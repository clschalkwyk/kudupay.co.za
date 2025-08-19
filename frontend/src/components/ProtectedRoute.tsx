import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles: ('student' | 'sponsor' | 'merchant' | 'admin')[]
  fallback?: ReactNode
}

const ProtectedRoute = ({ children, allowedRoles, fallback }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuth()

  // If user is not authenticated, show fallback or redirect message
  if (!isAuthenticated) {
    return fallback || (
      <div className="min-h-screen bg-kalahari-sand-light flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-6xl mb-4">🦌</div>
          <h2 className="text-2xl font-bold text-kudu-brown mb-4">Access Restricted</h2>
          <p className="text-charcoal-light mb-6">
            Eish! You need to be logged in to access this section, boet.
          </p>
          <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦌</span>
              <p className="text-sm text-charcoal font-medium">
                "Head back to the main page and log in first, my friend!"
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-block bg-kudu-brown text-white px-6 py-3 rounded-lg font-medium hover:bg-kudu-brown-dark transition-colors"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // If user is authenticated but doesn't have the right role
  if (!allowedRoles.includes(user?.role as any)) {
    return (
      <div className="min-h-screen bg-kalahari-sand-light flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-kudu-brown mb-4">Access Denied</h2>
          <p className="text-charcoal-light mb-6">
            Sorry boet, this section is not for {user?.role}s. You can only access sections meant for your user type.
          </p>
          <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦌</span>
              <p className="text-sm text-charcoal font-medium">
                "Stick to your own turf, my friend. That's how we keep things lekker!"
              </p>
            </div>
          </div>
          <div className="mt-6 space-x-4">
            <Link 
              to="/" 
              className="inline-block bg-kudu-brown text-white px-6 py-3 rounded-lg font-medium hover:bg-kudu-brown-dark transition-colors"
            >
              Go to Home
            </Link>
            {user?.role === 'student' && (
              <Link 
                to="/for-students" 
                className="inline-block bg-savanna-gold text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-savanna-gold-dark transition-colors"
              >
                Go to Student Section
              </Link>
            )}
            {user?.role === 'sponsor' && (
              <Link 
                to="/for-sponsors" 
                className="inline-block bg-savanna-gold text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-savanna-gold-dark transition-colors"
              >
                Go to Sponsor Section
              </Link>
            )}
            {user?.role === 'merchant' && (
              <Link 
                to="/for-merchants" 
                className="inline-block bg-savanna-gold text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-savanna-gold-dark transition-colors"
              >
                Go to Merchant Section
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // User is authenticated and has the right role
  return <>{children}</>
}

export default ProtectedRoute