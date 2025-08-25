// Tiny student API helpers (no extra deps)

const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
  ? (import.meta as any).env.VITE_API_URL
  : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any)?.error || 'Request failed')
  return ((data as any).data ?? data) as T
}

export interface Tx {
  id: string
  amount?: number
  amount_cents?: number
  merchantName?: string
  category?: string
  status?: string
  created_at?: string
  [k: string]: any
}

export async function getStudentTransactions(userId: string, token: string, limit = 30): Promise<Tx[]> {
  const res = await fetch(`${base}/students/${encodeURIComponent(userId)}/transactions?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await parse<{ transactions?: unknown[] } | unknown[]>(res)
  const list = Array.isArray((data as any).transactions) ? (data as any).transactions
    : Array.isArray(data as any) ? (data as any) : []
  // Best-effort normalize
  return list.map((t: any) => ({
    id: String(t.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    amount: typeof t.amount === 'number' ? t.amount : undefined,
    amount_cents: typeof t.amount_cents === 'number' ? t.amount_cents : undefined,
    merchantName: typeof t.merchantName === 'string' ? t.merchantName : undefined,
    category: typeof t.category === 'string' ? t.category : undefined,
    status: typeof t.status === 'string' ? t.status : undefined,
    created_at: typeof t.created_at === 'string' ? t.created_at : undefined,
    ...t,
  }))
}
