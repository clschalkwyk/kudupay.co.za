import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface NavigationProps {
  className?: string
}

const Navigation = ({ className = '' }: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleAdminLogout = () => {
    try {
      logout()
    } finally {
      setIsMenuOpen(false)
      navigate('/')
    }
  }

  // Base menu items that are always visible
  const baseMenuItems = [
    { name: 'Home', href: '/', current: location.pathname === '/' },
    { name: 'How It Works', href: '/#how-it-works', current: false },
    { name: 'Admin', href: '/admin', current: location.pathname === '/admin' },
    { name: 'About Koos', href: '/about-koos', current: location.pathname === '/about-koos' },
  ]

  // Add Join link for unauthenticated users
  if (!isAuthenticated) {
    baseMenuItems.push({ name: 'Join', href: '/join', current: location.pathname === '/join' })
  }

  // Role-specific menu items
  const roleSpecificItems = []
  if (isAuthenticated && user) {
    switch (user.role) {
      case 'student':
        roleSpecificItems.push({ name: 'For Students', href: '/for-students', current: location.pathname === '/for-students' })
        break
      case 'sponsor':
        roleSpecificItems.push({ name: 'For Sponsors', href: '/for-sponsors', current: location.pathname === '/for-sponsors' })
        break
      case 'merchant':
        roleSpecificItems.push({ name: 'For Merchants', href: '/for-merchants', current: location.pathname === '/for-merchants' })
        break
      case 'admin':
        // Admin can see all sections
        roleSpecificItems.push(
          { name: 'For Students', href: '/for-students', current: location.pathname === '/for-students' },
          { name: 'For Sponsors', href: '/for-sponsors', current: location.pathname === '/for-sponsors' },
          { name: 'For Merchants', href: '/for-merchants', current: location.pathname === '/for-merchants' }
        )
        break
    }
  }

  // Combine base items with role-specific items
  const menuItems = [...baseMenuItems.slice(0, 2), ...roleSpecificItems, ...baseMenuItems.slice(2)]

  return (
    <nav className={`bg-white shadow-sm border-b border-kalahari-sand-dark ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <img 
              src="/img/kudu_logo_small.png"
              alt="KuduPay Logo" 
              className="w-10 h-10"
            />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-kudu-brown font-accent">
                KuduPay
              </h1>
              <span className="text-xs text-charcoal-light font-medium">
                with Koos the Kudu
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {menuItems.map((item) => (
                item.href.startsWith('/#') ? (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-102 ${
                      item.current
                        ? 'bg-kudu-brown text-white shadow-sm'
                        : 'text-charcoal hover:text-kudu-brown hover:bg-kalahari-sand-light'
                    }`}
                    aria-current={item.current ? 'page' : undefined}
                  >
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-102 ${
                      item.current
                        ? 'bg-kudu-brown text-white shadow-sm'
                        : 'text-charcoal hover:text-kudu-brown hover:bg-kalahari-sand-light'
                    }`}
                    aria-current={item.current ? 'page' : undefined}
                  >
                    {item.name}
                  </Link>
                )
              ))}
            </div>
          </div>

          {/* Koos Message - Desktop */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg px-4 py-2 max-w-xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">🦌</span>
                <p className="text-sm text-charcoal font-medium">
                  "Lekker to see you here, boet!"
                </p>
              </div>
            </div>
            {isAuthenticated && user?.role === 'admin' && (
              <button
                onClick={handleAdminLogout}
                className="ml-2 bg-sunset-orange text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sunset-orange-dark transition-colors"
                aria-label="Logout admin"
              >
                Logout
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-lg text-charcoal hover:text-kudu-brown hover:bg-kalahari-sand-light focus:outline-none focus:ring-2 focus:ring-kudu-brown focus:ring-offset-2 transition-colors"
              aria-expanded="false"
              aria-label="Toggle navigation menu"
            >
              <span className="sr-only">Open main menu</span>
              {/* Hamburger icon */}
              <svg
                className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
              {/* Close icon */}
              <svg
                className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <div className={`md:hidden ${isMenuOpen ? 'block' : 'hidden'}`}>
          <div className="px-2 pt-2 pb-3 space-y-1 border-t border-kalahari-sand-dark">
            {menuItems.map((item) => (
              item.href.startsWith('/#') ? (
                <a
                  key={item.name}
                  href={item.href}
                  className={`block px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                    item.current
                      ? 'bg-kudu-brown text-white'
                      : 'text-charcoal hover:text-kudu-brown hover:bg-kalahari-sand-light'
                  }`}
                  aria-current={item.current ? 'page' : undefined}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`block px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                    item.current
                      ? 'bg-kudu-brown text-white'
                      : 'text-charcoal hover:text-kudu-brown hover:bg-kalahari-sand-light'
                  }`}
                  aria-current={item.current ? 'page' : undefined}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.name}
                </Link>
              )
            ))}
            
            {/* Mobile Koos Message */}
            <div className="mt-4 bg-savanna-gold-light border-l-4 border-kudu-brown rounded-r-lg p-3">
              <div className="flex items-start gap-3">
                <span className="text-xl">🦌</span>
                <div>
                  <p className="text-sm text-charcoal font-medium mb-1">
                    Koos says:
                  </p>
                  <p className="text-sm text-charcoal-light">
                    "Navigate like a pro, my friend. I'm here if you need help!"
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile Admin Logout */}
            {isAuthenticated && user?.role === 'admin' && (
              <div className="mt-3">
                <button
                  onClick={handleAdminLogout}
                  className="w-full bg-sunset-orange text-white px-4 py-2 rounded-lg text-base font-medium hover:bg-sunset-orange-dark transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation