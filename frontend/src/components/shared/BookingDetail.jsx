import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore.js'
import { useBookingStore } from '../../store/bookingStore.js'
import { useInvoiceStore } from '../../store/invoiceStore.js'
import { useSupportStore } from '../../store/supportStore.js'
import { useProviderStore } from '../../store/providerStore.js'
import { Modal, StatusBadge, Spinner, StarRating, Money, FileUpload, Badge, fileUrl } from './UI.jsx'
import SupportCaseThread from './SupportCaseThread.jsx'

const NEXT_STATUS = { scheduled: 'inProgress', inProgress: 'awaitingConfirmation' }
const NEXT_STATUS_LABEL = { inProgress: 'Start job', awaitingConfirmation: 'Mark work finished' }
const EDIT_WINDOW_MS = 14 * 86400000

export default function BookingDetail({ bookingId, open, onClose }) {
  const user = useAuthStore((s) => s.user)
  const {
    activeBooking, activeBookingInvoice, activeBookingReview, activeBookingCases,
    fetchBooking, updateStatus, confirmCompletion, rejectCompletion, cancelBooking,
    rescheduleBooking, reassignBooking, submitReview, editReview, replyToReview,
  } = useBookingStore()
  const { createInvoice, saveInvoice, issueInvoice, payInvoice } = useInvoiceStore()
  const { raiseCase } = useSupportStore()
  const { providers, fetchProviders } = useProviderStore()

  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState([])
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [editingReview, setEditingReview] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [reschedForm, setReschedForm] = useState({ scheduledDate: '', startTime: '', endTime: '' })
  const [showReassign, setShowReassign] = useState(false)
  const [reassignForm, setReassignForm] = useState({ providerId: '', reason: '' })
  const [extraItem, setExtraItem] = useState({ description: '', quantity: 1, unitPrice: '' })
  const [payMethod, setPayMethod] = useState('upi')
  const [showCaseForm, setShowCaseForm] = useState(false)
  const [caseForm, setCaseForm] = useState({ type: 'dispute', subject: '', reason: '' })
  const [openCaseId, setOpenCaseId] = useState(null)

  useEffect(() => {
    if (!open || !bookingId) return
    setLoading(true)
    fetchBooking(bookingId).finally(() => setLoading(false))
    setShowReviewForm(false); setEditingReview(false); setNote(''); setEvidence([])
    setShowCancelForm(false); setCancelReason(''); setShowRejectForm(false); setRejectReason('')
    setShowReschedule(false); setShowReassign(false); setShowCaseForm(false)
  }, [open, bookingId, fetchBooking])

  if (!open) return null
  const b = activeBooking
  const isProvider = user?.role === 'provider'
  const isCustomer = user?.role === 'customer'
  const isStaff = ['admin', 'operationsManager', 'supportAgent'].includes(user?.role)
  const isManager = ['admin', 'operationsManager'].includes(user?.role)

  const handleAdvanceStatus = async () => {
    if (!b) return
    const next = NEXT_STATUS[b.status]
    if (!next) return
    if (next === 'awaitingConfirmation' && !note.trim()) return toast.error('Add a note explaining what was done')
    try {
      await updateStatus(b._id, {
        status: next,
        note: note || `Status changed to ${next}`,
        beforeEvidence: next === 'inProgress' ? evidence.map((f) => f.url) : [],
        afterEvidence: next === 'awaitingConfirmation' ? evidence.map((f) => f.url) : [],
      })
      toast.success('Job status updated')
      setNote(''); setEvidence([])
    } catch { /* handled */ }
  }

  const handleForceComplete = async () => {
    if (!note.trim()) return toast.error('Add a note explaining why the job is being closed')
    try {
      await updateStatus(b._id, { status: 'completed', note })
      toast.success('Job closed')
      setNote('')
    } catch { /* handled */ }
  }

  const handleConfirm = async () => {
    try { await confirmCompletion(b._id); toast.success('Completion confirmed') } catch { /* handled */ }
  }
  const handleReject = async (e) => {
    e.preventDefault()
    if (rejectReason.trim().length < 5) return toast.error('Tell the provider what still needs fixing')
    try {
      await rejectCompletion(b._id, rejectReason)
      toast.success('Sent back to the provider')
      setShowRejectForm(false); setRejectReason('')
    } catch { /* handled */ }
  }

  const handleCancel = async (e) => {
    e.preventDefault()
    if (cancelReason.trim().length < 3) return toast.error('Give a reason for the cancellation')
    try {
      await cancelBooking(b._id, cancelReason)
      toast.success('Booking cancelled')
      setShowCancelForm(false); setCancelReason('')
    } catch { /* handled */ }
  }

  const handleReschedule = async (e) => {
    e.preventDefault()
    if (!reschedForm.scheduledDate || !reschedForm.startTime || !reschedForm.endTime) return toast.error('Pick a date and time window')
    try {
      await rescheduleBooking(b._id, reschedForm)
      toast.success('Booking rescheduled')
      setShowReschedule(false)
    } catch { /* handled */ }
  }

  const openReassign = () => {
    fetchProviders({ verificationStatus: 'verified' })
    setReassignForm({ providerId: '', reason: '' })
    setShowReassign(true)
  }
  const handleReassign = async (e) => {
    e.preventDefault()
    if (!reassignForm.providerId) return toast.error('Choose a provider')
    if (reassignForm.reason.trim().length < 3) return toast.error('Record a reason')
    try {
      await reassignBooking(b._id, reassignForm)
      toast.success('Provider reassigned')
      setShowReassign(false)
    } catch { /* handled */ }
  }

  const handleReview = async (e) => {
    e.preventDefault()
    try {
      await submitReview(b._id, { rating, comment })
      toast.success('Review submitted')
      setShowReviewForm(false)
    } catch { /* handled */ }
  }
  const handleEditReview = async (e) => {
    e.preventDefault()
    try {
      await editReview(b._id, { rating, comment })
      toast.success('Review updated')
      setEditingReview(false)
    } catch { /* handled */ }
  }
  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    try {
      await replyToReview(b._id, replyText)
      toast.success('Reply posted')
      setReplyText('')
    } catch { /* handled */ }
  }

  const handleCreateInvoice = async () => {
    try { await createInvoice(b._id); toast.success('Invoice drafted'); fetchBooking(b._id) } catch { /* handled */ }
  }
  const handleAddLineItem = async () => {
    if (!extraItem.description.trim() || !extraItem.unitPrice) return toast.error('Fill in the extra charge')
    const lineItems = [
      { description: activeBookingInvoice.lineItems[0]?.description, unitPrice: activeBookingInvoice.lineItems[0]?.unitPrice, quantity: 1 },
      ...activeBookingInvoice.lineItems.slice(1),
      { description: extraItem.description, unitPrice: Number(extraItem.unitPrice), quantity: Number(extraItem.quantity) || 1 },
    ]
    try {
      await saveInvoice(activeBookingInvoice._id, { lineItems })
      toast.success('Line item added')
      setExtraItem({ description: '', quantity: 1, unitPrice: '' })
      fetchBooking(b._id)
    } catch { /* handled */ }
  }
  const handleIssueInvoice = async () => {
    try { await issueInvoice(activeBookingInvoice._id); toast.success('Invoice sent to customer'); fetchBooking(b._id) } catch { /* handled */ }
  }
  const handlePay = async () => {
    try { await payInvoice(activeBookingInvoice._id, payMethod); toast.success('Payment recorded'); fetchBooking(b._id) } catch { /* handled */ }
  }

  const handleRaiseCase = async (e) => {
    e.preventDefault()
    if (caseForm.reason.trim().length < 10) return toast.error('Describe the issue in at least 10 characters')
    try {
      await raiseCase({ ...caseForm, bookingId: b._id })
      toast.success('Case submitted — support will respond shortly')
      setShowCaseForm(false)
      setCaseForm({ type: 'dispute', subject: '', reason: '' })
      fetchBooking(b._id)
    } catch { /* handled */ }
  }

  const canCancel = b && (
    (isCustomer && b.status === 'scheduled') ||
    (isProvider && ['scheduled', 'inProgress'].includes(b.status)) ||
    (isStaff && ['scheduled', 'inProgress', 'awaitingConfirmation', 'disputed'].includes(b.status))
  )
  const reviewEditable = activeBookingReview && isCustomer && (Date.now() - new Date(activeBookingReview.createdAt).getTime()) < EDIT_WINDOW_MS
  const hasActiveCase = (activeBookingCases || []).some((c) => ['open', 'investigating', 'escalated'].includes(c.status))

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
                {b.rescheduleCount > 0 && <> · rescheduled {b.rescheduleCount}×</>}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Customer: {b.customer?.name} &nbsp;·&nbsp; Provider: {b.provider?.user?.name}
              </p>
            </div>
            <div className="text-right">
              <StatusBadge status={b.status} />
              <p className="mt-1 text-lg font-bold text-slate-900"><Money value={b.price} /></p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Job timeline</h4>
            <ul className="space-y-2 border-l-2 border-slate-200 pl-4">
              {b.jobTimeline?.map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                  <p className="text-sm font-medium text-slate-800">{ev.status} <span className="font-normal text-slate-400">by {ev.byName}</span></p>
                  {ev.note && <p className="text-xs text-slate-500">{ev.note}</p>}
                  {ev.attachments?.length > 0 && (
                    <p className="text-xs text-brand-700">
                      {ev.attachments.map((a, j) => (
                        <a key={j} href={fileUrl(a)} target="_blank" rel="noreferrer" className="mr-2 underline">Evidence {j + 1}</a>
                      ))}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">{new Date(ev.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Provider: advance status */}
          {isProvider && NEXT_STATUS[b.status] && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Update job</h4>
              <textarea className="input-field mb-3" rows={2} placeholder="Note (e.g. what was fixed)" value={note} onChange={(e) => setNote(e.target.value)} />
              <FileUpload files={evidence} onUploaded={(f) => setEvidence((prev) => [...prev, ...f])} onRemove={(i) => setEvidence((prev) => prev.filter((_, idx) => idx !== i))} label="Attach photos" />
              <button onClick={handleAdvanceStatus} className="btn-primary mt-3 w-auto px-5">
                {NEXT_STATUS_LABEL[NEXT_STATUS[b.status]]}
              </button>
            </div>
          )}

          {/* Staff: force-complete a stuck job */}
          {isManager && b.status === 'awaitingConfirmation' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-amber-900">Close this job on the customer's behalf</h4>
              <textarea className="input-field mb-3" rows={2} placeholder="Why is operations closing this job?" value={note} onChange={(e) => setNote(e.target.value)} />
              <button onClick={handleForceComplete} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Force complete</button>
            </div>
          )}

          {/* Customer: confirm / reject completion */}
          {isCustomer && b.status === 'awaitingConfirmation' && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
              <button onClick={handleConfirm} className="btn-primary w-auto px-5">Confirm job completion</button>
              <button onClick={() => setShowRejectForm((v) => !v)} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                Not done yet
              </button>
              {showRejectForm && (
                <form onSubmit={handleReject} className="mt-2 w-full space-y-2">
                  <textarea className="input-field" rows={2} placeholder="What still needs to be fixed?" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Send back to provider</button>
                </form>
              )}
            </div>
          )}

          {/* Review */}
          {isCustomer && b.status === 'completed' && !activeBookingReview && (
            <div className="rounded-xl border border-slate-200 p-4">
              {!showReviewForm ? (
                <button onClick={() => setShowReviewForm(true)} className="text-sm font-semibold text-brand-700 hover:underline">Leave a review</button>
              ) : (
                <form onSubmit={handleReview} className="space-y-3">
                  <StarPicker rating={rating} setRating={setRating} />
                  <textarea className="input-field" rows={2} placeholder="How did it go?" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button type="submit" className="btn-primary w-auto px-5">Submit review</button>
                </form>
              )}
            </div>
          )}
          {activeBookingReview && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StarRating value={activeBookingReview.rating} size="md" />
                  <p className="mt-1 text-sm text-slate-700">{activeBookingReview.comment}</p>
                </div>
                {reviewEditable && !editingReview && (
                  <button onClick={() => { setEditingReview(true); setRating(activeBookingReview.rating); setComment(activeBookingReview.comment) }} className="text-xs font-semibold text-brand-700 hover:underline">
                    Edit
                  </button>
                )}
              </div>
              {editingReview && (
                <form onSubmit={handleEditReview} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <StarPicker rating={rating} setRating={setRating} />
                  <textarea className="input-field" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button type="submit" className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Save changes</button>
                </form>
              )}
              {activeBookingReview.providerReply?.text ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="text-xs font-semibold text-slate-500">Provider reply</p>
                  {activeBookingReview.providerReply.text}
                </div>
              ) : isProvider && (
                <form onSubmit={handleReply} className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <input className="input-field" placeholder="Reply to this review…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                  <button type="submit" className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Reply</button>
                </form>
              )}
            </div>
          )}

          {/* Invoice */}
          {(activeBookingInvoice || ['inProgress', 'awaitingConfirmation', 'completed'].includes(b.status)) && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Invoice</h4>
                {activeBookingInvoice && <StatusBadge status={activeBookingInvoice.status} />}
              </div>
              {!activeBookingInvoice ? (
                (isProvider || isManager) && ['inProgress', 'awaitingConfirmation', 'completed'].includes(b.status) && (
                  <button onClick={handleCreateInvoice} className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">Draft invoice</button>
                )
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">{activeBookingInvoice.number}</p>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {activeBookingInvoice.lineItems.map((li, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-1.5 text-slate-700">{li.description} {li.quantity > 1 && <span className="text-slate-400">×{li.quantity}</span>}</td>
                          <td className="py-1.5 text-right text-slate-700"><Money value={li.amount} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td className="pt-2 text-slate-500">Subtotal</td><td className="pt-2 text-right text-slate-500"><Money value={activeBookingInvoice.subtotal} /></td></tr>
                      <tr><td className="text-slate-500">Tax ({activeBookingInvoice.taxPercent}%)</td><td className="text-right text-slate-500"><Money value={activeBookingInvoice.tax} /></td></tr>
                      <tr><td className="pt-1 font-semibold text-slate-900">Total</td><td className="pt-1 text-right font-semibold text-slate-900"><Money value={activeBookingInvoice.total} /></td></tr>
                    </tfoot>
                  </table>

                  {activeBookingInvoice.status === 'draft' && (isProvider || isManager) && (
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <div className="grid grid-cols-4 gap-2">
                        <input className="input-field col-span-2" placeholder="Extra charge" value={extraItem.description} onChange={(e) => setExtraItem({ ...extraItem, description: e.target.value })} />
                        <input type="number" min="1" className="input-field" placeholder="Qty" value={extraItem.quantity} onChange={(e) => setExtraItem({ ...extraItem, quantity: e.target.value })} />
                        <input type="number" min="0" className="input-field" placeholder="₹ price" value={extraItem.unitPrice} onChange={(e) => setExtraItem({ ...extraItem, unitPrice: e.target.value })} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddLineItem} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">+ Add charge</button>
                        {['awaitingConfirmation', 'completed'].includes(b.status) && (
                          <button onClick={handleIssueInvoice} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Send to customer</button>
                        )}
                      </div>
                    </div>
                  )}

                  {activeBookingInvoice.status === 'issued' && b.status === 'completed' && (isCustomer || isProvider) && (
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      {isCustomer && (
                        <select className="input-field !w-auto" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="netbanking">Netbanking</option>
                        </select>
                      )}
                      <button onClick={handlePay} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                        {isProvider ? 'Mark paid (cash)' : 'Pay now'}
                      </button>
                    </div>
                  )}
                  {activeBookingInvoice.status === 'paid' && (
                    <p className="text-xs text-emerald-700">Paid via {activeBookingInvoice.paymentMethod} on {new Date(activeBookingInvoice.paidAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Support cases */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">Support cases</h4>
              {!hasActiveCase && b.status !== 'cancelled' && (isCustomer || isProvider) && (
                <button onClick={() => setShowCaseForm((v) => !v)} className="text-xs font-semibold text-brand-700 hover:underline">Raise a case</button>
              )}
            </div>
            {(activeBookingCases || []).length === 0 ? (
              <p className="text-sm text-slate-400">No support cases on this booking.</p>
            ) : (
              <div className="space-y-2">
                {activeBookingCases.map((c) => (
                  <button key={c._id} onClick={() => setOpenCaseId(c._id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400">
                    <div>
                      <div className="flex items-center gap-2"><Badge>{c.type}</Badge><p className="text-sm font-medium text-slate-800">{c.subject}</p></div>
                      <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </button>
                ))}
              </div>
            )}
            {showCaseForm && (
              <form onSubmit={handleRaiseCase} className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <select className="input-field" value={caseForm.type} onChange={(e) => setCaseForm({ ...caseForm, type: e.target.value })}>
                    <option value="dispute">Dispute</option>
                    <option value="complaint">Complaint</option>
                    {isCustomer && <option value="refund">Refund request</option>}
                  </select>
                  <input className="input-field sm:col-span-2" placeholder="Subject" value={caseForm.subject} onChange={(e) => setCaseForm({ ...caseForm, subject: e.target.value })} />
                </div>
                <textarea className="input-field" rows={2} placeholder="Describe the issue…" value={caseForm.reason} onChange={(e) => setCaseForm({ ...caseForm, reason: e.target.value })} />
                <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Submit case</button>
              </form>
            )}
          </div>

          {/* Reschedule / reassign / cancel */}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {b.status === 'scheduled' && (isCustomer || isManager) && (
              <button onClick={() => setShowReschedule((v) => !v)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Reschedule
              </button>
            )}
            {b.status === 'scheduled' && isManager && (
              <button onClick={openReassign} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Reassign provider
              </button>
            )}
            {canCancel && (
              <button onClick={() => setShowCancelForm((v) => !v)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                Cancel booking
              </button>
            )}
          </div>

          {showCancelForm && (
            <form onSubmit={handleCancel} className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
              <textarea className="input-field" rows={2} placeholder="Reason for cancelling…" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Confirm cancellation</button>
            </form>
          )}

          {showReschedule && (
            <form onSubmit={handleReschedule} className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-4">
              <input type="date" required className="input-field" value={reschedForm.scheduledDate} onChange={(e) => setReschedForm({ ...reschedForm, scheduledDate: e.target.value })} />
              <input type="time" required className="input-field" value={reschedForm.startTime} onChange={(e) => setReschedForm({ ...reschedForm, startTime: e.target.value })} />
              <input type="time" required className="input-field" value={reschedForm.endTime} onChange={(e) => setReschedForm({ ...reschedForm, endTime: e.target.value })} />
              <button type="submit" className="btn-primary col-span-3 mt-1">Move booking</button>
            </form>
          )}

          {showReassign && (
            <form onSubmit={handleReassign} className="space-y-2 rounded-xl border border-slate-200 p-4">
              <select className="input-field" value={reassignForm.providerId} onChange={(e) => setReassignForm({ ...reassignForm, providerId: e.target.value })}>
                <option value="">Choose a verified provider…</option>
                {providers.filter((p) => p._id !== b.provider?._id).map((p) => (
                  <option key={p._id} value={p._id}>{p.user?.name}</option>
                ))}
              </select>
              <textarea className="input-field" rows={2} placeholder="Reason for reassigning…" value={reassignForm.reason} onChange={(e) => setReassignForm({ ...reassignForm, reason: e.target.value })} />
              <button type="submit" className="btn-primary w-auto px-5">Confirm reassignment</button>
            </form>
          )}
        </div>
      )}
      <SupportCaseThread caseId={openCaseId} open={!!openCaseId} onClose={() => { setOpenCaseId(null); if (b) fetchBooking(b._id) }} showStaffControls={isStaff} />
    </Modal>
  )
}

function StarPicker({ rating, setRating }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} star`}>
          <svg viewBox="0 0 20 20" className={`h-6 w-6 ${n <= rating ? 'fill-amber-400' : 'fill-slate-200'}`}>
            <path d="M10 1.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L10 14.7l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
          </svg>
        </button>
      ))}
    </div>
  )
}
