import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useProviderStore } from '../store/providerStore.js'
import { useServiceStore } from '../store/serviceStore.js'
import { useBookingStore } from '../store/bookingStore.js'
import { useInvoiceStore } from '../store/invoiceStore.js'
import AppShell from '../components/shared/AppShell.jsx'
import BookingDetail from '../components/shared/BookingDetail.jsx'
import { Tabs, Modal, StatusBadge, EmptyState, Spinner, StarRating, Badge, Money, StatCard, FileUpload } from '../components/shared/UI.jsx'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function ProviderDashboard() {
  const [tab, setTab] = useState('overview')
  const { myProfile, fetchMyProfile } = useProviderStore()

  useEffect(() => { fetchMyProfile() }, [fetchMyProfile])

  return (
    <AppShell heading="Provider workspace" subheading="Manage your profile, quote on jobs, and track active work.">
      {myProfile && myProfile.verificationStatus !== 'verified' && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your profile is <strong>{myProfile.verificationStatus}</strong>. You can browse requests, but you need to be
          verified by an administrator before you can submit quotes.
        </div>
      )}
      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'profile', label: 'My profile' },
          { key: 'browse', label: 'Open requests' },
          { key: 'quotes', label: 'My quotes' },
          { key: 'jobs', label: 'My jobs' },
          { key: 'invoices', label: 'Invoices' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'browse' && <BrowseTab />}
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'jobs' && <JobsTab />}
        {tab === 'invoices' && <InvoicesTab />}
      </div>
    </AppShell>
  )
}

/* ---------------------------- Overview tab ---------------------------- */

function OverviewTab() {
  const { myStats, fetchMyStats } = useProviderStore()
  useEffect(() => { fetchMyStats() }, [fetchMyStats])

  if (!myStats) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={myStats.today} hint="jobs scheduled today" />
        <StatCard label="Upcoming" value={myStats.upcoming} hint="jobs scheduled ahead" />
        <StatCard label="In progress" value={myStats.inProgress} />
        <StatCard label="Completed" value={myStats.completed} />
        <StatCard label="Pending quotes" value={myStats.pendingQuotes} />
        <StatCard label="Quote acceptance" value={`${Math.round((myStats.acceptanceRate || 0) * 100)}%`} />
        <StatCard label="Earnings this month" value={<Money value={myStats.earningsMonth} />} />
        <StatCard label="Total earnings" value={<Money value={myStats.earningsTotal} />} />
      </div>
      {(myStats.awaitingPayment > 0 || myStats.draftInvoices > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {myStats.draftInvoices > 0 && <>You have {myStats.draftInvoices} invoice{myStats.draftInvoices !== 1 ? 's' : ''} still in draft. </>}
          {myStats.awaitingPayment > 0 && <>{myStats.awaitingPayment} invoice{myStats.awaitingPayment !== 1 ? 's' : ''} issued and awaiting customer payment.</>}
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Profile tab ---------------------------- */

function ProfileTab() {
  const { myProfile, saveMyProfile, addAvailability, updateAvailability, removeAvailability } = useProviderStore()
  const [form, setForm] = useState({ headline: '', bio: '', skills: '', serviceAreas: '', experienceYears: 0, hourlyRate: 0, documents: [] })
  const [slot, setSlot] = useState({ day: 'Monday', startTime: '09:00', endTime: '18:00' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (myProfile) {
      setForm({
        headline: myProfile.headline || '',
        bio: myProfile.bio || '',
        skills: (myProfile.skills || []).join(', '),
        serviceAreas: (myProfile.serviceAreas || []).join(', '),
        experienceYears: myProfile.experienceYears || 0,
        hourlyRate: myProfile.hourlyRate || 0,
        documents: (myProfile.documents || []).map((url) => ({ url })),
      })
    }
  }, [myProfile])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await saveMyProfile({
        headline: form.headline,
        bio: form.bio,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        serviceAreas: form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        experienceYears: Number(form.experienceYears) || 0,
        hourlyRate: Number(form.hourlyRate) || 0,
        documents: form.documents.map((f) => f.url),
        availability: myProfile?.availability || [],
      })
      toast.success('Profile saved')
    } catch { /* handled */ } finally {
      setSaving(false)
    }
  }

  const handleAddSlot = async () => {
    try {
      await addAvailability(slot)
      toast.success('Availability added')
    } catch { /* handled */ }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Provider profile</h3>
          {myProfile && <StatusBadge status={myProfile.verificationStatus} />}
        </div>
        {myProfile?.verificationStatus === 'rejected' && myProfile.verificationNote && (
          <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Rejected: {myProfile.verificationNote}. Update your details and documents below to resubmit.</p>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Headline</label>
          <input className="input-field" placeholder="e.g. Fast, reliable home repairs" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Bio</label>
          <textarea className="input-field" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Skills (comma-separated)</label>
          <input className="input-field" placeholder="plumbing, electrical" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Service areas (comma-separated)</label>
          <input className="input-field" placeholder="Kukatpally, Madhapur" value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Years of experience</label>
            <input type="number" min="0" className="input-field" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Hourly rate (₹)</label>
            <input type="number" min="0" className="input-field" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Rating</label>
            <div className="flex h-[42px] items-center gap-2">
              <StarRating value={myProfile?.rating} />
              <span className="text-sm text-slate-500">{(myProfile?.rating || 0).toFixed(1)} ({myProfile?.ratingCount || 0})</span>
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Verification documents</label>
          <FileUpload files={form.documents} onUploaded={(f) => setForm({ ...form, documents: [...form.documents, ...f] })} onRemove={(i) => setForm({ ...form, documents: form.documents.filter((_, idx) => idx !== i) })} label="Upload ID / certification" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-auto px-5">{saving ? 'Saving…' : 'Save profile'}</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-900">Weekly availability</h3>
        <div className="space-y-2">
          {(myProfile?.availability || []).length === 0 && <p className="text-sm text-slate-400">No slots added yet.</p>}
          {(myProfile?.availability || []).map((s) => (
            <div key={s._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{s.day}: {s.startTime}–{s.endTime}</span>
              <button onClick={() => removeAvailability(s._id)} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <select className="input-field" value={slot.day} onChange={(e) => setSlot({ ...slot, day: e.target.value })}>
            {DAYS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="time" className="input-field" value={slot.startTime} onChange={(e) => setSlot({ ...slot, startTime: e.target.value })} />
            <input type="time" className="input-field" value={slot.endTime} onChange={(e) => setSlot({ ...slot, endTime: e.target.value })} />
          </div>
          <button onClick={handleAddSlot} className="w-full rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            + Add slot
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------- Browse tab ---------------------------- */

function BrowseTab() {
  const { requests, fetchRequests, isLoading } = useServiceStore()
  const { myProfile } = useProviderStore()
  const [search, setSearch] = useState('')
  const [quoteFor, setQuoteFor] = useState(null)

  useEffect(() => { fetchRequests({ status: 'open' }) }, [fetchRequests])

  const filtered = requests.filter((r) => !search || r.description.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <input className="input-field mb-4 max-w-sm" placeholder="Search open requests…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState title="No open requests" description="Nothing matches your service areas right now — check back later." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <div key={r._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{r.title || r.category?.name || 'Uncategorized'}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{r.description}</p>
              <p className="mt-2 text-xs text-slate-400">
                {r.serviceArea} · {r.urgency}{r.preferredDate ? ` · ${new Date(r.preferredDate).toLocaleDateString()}` : ''}
              </p>
              {r.requiredSkills?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.requiredSkills.map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
              )}
              <button
                onClick={() => setQuoteFor(r)}
                disabled={myProfile?.verificationStatus !== 'verified'}
                className="mt-4 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {myProfile?.verificationStatus !== 'verified' ? 'Verification required' : 'Submit a quote'}
              </button>
            </div>
          ))}
        </div>
      )}
      <QuoteModal request={quoteFor} onClose={() => setQuoteFor(null)} />
    </div>
  )
}

function QuoteModal({ request, onClose }) {
  const { submitQuote } = useServiceStore()
  const [form, setForm] = useState({ price: '', estimatedDuration: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  if (!request) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.price) return toast.error('Enter a price')
    setSubmitting(true)
    try {
      await submitQuote({ serviceRequest: request._id, price: Number(form.price), estimatedDuration: form.estimatedDuration, notes: form.notes })
      toast.success('Quote submitted')
      setForm({ price: '', estimatedDuration: '', notes: '' })
      onClose()
    } catch { /* handled */ } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={!!request} onClose={onClose} title={`Quote: ${request.title || request.category?.name || 'Request'}`}>
      <p className="mb-4 text-sm text-slate-600">{request.description}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Price (₹)</label>
          <input type="number" min="0" className="input-field" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Estimated duration</label>
          <input className="input-field" placeholder="e.g. 2 hours" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
          <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Submitting…' : 'Submit quote'}</button>
      </form>
    </Modal>
  )
}

/* ---------------------------- Quotes tab ---------------------------- */

function QuotesTab() {
  const { myQuotes, fetchMyQuotes, withdrawQuote, updateQuote } = useServiceStore()
  const [editing, setEditing] = useState(null)
  const [price, setPrice] = useState('')
  useEffect(() => { fetchMyQuotes() }, [fetchMyQuotes])

  if (myQuotes.length === 0) return <EmptyState title="No quotes submitted yet" description="Quotes you send on open requests will appear here." />

  const startEdit = (q) => { setEditing(q._id); setPrice(q.price) }
  const saveEdit = async (id) => {
    try { await updateQuote(id, { price: Number(price) }); toast.success('Quote updated'); setEditing(null) } catch { /* handled */ }
  }

  return (
    <div className="space-y-3">
      {myQuotes.map((q) => (
        <div key={q._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="font-semibold text-slate-900">{q.serviceRequest?.category?.name || 'Request'}</p>
            {editing === q._id ? (
              <div className="mt-1 flex items-center gap-2">
                <input type="number" min="0" className="input-field !w-32 !py-1" value={price} onChange={(e) => setPrice(e.target.value)} />
                <button onClick={() => saveEdit(q._id)} className="text-xs font-semibold text-brand-700 hover:underline">Save</button>
                <button onClick={() => setEditing(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
              </div>
            ) : (
              <p className="text-sm text-slate-500"><Money value={q.price} /> · {q.estimatedDuration}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={q.status} />
            {q.status === 'pending' && editing !== q._id && (
              <>
                <button onClick={() => startEdit(q)} className="text-xs font-semibold text-brand-700 hover:underline">Edit</button>
                <button onClick={async () => { await withdrawQuote(q._id); toast.success('Quote withdrawn') }} className="text-xs font-semibold text-red-600 hover:underline">Withdraw</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------- Jobs tab ---------------------------- */

function JobsTab() {
  const { bookings, fetchBookings } = useBookingStore()
  const [selected, setSelected] = useState(null)
  useEffect(() => { fetchBookings() }, [fetchBookings])

  if (bookings.length === 0) return <EmptyState title="No active jobs" description="Accepted bookings will show up here for you to manage." />

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bookings.map((b) => (
        <button key={b._id} onClick={() => setSelected(b._id)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-brand-400">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-slate-900">{b.serviceRequest?.category?.name || 'Service'}</p>
            <StatusBadge status={b.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">Customer: {b.customer?.name}</p>
          <p className="mt-1 text-xs text-slate-400">{new Date(b.scheduledDate).toLocaleDateString()} · {b.startTime}–{b.endTime}</p>
          <p className="mt-2 text-sm font-bold text-slate-900"><Money value={b.price} /></p>
        </button>
      ))}
      <BookingDetail bookingId={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ---------------------------- Invoices tab ---------------------------- */

function InvoicesTab() {
  const { invoices, fetchInvoices, isLoading } = useInvoiceStore()
  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  if (isLoading) return <Spinner />
  if (invoices.length === 0) return <EmptyState title="No invoices yet" description="Draft an invoice from a job once it's in progress." />

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div key={inv._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="font-semibold text-slate-900">{inv.number}</p>
            <p className="text-xs text-slate-500">{inv.booking?.serviceRequest?.category?.name} · {new Date(inv.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-slate-500">
              <p className="text-sm font-bold text-slate-900"><Money value={inv.total} /></p>
              <p>Your payout: <Money value={inv.providerPayout} /></p>
            </div>
            <StatusBadge status={inv.status} />
          </div>
        </div>
      ))}
    </div>
  )
}
