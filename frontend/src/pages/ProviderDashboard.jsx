import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore.js'
import { useProviderStore } from '../store/providerStore.js'
import { useServiceStore } from '../store/serviceStore.js'
import { useBookingStore } from '../store/bookingStore.js'
import AppShell from '../components/shared/AppShell.jsx'
import BookingDetail from '../components/shared/BookingDetail.jsx'
import { Tabs, Modal, StatusBadge, EmptyState, Spinner, StarRating, Badge } from '../components/shared/UI.jsx'

export default function ProviderDashboard() {
  const [tab, setTab] = useState('profile')
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
          { key: 'profile', label: 'My profile' },
          { key: 'browse', label: 'Open requests' },
          { key: 'quotes', label: 'My quotes' },
          { key: 'jobs', label: 'My jobs' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'browse' && <BrowseTab />}
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'jobs' && <JobsTab />}
      </div>
    </AppShell>
  )
}

/* ---------------------------- Profile tab ---------------------------- */

function ProfileTab() {
  const { myProfile, saveMyProfile, addAvailability, removeAvailability } = useProviderStore()
  const [form, setForm] = useState({ skills: '', serviceAreas: '', experienceYears: 0, documents: '' })
  const [slot, setSlot] = useState({ day: 'Monday', startTime: '09:00', endTime: '18:00' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (myProfile) {
      setForm({
        skills: (myProfile.skills || []).join(', '),
        serviceAreas: (myProfile.serviceAreas || []).join(', '),
        experienceYears: myProfile.experienceYears || 0,
        documents: (myProfile.documents || []).join(', '),
      })
    }
  }, [myProfile])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await saveMyProfile({
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        serviceAreas: form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        experienceYears: Number(form.experienceYears) || 0,
        documents: form.documents.split(',').map((s) => s.trim()).filter(Boolean),
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
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Skills (comma-separated)</label>
          <input className="input-field" placeholder="plumbing, electrical" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Service areas (comma-separated)</label>
          <input className="input-field" placeholder="Kukatpally, Madhapur" value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Years of experience</label>
            <input type="number" min="0" className="input-field" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} />
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
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Verification documents (URLs, comma-separated)</label>
          <input className="input-field" placeholder="https://…/id-proof.pdf" value={form.documents} onChange={(e) => setForm({ ...form, documents: e.target.value })} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-auto px-5">{saving ? 'Saving…' : 'Save profile'}</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-900">Weekly availability</h3>
        <div className="space-y-2">
          {(myProfile?.availability || []).length === 0 && <p className="text-sm text-slate-400">No slots added yet.</p>}
          {(myProfile?.availability || []).map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{s.day}: {s.startTime}–{s.endTime}</span>
              <button onClick={() => removeAvailability(i)} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <select className="input-field" value={slot.day} onChange={(e) => setSlot({ ...slot, day: e.target.value })}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => <option key={d}>{d}</option>)}
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
                <p className="font-semibold text-slate-900">{r.category?.name || 'Uncategorized'}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{r.description}</p>
              <p className="mt-2 text-xs text-slate-400">{r.serviceArea}{r.preferredDate ? ` · ${new Date(r.preferredDate).toLocaleDateString()}` : ''}</p>
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
    <Modal open={!!request} onClose={onClose} title={`Quote: ${request.category?.name || 'Request'}`}>
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
  const { myQuotes, fetchMyQuotes, withdrawQuote } = useServiceStore()
  useEffect(() => { fetchMyQuotes() }, [fetchMyQuotes])

  if (myQuotes.length === 0) return <EmptyState title="No quotes submitted yet" description="Quotes you send on open requests will appear here." />

  return (
    <div className="space-y-3">
      {myQuotes.map((q) => (
        <div key={q._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="font-semibold text-slate-900">{q.serviceRequest?.category?.name || 'Request'}</p>
            <p className="text-sm text-slate-500">₹{q.price} · {q.estimatedDuration}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={q.status} />
            {q.status === 'pending' && (
              <button onClick={() => withdrawQuote(q._id)} className="text-xs font-semibold text-red-600 hover:underline">Withdraw</button>
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
          <p className="mt-2 text-sm font-bold text-slate-900">₹{b.price}</p>
        </button>
      ))}
      <BookingDetail bookingId={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  )
}
