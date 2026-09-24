import { useAuthStore } from '../store/authStore.js'
import CustomerDashboard from './CustomerDashboard.jsx'
import ProviderDashboard from './ProviderDashboard.jsx'
import AdminDashboard from './AdminDashboard.jsx'

export default function Dashboard() {
  const role = useAuthStore((s) => s.user?.role)

  if (role === 'customer') return <CustomerDashboard />
  if (role === 'provider') return <ProviderDashboard />
  if (['admin', 'operationsManager', 'supportAgent'].includes(role)) return <AdminDashboard />

  return null
}
