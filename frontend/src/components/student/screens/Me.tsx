import { useAuth } from '../../../contexts/AuthContext'

export default function Me() {
  const { user, studentProfile, logout } = useAuth()
  const isInstalled = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="font-semibold">{studentProfile?.fullName || user?.name}</div>
        <div className="text-sm text-kudu-gray">{studentProfile?.email || user?.email}</div>
      </div>
      {!isInstalled && (
        <div className="bg-sky-50 text-sky-800 border border-sky-200 rounded-lg p-3">
          Install KuduPay for faster access. Open browser menu → "Add to Home Screen".
        </div>
      )}
      <button onClick={logout} className="bg-desert-red text-white rounded-lg px-4 py-3">Sign out</button>
      <div className="text-sm text-kudu-gray">App version: 1.0.0</div>
    </div>
  )
}
