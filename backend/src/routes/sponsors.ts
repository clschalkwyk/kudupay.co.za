import { Router, Request, Response } from 'express';
import { getCurrentUser, extractTokenFromHeader, findUserByEmailAndRole, findUserById, Roles } from '../services/auth';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { addDeposit, updateSponsorshipLimits, getSponsorTotals, allocateBudgets, SpendCategories, addSponsorStudentLink, hasSponsorStudentLinkAsync, listLinkedStudentsBySponsor, topupSponsorCredits, reverseAllocations, generateEFTReference, createEFTDepositNotification, listEFTDepositNotificationsAsync, listBudgetsForSponsor, listAllocationLedgerBySponsorAsync, getSponsorAggregateAsync, sumSponsorApprovedDepositsAsync } from '../services/sponsorship.store';

const router = Router();

// POST /api/sponsors/deposit - Fund student + define rules
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const me = await getCurrentUser(token);
    if ('error' in me) {
      return res.status(401).json({ error: me.error });
    }
    if (me.user.role !== 'sponsor') {
      return res.status(403).json({ error: 'Access denied. Only sponsors can deposit.' });
    }

    const { student_id, amount_cents, amount_zar, merchant_category_limits, categoryLimits } = req.body as { student_id: string; amount_cents?: number; amount_zar?: number; merchant_category_limits?: any; categoryLimits?: any };
    if (!student_id || (amount_cents === undefined && amount_zar === undefined)) {
      return res.status(400).json({ error: 'student_id and amount_cents (or amount_zar) are required' });
    }

    const amtCents = amount_cents != null ? Math.floor(Number(amount_cents)) : Math.floor(Number(amount_zar) * 100);
    if (!Number.isFinite(amtCents) || !(amtCents > 0)) {
      return res.status(400).json({ error: 'amount_cents must be a positive integer (or provide valid amount_zar)' });
    }

    const limits = merchant_category_limits || categoryLimits || {};
    const record = await addDeposit(me.user.id, String(student_id), amtCents, limits);

    // Backward-compatible ZAR fields
    const amountZar = Math.round(record.amount_cents / 100);
    const feeZar = Math.round(record.fee_cents / 100);
    const netZar = Math.round(record.net_amount_cents / 100);

    return res.status(201).json({
      message: 'Deposit recorded successfully',
      data: {
        sponsorship: {
          id: record.id,
          sponsor_id: record.sponsorId,
          student_id: record.studentId,
          amount_cents: record.amount_cents,
          fee_cents: record.fee_cents,
          net_amount_cents: record.net_amount_cents,
          // legacy fields (rounded ZAR units)
          amount_zar: amountZar,
          transaction_fee: feeZar,
          net_amount: netZar,
          merchant_category_limits: record.categoryLimits,
          created_at: record.createdAt,
          status: 'active'
        }
      }
    });
  } catch (error) {
    console.error('Sponsor deposit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/profile - Get sponsor profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const me = await getCurrentUser(token);
    if ('error' in me) {
      return res.status(401).json({ error: me.error });
    }
    if (me.user.role !== 'sponsor') {
      return res.status(403).json({ error: 'Access denied. Only sponsors can access this endpoint.' });
    }

    const totals = await getSponsorTotals(me.user.id);

    return res.status(200).json({
      message: 'Sponsor profile retrieved successfully',
      data: {
        profile: {
          id: me.user.id,
          firstName: me.user.firstName,
          lastName: me.user.lastName,
          email: me.user.email,
          type: (me.user as any).sponsorType || 'parent',
          totalSponsored: totals.totalDeposited,
          activeStudents: totals.uniqueStudents,
          isVerified: false
        }
      }
    });
  } catch (error) {
    console.error('Get sponsor profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/:id/overview - Show balances + limits
router.get('/:id/overview', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  try {
    const totals = await getSponsorTotals(id);
    return res.status(200).json({
      message: 'Sponsor overview retrieved successfully',
      data: {
        sponsor_id: id,
        total_deposited: totals.totalDeposited,
        total_fees_paid: totals.totalFeesPaid,
        active_sponsorships: [],
        summary: {
          total_students_sponsored: totals.uniqueStudents,
          total_amount_deposited: totals.totalDeposited,
          total_amount_spent: 0,
          remaining_balance: totals.totalDeposited
        }
      }
    });
  } catch (error) {
    console.error('Sponsor overview error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/student/:student_id/spending - View how funds are used
router.get('/student/:student_id/spending', (req: Request, res: Response) => {
  const { student_id } = req.params;

  res.status(200).json({
    message: 'Student spending view endpoint - Implementation in progress',
    data: {
      student_id,
      spending_breakdown: {
        food: { spent: 0, limit: 0, remaining: 0 },
        transport: { spent: 0, limit: 0, remaining: 0 },
        textbooks: { spent: 0, limit: 0, remaining: 0 },
        clothing: { spent: 0, limit: 0, remaining: 0 }
      },
      recent_transactions: []
    }
  });
});

// GET /api/sponsors/:id/students - Get all students linked to this sponsor
router.get('/:id/students', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can view students.' });

    const { id } = req.params;
    if (me.user.id !== id) return res.status(403).json({ error: 'Cannot view students for another sponsor' });

    const studentIds = await listLinkedStudentsBySponsor(id);
    const students = [] as any[];
    for (const sid of studentIds) {
      const u = await findUserById(sid);
      if (u && u.role === Roles.STUDENT) {
        students.push({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, studentNumber: u.studentNumber });
      } else {
        // Fallback minimal entry
        students.push({ id: sid });
      }
    }

    return res.status(200).json({ students });
  } catch (error) {
    console.error('List sponsor students error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sponsors/:sponsorId/students - Link a student to this sponsor (by email or id)
router.post('/:sponsorId/students', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can add students.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot add students for another sponsor' });

    const { student_email, student_id } = req.body as { student_email?: string; student_id?: string };
    if (!student_email && !student_id) {
      return res.status(400).json({ error: 'Provide student_email or student_id' });
    }

    let student: any = null;
    if (student_email) {
      student = await findUserByEmailAndRole(String(student_email).toLowerCase(), Roles.STUDENT);
      if (!student) return res.status(404).json({ error: 'Student with this email not found' });
    } else if (student_id) {
      const u = await findUserById(String(student_id));
      if (!u || u.role !== Roles.STUDENT) return res.status(404).json({ error: 'Student not found' });
      student = u;
    }

    if (await hasSponsorStudentLinkAsync(sponsorId, student.id)) {
      return res.status(200).json({ message: 'Student already linked', data: { student: { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email, studentNumber: student.studentNumber } } });
    }

    await addSponsorStudentLink(sponsorId, student.id);

    return res.status(201).json({
      message: 'Student linked successfully',
      data: { student: { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email, studentNumber: student.studentNumber } }
    });
  } catch (error) {
    console.error('Add sponsor student error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/sponsors/sponsorship/:sponsorship_id/limits - Update spending limits
router.put('/sponsorship/:sponsorship_id/limits', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const me = await getCurrentUser(token);
    if ('error' in me) {
      return res.status(401).json({ error: me.error });
    }
    if (me.user.role !== 'sponsor') {
      return res.status(403).json({ error: 'Access denied. Only sponsors can update limits.' });
    }

    const { sponsorship_id } = req.params;
    const { merchant_category_limits, categoryLimits } = req.body;

    const updated = await updateSponsorshipLimits(sponsorship_id, me.user.id, merchant_category_limits || categoryLimits || {});
    if (!updated) {
      return res.status(404).json({ error: 'Sponsorship not found or access denied' });
    }

    return res.status(200).json({
      message: 'Spending limits updated successfully',
      data: {
        sponsorship_id,
        updated_limits: updated.categoryLimits,
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Update spending limits error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sponsors/:sponsorId/students/:studentId/budgets - Allocate/Top-up Budgets (idempotent)
router.post('/:sponsorId/students/:studentId/budgets', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can allocate budgets.' });

    const { sponsorId, studentId } = req.params as { sponsorId: string; studentId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot allocate for another sponsor' });


    const { allocations, idempotency_key } = req.body as { allocations: Array<{ category: string; amount?: number; amount_cents?: number }>; idempotency_key?: string };
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'allocations must be a non-empty array' });
    }

    // Validate and coerce categories (keep Title Case; do not lowercase)
    const normalized = allocations.map(a => ({
      category: String((a as any).category),
      amount: Number((a as any).amount_cents ?? (a as any).amount)
    }));

    for (const a of normalized) {
      if (!SpendCategories.includes(a.category as any)) {
        return res.status(400).json({ error: `Invalid category: ${a.category}` });
      }
      if (!(a.amount > 0)) {
        return res.status(400).json({ error: 'amount must be > 0' });
      }
    }

    const resp = await allocateBudgets(sponsorId, studentId, normalized as any, idempotency_key);
    return res.status(200).json(resp);
  } catch (error: any) {
    console.error('Allocate budgets error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('Insufficient sponsor credits')) {
      return res.status(409).json({ error: msg });
    }
    if (msg.includes('allocations must be') || msg.includes('amount must')) {
      return res.status(400).json({ error: msg });
    }
    if (msg.toLowerCase().includes('not linked')) {
      return res.status(403).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/:sponsorId/students/:studentId/budgets - List budgets for student
router.get('/:sponsorId/students/:studentId/budgets', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can view budgets.' });

    const { sponsorId, studentId } = req.params as { sponsorId: string; studentId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot view budgets for another sponsor' });

    const updated = await listBudgetsForSponsor(studentId, sponsorId);
    return res.status(200).json({ budgets: updated });
  } catch (error) {
    console.error('List budgets error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/:sponsorId/students/:studentId/ledger - List allocation ledger entries
router.get('/:sponsorId/students/:studentId/ledger', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can view ledger.' });

    const { sponsorId, studentId } = req.params as { sponsorId: string; studentId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot view ledger for another sponsor' });

    const items = await listAllocationLedgerBySponsorAsync(studentId, sponsorId, Number(req.query.limit) || 20);
    return res.status(200).json({ ledger: items });
  } catch (error) {
    console.error('List ledger error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sponsors/:sponsorId/credits/topup - Add sponsor credits (Phase 1 mock)
router.post('/:sponsorId/credits/topup', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can top up credits.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot top up credits for another sponsor' });

    const { amount_cents, idempotency_key } = req.body as { amount_cents: number; idempotency_key?: string };
    const amt = Number(amount_cents);
    if (!Number.isFinite(amt) || !(amt > 0)) {
      return res.status(400).json({ error: 'amount_cents must be a positive number' });
    }

    const result = await topupSponsorCredits(sponsorId, amt, idempotency_key);
    return res.status(200).json({ message: 'Top-up successful', ...result });
  } catch (error: any) {
    console.error('Top-up credits error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('amount_cents')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/:sponsorId/credits/summary - Balance + totals
router.get('/:sponsorId/credits/summary', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can view credits summary.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot view credits for another sponsor' });

    const agg = await getSponsorAggregateAsync(sponsorId);
    let approved_total_cents = Math.round(Number(agg?.approved_total_cents || 0));
    let allocated_total_cents = Math.round(Number(agg?.allocated_total_cents || 0));
    let balance_cents = Math.max(0, Math.round(Number(agg?.available_total_cents || (approved_total_cents - allocated_total_cents))));

    // Fallback: derive approved from ledger if aggregate missing/zero
    try {
      if (!agg || (approved_total_cents === 0 && balance_cents === 0)) {
        const approvedFromLedger = await sumSponsorApprovedDepositsAsync(sponsorId);
        if (approved_total_cents === 0 && approvedFromLedger > 0) {
          approved_total_cents = approvedFromLedger;
          if (!agg) {
            allocated_total_cents = 0;
            balance_cents = Math.max(0, approved_total_cents - allocated_total_cents);
          } else {
            balance_cents = Math.max(0, Math.round(Number(agg.available_total_cents || (approved_total_cents - allocated_total_cents))));
          }
        }
      }
    } catch (err) {
      // keep original values on fallback error
    }

    return res.status(200).json({ balance_cents, approved_total_cents, allocated_total_cents });
  } catch (error) {
    console.error('Credits summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sponsors/:sponsorId/students/:studentId/budgets/reverse - Reverse/Drain unconsumed allocations (LIFO)
router.post('/:sponsorId/students/:studentId/budgets/reverse', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can reverse budgets.' });

    const { sponsorId, studentId } = req.params as { sponsorId: string; studentId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot reverse for another sponsor' });

    const { reversals, idempotency_key } = req.body as { reversals: Array<{ category: string; amount: number }>; idempotency_key?: string };
    if (!Array.isArray(reversals) || reversals.length === 0) {
      return res.status(400).json({ error: 'reversals must be a non-empty array' });
    }

    const normalized = reversals.map(a => ({
      category: String(a.category),
      amount: Math.abs(Number(a.amount)),
    }));
    for (const r of normalized) {
      if (!SpendCategories.includes(r.category as any)) {
        return res.status(400).json({ error: `Invalid category: ${r.category}` });
      }
      if (!(r.amount > 0)) {
        return res.status(400).json({ error: 'amount must be > 0' });
      }
    }

    const resp = reverseAllocations(sponsorId, studentId, normalized as any, idempotency_key);
    return res.status(200).json(resp);
  } catch (error: any) {
    console.error('Reverse budgets error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('reversals must be') || msg.includes('invalid category') || msg.includes('amount must')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- EFT Deposit Notifications ---
// POST /api/sponsors/:sponsorId/eft-deposits/reference - Generate an EFT reference for this sponsor
router.post('/:sponsorId/eft-deposits/reference', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can request EFT references.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot request reference for another sponsor' });

    const reference = generateEFTReference(sponsorId);
    return res.status(201).json({ message: 'EFT reference generated', data: { reference } });
  } catch (error) {
    console.error('Generate EFT reference error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sponsors/:sponsorId/eft-deposits - Submit an EFT deposit notification (status=new)
router.post('/:sponsorId/eft-deposits', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can submit EFT notifications.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot submit notification for another sponsor' });

    const { amount_cents, reference, notes } = req.body as { amount_cents: number; reference?: string; notes?: string };
    const amt = Number(amount_cents);
    if (!Number.isFinite(amt) || !(amt > 0)) {
      return res.status(400).json({ error: 'amount_cents must be a positive number' });
    }

    const rec = await createEFTDepositNotification(sponsorId, amt, { reference, notes });
    return res.status(201).json({ message: 'Deposit notification submitted', data: { eft_deposit: rec } });
  } catch (error: any) {
    console.error('Submit EFT deposit notification error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('amount_cents')) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sponsors/:sponsorId/eft-deposits - List past deposit notifications with paging/filter
router.get('/:sponsorId/eft-deposits', async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const me = await getCurrentUser(token);
    if ('error' in me) return res.status(401).json({ error: me.error });
    if (me.user.role !== 'sponsor') return res.status(403).json({ error: 'Access denied. Only sponsors can view EFT notifications.' });

    const { sponsorId } = req.params as { sponsorId: string };
    if (me.user.id !== sponsorId) return res.status(403).json({ error: 'Cannot view notifications for another sponsor' });

    const statusRaw = String(req.query.status || 'all').toLowerCase();
    const page = Number(req.query.page || 1);
    const page_size = Number(req.query.page_size || 10);
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const cursor: any = decodeCursor(req.query.cursor as any);
    const allowed = ['all', 'new', 'allocated', 'rejected'];
    if (!allowed.includes(statusRaw)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    if (limit || cursor) {
      const { items, total, cursor: next } = await listEFTDepositNotificationsAsync(sponsorId, { status: statusRaw as any, limit, cursor });
      return res.status(200).json({ items, total, cursor: encodeCursor(next) });
    }

    const { items, total } = await listEFTDepositNotificationsAsync(sponsorId, { status: statusRaw as any, page, page_size });
    const total_pages = Math.max(1, Math.ceil(total / Math.max(1, page_size)));
    return res.status(200).json({ items, page, page_size, total, total_pages });
  } catch (error) {
    console.error('List EFT deposit notifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;