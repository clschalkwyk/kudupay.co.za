import { Router, Request, Response } from 'express';
import { getCurrentUser, extractTokenFromHeader, findUserById } from '../services/auth';
import { getStudentAggregateAsync, prepareTransaction, confirmTransaction, SpendCategories, listSponsorStudentAggregates, listStudentSponsorCategoryBudgets } from '../services/sponsorship.store';
import { DynamoDBInterface } from '../services/dynamo.db';

const router = Router();

// Simple in-memory rate limiter (per IP) for student endpoints
// Reuse approach from merchants.ts to avoid external dependencies
// Note: This is a lightweight dev guard; consider express-rate-limit in production
// Windowed counter per IP; denies with 429 when limit exceeded
// Keeping implementation local to avoid cross-module imports
//
// Usage: router.get('...', createRateLimiter(60, 60_000), handler)

type RateEntry = { times: number[] };
const __student_rate_buckets = new Map<string, RateEntry>();
function createRateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: Function) => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).ip || 'unknown';
      const now = Date.now();
      const bucket = __student_rate_buckets.get(ip) || { times: [] };
      bucket.times = bucket.times.filter(t => now - t < windowMs);
      bucket.times.push(now);
      __student_rate_buckets.set(ip, bucket);
      if (bucket.times.length > limit) {
        return res.status(429).json({ error: 'Too many requests, please try again later.' });
      }
    } catch {}
    return (next as any)();
  };
}

// POST /api/students/pay - Accept scanned QR, validate rules
router.post('/pay', (req: Request, res: Response) => {
  const { qr_code_id, amount, student_id } = req.body;
  
  // TODO: Implement student payment logic
  // - Validate student authentication
  // - Validate QR code exists and is active
  // - Get merchant and category from QR code
  // - Check sponsor-defined limits for this category
  // - Validate amount is within limits
  // - Check student has sufficient balance
  // - Process payment via Lisk blockchain
  // - Update balances and limits
  // - Log transaction
  // - Return success with Koos message
  
  res.status(200).json({
    message: 'Student payment endpoint - Implementation in progress',
    data: {
      transaction: {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        student_id,
        qr_code_id,
        amount,
        status: 'processing',
        created_at: new Date().toISOString()
      },
      koos_message: "Boom! Transaction complete. Remember to save some for textbooks! 📚"
    }
  });
});

// GET /api/students/:id/balance - Get student wallet balance and limits (+category aggregates from DB)
router.get('/:id/balance', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const agg = await getStudentAggregateAsync(String(id));

  // Also fetch persisted per-category budgets for all sponsors for this student
  const { listStudentSponsorCategoryBudgets } = require('../services/sponsorship.store');
  const budgets = await listStudentSponsorCategoryBudgets(id);

  res.status(200).json({
    message: 'Student balance retrieved successfully',
    data: {
      student_id: id,
      total_balance: agg.totalBalance,
      available_balance: agg.totalBalance,
      category_limits: agg.categoryLimits,
      persisted_budgets: budgets,
      recent_transactions: []
    }
  });
});

// GET /api/students/:id/transactions - Get student transaction history (DB-backed with cursor pagination)
router.get('/:id/transactions', createRateLimiter(120, 60_000), async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });

    const { id } = req.params as { id: string };
    // Students can view their own transactions; other roles may be allowed for support if needed
    if (me.user.role === 'student' && me.user.id !== id) {
      return res.status(403).json({ error: 'Cannot view transactions for another student' });
    }

    const { limit = 20, category, date_from, date_to, merchantId, cursor } = req.query as any;

    // Validate/normalize filters (not applied server-side yet; included in response for transparency)
    const lim = Math.max(1, Math.min(100, Number(limit) || 20));

    let cat: any = undefined;
    if (category && typeof category === 'string') {
      const maybe = String(category);
      if ((SpendCategories as readonly string[]).includes(maybe)) cat = maybe as any;
    }
    const df = date_from ? (isNaN(Number(date_from)) ? Date.parse(String(date_from)) : Number(date_from)) : undefined;
    const dt = date_to ? (isNaN(Number(date_to)) ? Date.parse(String(date_to)) : Number(date_to)) : undefined;

    // DB-backed path with cursor-based pagination
    let ExclusiveStartKey: any = undefined;
    if (cursor && typeof cursor === 'string') {
      try {
        const decoded = Buffer.from(String(cursor), 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        if (!parsed || typeof parsed !== 'object') {
          return res.status(400).json({ error: 'Invalid cursor' });
        }
        ExclusiveStartKey = parsed;
      } catch {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }
    const { listStudentTransactionsFromDB } = require('../services/sponsorship.store');
    const result = await listStudentTransactionsFromDB(id, { Limit: lim, ExclusiveStartKey });
    const items = (result.Items || []) as any[];
    const transactions = items.map((it: any) => ({
      id: it.txId,
      merchantId: it.merchantId || undefined,
      category: it.category,
      amount_cents: Number(it.amount_cents || 0),
      status: it.status,
      created_at: it.created_at || null
    }));
    const next_cursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null;
    // Apply in-memory filters to ensure only relevant merchant/category data is returned
    let filtered = transactions;
    if (merchantId && typeof merchantId === 'string') {
      const mid = String(merchantId);
      filtered = filtered.filter(t => String(t.merchantId || '') === mid);
    }
    if (cat) {
      const catLc = String(cat).toLowerCase();
      filtered = filtered.filter(t => String(t.category || '').toLowerCase() === catLc);
    }
    // Keep response size predictable
    filtered = filtered.slice(0, lim);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({
      message: 'Student transactions retrieved successfully',
      data: {
        student_id: id,
        transactions: filtered,
        pagination: {
          page: 1,
          limit: lim,
          total: null,
          pages: null,
          next_cursor: null
        },
        filters: {
          merchantId,
          category: cat,
          date_from: df,
          date_to: dt,
          source: 'db'
        }
      }
    });
  } catch (error) {
    console.error('Student transactions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:id/sponsors - Get all sponsors for this student
router.get('/:id/sponsors', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    // Students can view their own sponsors; sponsors/admins could also view for support if needed

    const { id } = req.params as { id: string };
    if (me.user.role === 'student' && me.user.id !== id) {
      return res.status(403).json({ error: 'Cannot view sponsors for another student' });
    }

    const aggregates = await listSponsorStudentAggregates(id);

    // Optionally enrich with sponsor basic profile (firstName/lastName)
    const sponsors = [] as any[];
    for (const agg of aggregates) {
      const sp = await findUserById(agg.sponsorId);
      sponsors.push({
        sponsorId: agg.sponsorId,
        allocated_total_cents: agg.allocated_total_cents,
        updated_at: agg.updated_at,
        firstName: sp?.firstName,
        lastName: sp?.lastName,
        email: sp?.email,
      });
    }

    return res.status(200).json({ student_id: id, sponsors });
  } catch (error) {
    console.error('Get student sponsors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/scan-qr - Validate QR code before payment
router.post('/scan-qr', (req: Request, res: Response) => {
  const { qr_code_id, student_id } = req.body;
  
  // TODO: Implement QR code validation logic
  // - Validate QR code exists and is active
  // - Get merchant and category information
  // - Check if student can pay in this category
  // - Return QR code details and payment options
  
  res.status(200).json({
    message: 'QR code scan endpoint - Implementation in progress',
    data: {
      qr_code: {
        id: qr_code_id,
        merchant_name: 'Sample Merchant',
        category: 'food',
        fixed_amount: null,
        open_amount: true,
        can_pay: true,
        available_balance: 0,
        category_limit: 0,
        category_remaining: 0
      },
      koos_tip: "Great choice! This merchant accepts KuduPay. Check your limits before paying! 💰"
    }
  });
});

// GET /api/students/:id/dashboard - Student dashboard with summary
router.get('/:id/dashboard', (req: Request, res: Response) => {
  const { id } = req.params;
  
  // TODO: Implement student dashboard logic
  // - Validate student authentication
  // - Get balance summary
  // - Get recent transactions
  // - Get spending by category
  // - Get Koos tips and messages
  // - Return dashboard data
  
  res.status(200).json({
    message: 'Student dashboard endpoint - Implementation in progress',
    data: {
      student_id: id,
      summary: {
        total_balance: 0,
        spent_this_month: 0,
        transactions_count: 0,
        active_sponsors: 0
      },
      spending_by_category: {
        food: 0,
        transport: 0,
        textbooks: 0,
        clothing: 0
      },
      recent_transactions: [],
      koos_tip_of_day: "Remember to budget wisely! Your sponsors believe in your success! 🌟"
    }
  });
});

// PUT /api/students/:id/profile - Update student profile
router.put('/:id/profile', (req: Request, res: Response) => {
  const { id } = req.params;
  const { firstName, lastName, email, phone, university, student_number } = req.body;
  
  // TODO: Implement profile update logic
  // - Validate student authentication
  // - Update student profile information
  // - Return updated profile data
  
  res.status(200).json({
    message: 'Student profile update endpoint - Implementation in progress',
    data: {
      student_id: id,
      profile: {
        firstName,
        lastName,
        email,
        phone,
        university,
        student_number,
        updated_at: new Date().toISOString()
      }
    }
  });
});

// GET /api/students/profile - GET student profile (with sponsors and budgets)
router.get('/profile', async (req: Request, res: Response) => {
  try {
    // Extract JWT token from Authorization header
    const token = extractTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Get current user from JWT token
    const result = await getCurrentUser(token);
    if ('error' in result) {
      return res.status(401).json({ error: result.error });
    }

    // Check if user is a student
    if (result.user.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Only students can access this endpoint.' });
    }

    const studentId = result.user.id;

    // Build Sponsors list from aggregates stored in DynamoDB (if any)
    const sponsorsAgg = await listSponsorStudentAggregates(studentId);
    const sponsors = [] as Array<{ id: string; name: string; type: string; totalAmount: number }>;
    for (const agg of sponsorsAgg) {
      const sp = await findUserById(agg.sponsorId);
      const name = sp ? `${sp.firstName ?? ''} ${sp.lastName ?? ''}`.trim() || sp.email || agg.sponsorId : agg.sponsorId;
      // allocated_total_cents is in integer units; convert to ZAR (cents->ZAR) if looks like cents
      const totalAmount = Math.round(Number(agg.allocated_total_cents || 0)) / 100; // display in R
      const sponsorType = (sp as any)?.sponsorType || 'parent';
      sponsors.push({ id: agg.sponsorId, name, type: sponsorType, totalAmount });
    }

    // Build per-category budgets by summing across sponsors
    const budgets = await listStudentSponsorCategoryBudgets(studentId);
    const categoryMap = new Map<string, { limit: number; spent: number }>();
    for (const b of budgets) {
      const cat = String(b.category);
      const prev = categoryMap.get(cat) || { limit: 0, spent: 0 };
      prev.limit += Math.round(Number(b.allocated_total_cents || 0)) / 100;
      prev.spent += Math.round(Number(b.used_total_cents || 0)) / 100;
      categoryMap.set(cat, prev);
    }
    const categories = Array.from(categoryMap.entries()).map(([name, v], idx) => ({
      id: `${idx}`,
      name,
      limit: v.limit,
      spent: v.spent,
      remaining: Math.max(0, v.limit - v.spent)
    }));

    // Return student profile data matching frontend expectations
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({
      message: 'Student profile retrieved successfully',
      data: {
        student_id: studentId,
        profile: {
          id: studentId,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          fullName: `${result.user.firstName} ${result.user.lastName}`.trim(),
          email: result.user.email,
          studentNumber: result.user.studentNumber, // camelCase to match frontend
          sponsors,
          categories,
          badge: 'Smart Saver',
          role: result.user.role,
          is_active: result.user.is_active,
          created_at: result.user.created_at
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/:studentId/transactions/prepare - Prepare spend authorization
router.post('/:studentId/transactions/prepare', createRateLimiter(60, 60_000), async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'student') return res.status(403).json({ error: 'Access denied. Only students can prepare transactions.' });

    const { studentId } = req.params as { studentId: string };
    if (me.user.id !== studentId) return res.status(403).json({ error: 'Cannot prepare transaction for another student' });

    const { merchantId, category, amount_cents, idempotency_key } = req.body as { merchantId?: string; category?: string; amount_cents: number; idempotency_key?: string };
    const amt = Number(amount_cents);
    if (!Number.isFinite(amt) || !(amt > 0)) return res.status(400).json({ error: 'amount_cents must be a positive number' });

    const rawCat: string | undefined = category ? String(category) : undefined;
    let cat: string | undefined = rawCat;
    if (cat && !SpendCategories.includes(cat as any)) {
      const found = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === cat!.toLowerCase());
      if (found) {
        cat = found as any;
      } else {
        return res.status(400).json({ error: `Invalid category: ${cat}` });
      }
    }

    const resp = await prepareTransaction(studentId, { merchantId: merchantId ? String(merchantId) : undefined, category: cat as any, amount_cents: amt, idempotency_key });
    return res.status(200).json(resp);
  } catch (error: any) {
    console.error('Prepare transaction error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.toLowerCase().includes('inactive') || msg.toLowerCase().includes('not approved')) {
      return res.status(403).json({ error: msg });
    }
    if (msg.includes('amount_cents') || msg.toLowerCase().includes('unknown merchantid') || msg.toLowerCase().includes('merchant') || msg.toLowerCase().includes('category')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/:studentId/transactions/:txId/confirm - Confirm spend and consume lots
router.post('/:studentId/transactions/:txId/confirm', createRateLimiter(60, 60_000), async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'student') return res.status(403).json({ error: 'Access denied. Only students can confirm transactions.' });

    const { studentId, txId } = req.params as { studentId: string; txId: string };
    if (me.user.id !== studentId) return res.status(403).json({ error: 'Cannot confirm transaction for another student' });
    if (!txId || typeof txId !== 'string') return res.status(400).json({ error: 'Invalid txId' });

    const { idempotency_key } = req.body as { idempotency_key?: string };
    const resp = await confirmTransaction(studentId, txId, idempotency_key);
    if ((resp as any).reconfirm_required) {
      return res.status(409).json({ error: 'Availability changed. Please re-confirm.', ...resp });
    }
    return res.status(200).json(resp);
  } catch (error: any) {
    console.error('Confirm transaction error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('Transaction not found')) {
      return res.status(404).json({ error: msg });
    }
    if (msg.toLowerCase().includes('inactive') || msg.toLowerCase().includes('not approved')) {
      return res.status(403).json({ error: msg });
    }
    if (msg.toLowerCase().includes('unknown merchantid') || msg.toLowerCase().includes('category mismatch') || msg.toLowerCase().includes('category invalid')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:id/budgets - Aggregated budgets per category from DynamoDB
router.get('/:id/budgets', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: (me as any).error });

    const { id } = req.params as { id: string };
    if (me.user.role === 'student' && me.user.id !== id) {
      return res.status(403).json({ error: 'Cannot view budgets for another student' });
    }

    const budgets = await listStudentSponsorCategoryBudgets(String(id));
    const byCat = new Map<string, { limit_cents: number; spent_cents: number }>();
    for (const b of budgets) {
      const cat = String(b.category);
      const prev = byCat.get(cat) || { limit_cents: 0, spent_cents: 0 };
      prev.limit_cents += Math.max(0, Number(b.allocated_total_cents || 0));
      prev.spent_cents += Math.max(0, Number(b.used_total_cents || 0));
      byCat.set(cat, prev);
    }
    const categories = Array.from(byCat.entries()).map(([name, v]) => {
      const remaining_cents = Math.max(0, v.limit_cents - v.spent_cents);
      return {
        name,
        limit: Math.round(v.limit_cents) / 100,
        spent: Math.round(v.spent_cents) / 100,
        remaining: Math.round(remaining_cents) / 100,
        limit_cents: Math.round(v.limit_cents),
        spent_cents: Math.round(v.spent_cents),
        remaining_cents: Math.round(remaining_cents)
      };
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json({
      message: 'Student budgets retrieved successfully',
      data: {
        student_id: id,
        categories
      }
    });
  } catch (error) {
    console.error('Student budgets error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Student self profile endpoints ---
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: (me as any).error });
    if (me.user.role !== 'student') return res.status(403).json({ error: 'Only students can access this endpoint' });

    // Basic profile view (email + names + studentNumber)
    return res.status(200).json({
      message: 'Student profile',
      data: {
        userId: me.user.id,
        email: me.user.email,
        firstName: me.user.firstName,
        lastName: me.user.lastName,
        studentNumber: me.user.studentNumber || ''
      }
    });
  } catch (err) {
    console.error('GET /students/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/me', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: (me as any).error });
    if (me.user.role !== 'student') return res.status(403).json({ error: 'Only students can update this profile' });

    const { firstName, lastName, studentNumber } = req.body || {};
    const updates: Record<string, any> = {};
    const str = (v: any) => (v === undefined || v === null ? undefined : String(v));
    if (str(firstName)) updates.firstName = String(firstName).trim();
    if (str(lastName)) updates.lastName = String(lastName).trim();
    if (str(studentNumber)) updates.studentNumber = String(studentNumber).trim();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Simple length validation (minimal, avoids adding new deps)
    if (updates.firstName && (updates.firstName.length < 1 || updates.firstName.length > 50)) {
      return res.status(400).json({ error: 'firstName must be 1-50 characters' });
    }
    if (updates.lastName && (updates.lastName.length < 1 || updates.lastName.length > 50)) {
      return res.status(400).json({ error: 'lastName must be 1-50 characters' });
    }
    if (updates.studentNumber && (updates.studentNumber.length < 3 || updates.studentNumber.length > 20)) {
      return res.status(400).json({ error: 'studentNumber must be 3-20 characters' });
    }

    const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'users';
    const DB_TABLE_REGION = process.env.DB_TABLE_REGION || 'af-south-1';
    const db = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

    // Our user record lives at PK: ROLE#id, SK: USER
    const Pk = `${me.user.role.toUpperCase()}#${me.user.id}`;
    const Sk = 'USER';

    const keys = Object.keys(updates);
    const setExpr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ');
    const ExpressionAttributeNames = Object.fromEntries(keys.map((k, i) => [`#k${i}`, k]));
    const ExpressionAttributeValues = Object.fromEntries(keys.map((k, i) => [`:v${i}`, (updates as any)[k]]));

    const updated = await db.updateItem({
      Pk,
      Sk,
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    if (!updated) return res.status(404).json({ error: 'Profile not found' });

    return res.status(200).json({
      message: 'Profile updated',
      data: {
        userId: updated.id || me.user.id,
        email: updated.email || me.user.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        studentNumber: updated.studentNumber || ''
      }
    });
  } catch (err) {
    console.error('PATCH /students/me error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;