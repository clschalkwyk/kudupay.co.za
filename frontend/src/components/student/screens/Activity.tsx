import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { getStudentTransactions } from '../../../lib/api'

interface Tx {
  id: string
  amount?: number
  amount_cents?: number
  merchantName?: string
  category?: string
  status?: string
  created_at?: string
}

export default function Activity() {
  const { user, token } = useAuth()
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        if (user?.id && token) {
          const list = await getStudentTransactions(user.id, token, 30)
          setTxs(list)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id, token])

  if (loading) return <div className="text-kudu-gray">Loading…</div>
  if (!txs.length) return <div className="text-kudu-gray">No transactions yet.</div>

  return (
    <ul className="space-y-2">
      {txs.map((t) => {
        const amount = typeof t.amount === 'number' ? t.amount : (typeof t.amount_cents === 'number' ? t.amount_cents / 100 : 0)
        return (
          <li key={t.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
            <div>
              <div className="font-medium text-charcoal">{t.merchantName || 'Merchant'}</div>
              <div className="text-xs text-kudu-gray">{new Date(t.created_at || Date.now()).toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">R{amount.toFixed(2)}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${pill(t.status)}`}>{(t.status || 'SUCCESS').toUpperCase()}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function pill(status?: string) {
  const s = (status || '').toUpperCase()
  if (s === 'PENDING') return 'bg-amber-100 text-amber-800'
  if (s === 'DECLINED') return 'bg-red-100 text-red-800'
  return 'bg-emerald-100 text-emerald-800'
}
