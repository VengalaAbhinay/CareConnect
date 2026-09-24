import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore.js'
import { useServiceStore } from '../store/serviceStore.js'
import { useProviderStore } from '../store/providerStore.js'
import { useAdminStore } from '../store/adminStore.js'
import { useBookingStore } from '../store/bookingStore.js'
import AppShell from '../components/shared/AppShell.jsx'
import BookingDetail from '../components/shared/BookingDetail.jsx'
import { Tabs, Modal, StatusBadge, EmptyState, Spinner, StarRating, StatCard, Badge } from '../components/shared/UI.jsx'

const TABS_BY_ROLE = {
  admin: [
    { key: 'categories', label: 'Categories' },
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit log' },
  ],
  operationsManager: [
    { key: 'providers', label: 'Providers' },
    { key: 'users', label: 'Users' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit', label: 'Audit log' },
  ],
  supportAgent: [
    { key: 'disputes', label: 'Disputes' },
    { key: 'bookings', label: 'Bookings' },
  ],
}

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const tabs = TABS_BY_ROLE[user?.role] || TABS_BY_ROLE.supportAgent
  const [tab, setTab] = useState(tabs[0].key)

  return (
    <AppShell heading="Operations console" subheading="Manage categories, providers, users, bookings and disputes across CareConnect.">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'users' && <UsersTab canEdit={user?.role === 'admin'} />}
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'disputes' && <DisputesTab />}
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
  const [form, setForm] = useState({ name: '', description: '', requiredSkills: '', min: '', max: '' })

  useEffect(() => { fetchCategories({ includeInactive: true }) }, [fetchCategories])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', requiredSkills: '', min: '', max: '' })
    setShowForm(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name, description: c.description || '',
      requiredSkills: (c.requiredSkills || []).join(', '),
      min: c.basePriceRange?.min ?? '', max: c.basePriceRange?.max ?? '',
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
            <p className="mt-2 text-xs text-slate-400">₹{c.basePriceRange?.min || 0}–₹{c.basePriceRange?.max || 0}</p>
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

  useEffect(() => { fetchProviders(filter ? { verificationStatus: filter } : {}) }, [fetchProviders, filter])

  const filtered = providers.filter((p) => !search || p.user?.name?.toLowerCase().includes(search.toLowerCase()))

  const handleVerify = async (id, status) => {
    try {
      await verifyProvider(id, status)
      toast.success(status === 'verified' ? 'Provider verified' : 'Provider rejected')
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
              <p className="mt-2 text-xs text-slate-400">{p.experienceYears || 0}y experience</p>
              {p.skills?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
              )}
              {p.serviceAreas?.length > 0 && <p className="mt-2 text-xs text-slate-400">Areas: {p.serviceAreas.join(', ')}</p>}
              {p.documents?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {p.documents.map((d, i) => (
                    <a key={i} href={d} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 underline">Document {i + 1}</a>
                  ))}
                </div>
              )}
              {p.verificationStatus !== 'verified' && (
                <button onClick={() => handleVerify(p._id, 'verified')} className="mt-4 mr-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                  Verify
                </button>
              )}
              {p.verificationStatus !== 'rejected' && (
                <button onClick={() => handleVerify(p._id, 'rejected')} className="mt-4 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                  Reject
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Users ---------------------------- */

const ROLES = ['customer', 'provider', 'admin', 'operationsManager', 'supportAgent']

function UsersTab({ canEdit }) {
  const { users, fetchUsers, updateUser, isLoading } = useAdminStore()
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filtered = users.filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <input className="input-field mb-4 max-w-xs" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              {filtered.map((u) => (
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
        {['scheduled', 'inProgress', 'completed', 'cancelled', 'disputed'].map((s) => <option key={s} value={s}>{s}</option>)}
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
                  <td className="px-4 py-3">₹{b.price}</td>
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

/* ---------------------------- Disputes ---------------------------- */

function DisputesTab() {
  const { disputes, fetchAllDisputes, resolveDispute, isLoading } = useBookingStore()
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ status: 'investigating', resolutionNotes: '', refundAmount: 0 })

  useEffect(() => { fetchAllDisputes(status ? { status } : {}) }, [fetchAllDisputes, status])

  const openResolve = (d) => {
    setEditing(d)
    setForm({ status: d.status === 'open' ? 'investigating' : d.status, resolutionNotes: d.resolutionNotes || '', refundAmount: d.refundAmount || 0 })
  }

  const handleResolve = async (e) => {
    e.preventDefault()
    try {
      await resolveDispute(editing._id, { ...form, refundAmount: Number(form.refundAmount) || 0 })
      toast.success('Dispute updated')
      setEditing(null)
    } catch { /* handled */ }
  }

  return (
    <div>
      <select className="input-field mb-4 max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {['open', 'investigating', 'resolved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {isLoading ? <Spinner /> : disputes.length === 0 ? <EmptyState title="No disputes" description="All clear — no disputes match this filter." /> : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <div key={d._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{d.raisedBy?.name} raised a dispute</p>
                  <p className="mt-1 text-sm text-slate-600">{d.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Booking: {d.booking?.serviceRequest?.category?.name || d.booking?._id} · {d.booking?.customer?.name} ↔ {d.booking?.provider?.user?.name}
                  </p>
                  {d.resolutionNotes && <p className="mt-2 text-xs text-slate-500">Resolution: {d.resolutionNotes}</p>}
                </div>
                <div className="text-right">
                  <StatusBadge status={d.status} />
                  {d.refundAmount > 0 && <p className="mt-1 text-xs text-slate-500">Refund: ₹{d.refundAmount}</p>}
                </div>
              </div>
              {['open', 'investigating'].includes(d.status) && (
                <button onClick={() => openResolve(d)} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                  Manage dispute
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Resolve dispute">
        <form onSubmit={handleResolve} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['investigating', 'resolved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Resolution notes</label>
            <textarea className="input-field" rows={3} value={form.resolutionNotes} onChange={(e) => setForm({ ...form, resolutionNotes: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Refund amount (₹)</label>
            <input type="number" min="0" className="input-field" value={form.refundAmount} onChange={(e) => setForm({ ...form, refundAmount: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary">Save resolution</button>
        </form>
      </Modal>
    </div>
  )
}

/* ---------------------------- Analytics ---------------------------- */

function AnalyticsTab() {
  const { analytics, fetchAnalytics } = useAdminStore()
  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  if (!analytics) return <Spinner />

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total users" value={analytics.totalUsers} />
      <StatCard label="Total providers" value={analytics.totalProviders} hint={`${analytics.verifiedProviders} verified`} />
      <StatCard label="Open requests" value={analytics.openRequests} />
      <StatCard label="Total bookings" value={analytics.totalBookings} />
      <StatCard label="Completed bookings" value={analytics.completedBookings} />
      <StatCard label="Active disputes" value={analytics.activeDisputes} />
      <StatCard label="Total revenue" value={`₹${analytics.totalRevenue}`} hint="From completed bookings" />
      <StatCard
        label="Bookings by status"
        value={Object.entries(analytics.bookingsByStatus || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}
      />
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
