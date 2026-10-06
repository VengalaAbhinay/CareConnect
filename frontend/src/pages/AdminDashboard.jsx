import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore.js'
import { useServiceStore } from '../store/serviceStore.js'
import { useProviderStore } from '../store/providerStore.js'
import { useAdminStore } from '../store/adminStore.js'
import { useBookingStore } from '../store/bookingStore.js'
import { useSupportStore } from '../store/supportStore.js'
import AppShell from '../components/shared/AppShell.jsx'
import BookingDetail from '../components/shared/BookingDetail.jsx'
import SupportCaseThread from '../components/shared/SupportCaseThread.jsx'
import { Tabs, Modal, StatusBadge, EmptyState, Spinner, StarRating, StatCard, Badge, Money, fileUrl } from '../components/shared/UI.jsx'

const TABS_BY_ROLE = {
  admin: [
    { key: 'categories', label: 'Categories' },
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
    { key: 'staff', label: 'Staff accounts' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'support', label: 'Support queue' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit log' },
  ],
  operationsManager: [
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
    { key: 'staff', label: 'Staff accounts' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'support', label: 'Support queue' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit log' },
  ],
  supportAgent: [
    { key: 'support', label: 'Support queue' },
    { key: 'bookings', label: 'Bookings' },
  ],
}

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const tabs = TABS_BY_ROLE[user?.role] || TABS_BY_ROLE.supportAgent
  const [tab, setTab] = useState(tabs[0].key)

  return (
    <AppShell heading="Operations console" subheading="Manage categories, providers, users, bookings and support cases across CareConnect.">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'users' && <UsersTab canEdit={user?.role === 'admin'} />}
        {tab === 'staff' && <StaffTab isAdmin={user?.role === 'admin'} />}
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'support' && <SupportTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </AppShell>
  )
}

/* ---------------------------- Categories ---------------------------- */

function CategoriesTab() {
  const { categories, fetchCategories, createCategory, updateCategory, deactivateCategory } = useServiceStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', requiredSkills: '', min: '', max: '', enforcePriceRange: true, platformFeePercent: 10, taxPercent: 0 })

  useEffect(() => { fetchCategories({ includeInactive: true }) }, [fetchCategories])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', requiredSkills: '', min: '', max: '', enforcePriceRange: true, platformFeePercent: 10, taxPercent: 0 })
    setShowForm(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name, description: c.description || '',
      requiredSkills: (c.requiredSkills || []).join(', '),
      min: c.basePriceRange?.min ?? '', max: c.basePriceRange?.max ?? '',
      enforcePriceRange: c.enforcePriceRange !== false,
      platformFeePercent: c.platformFeePercent ?? 10,
      taxPercent: c.taxPercent ?? 0,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      name: form.name,
      description: form.description,
      requiredSkills: form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
      basePriceRange: { min: Number(form.min) || 0, max: Number(form.max) || 0 },
      enforcePriceRange: form.enforcePriceRange,
      platformFeePercent: Number(form.platformFeePercent) || 0,
      taxPercent: Number(form.taxPercent) || 0,
    }
    try {
      if (editing) {
        await updateCategory(editing._id, payload)
        toast.success('Category updated')
      } else {
        await createCategory(payload)
        toast.success('Category created')
      }
      setShowForm(false)
    } catch { /* handled */ }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{categories.length} categories</p>
        <button onClick={openCreate} className="btn-primary w-auto px-5">+ New category</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{c.name}</p>
              <Badge tone={c.isActive ? 'green' : 'red'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{c.description}</p>
            <p className="mt-2 text-xs text-slate-400">
              <Money value={c.basePriceRange?.min || 0} />–<Money value={c.basePriceRange?.max || 0} />
              {c.enforcePriceRange === false && ' (not enforced)'}
            </p>
            <p className="text-xs text-slate-400">Platform fee {c.platformFeePercent}% · Tax {c.taxPercent}%</p>
            {c.requiredSkills?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.requiredSkills.map((s) => <Badge key={s}>{s}</Badge>)}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => openEdit(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
              {c.isActive && (
                <button onClick={() => deactivateCategory(c._id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Deactivate</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit category' : 'New category'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
            <textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Required skills (comma-separated)</label>
            <input className="input-field" value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Min price (₹)</label>
              <input type="number" className="input-field" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Max price (₹)</label>
              <input type="number" className="input-field" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.enforcePriceRange} onChange={(e) => setForm({ ...form, enforcePriceRange: e.target.checked })} />
            Reject quotes outside this price range
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Platform fee (%)</label>
              <input type="number" min="0" max="100" className="input-field" value={form.platformFeePercent} onChange={(e) => setForm({ ...form, platformFeePercent: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tax (%)</label>
              <input type="number" min="0" max="100" className="input-field" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn-primary">{editing ? 'Save changes' : 'Create category'}</button>
        </form>
      </Modal>
    </div>
  )
}

/* ---------------------------- Providers ---------------------------- */

function ProvidersTab() {
  const { providers, fetchProviders, verifyProvider, isLoading } = useProviderStore()
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => { fetchProviders(filter ? { verificationStatus: filter } : {}) }, [fetchProviders, filter])

  const filtered = providers.filter((p) => !search || p.user?.name?.toLowerCase().includes(search.toLowerCase()))

  const handleVerify = async (id) => {
    try { await verifyProvider(id, 'verified'); toast.success('Provider verified') } catch { /* handled */ }
  }
  const handleReject = async (e) => {
    e.preventDefault()
    if (note.trim().length < 3) return toast.error('Explain why this profile is being rejected')
    try {
      await verifyProvider(rejecting._id, 'rejected', note)
      toast.success('Provider rejected')
      setRejecting(null); setNote('')
    } catch { /* handled */ }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input-field max-w-xs" placeholder="Search providers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      {isLoading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState title="No providers found" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{p.user?.name}</p>
                <StatusBadge status={p.verificationStatus} />
              </div>
              <p className="text-xs text-slate-500">{p.user?.email}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <StarRating value={p.rating} /> {(p.rating || 0).toFixed(1)} ({p.ratingCount || 0})
              </div>
              <p className="mt-2 text-xs text-slate-400">{p.experienceYears || 0}y experience · ₹{p.hourlyRate || 0}/hr</p>
              {p.skills?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
              )}
              {p.serviceAreas?.length > 0 && <p className="mt-2 text-xs text-slate-400">Areas: {p.serviceAreas.join(', ')}</p>}
              {p.documents?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {p.documents.map((d, i) => (
                    <a key={i} href={fileUrl(d)} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 underline">Document {i + 1}</a>
                  ))}
                </div>
              )}
              {p.verificationNote && <p className="mt-2 text-xs text-red-600">Note: {p.verificationNote}</p>}
              <div className="mt-4 flex gap-2">
                {p.verificationStatus !== 'verified' && (
                  <button onClick={() => handleVerify(p._id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                    Verify
                  </button>
                )}
                {p.verificationStatus !== 'rejected' && (
                  <button onClick={() => { setRejecting(p); setNote('') }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.user?.name || 'provider'}`}>
        <form onSubmit={handleReject} className="space-y-4">
          <textarea className="input-field" rows={3} placeholder="Why is this profile being rejected?" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Confirm rejection</button>
        </form>
      </Modal>
    </div>
  )
}

/* ---------------------------- Users ---------------------------- */

const ROLES = ['customer', 'provider', 'admin', 'operationsManager', 'supportAgent']

function UsersTab({ canEdit }) {
  const { users, usersTotal, fetchUsers, updateUser, isLoading } = useAdminStore()
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers(search ? { search } : {}) }, [fetchUsers, search])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <input className="input-field max-w-xs" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="text-sm text-slate-500">{usersTotal} total</p>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                {canEdit && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <select className="input-field !w-auto !py-1 text-xs" value={u.role} onChange={(e) => updateUser(u._id, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : <Badge>{u.role}</Badge>}
                  </td>
                  <td className="px-4 py-3"><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => updateUser(u._id, { isActive: !u.isActive })}
                        className={`text-xs font-semibold hover:underline ${u.isActive ? 'text-red-600' : 'text-emerald-600'}`}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Staff accounts ---------------------------- */

function StaffTab({ isAdmin }) {
  const { createStaff } = useAdminStore()
  const [form, setForm] = useState({ name: '', email: '', role: 'supportAgent' })
  const [created, setCreated] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await createStaff(form)
      setCreated(result)
      setForm({ name: '', email: '', role: 'supportAgent' })
      toast.success('Staff account created')
    } catch { /* handled */ } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900">Create a staff account</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
          <input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input type="email" className="input-field" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
          <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="supportAgent">Support agent</option>
            <option value="operationsManager">Operations manager</option>
            {isAdmin && <option value="admin">Admin</option>}
          </select>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-auto px-5">{submitting ? 'Creating…' : 'Create account'}</button>
      </form>

      {created && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">{created.user.name} was created as {created.user.role}.</p>
          <p className="mt-1">Temporary password: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{created.tempPassword}</code></p>
          <p className="mt-1 text-xs text-emerald-700">Share this securely — they should change it after their first login.</p>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Bookings overview ---------------------------- */

function BookingsTab() {
  const { bookings, fetchBookings, isLoading } = useBookingStore()
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchBookings(status ? { status } : {}) }, [fetchBookings, status])

  return (
    <div>
      <select className="input-field mb-4 max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {['scheduled', 'inProgress', 'awaitingConfirmation', 'completed', 'cancelled', 'disputed'].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {isLoading ? <Spinner /> : bookings.length === 0 ? <EmptyState title="No bookings" /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => (
                <tr key={b._id} onClick={() => setSelected(b._id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3">{b.customer?.name}</td>
                  <td className="px-4 py-3">{b.provider?.user?.name}</td>
                  <td className="px-4 py-3">{b.serviceRequest?.category?.name}</td>
                  <td className="px-4 py-3">{new Date(b.scheduledDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><Money value={b.price} /></td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BookingDetail bookingId={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ---------------------------- Support queue ---------------------------- */

function SupportTab() {
  const { cases, stats, fetchCases, fetchStats, isLoading } = useSupportStore()
  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [openCaseId, setOpenCaseId] = useState(null)

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => {
    const params = {}
    if (status) params.status = status
    if (assignedTo) params.assignedTo = assignedTo
    fetchCases(params)
  }, [fetchCases, status, assignedTo])

  return (
    <div>
      {stats && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Unassigned" value={stats.unassigned} />
          <StatCard label="Assigned to me" value={stats.mine} />
          <StatCard label="Urgent" value={stats.urgent} />
          <StatCard label="Over SLA (24h+)" value={stats.overSla ? 'Yes' : 'No'} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <select className="input-field max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['open', 'investigating', 'escalated', 'resolved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-field max-w-xs" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>
      {isLoading ? <Spinner /> : cases.length === 0 ? <EmptyState title="No cases" description="All clear — no cases match this filter." /> : (
        <div className="space-y-3">
          {cases.map((c) => (
            <button key={c._id} onClick={() => setOpenCaseId(c._id)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-400">
              <div>
                <div className="flex items-center gap-2">
                  <Badge>{c.type}</Badge>
                  <p className="font-semibold text-slate-900">{c.subject}</p>
                  {c.priority === 'high' || c.priority === 'urgent' ? <Badge tone="red">{c.priority}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">{c.reason}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {c.booking?.customer?.name} ↔ {c.booking?.provider?.user?.name} · {c.assignedTo ? `Assigned to ${c.assignedTo.name}` : 'Unassigned'}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={c.status} />
                {c.refundAmount > 0 && <p className="mt-1 text-xs text-slate-500">Refund: <Money value={c.refundAmount} /></p>}
              </div>
            </button>
          ))}
        </div>
      )}
      <SupportCaseThread caseId={openCaseId} open={!!openCaseId} onClose={() => { setOpenCaseId(null); fetchCases(); fetchStats() }} showStaffControls />
    </div>
  )
}

/* ---------------------------- Analytics ---------------------------- */

function AnalyticsTab() {
  const { analytics, revenueTrend, topProviders, fetchAnalytics, fetchRevenueTrend, fetchTopProviders } = useAdminStore()
  useEffect(() => { fetchAnalytics(); fetchRevenueTrend(6); fetchTopProviders() }, [fetchAnalytics, fetchRevenueTrend, fetchTopProviders])

  if (!analytics) return <Spinner />
  const maxRevenue = Math.max(1, ...revenueTrend.map((t) => t.revenue))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={analytics.totalUsers} />
        <StatCard label="Total providers" value={analytics.totalProviders} hint={`${analytics.verifiedProviders} verified, ${analytics.pendingVerifications} pending`} />
        <StatCard label="Open requests" value={analytics.openRequests} />
        <StatCard label="Total bookings" value={analytics.totalBookings} />
        <StatCard label="Completed bookings" value={analytics.completedBookings} />
        <StatCard label="Active support cases" value={analytics.activeDisputes} hint={`${analytics.unassignedCases} unassigned, ${analytics.escalatedCases} escalated`} />
        <StatCard label="Total revenue" value={<Money value={analytics.totalRevenue} />} hint="From paid invoices" />
        <StatCard label="Platform fee revenue" value={<Money value={analytics.platformFeeRevenue} />} />
        <StatCard label="Pending invoices" value={analytics.pendingInvoiceCount} hint={<Money value={analytics.pendingInvoiceTotal} />} />
        <StatCard label="Total refunded" value={<Money value={analytics.totalRefunded} />} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">Revenue, last 6 months</h3>
        <div className="flex items-end gap-3" style={{ height: 160 }}>
          {revenueTrend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(4, (t.revenue / maxRevenue) * 130)}px` }} title={`₹${t.revenue}`} />
              <p className="text-[11px] text-slate-500">{t.month.slice(5)}</p>
            </div>
          ))}
        </div>
      </div>

      {topProviders && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">Top providers</h3>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr><th className="pb-2">Name</th><th className="pb-2">Completed jobs</th><th className="pb-2">Rating</th><th className="pb-2">Earnings</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProviders.byJobs.map((p) => (
                <tr key={p.providerId}>
                  <td className="py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="py-2">{p.completedJobs}</td>
                  <td className="py-2">{(p.rating || 0).toFixed(1)} ({p.ratingCount})</td>
                  <td className="py-2"><Money value={p.earnings} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Audit log ---------------------------- */

function AuditTab() {
  const { auditLogs, fetchAuditLogs } = useAdminStore()
  useEffect(() => { fetchAuditLogs() }, [fetchAuditLogs])

  if (auditLogs.length === 0) return <EmptyState title="No audit activity yet" description="Admin and operations actions will be logged here." />

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {auditLogs.map((l) => (
            <tr key={l._id}>
              <td className="px-4 py-3 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="px-4 py-3">{l.actorName} <span className="text-xs text-slate-400">({l.actorRole})</span></td>
              <td className="px-4 py-3"><Badge>{l.action}</Badge></td>
              <td className="px-4 py-3 text-xs text-slate-500">{l.targetType}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{JSON.stringify(l.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
