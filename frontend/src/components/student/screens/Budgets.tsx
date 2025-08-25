import { useAuth } from '../../../contexts/AuthContext'

export default function Budgets() {
  const { studentProfile } = useAuth()
  const categories = studentProfile?.categories ?? []
  if (!categories.length) return <div className="text-kudu-gray">Waiting for sponsor to load funds.</div>
  return (
    <div className="space-y-3">
      {categories.map((c) => (
        <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">{c.name}</span>
            <span>R{c.remaining.toFixed(2)} / R{c.limit.toFixed(2)}</span>
          </div>
          <div className="h-2 rounded bg-kudu-gray-light/20">
            <div className="h-2 rounded bg-savanna-green" style={{ width: `${Math.min(100, (1 - (c.remaining / Math.max(1, c.limit))) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
