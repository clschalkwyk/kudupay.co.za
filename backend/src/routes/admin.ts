import { Router, Request, Response } from 'express';
import { extractTokenFromHeader, getCurrentUser } from '../services/auth';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import {
  listAllEFTDepositsAsync,
  getEFTDepositByIdAsync,
  approveEFTDeposit,
  rejectEFTDeposit,
} from '../services/sponsorship.store';

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<{ adminId: string } | null> {
  const token = extractTokenFromHeader(req);
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return null;
  }
  const me = await getCurrentUser(token);
  if ('error' in me) {
    res.status(401).json({ error: me.error });
    return null;
  }
  if (me.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Admins only.' });
    return null;
  }
  return { adminId: me.user.id };
}

// GET /api/admin/eft-deposits?status=new|allocated|rejected|all&page=&page_size=&limit=&cursor=
router.get('/eft-deposits', async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return; // response already sent

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
      const { items, total, cursor: next } = await listAllEFTDepositsAsync({ status: statusRaw as any, limit, cursor });
      return res.status(200).json({ items, total, cursor: encodeCursor(next) });
    }

    const { items, total } = await listAllEFTDepositsAsync({ status: statusRaw as any, page, page_size });
    const total_pages = Math.max(1, Math.ceil(total / Math.max(1, page_size)));
    return res.status(200).json({ items, page, page_size, total, total_pages });
  } catch (error) {
    console.error('Admin list EFT error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/eft-deposits/:eftId - with sponsor info
router.get('/eft-deposits/:eftId', async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { eftId } = req.params as { eftId: string };
    const eft = await getEFTDepositByIdAsync(eftId);
    if (!eft) return res.status(404).json({ error: 'Deposit not found' });
    return res.status(200).json({ eft_deposit: eft });
  } catch (error) {
    console.error('Admin get EFT error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/eft-deposits/:eftId/approve
router.post('/eft-deposits/:eftId/approve', async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { eftId } = req.params as { eftId: string };
    const { approved_amount_cents, idempotency_key } = req.body as { approved_amount_cents: number; idempotency_key?: string };
    const amt = Number(approved_amount_cents);
    if (!Number.isFinite(amt) || !(amt > 0)) {
      return res.status(400).json({ error: 'approved_amount_cents must be a positive number' });
    }

    const result = await approveEFTDeposit(eftId, admin.adminId, amt, idempotency_key);
    return res.status(200).json({ message: 'Approved', ...result });
  } catch (error: any) {
    console.error('Admin approve EFT error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('not found')) {
      return res.status(404).json({ error: msg });
    }
    if (msg.includes('already approved') || msg.includes('already rejected')) {
      return res.status(409).json({ error: msg });
    }
    if (msg.includes('must be > 0')) {
      return res.status(400).json({ error: msg });
    }
    if (msg.toLowerCase().includes('cannot approve')) {
      return res.status(400).json({ error: msg });
    }
    if (msg.toLowerCase().includes('cannot be approved')) {
      return res.status(409).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/eft-deposits/:eftId/reject
router.post('/eft-deposits/:eftId/reject', async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { eftId } = req.params as { eftId: string };
    const { reason, idempotency_key } = req.body as { reason?: string; idempotency_key?: string };

    const result = await rejectEFTDeposit(eftId, admin.adminId, reason, idempotency_key);
    return res.status(200).json({ message: 'Rejected', ...result });
  } catch (error: any) {
    console.error('Admin reject EFT error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('not found')) {
      return res.status(404).json({ error: msg });
    }
    if (msg.includes('already rejected') || msg.includes('already approved')) {
      return res.status(409).json({ error: msg });
    }
    if (msg.toLowerCase().includes('cannot reject')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
