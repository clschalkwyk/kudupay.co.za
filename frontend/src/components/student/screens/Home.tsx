import { Link } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'

export default function Home() {
  const { studentProfile } = useAuth()
  const categories = studentProfile?.categories ?? []
  const totalRemaining = categories.reduce((sum, c) => sum + (c.remaining ?? Math.max(0, (c.limit || 0) - (c.spent || 0))), 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="text-sm text-kudu-gray">Total available</div>
        <div className="text-3xl font-semibold text-kudu-brown">R{totalRemaining.toFixed(2)}</div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{c.name}</span>
              <span>R{c.remaining.toFixed(2)} / R{c.limit.toFixed(2)}</span>
            </div>
            <div className="mt-2 h-2 rounded bg-kudu-gray-light/20">
              <div className="h-2 rounded bg-savanna-green" style={{ width: `${Math.min(100, (1 - (c.remaining / Math.max(1, c.limit))) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link to="/app/pay" className="bg-savanna-green text-white rounded-lg px-3 py-3 text-center">Scan to pay</Link>
        <Link to="/app/budgets" className="bg-kudu-brown text-white rounded-lg px-3 py-3 text-center">View budgets</Link>
        <Link to="/app/activity" className="bg-charcoal text-white rounded-lg px-3 py-3 text-center">Activity</Link>
      </div>
    </div>
  )
}
