import {Router, Request, Response, NextFunction} from 'express';
import {registerUser, getCurrentUser, extractTokenFromHeader} from '../services/auth';
import {DynamoDBInterface, DynamoItem} from '../services/dynamo.db';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SpendCategories } from '../services/sponsorship.store';

require('dotenv').config();

const router = Router();
const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'users';
const DB_TABLE_REGION = process.env.DB_TABLE_REGION || 'af-south-1';

// S3 config for QR storage
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || DB_TABLE_REGION || 'af-south-1';
const S3_BUCKET = process.env.S3_BUCKET || 'kudupay.co.za';
const PUBLIC_QR_BASE_URL = process.env.PUBLIC_QR_BASE_URL || 'https://kudupay.co.za';
const s3 = new S3Client({ region: S3_REGION });

// Simple in-memory rate limiter (per IP)
type RateEntry = { times: number[] };
const __rate_buckets = new Map<string, RateEntry>();
function createRateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const xfwd = req.headers['x-forwarded-for'];
      const ip = (typeof xfwd === 'string' ? xfwd.split(',')[0]?.trim() : undefined) || (req as any).ip || 'unknown';
      const now = Date.now();
      const bucket = __rate_buckets.get(ip) || { times: [] };
      // purge old
      bucket.times = bucket.times.filter(t => now - t < windowMs);
      bucket.times.push(now);
      __rate_buckets.set(ip, bucket);
      if (bucket.times.length > limit) {
        res.status(429).json({ error: 'Too many requests, please try again later.' });
        return;
      }
    } catch {
      // swallow and continue
    }
    next();
  };
}

// Helper sanitizers for financials and transactions
const toNonNegNumber = (v: any) => Math.max(0, Number(v || 0));
function sanitizeFinancials(fin: any) {
  return {
    withdrawableBalance: toNonNegNumber(fin?.withdrawableBalance),
    totalReceived: toNonNegNumber(fin?.totalReceived),
    totalTransactions: toNonNegNumber(fin?.totalTransactions),
    salesThisWeek: toNonNegNumber(fin?.salesThisWeek)
  };
}
function canonicalizeCategoryStrict(value: any): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  const found = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === s.toLowerCase());
  return found || null;
}
function sanitizeLastFiveTransactions(arr: any) {
  if (!Array.isArray(arr)) return [] as any[];
  return arr.slice(0, 5).map((it: any) => ({
    txId: String(it?.txId || ''),
    amount_cents: toNonNegNumber(it?.amount_cents),
    category: canonicalizeCategoryStrict((it as any)?.category),
    studentId: (it as any)?.studentId || null,
    status: (it as any)?.status || 'APPROVED',
    created_at: typeof (it as any)?.created_at === 'string' ? (it as any).created_at : (new Date((it as any)?.created_at || Date.now()).toISOString())
  }));
}

// POST /api/merchants/register - Merchant-specific registration endpoint
router.post('/register', createRateLimiter(30, 60_000), async (req: Request, res: Response) => {
    const {
        businessName,
        email,
        ownerFirstName,
        ownerLastName,
        category,
        password,
        registrationNumber,
        whatsappNumber
    } = req.body;

    try {
        // Basic validation for merchant registration
        if (!businessName || !email || !ownerFirstName || !ownerLastName || !password) {
            return res.status(400).json({
                error: 'Business name, email, owner first name, owner last name, and password are required for merchant registration'
            });
        }
        // Enforce category to be provided and valid
        const categoryCanonical = canonicalizeCategoryStrict(category);
        if (!categoryCanonical) {
            return res.status(400).json({ error: 'Invalid or missing category. Must be one of the predefined merchant categories.' });
        }

        // Create base user via auth service
        const reg = await registerUser({
            firstName: ownerFirstName,
            lastName: ownerLastName,
            email,
            password,
            role: 'merchant'
        } as any);

        if ('error' in reg) {
            return res.status(400).json({ error: reg.error });
        }

        // Persist merchant business info
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const businessItem: DynamoItem = {
            Pk: `MERCHANT#${reg.user.id}`,
            Sk: 'BUSINESS_INFO',
            businessName,
            category: categoryCanonical,
            registrationNumber: registrationNumber || null,
            whatsappNumber: whatsappNumber || null,
            approved: true,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        await db.putItem(businessItem);

        return res.status(201).json({
            message: 'Merchant registered successfully! Welcome to KuduPay.',
            data: {
                user: reg.user,
                token: (reg as any).token,
                merchant: {
                    id: reg.user.id,
                    businessName,
                    email: reg.user.email,
                    ownerFirstName,
                    ownerLastName,
                    category: categoryCanonical,
                    registrationNumber: registrationNumber || null,
                    whatsappNumber: whatsappNumber || null,
                    approved: true,
                    isOnline: false,
                    status: 'active',
                    created_at: reg.user.created_at
                }
            }
        });
    } catch (e) {
        console.error('Merchant register error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/merchants/qr/create - Generate QR code
router.post('/qr/create', createRateLimiter(60, 60_000), async (req: Request, res: Response) => {
    try {
        // Deprecated: This endpoint returns a base64 data URL and does not persist to S3.
        // Use POST /api/merchants/payment-id instead for persisted QR codes with stable public URLs.
        res.setHeader('Warning', '299 - Deprecated QR preview endpoint. Use POST /api/merchants/payment-id for persisted QR with S3 URL');
        res.setHeader('Deprecation', 'true');
        const { fixed_amount, open_amount, category, expiry } = req.body;

        // Basic input validation
        const fixed = (fixed_amount !== undefined && fixed_amount !== null) ? Number(fixed_amount) : null;
        const open = (open_amount !== undefined && open_amount !== null) ? Boolean(open_amount) : null;
        if (fixed !== null && (!Number.isFinite(fixed) || fixed < 0)) {
            return res.status(400).json({ error: 'fixed_amount must be a non-negative number when provided' });
        }
        if (open !== null && typeof open !== 'boolean') {
            return res.status(400).json({ error: 'open_amount must be a boolean when provided' });
        }
        if (fixed === null && open === null) {
            return res.status(400).json({ error: 'Either fixed_amount or open_amount must be provided' });
        }

        // In a future iteration: validate merchant auth and persist QR metadata.
        const qr_code_id = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // For now, encode the QR ID itself; can be expanded to include metadata.
        const width = 200;
        const dataUrl = await QRCode.toDataURL(qr_code_id, { width });

        return res.status(201).json({
            message: 'QR code generated successfully',
            data: {
                qr_code: {
                    id: qr_code_id,
                    fixed_amount,
                    open_amount,
                    category,
                    expiry,
                    created_at: new Date().toISOString(),
                    // Preserve the same field name, but provide a self-generated data URL
                    qr_image_url: dataUrl,
                    status: 'active'
                }
            }
        });
    } catch (e) {
        console.error('QR create error:', e);
        return res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// POST /api/merchants/refund/:tx_id - Issue refund
router.post('/refund/:tx_id', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

    const { tx_id } = req.params as any;
    const { reason, amount, amount_cents } = req.body || {};
    const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

    // Find the merchant TX by txId (paginate up to 1000 items or 10 pages)
    let found: any = null;
    let lastKey: any = undefined;
    for (let i = 0; i < 10 && !found; i++) {
      const resp = await db.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': `MERCHANT#${me.user.id}`, ':sk': 'TX#' },
        ScanIndexForward: false,
        Limit: 100,
        ExclusiveStartKey: lastKey
      });
      const items = (resp.Items || []) as any[];
      found = items.find(it => String(it.txId) === String(tx_id)) || null;
      lastKey = resp.LastEvaluatedKey;
      if (!found && !lastKey) break;
    }

    if (!found) return res.status(404).json({ error: 'Transaction not found for this merchant' });
    const originalAmount = Number(found.amount_cents || 0);
    const studentId = String(found.studentId || '');
    const category = (found as any).category || null;
    const createdSk = String((found as any).Sk || (found as any).sk || '');
    const alreadyStatus = String((found as any).status || 'APPROVED');

    if (alreadyStatus === 'REFUNDED') {
      return res.status(200).json({
        message: 'Already refunded',
        data: { transaction: { txId: tx_id, status: 'REFUNDED' } }
      });
    }

    const refundAmountCentsRaw = amount_cents != null ? amount_cents : amount != null ? amount : originalAmount;
    let refundAmountCents = Math.floor(Number(refundAmountCentsRaw || 0));
    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount' });
    }
    refundAmountCents = Math.min(refundAmountCents, originalAmount);
    const newStatus = refundAmountCents === originalAmount ? 'REFUNDED' : 'PARTIAL_REFUNDED';

    const iso = new Date().toISOString();

    // Update original merchant transaction status
    try {
      await db.updateItem({
        Pk: `MERCHANT#${me.user.id}` as any,
        Sk: createdSk as any,
        UpdateExpression: 'SET #status = :s, #updated_at = :ts',
        ExpressionAttributeNames: { '#status': 'status', '#updated_at': 'updated_at' },
        ExpressionAttributeValues: { ':s': newStatus, ':ts': iso }
      });
    } catch (e) {
      console.warn('Failed to update MERCHANT_TX status (non-blocking)', e);
    }

    // Create MERCHANT_REFUND record
    const merchantRefund = {
      Pk: `MERCHANT#${me.user.id}`,
      Sk: `REFUND#${iso}#${tx_id}`,
      type: 'MERCHANT_REFUND',
      txId: tx_id,
      amount_cents: refundAmountCents,
      reason: reason || null,
      created_at: iso,
      original_created_at: (found as any).created_at || null,
      studentId,
      category
    } as any;
    await db.putItem(merchantRefund);

    // Create STUDENT_SPEND_REVERSAL record for the student
    if (studentId) {
      const studentReversal = {
        Pk: `STUDENT#${studentId}`,
        Sk: `REFUND#${iso}#${tx_id}`,
        type: 'STUDENT_SPEND_REVERSAL',
        txId: tx_id,
        amount_cents: refundAmountCents,
        merchantId: me.user.id,
        category,
        created_at: iso
      } as any;
      await db.putItem(studentReversal);
    }

    // Update merchant BUSINESS_INFO aggregates (subtract amounts)
    try {
      await db.updateItem({
        Pk: `MERCHANT#${me.user.id}` as any,
        Sk: 'BUSINESS_INFO' as any,
        UpdateExpression: 'SET #updated_at = :ts ADD #withdrawableBalance :negAmt, #totalReceived :negAmt, #totalTransactions :negOne',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at',
          '#withdrawableBalance': 'withdrawableBalance',
          '#totalReceived': 'totalReceived',
          '#totalTransactions': 'totalTransactions'
        },
        ExpressionAttributeValues: {
          ':ts': iso,
          ':negAmt': -refundAmountCents,
          ':negOne': -1
        }
      });
    } catch (e) {
      console.warn('Failed to update BUSINESS_INFO aggregates for refund (non-blocking)', e);
    }

    return res.status(200).json({
      message: 'Refund processed',
      data: {
        refund: {
          original_transaction_id: tx_id,
          refund_amount_cents: refundAmountCents,
          reason: reason || null,
          status: newStatus,
          created_at: iso
        }
      }
    });
  } catch (e) {
    console.error('Refund error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/merchants/dashboard - View QR codes + receipts
router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const me = await getCurrentUser(token);
        if ('error' in me) {
            return res.status(401).json({ error: me.error });
        }
        if (me.user.role !== 'merchant') {
            return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });
        }

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const merchantBusinessData = await db.getItem({ Pk: `MERCHANT#${me.user.id}`, Sk: 'BUSINESS_INFO' });

        const financialsRaw = {
            withdrawableBalance: merchantBusinessData?.withdrawableBalance,
            totalReceived: merchantBusinessData?.totalReceived,
            totalTransactions: merchantBusinessData?.totalTransactions,
            salesThisWeek: merchantBusinessData?.salesThisWeek
        };
        const financials = sanitizeFinancials(financialsRaw);

        const bankAccount = {
            bankName: merchantBusinessData?.bankName ?? 'Not Set',
            accountNumber: merchantBusinessData?.accountNumber ?? 'Not Set',
            branchCode: merchantBusinessData?.branchCode ?? 'Not Set',
            accountHolder: merchantBusinessData?.accountHolder ?? 'Not Set'
        };

        return res.status(200).json({
            message: 'Merchant dashboard retrieved successfully',
            data: {
                summary: {
                    total_earnings: financials.totalReceived,
                    transactions_today: 0,
                    active_qr_codes: 0,
                    pending_settlements: 0
                },
                recent_transactions: [],
                active_qr_codes: [],
                earnings_chart: {
                    daily: [],
                    weekly: [],
                    monthly: []
                },
                lastFiveTransactions: sanitizeLastFiveTransactions(merchantBusinessData?.lastFiveTransactions),
                bankAccount,
                financials
            }
        });
    } catch (error) {
        console.error('Merchant dashboard error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/merchants/qr-codes - Get all QR codes for merchant
router.get('/qr-codes', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

    const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
    const result = await db.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `MERCHANT#${me.user.id}`, ':sk': 'QR#' },
      ScanIndexForward: false,
      Limit: 100
    });

    const qr_codes = (result.Items || []).map((it: any) => ({
      qr_id: it.qr_id || String(it.Sk || '').replace(/^QR#/, ''),
      status: it.status || 'inactive',
      label: it.label || null,
      created_at: it.created_at || null,
      updated_at: it.updated_at || null,
      usage_count: Number(it.usage_count || 0),
      image_url: it.image_url || null
    }));

    return res.status(200).json({ message: 'QR codes fetched', data: { qr_codes } });
  } catch (e) {
    console.error('QR codes list error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/merchants/qr/:qr_id/status - Update QR code status (activate/deactivate)
router.put('/qr/:qr_id/status', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

    const { qr_id } = req.params as any;
    const { status } = req.body || {};
    const newStatus = String(status || '').toLowerCase();
    if (!['active', 'inactive'].includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status. Allowed: active | inactive' });
    }

    const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

    // Ensure QR exists and belongs to merchant
    const item = await db.getItem({ Pk: `MERCHANT#${me.user.id}` as any, Sk: `QR#${qr_id}` as any });
    if (!item) return res.status(404).json({ error: 'QR code not found' });

    const iso = new Date().toISOString();
    await db.updateItem({
      Pk: `MERCHANT#${me.user.id}` as any,
      Sk: `QR#${qr_id}` as any,
      UpdateExpression: 'SET #status = :s, #updated_at = :ts',
      ExpressionAttributeNames: { '#status': 'status', '#updated_at': 'updated_at' },
      ExpressionAttributeValues: { ':s': newStatus, ':ts': iso }
    });

    const updated = await db.getItem({ Pk: `MERCHANT#${me.user.id}` as any, Sk: `QR#${qr_id}` as any });

    return res.status(200).json({
      message: 'QR code status updated',
      data: {
        qr_code: {
          qr_id,
          status: (updated as any)?.status || newStatus,
          label: (updated as any)?.label || null,
          created_at: (updated as any)?.created_at || null,
          updated_at: (updated as any)?.updated_at || iso,
          usage_count: Number((updated as any)?.usage_count || 0),
          image_url: (updated as any)?.image_url || null
        }
      }
    });
  } catch (e) {
    console.error('QR status update error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/merchants/transactions - Get transaction history
router.get('/transactions', async (req: Request, res: Response) => {
    try {
        // Auth merchant
        const token = extractTokenFromHeader(req);
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const me = await getCurrentUser(token);
        if ('error' in me) return res.status(401).json({ error: me.error });
        if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

        const { limit = 20, cursor, status, date_from, date_to } = req.query as any;
        const Limit = Math.min(100, Math.max(1, Number(limit) || 20));
        let ExclusiveStartKey: any = undefined;
        if (cursor && typeof cursor === 'string') {
            try {
                ExclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
            } catch {}
        }

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const result = await db.query({
            KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
            ExpressionAttributeValues: { ':pk': `MERCHANT#${me.user.id}`, ':sk': 'TX#' },
            ScanIndexForward: false,
            Limit,
            ExclusiveStartKey
        });

        let items = (result.Items || []) as DynamoItem[];
        // Optional filters in-memory for now
        if (status) {
            const s = String(status).toLowerCase();
            items = items.filter(it => String((it as any).status || '').toLowerCase() === s);
        }
        if (date_from) {
            const from = String(date_from);
            items = items.filter(it => String((it as any).created_at || '').localeCompare(from) >= 0);
        }
        if (date_to) {
            const to = String(date_to);
            items = items.filter(it => String((it as any).created_at || '').localeCompare(to) <= 0);
        }

        const transactions = items.map(it => ({
            txId: (it as any).txId,
            amount_cents: Number((it as any).amount_cents || 0),
            category: (it as any).category,
            studentId: (it as any).studentId,
            status: (it as any).status || 'APPROVED',
            created_at: (it as any).created_at || null
        }));

        const next_cursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null;

        return res.status(200).json({
            message: 'Merchant transactions retrieved',
            data: {
                transactions,
                pagination: {
                    limit: Limit,
                    next_cursor
                },
                filters: { status: status || null, date_from: date_from || null, date_to: date_to || null }
            }
        });
    } catch (e) {
        console.error('Merchant transactions error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


// GET /api/merchants/profile - Get merchant profile
router.get('/profile', async (req: Request, res: Response) => {
    try {
        // Extract JWT token from Authorization header
        const token = extractTokenFromHeader(req);
        if (!token) {
            return res.status(401).json({
                error: 'No token provided'
            });
        }

        // Get current user from JWT token
        const result = await getCurrentUser(token);
        if ('error' in result) {
            return res.status(401).json({
                error: result.error
            });
        }

        // Check if user is a merchant
        if (result.user.role !== 'merchant') {
            return res.status(403).json({
                error: 'Access denied. Only merchants can access this endpoint.'
            });
        }

        // Get merchant business data from DynamoDB
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const merchantBusinessData = await db.getItem({
            Pk: `MERCHANT#${result.user.id}`,
            Sk: 'BUSINESS_INFO'
        });

        if (!merchantBusinessData) {
            return res.status(404).json({
                error: 'Merchant business information not found'
            });
        }

        // Return merchant profile data with fields used by different frontends/tests
        // Base64 QR data URL no longer included; use qrCodeUrl persisted in profile instead.
        // Compute qrCodeUrl fallback and provide alias QRCodeUrl for compatibility with consumers expecting PascalCase.
        const publicBase = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
        const pidForQr = merchantBusinessData?.paymentId ?? null;
        const computedQrUrl = (merchantBusinessData?.qrCodeUrl && String(merchantBusinessData.qrCodeUrl)) || (pidForQr ? `${publicBase}/merchants/qr/${pidForQr}/1024x1024.png` : '');
        return res.status(200).json({
            message: 'Merchant profile retrieved successfully',
            data: {
                qrCodeUrl: computedQrUrl || '',
                QRCodeUrl: computedQrUrl || '',
                profile: {
                    id: result.user.id,
                    businessName: merchantBusinessData.businessName,
                    // Provide both naming conventions for compatibility
                    firstName: result.user.firstName,
                    lastName: result.user.lastName,
                    ownerFirstName: result.user.firstName,
                    ownerLastName: result.user.lastName,
                    email: result.user.email,
                    category: canonicalizeCategoryStrict(merchantBusinessData.category),
                    registrationNumber: merchantBusinessData.registrationNumber,
                    whatsappNumber: merchantBusinessData.whatsappNumber,
                    walletAddress: merchantBusinessData?.walletAddress ?? 'None',
                    qrCode: merchantBusinessData?.qrCode ?? 'PENDING',
                    qrCodeUrl: computedQrUrl || '',
                    QRCodeUrl: computedQrUrl || '',
                    isApproved: merchantBusinessData.approved || false,
                    isOnline: (merchantBusinessData?.isOnline ?? merchantBusinessData?.inOnline ?? false),
                    // Enrich profile with expected nested objects and recent transactions
                    paymentId: merchantBusinessData?.paymentId ?? null,
                    logoDataUrl: merchantBusinessData?.logoDataUrl ?? null,
                    bankAccount: {
                        bankName: merchantBusinessData?.bankName ?? 'Not Set',
                        accountNumber: merchantBusinessData?.accountNumber ?? 'Not Set',
                        branchCode: merchantBusinessData?.branchCode ?? 'Not Set',
                        accountHolder: merchantBusinessData?.accountHolder ?? `Not Set`
                    },
                    financials: sanitizeFinancials({
                        withdrawableBalance: merchantBusinessData?.withdrawableBalance,
                        totalReceived: merchantBusinessData?.totalReceived,
                        totalTransactions: merchantBusinessData?.totalTransactions,
                        salesThisWeek: merchantBusinessData?.salesThisWeek
                    }),
                    lastFiveTransactions: sanitizeLastFiveTransactions(merchantBusinessData?.lastFiveTransactions)
                }
            }
        });
    } catch (error) {
        console.error('Get merchant profile error:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// PUT /api/merchants/profile - Update merchant profile
router.put('/profile', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const result = await getCurrentUser(token);
        if ('error' in result) {
            return res.status(401).json({ error: result.error });
        }

        if (result.user.role !== 'merchant') {
            return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });
        }

        const {
            businessName,
            category,
            registrationNumber,
            whatsappNumber,
            isOnline,
            bankAccount
        } = req.body || {};

        // Validate category strictly if provided
        let categoryCanonical: string | undefined = undefined;
        if (typeof category !== 'undefined') {
            const found = canonicalizeCategoryStrict(category);
            if (!found) {
                return res.status(400).json({ error: 'Invalid category. Must be one of the predefined merchant categories.' });
            }
            categoryCanonical = found;
        }

        // Build dynamic update expression from provided fields only
        const exprNames: Record<string, string> = { '#updated_at': 'updated_at' };
        const exprValues: Record<string, any> = { ':updated_at': new Date().toISOString() };
        const setParts: string[] = ['#updated_at = :updated_at'];

        const addField = (apiField: string, dbAttr: string, value: any) => {
            if (typeof value !== 'undefined') {
                exprNames[`#${dbAttr}`] = dbAttr;
                exprValues[`:${dbAttr}`] = value;
                setParts.push(`#${dbAttr} = :${dbAttr}`);
            }
        };

        addField('businessName', 'businessName', businessName);
        addField('category', 'category', categoryCanonical);
        addField('registrationNumber', 'registrationNumber', registrationNumber);
        addField('whatsappNumber', 'whatsappNumber', whatsappNumber);
        addField('isOnline', 'isOnline', isOnline);

        if (bankAccount && typeof bankAccount === 'object') {
            addField('bankName', 'bankName', bankAccount.bankName);
            addField('accountNumber', 'accountNumber', bankAccount.accountNumber);
            addField('branchCode', 'branchCode', bankAccount.branchCode);
            addField('accountHolder', 'accountHolder', bankAccount.accountHolder);
        }

        if (setParts.length === 1) {
            return res.status(400).json({ error: 'No valid fields provided for update' });
        }

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const updated = await db.updateItem({
            Pk: `MERCHANT#${result.user.id}`,
            Sk: 'BUSINESS_INFO',
            UpdateExpression: `SET ${setParts.join(', ')}`,
            ExpressionAttributeNames: exprNames,
            ExpressionAttributeValues: exprValues,
            ReturnValues: 'ALL_NEW'
        });

        if (!updated) {
            return res.status(404).json({ error: 'Merchant business information not found' });
        }

        // Build response profile similar to GET
        const merchantBusinessData: any = updated;
        const publicBasePut = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
        const pidForQrPut = merchantBusinessData?.paymentId ?? null;
        const computedQrUrlPut = (merchantBusinessData?.qrCodeUrl && String(merchantBusinessData.qrCodeUrl)) || (pidForQrPut ? `${publicBasePut}/merchants/qr/${pidForQrPut}/1024x1024.png` : '');
        return res.status(200).json({
            message: 'Merchant profile updated successfully',
            data: {
                qrCodeUrl: computedQrUrlPut || '',
                QRCodeUrl: computedQrUrlPut || '',
                profile: {
                    id: result.user.id,
                    businessName: merchantBusinessData.businessName,
                    firstName: result.user.firstName,
                    lastName: result.user.lastName,
                    ownerFirstName: result.user.firstName,
                    ownerLastName: result.user.lastName,
                    email: result.user.email,
                    category: canonicalizeCategoryStrict(merchantBusinessData.category),
                    registrationNumber: merchantBusinessData.registrationNumber,
                    whatsappNumber: merchantBusinessData.whatsappNumber,
                    walletAddress: merchantBusinessData?.walletAddress ?? 'None',
                    qrCode: merchantBusinessData?.qrCode ?? 'PENDING',
                    qrCodeUrl: computedQrUrlPut || '',
                    QRCodeUrl: computedQrUrlPut || '',
                    isApproved: merchantBusinessData.approved || false,
                    isOnline: (merchantBusinessData?.isOnline ?? merchantBusinessData?.inOnline ?? false),
                    bankAccount: {
                        bankName: merchantBusinessData?.bankName ?? 'Not Set',
                        accountNumber: merchantBusinessData?.accountNumber ?? 'Not Set',
                        branchCode: merchantBusinessData?.branchCode ?? 'Not Set',
                        accountHolder: merchantBusinessData?.accountHolder ?? 'Not Set'
                    },
                    financials: sanitizeFinancials({
                        withdrawableBalance: merchantBusinessData?.withdrawableBalance,
                        totalReceived: merchantBusinessData?.totalReceived,
                        totalTransactions: merchantBusinessData?.totalTransactions,
                        salesThisWeek: merchantBusinessData?.salesThisWeek
                    }),
                    lastFiveTransactions: sanitizeLastFiveTransactions(merchantBusinessData?.lastFiveTransactions)
                }
            }
        });
    } catch (error) {
        console.error('Update merchant profile error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// --- PaymentId: create / get ---
router.get('/payment-id', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const me = await getCurrentUser(token);
        if ('error' in me) return res.status(401).json({ error: me.error });
        if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const item = await db.getItem({ Pk: `MERCHANT#${me.user.id}`, Sk: 'BUSINESS_INFO' });
        const paymentId = item?.paymentId || null;
        const publicBase = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
        const qrCodeUrl = paymentId ? `${publicBase}/merchants/qr/${paymentId}/1024x1024.png` : null;
        return res.status(200).json({ message: 'PaymentId fetched', data: { paymentId, qrCodeUrl } });
    } catch (e) {
        console.error('Get paymentId error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/payment-id', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const me = await getCurrentUser(token);
        if ('error' in me) return res.status(401).json({ error: me.error });
        if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

        const newPaymentId = `pay_${uuidv4()}`;
        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const updated = await db.updateItem({
            Pk: `MERCHANT#${me.user.id}`,
            Sk: 'BUSINESS_INFO',
            UpdateExpression: 'SET #paymentId = :paymentId, #paymentIdUpdatedAt = :ts, #updated_at = :ts',
            ExpressionAttributeNames: {
                '#paymentId': 'paymentId',
                '#paymentIdUpdatedAt': 'paymentIdUpdatedAt',
                '#updated_at': 'updated_at'
            },
            ExpressionAttributeValues: {
                ':paymentId': newPaymentId,
                ':ts': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        });
        if (!updated) return res.status(404).json({ error: 'Merchant business information not found' });
        // Fire-and-forget pre-generation of a standard QR size into S3 to reduce first-load latency
        // Synchronously generate and upload a standard QR image to S3 so the public URL exists immediately
        try {
            const size = '1024x1024';
            const width = 1024;
            const template = process.env.QR_DESTINATION_URL || 'https://kudupay.example/pay?paymentId={paymentId}';
            const finalUrl = template.includes('{paymentId}')
                ? template.replace('{paymentId}', encodeURIComponent(newPaymentId))
                : `${template}${template.includes('?') ? '&' : '?'}paymentId=${encodeURIComponent(newPaymentId)}`;
            const key = `merchants/qr/${newPaymentId}/${size}.png`;
            const pngBuffer = await QRCode.toBuffer(finalUrl, { type: 'png', width });
            console.log(`[payment-id] Uploading QR to s3://${S3_BUCKET}/${key} (region=${S3_REGION})`);
            await s3.send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                Body: pngBuffer,
                ContentType: 'image/png',
                CacheControl: 'public, max-age=86400'
            }));
            console.log('[payment-id] QR uploaded to S3 successfully');
            // Persist static public URL to merchant profile for frontend consumption
            const publicBaseForSave = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
            const savedPublicUrl = `${publicBaseForSave}/${key}`;
            try {
                await db.updateItem({
                    Pk: `MERCHANT#${me.user.id}`,
                    Sk: 'BUSINESS_INFO',
                    UpdateExpression: 'SET #qrCodeUrl = :qr, #qrCode = :ready, #updated_at = :ts',
                    ExpressionAttributeNames: { '#qrCodeUrl': 'qrCodeUrl', '#qrCode': 'qrCode', '#updated_at': 'updated_at' },
                    ExpressionAttributeValues: { ':qr': savedPublicUrl, ':ready': 'READY', ':ts': new Date().toISOString() }
                });
            } catch (err) {
                console.warn('Failed to save qrCodeUrl to profile (non-blocking):', err);
            }
        } catch (e) {
            console.warn('Pre-generate QR to S3 failed:', e);
        }
        const publicBase = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
        const publicUrl = `${publicBase}/merchants/qr/${newPaymentId}/1024x1024.png`;
        return res.status(201).json({ message: 'New PaymentId generated', data: { paymentId: newPaymentId, qrCodeUrl: publicUrl } });
    } catch (e) {
        console.error('Create paymentId error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Logo upload (base64/data URL) ---
router.post('/logo', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const me = await getCurrentUser(token);
        if ('error' in me) return res.status(401).json({ error: me.error });
        if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

        const { logoDataUrl } = req.body || {};
        if (!logoDataUrl || typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Invalid logo. Expecting data URL starting with data:image/' });
        }
        // Basic size guard: limit ~1.5MB
        const approxBytes = Math.ceil(logoDataUrl.length * 3 / 4);
        if (approxBytes > 1_500_000) {
            return res.status(413).json({ error: 'Logo too large. Please upload an image under 1.5MB.' });
        }

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const updated = await db.updateItem({
            Pk: `MERCHANT#${me.user.id}`,
            Sk: 'BUSINESS_INFO',
            UpdateExpression: 'SET #logoDataUrl = :logoDataUrl, #updated_at = :ts',
            ExpressionAttributeNames: { '#logoDataUrl': 'logoDataUrl', '#updated_at': 'updated_at' },
            ExpressionAttributeValues: { ':logoDataUrl': logoDataUrl, ':ts': new Date().toISOString() },
            ReturnValues: 'ALL_NEW'
        });
        if (!updated) return res.status(404).json({ error: 'Merchant business information not found' });
        return res.status(200).json({ message: 'Logo saved', data: { logoDataUrl } });
    } catch (e) {
        console.error('Upload logo error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// --- QR render endpoint ---
router.get('/qr', async (req: Request, res: Response) => {
    try {
        const token = extractTokenFromHeader(req);
        if (!token) return res.status(401).json({ error: 'No token provided' });
        const me = await getCurrentUser(token);
        if ('error' in me) return res.status(401).json({ error: me.error });
        if (me.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied. Only merchants can access this endpoint.' });

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        const providedId = (req.query.paymentId as string) || '';
        let paymentId = providedId;
        if (!paymentId) {
            const item = await db.getItem({ Pk: `MERCHANT#${me.user.id}`, Sk: 'BUSINESS_INFO' });
            paymentId = item?.paymentId || '';
        }
        if (!paymentId) {
            return res.status(400).json({ error: 'No PaymentId found. Generate one first.' });
        }
        const template = process.env.QR_DESTINATION_URL || 'https://kudupay.example/pay?paymentId={paymentId}';
        const finalUrl = template.includes('{paymentId}')
            ? template.replace('{paymentId}', encodeURIComponent(paymentId))
            : `${template}${template.includes('?') ? '&' : '?'}paymentId=${encodeURIComponent(paymentId)}`;

        // Parse size like 512x512 and use width for QR code generation
        const size = typeof req.query.size === 'string' ? req.query.size : '512x512';
        const width = (() => {
            const m = /^(\d+)x(\d+)$/.exec(size);
            const w = m ? parseInt(m[1], 10) : parseInt(String(size), 10);
            return Number.isFinite(w) && w > 0 ? w : 512;
        })();

        // S3 key pattern for storing QR images
        const key = `merchants/qr/${paymentId}/${size}.png`;

        // Try to serve from S3 if it already exists
        let served = false;
        try {
            await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
            const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
            res.setHeader('Content-Type', obj.ContentType || 'image/png');
            if (obj.CacheControl) res.setHeader('Cache-Control', obj.CacheControl);
            if (typeof obj.ContentLength === 'number') res.setHeader('Content-Length', String(obj.ContentLength));
            res.status(200);
            const body: any = obj.Body;
            if (body && typeof body.pipe === 'function') {
                body.pipe(res);
                served = true;
                return; // stream will end response
            } else if (body) {
                const chunks: any[] = [];
                for await (const chunk of body as any) chunks.push(chunk);
                const buf = Buffer.concat(chunks);
                res.end(buf);
                served = true;
                return;
            }
        } catch (e) {
            // Not found or other error - fall back to generate & upload
        }

        // If not served from S3, generate, upload, then return
        const pngBuffer = await QRCode.toBuffer(finalUrl, { type: 'png', width });
        try {
            await s3.send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                Body: pngBuffer,
                ContentType: 'image/png',
                CacheControl: 'public, max-age=86400' // 1 day
            }));
            // Non-blocking: persist static public URL to profile for future loads
            try {
                const publicBase = String(PUBLIC_QR_BASE_URL || '').replace(/\/$/, '');
                const publicUrl = `${publicBase}/${key}`;
                await db.updateItem({
                    Pk: `MERCHANT#${me.user.id}`,
                    Sk: 'BUSINESS_INFO',
                    UpdateExpression: 'SET #qrCodeUrl = :qr, #qrCode = :ready, #updated_at = :ts',
                    ExpressionAttributeNames: { '#qrCodeUrl': 'qrCodeUrl', '#qrCode': 'qrCode', '#updated_at': 'updated_at' },
                    ExpressionAttributeValues: { ':qr': publicUrl, ':ready': 'READY', ':ts': new Date().toISOString() }
                });
            } catch (e2) {
                console.warn('Failed to save qrCodeUrl after GET /qr upload (non-blocking):', e2);
            }
        } catch (e) {
            console.warn('Failed to upload QR to S3, continuing to serve directly:', e);
        }
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.status(200);
        return res.end(pngBuffer);
    } catch (e) {
        console.error('QR render error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Public: lookup merchant by paymentId ---
router.get('/public/by-payment-id/:paymentId', createRateLimiter(120, 60_000), async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params as { paymentId: string };
        if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

        const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);
        // Scan for BUSINESS_INFO with matching paymentId (dev/testing convenience)
        const result = await db.scan({
            FilterExpression: '#Sk = :sk AND #paymentId = :pid',
            ExpressionAttributeNames: { '#Sk': 'Sk', '#paymentId': 'paymentId' },
            ExpressionAttributeValues: { ':sk': 'BUSINESS_INFO', ':pid': paymentId }
        });
        const item = (result.Items || [])[0];
        if (!item) return res.status(404).json({ error: 'Merchant not found for paymentId' });

        // Extract merchantId from PK format MERCHANT#{id}
        const id = String(item.Pk || item.PK || '')
            .replace(/^MERCHANT#/i, '');

        return res.status(200).json({
            message: 'Merchant resolved',
            data: {
                merchant: {
                    id,
                    businessName: item.businessName,
                    category: item.category,
                    paymentId: item.paymentId || paymentId,
                    logoDataUrl: item.logoDataUrl || null,
                    whatsappNumber: item.whatsappNumber || null,
                    isOnline: Boolean(item.isOnline ?? item.inOnline ?? false)
                }
            }
        });
    } catch (e) {
        console.error('Lookup by paymentId error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;