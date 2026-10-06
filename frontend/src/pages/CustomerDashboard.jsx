import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useServiceStore } from '../store/serviceStore.js'
import { useBookingStore } from '../store/bookingStore.js'
import { useInvoiceStore } from '../store/invoiceStore.js'
import { useSupportStore } from '../store/supportStore.js'
import AppShell from '../components/shared/AppShell.jsx'
import BookingDetail from '../components/shared/BookingDetail.jsx'
import SupportCaseThread from '../components/shared/SupportCaseThread.jsx'
import { Tabs, Modal, StatusBadge, EmptyState, Spinner, StarRating, Money, Badge } from '../components/shared/UI.jsx'

export default function CustomerDashboard() {
  const [tab, setTab] = useState('requests')
  return (
    <AppShell heading="Customer workspace" subheading="Request services, compare quotes, and track your bookings.">
      <Tabs
        tabs={[
          { key: 'requests', label: 'My requests' },
          { key: 'bookings', label: 'My bookings' },
          { key: 'invoices', label: 'Invoices' },
          { key: 'support', label: 'Support cases' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === 'requests' && <RequestsTab />}
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'support' && <SupportTab />}
      </div>
    </AppShell>
  )
}

/* ---------------------------- Requests tab ---------------------------- */

const URGENCY_OPTIONS = ['flexible', 'normal', 'urgent']

function RequestsTab() {
  const { requests, categories, fetchRequests, fetchCategories, createRequest, cancelRequest, deleteRequest, classify, isLoading } = useServiceStore()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ description: '', serviceArea: '', address: '', preferredDate: '', urgency: 'normal', budget: '' })
  const [classifying, setClassifying] = useState(false)
  const [preview, setPreview] = useState(null)
  const [selectedRequestId, setSelectedRequestId] = useState(null)
  const [suggestFor, setSuggestFor] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchRequests()
    fetchCategories()
  }, [fetchRequests, fetchCategories])

  const handleClassifyPreview = async () => {
    if (!form.description.trim()) return toast.error('Describe what you need first')
    setClassifying(true)
    try {
      const classification = await classify(form.description)
      setPreview(classification)
    } catch { /* handled */ } finally {
      setClassifying(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.description.trim() || !form.serviceArea.trim()) return toast.error('Fill in the required fields')
    setSubmitting(true)
    try {
      const request = await createRequest({
        description: form.description,
        serviceArea: form.serviceArea,
        address: form.address || undefined,
        preferredDate: form.preferredDate || undefined,
        urgency: form.urgency,
        budget: form.budget ? Number(form.budget) : undefined,
        category: preview?.category || undefined,
        requiredSkills: preview?.requiredSkills || [],
      })
      // classify + persist AI category on the created request
      await classify(form.description, request._id)
      toast.success('Request created — providers can now quote it')
      setShowCreate(false)
      setForm({ description: '', serviceArea: '', address: '', preferredDate: '', urgency: 'normal', budget: '' })
      setPreview(null)
      fetchRequests()
    } catch { /* handled */ } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary w-auto px-5">+ New request</button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No service requests yet"
          description="Describe what you need and we'll match you with verified providers."
          action={<button onClick={() => setShowCreate(true)} className="btn-primary w-auto px-5">Create your first request</button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((r) => (
            <div key={r._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{r.title || r.category?.name || 'Uncategorized'}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{r.description}</p>
              <p className="mt-2 text-xs text-slate-400">
                {r.serviceArea} · {r.urgency} {r.budget ? `· up to ₹${r.budget}` : ''} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setSelectedRequestId(r._id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  View quotes
                </button>
                {r.status === 'open' && (
                  <button onClick={() => setSuggestFor(r._id)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                    ✨ Suggested providers
                  </button>
                )}
                {r.status === 'open' && (
                  <button
                    onClick={async () => { await cancelRequest(r._id, 'No longer needed'); toast.success('Request cancelled') }}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
                {r.status === 'open' && (
                  <button
                    onClick={async () => { if (confirm('Delete this request?')) { await deleteRequest(r._id); toast.success('Request deleted') } }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create request modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New service request" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">What do you need done?</label>
            <textarea
              className="input-field"
              rows={3}
              placeholder="e.g. My kitchen tap is leaking and needs a new washer"
              value={form.description}
              onChange={(e) => { setForm({ ...form, description: e.target.value }); setPreview(null) }}
            />
            <button type="button" onClick={handleClassifyPreview} disabled={classifying} className="mt-2 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">
              {classifying ? 'Classifying with AI…' : '✨ Suggest category with AI'}
            </button>
            {preview && (
              <div className="mt-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-800">
                Suggested category: <strong>{preview.categoryName}</strong>
                {preview.requiredSkills?.length > 0 && <> · Skills: {preview.requiredSkills.join(', ')}</>}
                {typeof preview.confidence === 'number' && <> · Confidence: {Math.round(preview.confidence * 100)}%</>}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Service area / locality</label>
              <input className="input-field" placeholder="e.g. Kukatpally, Hyderabad" value={form.serviceArea} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Exact address <span className="font-normal text-slate-400">(only shared once you book)</span></label>
              <input className="input-field" placeholder="Flat / house no., street" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Preferred date <span className="font-normal text-slate-400">(optional)</span></label>
              <input type="date" className="input-field" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Urgency</label>
              <select className="input-field" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                {URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Budget <span className="font-normal text-slate-400">(optional, ₹)</span></label>
              <input type="number" min="0" className="input-field" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
          </div>
          {categories.length > 0 && (
            <p className="text-xs text-slate-400">Available categories: {categories.map((c) => c.name).join(', ')}</p>
          )}
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating…' : 'Submit request'}</button>
        </form>
      </Modal>

      {/* Quotes for a selected request */}
      <QuotesModal requestId={selectedRequestId} onClose={() => setSelectedRequestId(null)} />
      {/* AI-suggested providers for a request, with one-tap invite */}
      <SuggestedProvidersModal requestId={suggestFor} onClose={() => setSuggestFor(null)} />
    </div>
  )
}

function QuotesModal({ requestId, onClose }) {
  const { quotesForActiveRequest, fetchQuotesForRequest } = useServiceStore()
  const { createBooking } = useBookingStore()
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState({ quoteId: null, scheduledDate: '', startTime: '', endTime: '' })

  useEffect(() => {
    if (!requestId) return
    setLoading(true)
    fetchQuotesForRequest(requestId).finally(() => setLoading(false))
  }, [requestId, fetchQuotesForRequest])

  if (!requestId) return null

  const handleBook = async (e) => {
    e.preventDefault()
    if (!booking.scheduledDate || !booking.startTime || !booking.endTime) return toast.error('Pick a date and time window')
    try {
      await createBooking(booking)
      toast.success('Booking confirmed!')
      onClose()
    } catch { /* handled */ }
  }

  return (
    <Modal open={!!requestId} onClose={onClose} title="Quotes for this request" wide>
      {loading ? (
        <Spinner />
      ) : quotesForActiveRequest.length === 0 ? (
        <EmptyState title="No quotes yet" description="Providers will submit quotes shortly — check back soon, or try Suggested Providers to invite someone directly." />
      ) : (
        <div className="space-y-3">
          {quotesForActiveRequest.map((q) => (
            <div key={q._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{q.provider?.user?.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <StarRating value={q.provider?.rating} />
                    <span>{(q.provider?.rating || 0).toFixed(1)} ({q.provider?.ratingCount || 0} reviews)</span>
                  </div>
                  {q.notes && <p className="mt-2 text-sm text-slate-600">{q.notes}</p>}
                  {q.estimatedDuration && <p className="mt-1 text-xs text-slate-400">Est. duration: {q.estimatedDuration}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900"><Money value={q.price} /></p>
                  <StatusBadge status={q.status} />
                </div>
              </div>
              {q.status === 'pending' && (
                booking.quoteId === q._id ? (
                  <form onSubmit={handleBook} className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                    <input type="date" required className="input-field" value={booking.scheduledDate} onChange={(e) => setBooking({ ...booking, scheduledDate: e.target.value })} />
                    <input type="time" required className="input-field" value={booking.startTime} onChange={(e) => setBooking({ ...booking, startTime: e.target.value })} />
                    <input type="time" required className="input-field" value={booking.endTime} onChange={(e) => setBooking({ ...booking, endTime: e.target.value })} />
                    <button type="submit" className="btn-primary col-span-3 mt-1">Confirm booking</button>
                  </form>
                ) : (
                  <button
                    onClick={() => setBooking({ quoteId: q._id, scheduledDate: '', startTime: '', endTime: '' })}
                    className="mt-3 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Accept & schedule
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function SuggestedProvidersModal({ requestId, onClose }) {
  const { suggestedProviders, fetchSuggestedProviders, inviteProvider } = useServiceStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!requestId) return
    setLoading(true)
    fetchSuggestedProviders(requestId).finally(() => setLoading(false))
  }, [requestId, fetchSuggestedProviders])

  if (!requestId) return null

  const handleInvite = async (providerId) => {
    try { await inviteProvider(requestId, providerId); toast.success('Provider invited to quote') } catch { /* handled */ }
  }

  return (
    <Modal open={!!requestId} onClose={onClose} title="AI-suggested providers" wide>
      <p className="mb-4 text-xs text-slate-500">Ranked by skill match, rating, availability on your preferred date, and experience.</p>
      {loading ? (
        <Spinner />
      ) : suggestedProviders.length === 0 ? (
        <EmptyState title="No matching providers yet" description="Try widening your service area, or check back later." />
      ) : (
        <div className="space-y-3">
          {suggestedProviders.map((s) => (
            <div key={s.providerId} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div>
                <p className="font-semibold text-slate-900">{s.name}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <StarRating value={s.rating} /><span>{(s.rating || 0).toFixed(1)}</span>
                  {s.availability?.status && <Badge tone={s.availability.status === 'free' ? 'green' : 'amber'}>{s.availability.status}</Badge>}
                </div>
                {s.reasons?.length > 0 && <p className="mt-1 text-xs text-slate-500">{s.reasons.join(' · ')}</p>}
              </div>
              <button onClick={() => handleInvite(s.providerId)} className="shrink-0 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                Invite to quote
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ---------------------------- Bookings tab ---------------------------- */

function BookingsTab() {
  const { bookings, fetchBookings, isLoading } = useBookingStore()
  const [selected, setSelected] = useState(null)

  useEffect(() => { fetchBookings() }, [fetchBookings])

  if (isLoading) return <Spinner />
  if (bookings.length === 0) {
    return <EmptyState title="No bookings yet" description="Once you accept a quote, your bookings will show up here." />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {bookings.map((b) => (
        <button key={b._id} onClick={() => setSelected(b._id)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-brand-400">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-slate-900">{b.serviceRequest?.category?.name || 'Service'}</p>
            <StatusBadge status={b.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">Provider: {b.provider?.user?.name}</p>
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
  const { invoices, fetchInvoices, payInvoice, isLoading } = useInvoiceStore()
  const [payMethod, setPayMethod] = useState('upi')

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  if (isLoading) return <Spinner />
  if (invoices.length === 0) return <EmptyState title="No invoices yet" description="Invoices appear here once a provider marks a job finished." />

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div key={inv._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="font-semibold text-slate-900">{inv.number}</p>
            <p className="text-xs text-slate-500">{inv.booking?.serviceRequest?.category?.name} · {new Date(inv.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-lg font-bold text-slate-900"><Money value={inv.total} /></p>
            <StatusBadge status={inv.status} />
            {inv.status === 'issued' && (
              <>
                <select className="input-field !w-auto !py-1.5" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Netbanking</option>
                </select>
                <button
                  onClick={async () => { await payInvoice(inv._id, payMethod); toast.success('Payment recorded'); fetchInvoices() }}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Pay now
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------- Support tab ---------------------------- */

function SupportTab() {
  const { cases, fetchCases, isLoading } = useSupportStore()
  const [openCaseId, setOpenCaseId] = useState(null)

  useEffect(() => { fetchCases() }, [fetchCases])

  if (isLoading) return <Spinner />
  if (cases.length === 0) return <EmptyState title="No support cases" description="If something goes wrong with a booking, you can raise a case from its details." />

  return (
    <div className="space-y-2">
      {cases.map((c) => (
        <button key={c._id} onClick={() => setOpenCaseId(c._id)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand-400">
          <div>
            <div className="flex items-center gap-2"><Badge>{c.type}</Badge><p className="font-medium text-slate-800">{c.subject}</p></div>
            <p className="mt-1 text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</p>
          </div>
          <StatusBadge status={c.status} />
        </button>
      ))}
      <SupportCaseThread caseId={openCaseId} open={!!openCaseId} onClose={() => setOpenCaseId(null)} showStaffControls={false} />
    </div>
  )
}
