import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

function AdminLogin() {
  const { login, isLoading, error, isAuthenticated, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await login(email, password, rememberMe)
  }

  if (isAuthenticated && user?.role === 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🦌</div>
          <h2 className="text-2xl font-bold text-kudu-brown mb-2">Welcome, Admin</h2>
          <p className="text-charcoal-light">You're signed in. Loading your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-kalahari-sand-light">
      <div className="bg-white shadow-md rounded-lg p-8 max-w-md w-full">
        <div className="mb-6 text-center">
          <div className="text-5xl mb-2">🦌</div>
          <h1 className="text-2xl font-bold text-kudu-brown">Admin Sign In</h1>
          <p className="text-sm text-charcoal-light">Only admins can access the admin panel.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
            {String(error)}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-kalahari-sand-dark rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-kudu-brown"
              placeholder="admin@kudupay.test"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-kalahari-sand-dark rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-kudu-brown"
              placeholder="Enter your admin password"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-charcoal">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded"
              />
              Remember me
            </label>
            <span className="text-xs text-charcoal-light">Role must be admin</span>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-kudu-brown text-white px-4 py-2 rounded-lg font-medium transition-colors ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-kudu-brown-dark'}`}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminLogin
