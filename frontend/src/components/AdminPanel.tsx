import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
  ? (import.meta as any).env.VITE_API_URL
  : (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api')

interface EFTDeposit {
  id: string
  sponsorId: string
  reference: string
  amount_cents: number
  status: 'new' | 'allocated' | 'rejected'
  notes?: string
  created_at: string
}

function AdminPanel() {
  const { user, token } = useAuth()
  const { showSuccess, showError } = useToast()
  const [pending, setPending] = useState<EFTDeposit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [approveAmount, setApproveAmount] = useState<Record<string, string>>({})
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})

  const authHeader = useMemo(() => ({ 'Authorization': token ? `Bearer ${token}` : '' }), [token])

  const loadPending = async () => {
    try {
      setError(null)
      setPending(null)
      const resp = await fetch(`${API_BASE}/admin/eft-deposits?status=new&page=1&page_size=20`, {
        headers: authHeader
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data?.error || `Failed to load deposits (${resp.status})`)
      }
      const data = await resp.json()
      setPending(data.items || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      loadPending()
    }
  }, [user?.role, token])

  function parseMoneyToCents(input: string | undefined, fallbackCents: number): number {
    const s = (input ?? '').trim();
    if (!s) return fallbackCents; // approve full amount when blank
    const normalized = s.replace(/,/g, '.');
    const n = Number(normalized);
    const cents = Math.floor(n * 100);
    return Number.isFinite(cents) && cents > 0 ? cents : 0;
  }

  const onApprove = async (p: EFTDeposit) => {
    try {
      setActingId(p.id)
      const amountInput = approveAmount[p.id]
      const cents = parseMoneyToCents(amountInput, p.amount_cents)
      if (!(cents > 0)) throw new Error('Please enter a valid amount to approve')
      const body = { approved_amount_cents: Math.min(cents, p.amount_cents), idempotency_key: `${p.id}-${p.created_at}` }
      const resp = await fetch(`${API_BASE}/admin/eft-deposits/${encodeURIComponent(p.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(body)
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to approve deposit')
      showSuccess(`Approved R${((body.approved_amount_cents)/100).toFixed(2)} for ${p.reference}`)
      // Remove from list
      setPending(prev => (prev || []).filter(x => x.id !== p.id))
    } catch (e: any) {
      showError(e?.message || 'Approval failed')
    } finally {
      setActingId(null)
    }
  }

  const onReject = async (p: EFTDeposit) => {
    try {
      setActingId(p.id)
      const reason = (rejectReason[p.id] || '').trim()
      const resp = await fetch(`${API_BASE}/admin/eft-deposits/${encodeURIComponent(p.id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ reason })
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to reject deposit')
      showSuccess(`Rejected ${p.reference}${reason ? ` · ${reason}` : ''}`)
      // Remove from list
      setPending(prev => (prev || []).filter(x => x.id !== p.id))
    } catch (e: any) {
      showError(e?.message || 'Rejection failed')
    } finally {
      setActingId(null)
    }
  }

  const formatAmount = (cents: number) => `R${(cents/100).toFixed(2)}`

  return (
    <div className="min-h-[60vh] bg-kalahari-sand-light py-10">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-kudu-brown mb-6">Admin Dashboard</h1>
        <p className="text-charcoal mb-8">Signed in as <span className="font-semibold">{user?.firstName} {user?.lastName}</span> ({user?.email})</p>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-charcoal">Pending EFT Deposits</h2>
            <button onClick={loadPending} className="text-sm text-kudu-brown hover:underline">Refresh</button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          {pending === null ? (
            <div className="text-charcoal-light">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-charcoal-light">No pending deposits.</div>
          ) : (
            <ul className="divide-y divide-kalahari-sand-dark">
              {pending.map((p) => (
                <li key={p.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  <div className="md:col-span-5">
                    <div className="font-medium text-charcoal">{p.reference}</div>
                    <div className="text-sm text-charcoal-light">Sponsor: {p.sponsorId} · {new Date(p.created_at).toLocaleString()}</div>
                    {p.notes && <div className="text-xs text-charcoal-light mt-1">Notes: {p.notes}</div>}
                  </div>
                  <div className="md:col-span-2 text-sm font-semibold text-charcoal">{formatAmount(p.amount_cents)}</div>
                  <div className="md:col-span-5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        placeholder={`${(p.amount_cents/100).toFixed(2)}`}
                        value={approveAmount[p.id] ?? ''}
                        onChange={(e) => setApproveAmount(prev => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-28 border border-kalahari-sand-dark rounded px-2 py-1 text-sm"
                        aria-label="Approve amount (R)"
                      />
                      <button
                        onClick={() => onApprove(p)}
                        disabled={actingId === p.id}
                        className={`px-3 py-1 rounded text-white text-sm ${actingId === p.id ? 'bg-kudu-brown/60 cursor-not-allowed' : 'bg-kudu-brown hover:bg-kudu-brown-dark'}`}
                      >
                        {actingId === p.id ? 'Approving…' : 'Approve'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={rejectReason[p.id] ?? ''}
                        onChange={(e) => setRejectReason(prev => ({ ...prev, [p.id]: e.target.value }))}
                        className="flex-1 border border-kalahari-sand-dark rounded px-2 py-1 text-sm"
                        aria-label="Reject reason"
                      />
                      <button
                        onClick={() => onReject(p)}
                        disabled={actingId === p.id}
                        className={`px-3 py-1 rounded text-white text-sm ${actingId === p.id ? 'bg-red-600/60 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                        {actingId === p.id ? 'Rejecting…' : 'Reject'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
