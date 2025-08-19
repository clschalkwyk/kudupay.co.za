// Simple in-memory sponsorship + budgets/ledger store for development/testing
// NOTE: This is volatile and will reset on server restart. Replace with DB in production.

import { DynamoDBInterface, DynamoItem } from './dynamo.db';
require('dotenv').config();
const DB_TABLE_NAME = process.env.DB_TABLE_NAME || 'users';
const DB_TABLE_REGION = process.env.DB_TABLE_REGION || 'af-south-1';
const dynamo = new DynamoDBInterface(DB_TABLE_NAME, DB_TABLE_REGION);

// One-time GSI readiness check. Call ensureIndexesOnce() from app startup.
let __indexesChecked = false;
export async function ensureIndexesOnce(): Promise<void> {
  if (__indexesChecked) return;
  // GSI2 is required for getSponsorshipsForStudentAsync
  try {
    await dynamo.queryIndex({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
      ExpressionAttributeValues: { ':pk': 'STUDENT#__healthcheck__', ':sk': 'SPON#' },
      Limit: 1
    } as any);
  } catch (err: any) {
    console.error('[Startup] Missing required GSI2 (STUDENT partition). Ensure your table defines GSI2 with GSI2PK/GSI2SK.');
    throw err;
  }
  // GSI1 is optional; log a warning if missing. We fall back in code.
  try {
    await dynamo.queryIndex({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: { ':pk': 'SPONSOR#__healthcheck__', ':sk': 'EFT#' },
      Limit: 1
    } as any);
  } catch (err: any) {
    console.warn('[Startup] Optional GSI1 not found (sponsor EFT status listing). Code will fall back to partition query + filter.');
  }
  __indexesChecked = true;
}

export type CategoryLimits = Record<string, number>;

// SpendCategories must align exactly with frontend/src/constants/merchantCategories.ts (MerchantCategoryList)
// Note: we mirror the canonical values here to avoid cross-package build issues.
export const SpendCategories = [
  'Tuition',
  'Housing',
  'Books',
  'Food & Groceries',
  'Restaurants & Fast Food',
  'Transport',
  'Utilities',
  'Data & Airtime',
  'Hardware',
  'Libraries',
  'Labs & Classrooms',
  'Health & Wellness',
  'Student Center & Societies',
  'Sports & Recreation',
  'Arts & Culture',
  'Campus Accommodation Services',
  'Stationery & Supplies',
  'Apparel',
  'Financial Services',
  'Other',
  'General Retail',
] as const;
export type SpendCategory = typeof SpendCategories[number];

export interface SponsorshipRecord {
  id: string;
  sponsorId: string;
  studentId: string;
  amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  categoryLimits: CategoryLimits;
  createdAt: string;
}

// --- In-memory legacy sponsorships ---

export async function addDeposit(
  sponsorId: string,
  studentId: string,
  amount_cents: number,
  categoryLimits: CategoryLimits
): Promise<SponsorshipRecord> {
  const fee_cents = 200; // fixed fee of R2.00 in cents
  const amt = Math.max(0, Math.floor(Number(amount_cents)));
  const net_cents = Math.max(0, amt - fee_cents);
  const id = `spons_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const record: SponsorshipRecord = {
    id,
    sponsorId,
    studentId,
    amount_cents: amt,
    fee_cents,
    net_amount_cents: net_cents,
    categoryLimits: categoryLimits || {},
    createdAt,
  };
  // Persist sponsorship to DynamoDB (single-table)
  try {
    const item: DynamoItem = {
      Pk: `SPONSOR#${sponsorId}`,
      Sk: `SPONSORSHIP#${createdAt}#${id}`,
      entity: 'SPONSORSHIP',
      id,
      sponsorId,
      studentId,
      amount_cents: record.amount_cents,
      fee_cents: record.fee_cents,
      net_amount_cents: record.net_amount_cents,
      category_limits: record.categoryLimits,
      created_at: createdAt,
      // Optional GSI to fetch by sponsor or student if table supports
      GSI1PK: `SPONSOR#${sponsorId}`,
      GSI1SK: `SPON#${createdAt}#${id}`,
      GSI2PK: `STUDENT#${studentId}`,
      GSI2SK: `SPON#${createdAt}#${id}`,
    };
    await dynamo.putItem(item);
  } catch (err) {
    console.error('Failed to persist sponsorship to DynamoDB', { sponsorId, studentId, id, err });
  }
  // Do not auto-link here; linking must be explicit via API action
  return record;
}

export async function updateSponsorshipLimits(
  sponsorshipId: string,
  sponsorId: string,
  newLimits: CategoryLimits
): Promise<SponsorshipRecord | null> {
  try {
    // Query by sponsor partition and find sponsorship by id (no table scan)
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'SPONSORSHIP#' }
    } as any);
    const item = (resp.Items || []).find((it: any) => String(it.id) === String(sponsorshipId)) as any;
    if (!item) return null;
    if (String(item.sponsorId) !== String(sponsorId)) return null;
    const pk = String(item.Pk || `SPONSOR#${sponsorId}`);
    const sk = String(item.Sk);
    const now = new Date().toISOString();
    await dynamo.updateItem({
      Pk: pk,
      Sk: sk,
      UpdateExpression: 'SET category_limits = :cl, updated_at = :u',
      ExpressionAttributeValues: { ':cl': newLimits || {}, ':u': now }
    });
    return {
      id: String(item.id),
      sponsorId: String(item.sponsorId),
      studentId: String(item.studentId),
      amount_cents: Number(item.amount_cents || 0),
      fee_cents: Number(item.fee_cents || 0),
      net_amount_cents: Number(item.net_amount_cents || 0),
      categoryLimits: newLimits || {},
      createdAt: String(item.created_at || now)
    };
  } catch (err) {
    console.error('updateSponsorshipLimits failed', { sponsorshipId, sponsorId, err });
    return null;
  }
}

export async function getSponsorTotals(sponsorId: string): Promise<{
  totalDeposited: number; // ZAR units for backward compatibility
  totalFeesPaid: number;  // ZAR units
  uniqueStudents: number;
}> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'SPONSORSHIP#' }
    } as any);
    let total_cents = 0;
    let fees_cents = 0;
    const studentSet = new Set<string>();
    for (const it of (resp.Items || []) as any[]) {
      total_cents += Math.round(Number(it.amount_cents || 0));
      fees_cents += Math.round(Number(it.fee_cents || 0));
      if (it.studentId) studentSet.add(String(it.studentId));
    }
    // Return ZAR units as original contract expects
    const totalDeposited = Math.round(total_cents / 100);
    const totalFeesPaid = Math.round(fees_cents / 100);
    return { totalDeposited, totalFeesPaid, uniqueStudents: studentSet.size };
  } catch (err) {
    console.error('getSponsorTotals query failed', { sponsorId, err });
    return { totalDeposited: 0, totalFeesPaid: 0, uniqueStudents: 0 };
  }
}


export async function getSponsorshipsForSponsorAsync(sponsorId: string): Promise<SponsorshipRecord[]> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'SPONSORSHIP#' }
    } as any);
    const items = (resp.Items || []) as any[];
    return items.map(it => ({
      id: String(it.id || ''),
      sponsorId: String(it.sponsorId || sponsorId),
      studentId: String(it.studentId || ''),
      amount_cents: Number(it.amount_cents || 0),
      fee_cents: Number(it.fee_cents || 0),
      net_amount_cents: Number(it.net_amount_cents || 0),
      categoryLimits: (it.category_limits || {}) as CategoryLimits,
      createdAt: String(it.created_at || new Date().toISOString())
    }));
  } catch (err) {
    console.error('getSponsorshipsForSponsorAsync failed', { sponsorId, err });
    return [];
  }
}


export async function getSponsorshipsForStudentAsync(studentId: string): Promise<SponsorshipRecord[]> {
  try {
    // Ensure indexes are present (GSI2 required)
    await ensureIndexesOnce();
    // Require GSI2; no Scan fallback
    const q = await dynamo.queryIndex({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'SPON#' }
    } as any);
    const items = (q.Items || []) as any[];
    return items.map(it => ({
      id: String(it.id || ''),
      sponsorId: String(it.sponsorId || ''),
      studentId: String(it.studentId || studentId),
      amount_cents: Number(it.amount_cents || 0),
      fee_cents: Number(it.fee_cents || 0),
      net_amount_cents: Number(it.net_amount_cents || 0),
      categoryLimits: (it.category_limits || {}) as CategoryLimits,
      createdAt: String(it.created_at || new Date().toISOString())
    }));
  } catch (err) {
    console.error('getSponsorshipsForStudentAsync failed (GSI2 required)', { studentId, err });
    return [];
  }
}


// DB-backed aggregate using persisted student+sponsor+category budgets
export async function getStudentAggregateAsync(studentId: string): Promise<{
  totalBalance: number;
  categoryLimits: Record<string, { limit: number; spent: number; remaining: number }>
}> {
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    const agg: Record<string, { limit: number; spent: number; remaining: number }> = {};
    let total = 0;
    for (const it of items) {
      const cat = String(it.category);
      const allocated = Math.round(Number(it.allocated_total_cents || 0));
      const used = Math.round(Number(it.used_total_cents || 0));
      const cur = agg[cat] || { limit: 0, spent: 0, remaining: 0 };
      cur.limit += allocated;
      cur.spent += used;
      cur.remaining = Math.max(0, cur.limit - cur.spent);
      agg[cat] = cur;
      total += allocated;
    }
    return { totalBalance: total, categoryLimits: agg };
  } catch (err) {
    console.error('getStudentAggregateAsync failed', { studentId, err });
    return { totalBalance: 0, categoryLimits: {} };
  }
}

// --- Budgets (summary per student+category) ---


export async function getSponsorCreditBalanceAsync(sponsorId: string): Promise<number> {
  try {
    const agg = await getSponsorAggregateAsync(sponsorId);
    const aggAvail = agg ? Math.max(0, Math.round(Number(agg.available_total_cents || 0))) : 0;
    if (aggAvail > 0) return aggAvail;

    // Fallback: derive balance from approved deposits ledger minus allocated
    const approvedSum = await sumSponsorApprovedDepositsAsync(sponsorId);
    if (!agg) return Math.max(0, approvedSum);

    const allocated = Math.max(0, Math.round(Number(agg.allocated_total_cents || 0)));
    return Math.max(0, approvedSum - allocated);
  } catch (err) {
    console.error('getSponsorCreditBalanceAsync error', { sponsorId, err });
    return 0;
  }
}
export async function topupSponsorCredits(
  sponsorId: string,
  amount_cents: number,
  idempotency_key?: string,
  opts?: { ledgerType?: LedgerType; eft_id?: string }
): Promise<{ sponsorId: string; balance_cents: number }> {
  const amt = Number(amount_cents);
  if (!(amt > 0)) throw new Error('amount_cents must be > 0');
  const scope = `TOPUP#${sponsorId}`;
  if (idempotency_key) {
    const existing = await getIdempotentResponse(scope, idempotency_key);
    if (existing) return existing;
  }
  const now = new Date().toISOString();

  // Record ledger deposit (DynamoDB only)
  const ts = Date.now();
  const uid = Math.random().toString(36).slice(2, 10);
  const ledgerType = (opts?.ledgerType ?? 'DEPOSIT') as LedgerType;
  try {
    const item: DynamoItem = {
      Pk: `SPONSOR#${sponsorId}`,
      Sk: `LEDGER#${ts}#${uid}`,
      type: ledgerType,
      amount: amt,
      sponsorId: sponsorId,
      eft_id: opts?.eft_id,
      created_at: now,
    };
    await dynamo.putItem(item);
  } catch (err) {
    console.error('Failed to persist ledger deposit to DynamoDB', { sponsorId, err });
  }

  // Seed aggregate row (first-write safety)
  try {
    await dynamo.putItem({
      Pk: `SPONSOR#${sponsorId}`,
      Sk: 'AGGREGATE',
      sponsorId,
      approved_total_cents: 0,
      allocated_total_cents: 0,
      available_total_cents: 0,
      created_at: now,
    } as any, { ConditionExpression: 'attribute_not_exists(Pk) AND attribute_not_exists(Sk)' });
  } catch {}
  // Apply aggregate delta — do not swallow errors
  try {
    await updateSponsorAggregate(sponsorId, { delta_approved_cents: amt });
  } catch (err) {
    console.error('topupSponsorCredits: updateSponsorAggregate failed', { sponsorId, amt, err });
    throw new Error('Failed to apply sponsor credit');
  }

  // Determine current balance from aggregate (authoritative)
  const agg = await getSponsorAggregateAsync(sponsorId);
  const balance_cents = agg ? Math.max(0, Math.round(Number(agg.available_total_cents || 0))) : 0;

  const response = { sponsorId, balance_cents };
  if (idempotency_key) await putIdempotentResponse(scope, idempotency_key, response);
  return response;
}

// --- Allocation Lots (FIFO per student+category) ---
export interface AllocationLot {
  sponsorId: string;
  studentId: string;
  category: SpendCategory;
  ts: number;
  lotId: string;
  amount_cents: number; // integer units (dev: ZAR or cents; consistent within app)
  remaining_cents: number;
}

// --- Ledger (append-only) ---
export type LedgerType = 'DEPOSIT' | 'DEPOSIT_APPROVED' | 'DEPOSIT_REJECTED' | 'ALLOCATION' | 'SPEND' | 'REVERSAL';
export interface LedgerEntry {
  PK: string; // STUDENT#{studentId} | SPONSOR#{sponsorId}
  SK: string; // LEDGER#{ts}#{uuid}
  type: LedgerType;
  category?: SpendCategory;
  amount: number; // integer units
  sponsorId?: string; // for ALLOCATION/DEPOSIT
  txId?: string;      // for SPEND
  eft_id?: string;    // for DEPOSIT_APPROVED/DEPOSIT_REJECTED
  created_at: string;
}


// --- Student-Sponsor Aggregates in DynamoDB ---
export async function updateSponsorStudentAggregate(sponsorId: string, studentId: string, delta_allocated_cents: number) {
  const pk = `STUDENT#${studentId}`;
  const sk = `AGG#SPONSOR#${sponsorId}`;
  const now = new Date().toISOString();
  try {
    await dynamo.updateItem({
      Pk: pk,
      Sk: sk,
      UpdateExpression: 'SET allocated_total_cents = if_not_exists(allocated_total_cents, :z) + :d, updated_at = :u, sponsorId = :sid, studentId = :stid',
      ExpressionAttributeValues: { ':z': 0, ':d': Number(delta_allocated_cents || 0), ':u': now, ':sid': sponsorId, ':stid': studentId }
    });
  } catch (err) {
    console.error('Failed to update SponsorStudentAggregate', { sponsorId, studentId, err });
  }
}

export async function listSponsorStudentAggregates(studentId: string): Promise<Array<{ sponsorId: string; allocated_total_cents: number; updated_at?: string }>> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'AGG#SPONSOR#' }
    } as any);
    const items = (resp.Items || []) as any[];
    return items.map(it => ({
      sponsorId: String(it.sponsorId || String(it.Sk || '').split('AGG#SPONSOR#')[1] || ''),
      allocated_total_cents: Number(it.allocated_total_cents || 0),
      updated_at: it.updated_at as string | undefined,
    }));
  } catch (err) {
    console.error('Failed to list SponsorStudentAggregates', { studentId, err });
    return [];
  }
}

// --- Sponsor-wide aggregate (authoritative balances) ---
export interface SponsorAggregate {
  sponsorId: string;
  approved_total_cents: number;
  allocated_total_cents: number;
  available_total_cents: number;
  updated_at?: string;
  created_at?: string;
}

export async function getSponsorAggregateAsync(sponsorId: string): Promise<SponsorAggregate | null> {
  try {
    const item = await dynamo.getItem({ Pk: `SPONSOR#${sponsorId}` as any, Sk: 'AGGREGATE' });
    if (!item) return null;
    return {
      sponsorId: String(item.sponsorId || sponsorId),
      approved_total_cents: Math.round(Number(item.approved_total_cents || 0)),
      allocated_total_cents: Math.round(Number(item.allocated_total_cents || 0)),
      available_total_cents: Math.round(Number(item.available_total_cents || 0)),
      updated_at: item.updated_at as string | undefined,
      created_at: item.created_at as string | undefined,
    };
  } catch (err) {
    console.error('getSponsorAggregateAsync failed', { sponsorId, err });
    return null;
  }
}

export async function updateSponsorAggregate(sponsorId: string, deltas: { delta_approved_cents?: number; delta_allocated_cents?: number }) {
  const da = Math.round(Number(deltas.delta_approved_cents || 0));
  const dl = Math.round(Number(deltas.delta_allocated_cents || 0));
  const now = new Date().toISOString();
  try {
    await dynamo.updateItem({
      Pk: `SPONSOR#${sponsorId}`,
      Sk: 'AGGREGATE',
      UpdateExpression: 'SET approved_total_cents = if_not_exists(approved_total_cents, :z) + :da, allocated_total_cents = if_not_exists(allocated_total_cents, :z) + :dl, available_total_cents = if_not_exists(available_total_cents, :z) + :da - :dl, updated_at = :u, sponsorId = :sid',
      ExpressionAttributeValues: { ':z': 0, ':da': da, ':dl': dl, ':u': now, ':sid': sponsorId },
    });
  } catch (err) {
    console.error('updateSponsorAggregate failed', { sponsorId, deltas, err });
  }
}

export async function updateStudentSponsorCategoryBudget(
  sponsorId: string,
  studentId: string,
  category: SpendCategory,
  delta_allocated_cents: number
) {
  const pk = `STUDENT#${studentId}`;
  const sk = `BUDGET#SPONSOR#${sponsorId}#CATEGORY#${category}`;
  const now = new Date().toISOString();
  try {
    await dynamo.updateItem({
      Pk: pk,
      Sk: sk,
      UpdateExpression: 'SET allocated_total_cents = if_not_exists(allocated_total_cents, :z) + :d, used_total_cents = if_not_exists(used_total_cents, :z), updated_at = :u, sponsorId = :sid, studentId = :stid, category = :cat',
      ExpressionAttributeValues: { ':z': 0, ':d': Number(delta_allocated_cents || 0), ':u': now, ':sid': sponsorId, ':stid': studentId, ':cat': category }
    });
  } catch (err) {
    console.error('Failed to update StudentSponsorCategoryBudget', { sponsorId, studentId, category, err });
  }
}

export async function incrementStudentSponsorCategoryUsed(
  sponsorId: string,
  studentId: string,
  category: SpendCategory,
  delta_used_cents: number
) {
  const pk = `STUDENT#${studentId}`;
  const sk = `BUDGET#SPONSOR#${sponsorId}#CATEGORY#${category}`;
  const now = new Date().toISOString();
  try {
    await dynamo.updateItem({
      Pk: pk,
      Sk: sk,
      UpdateExpression: 'SET used_total_cents = if_not_exists(used_total_cents, :z) + :uinc, allocated_total_cents = if_not_exists(allocated_total_cents, :z), updated_at = :u, sponsorId = :sid, studentId = :stid, category = :cat',
      ExpressionAttributeValues: { ':z': 0, ':uinc': Number(delta_used_cents || 0), ':u': now, ':sid': sponsorId, ':stid': studentId, ':cat': category }
    });
  } catch (err) {
    console.error('Failed to increment used_total_cents for StudentSponsorCategoryBudget', { sponsorId, studentId, category, err });
  }
}

export async function listStudentSponsorCategoryBudgets(studentId: string): Promise<Array<{ sponsorId: string; category: SpendCategory; allocated_total_cents: number; used_total_cents: number; updated_at?: string }>> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'BUDGET#SPONSOR#' }
    } as any);
    const items = (resp.Items || []) as any[];
    return items.map(it => ({
      sponsorId: String((it as any).sponsorId || ''),
      category: String((it as any).category) as SpendCategory,
      allocated_total_cents: Number((it as any).allocated_total_cents || 0),
      used_total_cents: Number((it as any).used_total_cents || 0),
      updated_at: (it as any).updated_at as string | undefined,
    }));
  } catch (err) {
    console.error('Failed to list StudentSponsorCategoryBudgets', { studentId, err });
    return [];
  }
}

// --- DB-backed idempotency helpers ---
interface IdemRecord { response: any; created_at: string }
const idemKey = (scope: string, idempotencyKey: string) => `IDEMPOTENCY#${scope}#${idempotencyKey}`;

async function getIdempotentResponse(scope: string, idempotencyKey: string): Promise<any | null> {
  try {
    const item = await dynamo.getItem({ Pk: `IDEMPOTENCY#${scope}` as any, Sk: idempotencyKey });
    if (!item) return null;
    return (item as any).response ?? null;
  } catch {
    return null;
  }
}

async function putIdempotentResponse(scope: string, idempotencyKey: string, response: any) {
  const now = new Date();
  const ttlDays = Number(process.env.IDEMPOTENCY_TTL_DAYS || 14);
  const expires_at = Math.floor(now.getTime() / 1000) + ttlDays * 24 * 60 * 60;
  try {
    await dynamo.putItem({
      Pk: `IDEMPOTENCY#${scope}`,
      Sk: idempotencyKey,
      entity: 'IDEMPOTENCY',
      scope,
      idempotency_key: idempotencyKey,
      response,
      created_at: now.toISOString(),
      expires_at
    } as any);
  } catch (err) {
    console.error('putIdempotentResponse failed', { scope, idempotencyKey, err });
  }
}

// --- Sponsor-Student links (DB-only) ---
const linkKey = (sponsorId: string, studentId: string) => `${sponsorId}#${studentId}`;
export async function addSponsorStudentLink(sponsorId: string, studentId: string) {
  const now = new Date().toISOString();
  const item: DynamoItem = {
    Pk: `SPONSOR#${sponsorId}`,
    Sk: `STUDENT_LINK#${studentId}`,
    entity: 'SPONSOR_STUDENT_LINK',
    sponsorId,
    studentId,
    created_at: now,
    GSI1PK: `SPONSOR#${sponsorId}`,
    GSI1SK: `STUDENT#${studentId}`
  };
  try {
    await dynamo.putItem(item, {
      ConditionExpression: 'attribute_not_exists(Pk) AND attribute_not_exists(Sk)'
    });
  } catch (err) {
    const msg = (err && (err as any).message) || '';
    if (!msg.includes('ConditionalCheckFailed')) {
      console.error('Failed to persist sponsor-student link to DynamoDB', { sponsorId, studentId, err });
      throw err;
    }
  }
}
export async function hasSponsorStudentLinkAsync(sponsorId: string, studentId: string): Promise<boolean> {
  try {
    const item = await dynamo.getItem({ Pk: `SPONSOR#${sponsorId}` as any, Sk: `STUDENT_LINK#${studentId}` });
    return !!item;
  } catch (err) {
    console.error('hasSponsorStudentLinkAsync failed', { sponsorId, studentId, err });
    return false;
  }
}
export async function listLinkedStudentsBySponsor(sponsorId: string): Promise<string[]> {
  const resultSet = new Set<string>();
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'STUDENT_LINK#' }
    } as any);
    for (const it of (resp.Items || [])) {
      const sk = String((it as any).Sk || '');
      let sid = (it as any).studentId as string | undefined;
      if (!sid && sk.startsWith('STUDENT_LINK#')) sid = sk.substring('STUDENT_LINK#'.length);
      if (sid) resultSet.add(sid);
    }
  } catch (err) {
    console.error('Failed to query sponsor-student links from DynamoDB', { sponsorId, err });
  }
  return Array.from(resultSet);
}

export async function allocateBudgets(
  sponsorId: string,
  studentId: string,
  allocations: Array<{ category: SpendCategory; amount: number }>,
  idempotency_key?: string
): Promise<{ updated: Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }> }> {
  // Prefer async sponsor-student link checks
  const linked = await hasSponsorStudentLinkAsync(sponsorId, studentId);
  if (!linked) {
    throw new Error('Sponsor is not linked to this student');
  }

  // Validate inputs
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new Error('allocations must be a non-empty array');
  }
  for (const a of allocations) {
    // Canonicalize category to unify close variants (e.g., Restaurants & Fast Food -> Food)
    const norm = normalizeCategory(a.category as any);
    if (norm) (a as any).category = norm;
    if (!SpendCategories.includes(a.category)) {
      throw new Error(`invalid category: ${a.category}`);
    }
    if (!(Number(a.amount) > 0)) {
      throw new Error('amount must be > 0');
    }
  }

  const scope = `ALLOCATE#${sponsorId}#${studentId}`;
  if (idempotency_key) {
    const existing = await getIdempotentResponse(scope, idempotency_key);
    if (existing) return existing;
  }

  // Phase 1: enforce SponsorCredit balance and create FIFO AllocationLots
  const totalRequested = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const currentBal = await getSponsorCreditBalanceAsync(sponsorId);
  if (currentBal < totalRequested) {
    throw new Error('Insufficient sponsor credits');
  }
  // Persist aggregates in DynamoDB
  try {
    await updateSponsorStudentAggregate(sponsorId, studentId, totalRequested);
  } catch (e) { /* noop */ }
  try {
    await updateSponsorAggregate(sponsorId, { delta_allocated_cents: totalRequested });
  } catch (e) { /* noop */ }
  // No direct mutation of in-memory credits; balance is derived from durable totals
  const now = new Date().toISOString();

  // Apply allocations
  for (const a of allocations) {
    const ts = Date.now();
    const tsStr = String(ts).padStart(13, '0');
    const lotId = Math.random().toString(36).slice(2, 10);

    // Create Allocation Lot (persist to DynamoDB)
    const lot: AllocationLot = {
      sponsorId,
      studentId,
      category: a.category,
      ts,
      lotId,
      amount_cents: Number(a.amount),
      remaining_cents: Number(a.amount)
    };
    try {
      const lotItem: DynamoItem = {
        Pk: `STUDENT#${studentId}`,
        Sk: `ALLOT#${a.category}#${tsStr}#${lotId}`,
        entity: 'ALLOCATION_LOT',
        sponsorId,
        studentId,
        category: a.category,
        ts,
        lotId,
        amount_cents: lot.amount_cents,
        remaining_cents: lot.remaining_cents,
        created_at: now
      };
      await dynamo.putItem(lotItem);
    } catch (err) {
      console.error('Failed to persist AllocationLot to DynamoDB', { sponsorId, studentId, category: a.category, err });
    }

    // Write ledger (ALLOCATION) directly to DynamoDB (awaited)
    try {
      const allocEntry: DynamoItem = {
        Pk: `STUDENT#${studentId}`,
        Sk: `LEDGER#${ts}#${lotId}`,
        type: 'ALLOCATION',
        category: a.category,
        amount: Number(a.amount),
        sponsorId: sponsorId,
        studentId: studentId,
        created_at: now,
      };
      await dynamo.putItem(allocEntry);
    } catch (err) {
      console.error('Failed to persist allocation ledger to DynamoDB', { sponsorId, studentId, category: a.category, err });
    }

    // Persist per-category student-sponsor budget aggregate in DynamoDB (await for durability)
    try {
      await updateStudentSponsorCategoryBudget(sponsorId, studentId, a.category as any, Number(a.amount));
    } catch (err) {
      console.error('Failed to update StudentSponsorCategoryBudget', { sponsorId, studentId, category: a.category, err });
    }

    // No in-memory budget summary updates; DB is the source of truth
  }

  const categories = allocations.map(a => a.category);
  let updated: Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }>
    = [];
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    const combined: Record<string, { allocated: number; used: number }> = {};
    for (const it of items) {
      const cat = String((it as any).category);
      const allocated = Math.round(Number((it as any).allocated_total_cents || 0));
      const used = Math.round(Number((it as any).used_total_cents || 0));
      const cur = combined[cat] || { allocated: 0, used: 0 };
      cur.allocated += allocated;
      cur.used += used;
      combined[cat] = cur;
    }
    updated = categories.map((cat) => {
      const key = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === String(cat).toLowerCase()) || String(cat);
      const vals = combined[key] || { allocated: 0, used: 0 };
      const available = Math.max(0, vals.allocated - vals.used);
      return { category: cat, allocated_total: vals.allocated, used_total: vals.used, available };
    });
  } catch (err) {
    console.error('allocateBudgets: failed to compute response from DB', { studentId, err });
    updated = [];
  }

  const response = { updated };
  if (idempotency_key) {
    await putIdempotentResponse(scope, idempotency_key, response);
  }
  return response;
}


export async function listBudgetsAsync(
  studentId: string,
  categories?: SpendCategory[]
): Promise<Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }>> {
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    const combined: Record<string, { allocated: number; used: number }> = {};
    for (const it of items) {
      const cat = String(it.category);
      const alloc = Math.round(Number(it.allocated_total_cents || 0));
      const used = Math.round(Number(it.used_total_cents || 0));
      const curr = combined[cat] || { allocated: 0, used: 0 };
      curr.allocated += alloc;
      curr.used += used;
      combined[cat] = curr;
    }
    const cats = categories && categories.length ? categories : SpendCategories;
    const result: Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }> = [];
    for (const cat of cats) {
      const key = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === String(cat).toLowerCase()) || String(cat);
      const vals = combined[key] || { allocated: 0, used: 0 };
      const available = Math.max(0, vals.allocated - vals.used);
      result.push({ category: cat as SpendCategory, allocated_total: vals.allocated, used_total: vals.used, available });
    }
    return result;
  } catch (err) {
    console.error('listBudgetsAsync error', { studentId, err });
    return [];
  }
}

export async function listBudgetsForSponsor(
  studentId: string,
  sponsorId: string
): Promise<Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }>> {
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    const filtered = items.filter(it => String(it.sponsorId) === String(sponsorId));
    return filtered.map(it => {
      const allocated = Math.round(Number(it.allocated_total_cents || 0));
      const used = Math.round(Number(it.used_total_cents || 0));
      const available = Math.max(0, allocated - used);
      return { category: it.category as SpendCategory, allocated_total: allocated, used_total: used, available };
    });
  } catch (err) {
    console.error('listBudgetsForSponsor error', { studentId, sponsorId, err });
    return [];
  }
}


// DB-backed ledger listing (new)
export async function listAllocationLedgerAsync(studentId: string, limit: number = 20): Promise<LedgerEntry[]> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'LEDGER#' },
      ScanIndexForward: false,
      Limit: Math.max(1, Math.min(100, Number(limit || 20)))
    });
    const items = (resp.Items || []) as any[];
    return items
      .filter(it => String(it.type) === 'ALLOCATION')
      .map(it => ({
        PK: String(it.Pk),
        SK: String(it.Sk),
        type: String(it.type) as LedgerType,
        category: it.category as SpendCategory | undefined,
        amount: Number(it.amount || 0),
        sponsorId: it.sponsorId as string | undefined,
        txId: it.txId as string | undefined,
        eft_id: it.eft_id as string | undefined,
        created_at: String(it.created_at || new Date().toISOString()),
      })) as LedgerEntry[];
  } catch (err) {
    console.error('listAllocationLedgerAsync error', { studentId, err });
    return [];
  }
}

export async function listAllocationLedgerBySponsorAsync(studentId: string, sponsorId: string, limit: number = 20): Promise<LedgerEntry[]> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'LEDGER#' },
      ScanIndexForward: false,
      Limit: Math.max(1, Math.min(200, Number(limit || 20)))
    });
    const items = (resp.Items || []) as any[];
    return items
      .filter(it => String(it.type) === 'ALLOCATION' && String(it.sponsorId || '') === String(sponsorId))
      .map(it => ({
        PK: String(it.Pk),
        SK: String(it.Sk),
        type: String(it.type) as LedgerType,
        category: it.category as SpendCategory | undefined,
        amount: Number(it.amount || 0),
        sponsorId: it.sponsorId as string | undefined,
        txId: it.txId as string | undefined,
        eft_id: it.eft_id as string | undefined,
        created_at: String(it.created_at || new Date().toISOString()),
      })) as LedgerEntry[];
  } catch (err) {
    console.error('listAllocationLedgerBySponsorAsync error', { studentId, sponsorId, err });
    return [];
  }
}

// --- Sponsor summaries (DB-only) ---
export async function getSponsorApprovedDepositsTotalAsync(sponsorId: string): Promise<number> {
  try {
    const agg = await getSponsorAggregateAsync(sponsorId);
    return Math.round(Number(agg?.approved_total_cents || 0));
  } catch (err) {
    console.error('getSponsorApprovedDepositsTotalAsync failed', { sponsorId, err });
    return 0;
  }
}

// Fallback removed: rely strictly on Sponsor aggregate allocated_total_cents.
export async function getSponsorAllocatedTotalFromDynamoAsync(sponsorId: string): Promise<number> {
  try {
    const agg = await getSponsorAggregateAsync(sponsorId);
    return Math.round(Number(agg?.allocated_total_cents || 0));
  } catch (err) {
    console.error('getSponsorAllocatedTotalFromDynamoAsync error', { sponsorId, err });
    return 0;
  }
}



// --- Transactions and Merchant registry (Phase 1 in-memory) ---
export type TxStatus = 'PENDING' | 'APPROVED' | 'PARTIAL_APPROVED' | 'DECLINED';
export interface TransactionRecord {
  studentId: string;
  txId: string;
  ts: number;
  merchantId?: string;
  category: SpendCategory;
  amount_requested_cents: number;
  amount_covered_cents: number;
  amount_shortfall_cents: number;
  status: TxStatus;
  meta?: any;
}

interface Merchant { merchantId: string; category: SpendCategory; status: 'active' | 'inactive' }
// Local merchant maps/caches removed: always read from DynamoDB

// --- Merchant info (DB-backed fetch only) ---
interface MerchantInfo { merchantId: string; category?: SpendCategory; approved?: boolean; status?: string }

export async function getMerchantInfoFromDB(merchantId: string): Promise<MerchantInfo | null> {
  try {
    const item = await dynamo.getItem({ Pk: `MERCHANT#${merchantId}` as any, Sk: 'BUSINESS_INFO' });
    return item ? {
      merchantId,
      category: (item as any).category as any,
      approved: Boolean((item as any).approved),
      status: (item as any).status || ((item as any).isOnline != null ? ((item as any).isOnline ? 'active' : 'inactive') : 'active')
    } : null;
  } catch {
    return null;
  }
}

async function resolveMerchantCategoryStrictAsync(merchantId?: string, fallbackCategory?: SpendCategory): Promise<SpendCategory> {
  if (merchantId) {
    const info = await getMerchantInfoFromDB(merchantId);
    if (!info) throw new Error('Unknown merchantId');
    const status = String(info.status || 'active').toLowerCase();
    if (!info.approved || status !== 'active') throw new Error('Merchant inactive or not approved');
    const cat = normalizeCategory(info.category as any);
    if (!cat) throw new Error('Merchant category invalid');
    return cat;
  }
  const norm = normalizeCategory(fallbackCategory as any);
  if (norm) return norm;
  throw new Error('merchantId or category is required');
}

// Deprecated in-memory TX listing removed; use DB-backed listing

export async function listStudentTransactionsFromDB(studentId: string, params?: { Limit?: number; ExclusiveStartKey?: any }): Promise<{ Items: DynamoItem[]; LastEvaluatedKey?: any }> {
  const Limit = Math.max(1, Math.min(100, Number(params?.Limit || 20)));
  const result = await dynamo.query({
    KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
    ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'SPEND#' },
    ScanIndexForward: false,
    Limit,
    ExclusiveStartKey: params?.ExclusiveStartKey
  });
  return { Items: (result.Items || []) as any, LastEvaluatedKey: result.LastEvaluatedKey };
}


function normalizeCategory(input?: string): SpendCategory | undefined {
  if (!input) return undefined;
  const lc = String(input).toLowerCase();
  // Strict: only accept exact canonical values (case-insensitive), no aliasing
  const direct = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === lc);
  return direct as SpendCategory | undefined;
}

function resolveMerchantCategory(merchantId?: string, fallbackCategory?: SpendCategory): SpendCategory {
  // Local merchant map removed; enforce strict path or fallbackCategory only
  if (merchantId) {
    throw new Error('resolveMerchantCategory with merchantId is deprecated. Use resolveMerchantCategoryStrictAsync.');
  }
  const norm = normalizeCategory(fallbackCategory as any);
  if (norm) return norm;
  throw new Error('merchantId or category is required');
}

export async function prepareTransaction(
  studentId: string,
  params: { merchantId?: string; category?: SpendCategory; amount_cents: number; idempotency_key?: string }
): Promise<{ transaction: TransactionRecord }> {
  const amt = Number(params.amount_cents);
  if (!Number.isFinite(amt) || !(amt > 0)) throw new Error('amount_cents must be > 0');

  const scope = `TX_PREPARE#${studentId}`;
  if (params.idempotency_key) {
    const idem = await getIdempotentResponse(scope, params.idempotency_key);
    if (idem) return idem as any;
  }

  const category = await resolveMerchantCategoryStrictAsync(params.merchantId, params.category as SpendCategory | undefined);
  // Compute availability strictly from DB-backed aggregates (no in-memory dependency)
  let available = 0;
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    let alloc = 0, used = 0;
    for (const it of items) {
      const canon = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === String(it.category).toLowerCase());
      if (canon && canon.toLowerCase() === String(category).toLowerCase()) {
        alloc += Math.round(Number(it.allocated_total_cents || 0));
        used += Math.round(Number(it.used_total_cents || 0));
      }
    }
    available = Math.max(0, alloc - used);
  } catch {}
  const covered = Math.min(amt, available);
  const shortfall = Math.max(0, amt - covered);

  const tx: TransactionRecord = {
    studentId,
    txId: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    merchantId: params.merchantId,
    category,
    amount_requested_cents: amt,
    amount_covered_cents: covered,
    amount_shortfall_cents: shortfall,
    status: 'PENDING',
    meta: { prepared_available: available }
  };
  // Persist PENDING transaction in DynamoDB
  try {
    const tsStr = String(tx.ts).padStart(13, '0');
    const item: DynamoItem = {
      Pk: `STUDENT#${studentId}`,
      Sk: `TX#PENDING#${tsStr}#${tx.txId}`,
      type: 'TX_PENDING',
      txId: tx.txId,
      studentId,
      merchantId: tx.merchantId || null,
      category: tx.category,
      amount_requested_cents: tx.amount_requested_cents,
      amount_covered_cents: tx.amount_covered_cents,
      amount_shortfall_cents: tx.amount_shortfall_cents,
      status: tx.status,
      created_at: new Date(tx.ts).toISOString()
    };
    await dynamo.putItem(item);
  } catch (err) {
    console.error('Failed to persist TX_PENDING to DynamoDB', { studentId, txId: tx.txId, err });
  }

  const response = { transaction: tx };
  if (params.idempotency_key) await putIdempotentResponse(scope, params.idempotency_key, response);
  return response as any;
}

export async function confirmTransaction(
  studentId: string,
  txId: string,
  idempotency_key?: string
): Promise<{ transaction: TransactionRecord; reconfirm_required?: boolean }> {
  const scope = `TX_CONFIRM#${studentId}#${txId}`;
  if (idempotency_key) {
    const idem = await getIdempotentResponse(scope, idempotency_key);
    if (idem) return idem as any;
  }

  let tx: TransactionRecord | undefined = undefined;
  if (!tx) {
    // Try load from DynamoDB pending state
    try {
      const resp = await dynamo.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': 'TX#PENDING#' },
        ScanIndexForward: false,
        Limit: 50
      });
      const items = (resp.Items || []) as any[];
      const it = items.find(i => String(i.txId || '') === String(txId));
      if (it) {
        tx = {
          studentId,
          txId: String(it.txId),
          ts: new Date(String(it.created_at || new Date().toISOString())).getTime(),
          merchantId: it.merchantId as string | undefined,
          category: String(it.category) as SpendCategory,
          amount_requested_cents: Number(it.amount_requested_cents || 0),
          amount_covered_cents: Number(it.amount_covered_cents || 0),
          amount_shortfall_cents: Number(it.amount_shortfall_cents || 0),
          status: 'PENDING',
          meta: {}
        };
        // No in-memory caching
      }
    } catch (err) {
      console.error('Failed to load TX_PENDING from DynamoDB', { studentId, txId, err });
    }
  }
  if (!tx) throw new Error('Transaction not found');
  if (tx.status !== 'PENDING') {
    return { transaction: tx };
  }

  // Re-verify merchant category and status from DB/cache to harden confirm
  if (tx.merchantId) {
    const info = await getMerchantInfoFromDB(tx.merchantId);
    if (!info) throw new Error('Unknown merchantId');
    const status = String(info.status || 'active').toLowerCase();
    if (!info.approved || status !== 'active') throw new Error('Merchant inactive or not approved');
    const cat = normalizeCategory(info.category as any);
    if (!cat) throw new Error('Merchant category invalid');
    if (cat !== tx.category) throw new Error('Merchant category mismatch');
  }

  // Recalculate availability at confirm time from DB (no in-memory)
  let availableNow = 0;
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    let alloc = 0, used = 0;
    for (const it of items) {
      if (String(it.category).toLowerCase() === String(tx.category).toLowerCase()) {
        alloc += Math.round(Number(it.allocated_total_cents || 0));
        used += Math.round(Number(it.used_total_cents || 0));
      }
    }
    availableNow = Math.max(0, alloc - used);
  } catch {}
  const desiredCover = Math.min(tx.amount_requested_cents, availableNow);
  if (desiredCover !== tx.amount_covered_cents) {
    // Update tx and ask client to re-confirm
    tx.amount_covered_cents = desiredCover;
    tx.amount_shortfall_cents = Math.max(0, tx.amount_requested_cents - desiredCover);
    tx.meta = { ...(tx.meta || {}), confirm_available: availableNow };
    const responseChanged = { transaction: tx, reconfirm_required: true };
    if (idempotency_key) await putIdempotentResponse(scope, idempotency_key, responseChanged);
    return responseChanged;
  }

  // Consume AllocationLots FIFO up to amount_covered_cents using DynamoDB lots
  // Build a single transactional plan without applying updates yet
  let remaining = tx.amount_covered_cents;
  const breakdown: Array<{ lotId: string; sponsorId: string; taken: number } | null> = [];
  const lotUpdateOps: any[] = [];
  const perSponsor: Record<string, number> = {};
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': `ALLOT#${tx.category}#` },
      ScanIndexForward: true
    });
    const lots = ((resp.Items || []) as any[])
      .map(it => ({
        sponsorId: String(it.sponsorId || ''),
        studentId: String(it.studentId || studentId),
        category: String(it.category || tx.category) as SpendCategory,
        ts: Number(it.ts || 0),
        lotId: String(it.lotId || ''),
        amount_cents: Number(it.amount_cents || 0),
        remaining_cents: Number(it.remaining_cents || 0),
        Pk: String(it.Pk),
        Sk: String(it.Sk)
      }))
      .filter(l => l.remaining_cents > 0)
      .sort((a, b) => a.ts - b.ts);
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.remaining_cents, remaining);
      if (take <= 0) { breakdown.push(null); continue; }
      // Stage conditional decrement for this lot
      lotUpdateOps.push({
        Update: {
          Pk: lot.Pk,
          Sk: lot.Sk,
          UpdateExpression: 'SET remaining_cents = remaining_cents - :take',
          ConditionExpression: 'remaining_cents >= :take AND remaining_cents > :zero',
          ExpressionAttributeValues: { ':take': take, ':zero': 0 }
        }
      });
      remaining -= take;
      breakdown.push({ lotId: lot.lotId, sponsorId: lot.sponsorId, taken: take });
      perSponsor[lot.sponsorId] = (perSponsor[lot.sponsorId] || 0) + take;
    }
  } catch (err) {
    console.error('confirmTransaction lot planning failed (Dynamo)', { studentId, category: tx.category, err });
  }
  if (remaining > 0) {
    // Should not happen if availability was accurate, but guard anyway
    const consumed = tx.amount_covered_cents - remaining;
    tx.amount_covered_cents = consumed;
    tx.amount_shortfall_cents = Math.max(0, tx.amount_requested_cents - consumed);
    // Trim staged ops to match consumed only
    // Note: we keep current lotUpdateOps which already reflect the staged takes
  }

  const nowIso = new Date().toISOString();

  // Update transaction final status and metadata
  tx.status = tx.amount_covered_cents === tx.amount_requested_cents ? 'APPROVED' : 'PARTIAL_APPROVED';
  tx.meta = { ...(tx.meta || {}), lots_used: breakdown.filter(Boolean) } as any;

  // Build transactional writes according to spec
  const iso = nowIso;
  const studentSpend: DynamoItem = {
    Pk: `STUDENT#${studentId}`,
    Sk: `SPEND#${iso}#${tx.txId}`,
    type: 'STUDENT_SPEND',
    txId: tx.txId,
    studentId,
    merchantId: tx.merchantId || null,
    category: tx.category,
    amount_cents: tx.amount_covered_cents,
    amount_requested_cents: tx.amount_requested_cents,
    shortfall_cents: tx.amount_shortfall_cents,
    status: tx.status,
    created_at: iso
  };

  const transactItems: any[] = [];
  // Lot decrements
  transactItems.push(...lotUpdateOps);
  // Per-sponsor used_total increments
  for (const [sId, used] of Object.entries(perSponsor)) {
    if (used > 0) {
      transactItems.push({
        Update: {
          Pk: `STUDENT#${studentId}`,
          Sk: `BUDGET#SPONSOR#${sId}#CATEGORY#${tx.category}`,
          UpdateExpression: 'SET used_total_cents = if_not_exists(used_total_cents, :z) + :uinc, allocated_total_cents = if_not_exists(allocated_total_cents, :z), updated_at = :u, sponsorId = :sid, studentId = :stid, category = :cat',
          ExpressionAttributeValues: { ':z': 0, ':uinc': Number(used), ':u': iso, ':sid': sId, ':stid': studentId, ':cat': tx.category }
        }
      });
    }
  }
  // Student spend put
  transactItems.push({ Put: { Item: studentSpend } });

  // Merchant writes
  let merchantBusinessInfoUpdate: any | null = null;
  if (tx.merchantId) {
    const merchantTx: DynamoItem = {
      Pk: `MERCHANT#${tx.merchantId}`,
      Sk: `TX#${iso}#${tx.txId}`,
      type: 'MERCHANT_TX',
      txId: tx.txId,
      merchantId: tx.merchantId,
      studentId,
      category: tx.category,
      amount_cents: tx.amount_covered_cents,
      status: tx.status,
      created_at: iso
    };
    transactItems.push({ Put: { Item: merchantTx } });
    // Prepare BUSINESS_INFO update with precomputed lastFiveTransactions entry
    const txSummary = { txId: tx.txId, amount_cents: tx.amount_covered_cents, category: tx.category, studentId, created_at: iso, status: tx.status };
    // We cannot read existing list in the same transaction without a prior Get; we overwrite to a 1-length list here; acceptable for hackathon scope
    merchantBusinessInfoUpdate = {
      Update: {
        Pk: `MERCHANT#${tx.merchantId}`,
        Sk: 'BUSINESS_INFO',
        UpdateExpression: 'SET #lastFiveTransactions = list_append(:entry_list, if_not_exists(#lastFiveTransactions, :empty_list)), #updated_at = :ts ADD #withdrawableBalance :amt, #totalReceived :amt, #totalTransactions :one',
        ExpressionAttributeNames: {
          '#lastFiveTransactions': 'lastFiveTransactions',
          '#updated_at': 'updated_at',
          '#withdrawableBalance': 'withdrawableBalance',
          '#totalReceived': 'totalReceived',
          '#totalTransactions': 'totalTransactions'
        },
        ExpressionAttributeValues: {
          ':entry_list': [txSummary],
          ':empty_list': [],
          ':ts': iso,
          ':amt': Number(tx.amount_covered_cents || 0),
          ':one': 1
        }
      }
    };
    transactItems.push(merchantBusinessInfoUpdate);
  }

  // Delete TX#PENDING key
  const tsStr = String(tx.ts).padStart(13, '0');
  transactItems.push({ Delete: { Pk: `STUDENT#${studentId}`, Sk: `TX#PENDING#${tsStr}#${tx.txId}` } });

  // Idempotency record inside transaction if provided
  if (idempotency_key) {
    const responsePreview = { transaction: tx };
    const ttlDays = Number(process.env.IDEMPOTENCY_TTL_DAYS || 14);
    const expires_at = Math.floor(new Date(iso).getTime() / 1000) + ttlDays * 24 * 60 * 60;
    transactItems.push({
      Put: {
        Item: {
          Pk: `IDEMPOTENCY#${scope}`,
          Sk: idempotency_key,
          entity: 'IDEMPOTENCY',
          scope,
          idempotency_key,
          response: responsePreview,
          created_at: iso,
          expires_at
        },
        ConditionExpression: 'attribute_not_exists(Pk) AND attribute_not_exists(Sk)'
      }
    });
  }

  // Execute transaction
  try {
    await dynamo.transactWrite({ TransactItems: transactItems });
  } catch (err: any) {
    console.error('[confirmTransaction] transactWrite failed', err);
    throw new Error('Transaction conflict. Please retry confirmation.');
  }

  const response = { transaction: tx };
  // Also store idempotency outside transaction for non-provided keys (no-op if provided above)
  if (idempotency_key) {
    // already stored in transaction
  }
  return response;
}


// --- Reverse Allocations (Optional Phase 1) ---
export async function reverseAllocations(
  sponsorId: string,
  studentId: string,
  reversals: Array<{ category: SpendCategory; amount: number }>,
  idempotency_key?: string
): Promise<{ updated: Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }> }> {
  // Validate inputs
  if (!Array.isArray(reversals) || reversals.length === 0) {
    throw new Error('reversals must be a non-empty array');
  }
  const normalized = reversals.map(r => ({
    category: (normalizeCategory(r.category as any) || r.category) as SpendCategory,
    amount: Math.abs(Number(r.amount))
  }));
  for (const r of normalized) {
    if (!SpendCategories.includes(r.category)) throw new Error(`invalid category: ${r.category}`);
    if (!(Number(r.amount) > 0)) throw new Error('amount must be > 0');
  }

  const scope = `REVERSE#${sponsorId}#${studentId}`;
  if (idempotency_key) {
    const existing = await getIdempotentResponse(scope, idempotency_key);
    if (existing) return existing;
  }

  const nowIso = new Date().toISOString();
  const updatedCats = new Set<SpendCategory>();

  // Compute current availability per category from DB (no in-memory budgets)
  let combinedAvail: Record<string, { allocated: number; used: number }> = {};
  try {
    const preItems = await listStudentSponsorCategoryBudgets(studentId);
    for (const it of preItems) {
      const cat = String((it as any).category);
      const allocated = Math.round(Number((it as any).allocated_total_cents || 0));
      const used = Math.round(Number((it as any).used_total_cents || 0));
      const cur = combinedAvail[cat] || { allocated: 0, used: 0 };
      cur.allocated += allocated;
      cur.used += used;
      combinedAvail[cat] = cur;
    }
  } catch (err) {
    console.error('reverseAllocations: failed to precompute availability', { studentId, err });
  }

  for (const r of normalized) {
    const keyCat = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === String(r.category).toLowerCase()) || String(r.category);
    const cur = combinedAvail[keyCat] || { allocated: 0, used: 0 };
    const maxByBudget = Math.max(0, cur.allocated - cur.used);
    if (maxByBudget <= 0) {
      // Nothing reducible at budget level
      continue;
    }

    // Sum sponsor-owned unconsumed lots for this student/category using DynamoDB
    let totalUnconsumedFromSponsor = 0;
    let sponsorLots: Array<{ Pk: string; Sk: string; remaining_cents: number; ts: number }> = [];
    try {
      const resp = await dynamo.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': `STUDENT#${studentId}`, ':sk': `ALLOT#${r.category}#` },
        ScanIndexForward: false // LIFO by ts if SK contains zero-padded ts
      });
      sponsorLots = ((resp.Items || []) as any[])
        .filter(it => String(it.sponsorId || '') === String(sponsorId) && Number(it.remaining_cents || 0) > 0)
        .map(it => ({ Pk: String(it.Pk), Sk: String(it.Sk), remaining_cents: Number(it.remaining_cents || 0), ts: Number(it.ts || 0) }))
        .sort((a, b) => b.ts - a.ts);
      totalUnconsumedFromSponsor = sponsorLots.reduce((sum, l) => sum + l.remaining_cents, 0);
    } catch (err) {
      console.error('reverseAllocations lots scan failed', { sponsorId, studentId, category: r.category, err });
      // No in-memory fallback per spec
      sponsorLots = [];
      totalUnconsumedFromSponsor = 0;
    }

    if (totalUnconsumedFromSponsor <= 0) {
      continue; // nothing to reverse from this sponsor
    }

    const desired = Math.min(r.amount, totalUnconsumedFromSponsor, maxByBudget);
    if (desired <= 0) {
      continue;
    }

    // Drain lots LIFO up to 'desired' with conditional updates
    let toReverse = desired;
    for (const lot of sponsorLots) {
      if (toReverse <= 0) break;
      const take = Math.min(lot.remaining_cents, toReverse);
      if (take > 0) {
        try {
          await dynamo.updateItem({
            Pk: lot.Pk as any,
            Sk: lot.Sk as any,
            UpdateExpression: 'SET remaining_cents = remaining_cents - :take',
            ConditionExpression: 'remaining_cents >= :take AND remaining_cents > :zero',
            ExpressionAttributeValues: { ':take': take, ':zero': 0 }
          });
          toReverse -= take;
        } catch (err) {
          // Skip on conditional failure
          continue;
        }
      }
    }

    const actuallyReversed = desired - toReverse;
    if (actuallyReversed <= 0) {
      continue;
    }

    // Persist negative delta in Dynamo per sponsor/category aggregate
    try {
      await updateStudentSponsorCategoryBudget(sponsorId, studentId, r.category as any, -actuallyReversed);
    } catch {}

    // Ledger(REVERSAL) persisted to Dynamo only
    try {
      await dynamo.putItem({
        Pk: `STUDENT#${studentId}`,
        Sk: `LEDGER#${Date.now()}#${Math.random().toString(36).slice(2, 10)}`,
        type: 'REVERSAL',
        category: r.category,
        amount: actuallyReversed,
        sponsorId: sponsorId,
        studentId: studentId,
        created_at: nowIso,
      } as any);
    } catch (err) {
      console.error('reverseAllocations: failed to persist reversal ledger', { sponsorId, studentId, category: r.category, err });
    }

    updatedCats.add(r.category);
  }

  const categories = normalized.map(n => n.category);
  let updated: Array<{ category: SpendCategory; allocated_total: number; used_total: number; available: number }> = [];
  try {
    const items = await listStudentSponsorCategoryBudgets(studentId);
    const combined: Record<string, { allocated: number; used: number }> = {};
    for (const it of items) {
      const cat = String((it as any).category);
      const allocated = Math.round(Number((it as any).allocated_total_cents || 0));
      const used = Math.round(Number((it as any).used_total_cents || 0));
      const cur = combined[cat] || { allocated: 0, used: 0 };
      cur.allocated += allocated;
      cur.used += used;
      combined[cat] = cur;
    }
    updated = categories.map((cat) => {
      const key = (SpendCategories as readonly string[]).find(c => c.toLowerCase() === String(cat).toLowerCase()) || String(cat);
      const vals = combined[key] || { allocated: 0, used: 0 };
      const available = Math.max(0, vals.allocated - vals.used);
      return { category: cat, allocated_total: vals.allocated, used_total: vals.used, available };
    });
  } catch (err) {
    console.error('reverseAllocations: failed to compute response from DB', { studentId, err });
    updated = categories.map(cat => ({ category: cat, allocated_total: 0, used_total: 0, available: 0 } as any));
  }

  const response = { updated };
  if (idempotency_key) await putIdempotentResponse(scope, idempotency_key, response);
  return response;
}

// --- EFT Deposit Notifications ---
export type EFTStatus = 'new' | 'allocated' | 'rejected';
export interface EFTDepositNotification {
  id: string;
  sponsorId: string;
  reference: string;
  amount_cents: number;
  currency: 'ZAR';
  status: EFTStatus;
  notes?: string;
  approved_amount_cents?: number;
  approved_by?: string;
  approved_at?: string;
  rejected_reason?: string;
  created_at: string;
  updated_at: string;
}

// DB-only EFT helpers (no in-memory cache)
function mapEFTItem(it: any, sponsorIdHint?: string): EFTDepositNotification {
  return {
    id: String(it.id),
    sponsorId: String(it.sponsorId || sponsorIdHint || ''),
    reference: String(it.reference || ''),
    amount_cents: Number(it.amount_cents || 0),
    currency: 'ZAR',
    status: String(it.status || 'new') as EFTStatus,
    notes: it.notes as string | undefined,
    approved_amount_cents: it.approved_amount_cents != null ? Number(it.approved_amount_cents) : undefined,
    approved_by: it.approved_by as string | undefined,
    approved_at: it.approved_at as string | undefined,
    rejected_reason: it.rejected_reason as string | undefined,
    created_at: String(it.created_at || new Date().toISOString()),
    updated_at: String(it.updated_at || it.created_at || new Date().toISOString()),
  };
}

export async function getEFTDepositByIdAsync(eftId: string): Promise<EFTDepositNotification | null> {
  try {
    // Fast path: ID lookup
    const lookup = await dynamo.getItem({ Pk: `EFT#ID` as any, Sk: eftId });
    if (lookup) {
      const sponsorId = String((lookup as any).sponsorId || '');
      const created_at = String((lookup as any).created_at || '');
      if (!sponsorId || !created_at) return null;
      const item = await dynamo.getItem({ Pk: `SPONSOR#${sponsorId}` as any, Sk: `EFT_NOTIFY#${created_at}#${eftId}` });
      return item ? mapEFTItem(item, sponsorId) : null;
    }

    // Fallback: search admin mirror partition (no Scan)
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': 'EFT#ALL', ':sk': 'STATUS#' },
      ScanIndexForward: false,
      Limit: 100
    } as any);

    const found = (resp.Items || []).find(it => String((it as any).id) === eftId);
    if (!found) return null;

    const mapped = mapEFTItem(found);

    // Optional: backfill missing ID lookup for future O(1) fetches
    try {
      await dynamo.putItem({
        Pk: `EFT#ID`,
        Sk: eftId,
        entity: 'EFT_ID_LOOKUP',
        sponsorId: mapped.sponsorId,
        created_at: mapped.created_at
      } as any);
    } catch {
      // best-effort
    }

    return mapped;
  } catch (err) {
    console.error('getEFTDepositByIdAsync failed', { eftId, err });
    return null;
  }
}

export function generateEFTReference(sponsorId: string): string {
  const suffix = sponsorId.slice(-4).toUpperCase();
  const unique = Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString().slice(-4);
  return `KUDU-${suffix}-${unique}`; // e.g., KUDU-1A2B-7F330921
}

export async function createEFTDepositNotification(
  sponsorId: string,
  amount_cents: number,
  opts?: { reference?: string; notes?: string }
): Promise<EFTDepositNotification> {
  const amt = Number(amount_cents);
  if (!Number.isFinite(amt) || !(amt > 0)) throw new Error('amount_cents must be > 0');
  const now = new Date().toISOString();
  const id = `EFT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reference = (opts?.reference || generateEFTReference(sponsorId)).toUpperCase();
  const notes = opts?.notes;
  const rec: EFTDepositNotification = {
    id,
    sponsorId,
    reference,
    amount_cents: Math.floor(amt),
    currency: 'ZAR',
    status: 'new',
    notes,
    created_at: now,
    updated_at: now,
  };

  // Persist to DynamoDB (await)
  try {
    const item: DynamoItem = {
      Pk: `SPONSOR#${sponsorId}`,
      Sk: `EFT_NOTIFY#${rec.created_at}#${rec.id}`,
      entity: 'EFT_DEPOSIT_NOTIFICATION',
      sponsorId,
      id: rec.id,
      reference: rec.reference,
      amount_cents: rec.amount_cents,
      currency: rec.currency,
      status: rec.status,
      notes: rec.notes,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      // Optional GSI if table has it
      GSI1PK: `SPONSOR#${sponsorId}`,
      GSI1SK: `EFT#${rec.status}#${rec.created_at}`
    };
    await dynamo.putItem(item);
    // Also write an ID lookup item to enable O(1) fetch by EFT id
    await dynamo.putItem({
      Pk: `EFT#ID`,
      Sk: rec.id,
      entity: 'EFT_ID_LOOKUP',
      sponsorId,
      created_at: rec.created_at
    } as any);
    // Write an admin-mirror item to enable Query-based admin listing (no Scan)
    await dynamo.putItem({
      Pk: 'EFT#ALL' as any,
      Sk: `STATUS#${rec.status}#${rec.created_at}#${rec.id}`,
      entity: 'EFT_DEPOSIT_NOTIFICATION_ADMIN',
      id: rec.id,
      sponsorId,
      reference: rec.reference,
      amount_cents: rec.amount_cents,
      currency: rec.currency,
      status: rec.status,
      notes: rec.notes,
      created_at: rec.created_at,
      updated_at: rec.updated_at
    } as any);
  } catch (err) {
    console.error('Failed to persist EFT notification to DynamoDB', { sponsorId, id: rec.id, err });
  }

  return rec;
}

export async function listEFTDepositNotifications(
  sponsorId: string,
  params?: { status?: EFTStatus | 'all'; page?: number; page_size?: number; limit?: number; cursor?: any }
): Promise<{ items: EFTDepositNotification[]; total: number; cursor?: any }> {
  const { status, page = 1, page_size = 10, limit, cursor } = params || {} as any;
  try {
    // If limit/cursor specified, use Dynamo pagination on GSI1 (if present) or primary partition
    if (limit || cursor) {
      const Limit = Math.max(1, Math.min(100, Number(limit || 25)));
      const hasStatusFilter = !!(status && status !== 'all');
      // Try GSI1 path first when status filtered
      if (hasStatusFilter) {
        try {
          const q = await dynamo.queryIndex({
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
            ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': `EFT#${status}#` },
            ScanIndexForward: false,
            Limit,
            ExclusiveStartKey: cursor
          } as any);
          const items = (q.Items || []).map(it => mapEFTItem(it, sponsorId));
          return { items, total: items.length, cursor: q.LastEvaluatedKey };
        } catch {}
      }
      // Fallback to primary partition query and in-app filtering when needed
      const resp = await dynamo.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'EFT_NOTIFY#' },
        ScanIndexForward: false,
        Limit,
        ExclusiveStartKey: cursor
      } as any);
      let items = (resp.Items || []) as any[];
      if (hasStatusFilter) items = items.filter(it => String(it.status || 'new') === status);
      return { items: items.map(it => mapEFTItem(it, sponsorId)), total: items.length, cursor: resp.LastEvaluatedKey };
    }

    // Backward-compatible page/page_size path: full query then slice
    let items: any[] = [];
    if (status && status !== 'all') {
      // Prefer GSI1 for status if present
      try {
        const q = await dynamo.queryIndex({
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
          ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': `EFT#${status}#` }
        } as any);
        items = (q.Items || []) as any[];
      } catch {
        const resp = await dynamo.query({
          KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
          ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'EFT_NOTIFY#' }
        } as any);
        items = ((resp.Items || []) as any[]).filter(it => String(it.status || 'new') === status);
      }
    } else {
      const resp = await dynamo.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'EFT_NOTIFY#' }
      } as any);
      items = (resp.Items || []) as any[];
    }
    items.sort((a, b) => (String(a.created_at || '') < String(b.created_at || '') ? 1 : -1));
    const total = items.length;
    const start = (Math.max(1, page) - 1) * Math.max(1, page_size);
    const end = start + Math.max(1, page_size);
    const pageItems = items.slice(start, end).map(it => mapEFTItem(it, sponsorId));
    return { items: pageItems, total };
  } catch (err) {
    console.error('listEFTDepositNotifications (DB) failed', { sponsorId, err });
    return { items: [], total: 0 } as any;
  }
}

// Async sponsor EFT listing (DB-only)
export async function listEFTDepositNotificationsAsync(
  sponsorId: string,
  params?: { status?: EFTStatus | 'all'; page?: number; page_size?: number; limit?: number; cursor?: any }
): Promise<{ items: EFTDepositNotification[]; total: number; cursor?: any }> {
  return listEFTDepositNotifications(sponsorId, params);
}

// --- Admin helpers for EFT deposits (DB-only) ---
export async function listAllEFTDepositsAsync(params?: { status?: EFTStatus | 'all'; page?: number; page_size?: number; limit?: number; cursor?: any }): Promise<{ items: EFTDepositNotification[]; total: number; cursor?: any }> {
  const { status, page = 1, page_size = 10, limit, cursor } = params || {} as any;
  try {
    const skPrefix = status && status !== 'all' ? `STATUS#${status}#` : 'STATUS#';
    // If limit/cursor specified, use Dynamo pagination and return cursor (preferred for large lists)
    if (limit || cursor) {
      const Limit = Math.max(1, Math.min(100, Number(limit || 25)));
      const resp = await dynamo.query({
        KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
        ExpressionAttributeValues: { ':pk': 'EFT#ALL', ':sk': skPrefix },
        ScanIndexForward: false,
        Limit,
        ExclusiveStartKey: cursor
      } as any);
      const items = (resp.Items || []).map(it => mapEFTItem(it));
      return { items, total: items.length, cursor: resp.LastEvaluatedKey };
    }
    // Backward-compatible page/page_size: full query then slice
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': 'EFT#ALL', ':sk': skPrefix },
      ScanIndexForward: false
    } as any);
    const items = (resp.Items || []) as any[];
    const total = items.length;
    const start = (Math.max(1, page) - 1) * Math.max(1, page_size);
    const end = start + Math.max(1, page_size);
    const pageItems = items.slice(start, end).map(it => mapEFTItem(it));
    return { items: pageItems, total };
  } catch (err) {
    console.error('listAllEFTDepositsAsync failed (Query)', err);
    return { items: [], total: 0 } as any;
  }
}

export async function approveEFTDeposit(
  eftId: string,
  adminId: string,
  approved_amount_cents: number,
  idempotency_key?: string
): Promise<{ eft: EFTDepositNotification; sponsor_balance_cents: number }> {
  const eft = await getEFTDepositByIdAsync(eftId);
  if (!eft) throw new Error('EFT deposit not found');
  if (eft.status === 'rejected') throw new Error('Cannot approve a rejected deposit');
  if (eft.status === 'allocated') {
    // already approved; treat as conflict unless idempotent replay
    if (idempotency_key) {
      const scope = `ADMIN_APPROVE#${eftId}`;
      const existing = await getIdempotentResponse(scope, idempotency_key);
      if (existing) return existing;
    }
    throw new Error('EFT already approved');
  }
  const amt = Math.max(0, Math.floor(Number(approved_amount_cents)));
  if (!(amt > 0)) throw new Error('approved_amount_cents must be > 0');
  const approved = Math.min(amt, eft.amount_cents);
  const now = new Date().toISOString();

  // Build updated EFT object (no in-memory mutation)
  const updated: EFTDepositNotification = {
    ...eft,
    status: 'allocated',
    approved_amount_cents: approved,
    approved_by: adminId,
    approved_at: now,
    updated_at: now,
  };

  // 1) Persist EFT status update first with a condition to avoid double-approval
  const pk = `SPONSOR#${eft.sponsorId}`;
  const sk = `EFT_NOTIFY#${eft.created_at}#${eft.id}`;

  // Ensure sponsor EFT record exists for conditional update (legacy data repair)
  try {
    const existing = await dynamo.getItem({ Pk: pk as any, Sk: sk });
    if (!existing) {
      await dynamo.putItem({
        Pk: pk,
        Sk: sk,
        entity: 'EFT_DEPOSIT_NOTIFICATION',
        sponsorId: eft.sponsorId,
        id: eft.id,
        reference: eft.reference,
        amount_cents: eft.amount_cents,
        currency: 'ZAR',
        status: 'new',
        notes: eft.notes,
        created_at: eft.created_at,
        updated_at: eft.updated_at,
        GSI1PK: `SPONSOR#${eft.sponsorId}`,
        GSI1SK: `EFT#new#${eft.created_at}`
      } as any, { ConditionExpression: 'attribute_not_exists(Pk) AND attribute_not_exists(Sk)' });
    }
  } catch (e) {
    // best-effort; approval transaction will still guard via conditional update
  }

  try {
    await dynamo.transactWrite({
      TransactItems: [
        {
          Update: {
            Pk: pk,
            Sk: sk,
            UpdateExpression: 'SET #status = :st, approved_amount_cents = :aa, approved_by = :ab, approved_at = :at, updated_at = :u, GSI1PK = :gpk, GSI1SK = :gsk',
            ConditionExpression: '#status = :expected',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':st': 'allocated', ':aa': approved, ':ab': adminId, ':at': now, ':u': now, ':expected': 'new', ':gpk': `SPONSOR#${eft.sponsorId}`, ':gsk': `EFT#allocated#${eft.created_at}` }
          }
        },
        { Delete: { Pk: 'EFT#ALL' as any, Sk: `STATUS#new#${eft.created_at}#${eft.id}` } },
        { Put: { Item: {
          Pk: 'EFT#ALL' as any,
          Sk: `STATUS#allocated#${eft.created_at}#${eft.id}`,
          entity: 'EFT_DEPOSIT_NOTIFICATION_ADMIN',
          id: eft.id,
          sponsorId: eft.sponsorId,
          reference: eft.reference,
          amount_cents: eft.amount_cents,
          currency: 'ZAR',
          status: 'allocated',
          notes: eft.notes,
          approved_amount_cents: approved,
          approved_by: adminId,
          approved_at: now,
          created_at: eft.created_at,
          updated_at: now
        } } }
      ]
    });
  } catch (err: any) {
    const name = String(err?.name || err?.code || err?.Code || '').toLowerCase();
    // Conditional failures in transactions show up as TransactionCanceledException
    const isConditional =
      name.includes('conditionalcheckfailed') ||
      name.includes('transactioncanceled') ||
      name.includes('transactioncanceledexception');

    if (isConditional) {
      const latest = await getEFTDepositByIdAsync(eftId);
      if (latest?.status === 'allocated') throw new Error('EFT already approved');
      if (latest?.status === 'rejected') throw new Error('EFT already rejected');
      throw new Error('EFT cannot be approved in its current state');
    }

    console.error('approveEFTDeposit transactWrite failed', { eftId, err });
    throw err;
  }

  // 3) Only after successful DB updates, credit the sponsor and add ledger entry
  const resp = await topupSponsorCredits(eft.sponsorId, approved, idempotency_key, { ledgerType: 'DEPOSIT_APPROVED', eft_id: eftId });

  const response = { eft: updated, sponsor_balance_cents: resp.balance_cents };
  if (idempotency_key) {
    const scope = `ADMIN_APPROVE#${eftId}`;
    await putIdempotentResponse(scope, idempotency_key, response);
  }
  return response;
}

export async function rejectEFTDeposit(
  eftId: string,
  adminId: string,
  reason?: string,
  idempotency_key?: string
): Promise<{ eft: EFTDepositNotification }> {
  const eft = await getEFTDepositByIdAsync(eftId);
  if (!eft) throw new Error('EFT deposit not found');
  if (eft.status === 'allocated') throw new Error('Cannot reject an approved deposit');
  if (eft.status === 'rejected') {
    if (idempotency_key) {
      const scope = `ADMIN_REJECT#${eftId}`;
      const existing = await getIdempotentResponse(scope, idempotency_key);
      if (existing) return existing;
    }
    // Already rejected; treat as conflict
    throw new Error('EFT already rejected');
  }

  const now = new Date().toISOString();
  const updated: EFTDepositNotification = {
    ...eft,
    status: 'rejected',
    rejected_reason: reason,
    updated_at: now,
  };

  // Ledger entry for rejection (no balance change) persisted to DynamoDB
  try {
    await dynamo.putItem({
      Pk: `SPONSOR#${eft.sponsorId}`,
      Sk: `LEDGER#${Date.now()}#${Math.random().toString(36).slice(2, 10)}`,
      type: 'DEPOSIT_REJECTED',
      amount: eft.amount_cents,
      sponsorId: eft.sponsorId,
      eft_id: eftId,
      created_at: now,
    } as any);
  } catch (err) {
    console.error('Failed to persist rejection ledger to DynamoDB', { eftId, err });
  }

  // Persist update and mirror move in a single transaction for consistency
  try {
    const pk = `SPONSOR#${eft.sponsorId}`;
    const sk = `EFT_NOTIFY#${eft.created_at}#${eft.id}`;
    await dynamo.transactWrite({
      TransactItems: [
        {
          Update: {
            Pk: pk,
            Sk: sk,
            UpdateExpression: 'SET #status = :st, rejected_reason = :rr, updated_at = :u',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':st': 'rejected', ':rr': reason, ':u': now }
          }
        },
        { Delete: { Pk: 'EFT#ALL' as any, Sk: `STATUS#new#${eft.created_at}#${eft.id}` } },
        { Put: { Item: {
          Pk: 'EFT#ALL' as any,
          Sk: `STATUS#rejected#${eft.created_at}#${eft.id}`,
          entity: 'EFT_DEPOSIT_NOTIFICATION_ADMIN',
          id: eft.id,
          sponsorId: eft.sponsorId,
          reference: eft.reference,
          amount_cents: eft.amount_cents,
          currency: 'ZAR',
          status: 'rejected',
          notes: eft.notes,
          rejected_reason: reason,
          created_at: eft.created_at,
          updated_at: now
        } } }
      ]
    });
  } catch (err) {
    console.error('Failed to update EFT rejection + mirror in DynamoDB (transact)', { eftId, err });
  }

  const response = { eft: updated };
  if (idempotency_key) {
    const scope = `ADMIN_REJECT#${eftId}`;
    await putIdempotentResponse(scope, idempotency_key, response);
  }
  return response;
}


// --- Helper: Sum approved deposits from sponsor ledger (fallback for summary) ---
export async function sumSponsorApprovedDepositsAsync(sponsorId: string): Promise<number> {
  try {
    const resp = await dynamo.query({
      KeyConditionExpression: 'Pk = :pk AND begins_with(Sk, :sk)',
      ExpressionAttributeValues: { ':pk': `SPONSOR#${sponsorId}`, ':sk': 'LEDGER#' }
    } as any);
    const items = (resp.Items || []) as any[];
    return items.reduce((sum, it) => {
      return sum + (String((it as any).type || '') === 'DEPOSIT_APPROVED' ? Math.round(Number((it as any).amount || 0)) : 0);
    }, 0);
  } catch (err) {
    console.error('sumSponsorApprovedDepositsAsync failed', { sponsorId, err });
    return 0;
  }
}
