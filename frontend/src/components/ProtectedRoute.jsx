import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
          <p className="text-sm text-slate-500">Loading your workspace…</p>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return children
}
