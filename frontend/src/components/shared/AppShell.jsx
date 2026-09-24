import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore.js'
import { Logo } from '../AuthLayout.jsx'
import NotificationBell from './NotificationBell.jsx'

const roleLabels = {
  admin: 'Administrator',
  operationsManager: 'Operations Manager',
  provider: 'Service Provider',
  customer: 'Customer',
  supportAgent: 'Support Agent',
}

export default function AppShell({ children, heading, subheading }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Logged out')
      navigate('/login')
    } catch {
      // handled by interceptor
    }
  }

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{roleLabels[user?.role] || user?.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
              {initials}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {(heading || subheading) && (
          <div className="mb-6">
            {heading && <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>}
            {subheading && <p className="mt-1 text-sm text-slate-500">{subheading}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
