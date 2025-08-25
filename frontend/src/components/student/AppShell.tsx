import { Outlet, NavLink, useLocation } from 'react-router-dom'
import OfflineBanner from './OfflineBanner'

export default function AppShell() {
  const loc = useLocation()
  const title = (() => {
    if (loc.pathname.startsWith('/app/pay')) return 'Pay'
    if (loc.pathname.startsWith('/app/budgets')) return 'Budgets'
    if (loc.pathname.startsWith('/app/activity')) return 'Activity'
    if (loc.pathname.startsWith('/app/me')) return 'Me'
    return 'Home'
  })()

  return (
    <div className="min-h-screen bg-kalahari-sand-light">
      <header className="sticky top-0 z-10 bg-white border-b border-kalahari-sand-dark">
        <div className="max-w-screen-sm mx-auto p-4">
          <h1 className="text-xl font-semibold text-kudu-brown">{title}</h1>
        </div>
      </header>
      <OfflineBanner />
      <main className="max-w-screen-sm mx-auto p-4 pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-kalahari-sand-dark pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-screen-sm mx-auto grid grid-cols-5">
          <Tab to="/app" label="Home" icon="🏠" />
          <Tab to="/app/pay" label="Pay" icon="💳" />
          <Tab to="/app/budgets" label="Budgets" icon="📊" />
          <Tab to="/app/activity" label="Activity" icon="📜" />
          <Tab to="/app/me" label="Me" icon="👤" />
        </div>
      </nav>
    </div>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `flex flex-col items-center py-2 text-sm ${isActive ? 'text-kudu-brown' : 'text-kudu-gray'}`}
    >
      <span className="text-xl" aria-hidden>{icon}</span>
      <span className="sr-only md:not-sr-only md:text-xs">{label}</span>
    </NavLink>
  )
}
