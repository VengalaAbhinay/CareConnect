import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore.js'
import { useBookingStore } from '../../store/bookingStore.js'
import { Modal, StatusBadge, Spinner } from './UI.jsx'

const NEXT_STATUS = {
  scheduled: 'inProgress',
  inProgress: 'completed',
}
const NEXT_STATUS_LABEL = {
  inProgress: 'Start job',
  completed: 'Mark job completed',
}

export default function BookingDetail({ bookingId, open, onClose }) {
  const user = useAuthStore((s) => s.user)
  const { activeBooking, fetchBooking, updateStatus, confirmCompletion, cancelBooking, submitReview, raiseDispute } = useBookingStore()
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)

  useEffect(() => {
    if (!open || !bookingId) return
    setLoading(true)
    fetchBooking(bookingId).finally(() => setLoading(false))
    setShowReviewForm(false)
    setShowDisputeForm(false)
    setNote('')
    setEvidenceUrl('')
  }, [open, bookingId, fetchBooking])

  if (!open) return null

  const b = activeBooking
  const isProvider = user?.role === 'provider'
  const isCustomer = user?.role === 'customer'
  const isStaff = ['admin', 'operationsManager'].includes(user?.role)

  const handleAdvanceStatus = async () => {
    if (!b) return
    const next = NEXT_STATUS[b.status]
    if (!next) return
    try {
      await updateStatus(b._id, {
        status: next,
        note: note || `Status changed to ${next}`,
        attachments: evidenceUrl ? [evidenceUrl] : [],
        ...(next === 'inProgress' && evidenceUrl ? { beforeEvidence: [evidenceUrl] } : {}),
        ...(next === 'completed' && evidenceUrl ? { afterEvidence: [evidenceUrl] } : {}),
      })
      toast.success('Job status updated')
      setNote('')
      setEvidenceUrl('')
    } catch { /* handled by interceptor */ }
  }

  const handleConfirm = async () => {
    try {
      await confirmCompletion(b._id)
      toast.success('Completion confirmed')
    } catch { /* handled */ }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel this booking?')) return
    try {
      await cancelBooking(b._id, 'Cancelled by user')
      toast.success('Booking cancelled')
    } catch { /* handled */ }
  }

  const handleReview = async (e) => {
    e.preventDefault()
    try {
      await submitReview(b._id, { rating, comment })
      toast.success('Review submitted')
      setShowReviewForm(false)
      fetchBooking(b._id)
    } catch { /* handled */ }
  }

  const handleDispute = async (e) => {
    e.preventDefault()
    if (!disputeReason.trim()) return toast.error('Please describe the issue')
    try {
      await raiseDispute(b._id, disputeReason)
      toast.success('Dispute raised — support will review it')
      setShowDisputeForm(false)
      setDisputeReason('')
      fetchBooking(b._id)
    } catch { /* handled */ }
  }

  return (
    <Modal open={open} onClose={onClose} title="Booking details" wide>
      {loading || !b ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {b.serviceRequest?.category?.name || 'Service'} · {b.serviceRequest?.serviceArea}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(b.scheduledDate).toLocaleDateString()} · {b.startTime}–{b.endTime}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Customer: {b.customer?.name} &nbsp;·&nbsp; Provider: {b.provider?.user?.name}
              </p>
            </div>
            <div className="text-right">
              <StatusBadge status={b.status} />
              <p className="mt-1 text-lg font-bold text-slate-900">₹{b.price}</p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Job timeline</h4>
            <ul className="space-y-2 border-l-2 border-slate-200 pl-4">
              {b.jobTimeline?.map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                  <p className="text-sm font-medium text-slate-800">{ev.status}</p>
                  {ev.note && <p className="text-xs text-slate-500">{ev.note}</p>}
                  {ev.attachments?.length > 0 && (
                    <p className="text-xs text-brand-700">
                      {ev.attachments.map((a, j) => (
                        <a key={j} href={a} target="_blank" rel="noreferrer" className="mr-2 underline">Evidence {j + 1}</a>
                      ))}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">{new Date(ev.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Evidence gallery */}
          {(b.beforeEvidence?.length > 0 || b.afterEvidence?.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Before</h4>
                {b.beforeEvidence?.length ? b.beforeEvidence.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 underline">{u}</a>
                )) : <p className="text-xs text-slate-400">None yet</p>}
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">After</h4>
                {b.afterEvidence?.length ? b.afterEvidence.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand-700 underline">{u}</a>
                )) : <p className="text-xs text-slate-400">None yet</p>}
              </div>
            </div>
          )}

          {/* Provider actions: advance status */}
          {isProvider && NEXT_STATUS[b.status] && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Update job</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input-field" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <input className="input-field" placeholder="Evidence URL (optional)" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
              </div>
              <button onClick={handleAdvanceStatus} className="btn-primary mt-3 w-auto px-5">
                {NEXT_STATUS_LABEL[NEXT_STATUS[b.status]]}
              </button>
            </div>
          )}

          {/* Customer: confirm completion */}
          {isCustomer && b.status === 'completed' && !b.customerConfirmed && (
            <button onClick={handleConfirm} className="btn-primary w-auto px-5">Confirm job completion</button>
          )}

          {/* Customer: review */}
          {isCustomer && b.status === 'completed' && b.customerConfirmed && (
            <div className="rounded-xl border border-slate-200 p-4">
              {!showReviewForm ? (
                <button onClick={() => setShowReviewForm(true)} className="text-sm font-semibold text-brand-700 hover:underline">
                  Leave a review
                </button>
              ) : (
                <form onSubmit={handleReview} className="space-y-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} star`}>
                        <svg viewBox="0 0 20 20" className={`h-6 w-6 ${n <= rating ? 'fill-amber-400' : 'fill-slate-200'}`}>
                          <path d="M10 1.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L10 14.7l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <textarea className="input-field" rows={2} placeholder="How did it go?" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button type="submit" className="btn-primary w-auto px-5">Submit review</button>
                </form>
              )}
            </div>
          )}

          {/* Cancel + dispute */}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {['scheduled', 'inProgress'].includes(b.status) && (isCustomer || isProvider || isStaff) && (
              <button onClick={handleCancel} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                Cancel booking
              </button>
            )}
            {b.status !== 'disputed' && !showDisputeForm && (isCustomer || isProvider) && (
              <button onClick={() => setShowDisputeForm(true)} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                Raise a dispute
              </button>
            )}
          </div>

          {showDisputeForm && (
            <form onSubmit={handleDispute} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <textarea
                className="input-field"
                rows={2}
                placeholder="Describe the issue with this booking…"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                Submit dispute
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  )
}
