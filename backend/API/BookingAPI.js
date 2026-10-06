import exp from 'express'
import mongoose from 'mongoose'
import { BookingModel } from '../Models/BookingModel.js'
import { QuoteModel } from '../Models/QuoteModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { ReviewModel } from '../Models/ReviewModel.js'
import { DisputeModel } from '../Models/DisputeModel.js'
import { InvoiceModel } from '../Models/InvoiceModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'
import { claimWindow, releaseSlots, reserveSlots } from '../services/availabilityService.js'
import { ensureInvoiceForBooking } from '../services/invoiceService.js'
import { recomputeProviderRating } from '../services/ratingService.js'
import { STAFF_ROLES, MANAGER_ROLES, PARTY_USER, escapeRegex, toDateKey, dateFromKey, sameId, cleanList } from '../utils/helpers.js'

export const bookingApp = exp.Router()

const OPEN_REQUEST_STATUSES = ['open', 'quoted']
const isStaff = (u) => STAFF_ROLES.includes(u.role)

const populateBooking = (query) => query
  .populate('customer', PARTY_USER)
  .populate({ path: 'provider', populate: { path: 'user', select: PARTY_USER } })
  .populate({ path: 'serviceRequest', populate: { path: 'category' } })

const short = (b) => `#${String(b._id).slice(-6).toUpperCase()}`

// timeline entry authored by the current user
const event = (user, { status, note, attachments = [], kind = 'status' }) => ({
  status, kind, note, attachments, by: user._id, byName: user.name, byRole: user.role, createdAt: new Date(),
})

// Is req.user a party to this booking (its customer / its assigned provider) or platform staff?
async function canAccessBooking(booking, user) {
  if (isStaff(user)) return true
  if (user.role === 'customer') return sameId(booking.customer, user._id)
  if (user.role === 'provider') {
    const profile = await ProviderProfileModel.findOne({ user: user._id })
    return !!profile && sameId(booking.provider, profile._id)
  }
  return false
}

const providerUserOf = async (booking) => (await ProviderProfileModel.findById(booking.provider))?.user

/* ----------------------------- create a booking ----------------------------- */

// customer accepts a quote -> schedules a booking (runs the availability engine)
bookingApp.post('/', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  const bookingId = new mongoose.Types.ObjectId()
  let claimed = false
  let providerId = null
  try {
    const { quoteId, scheduledDate, startTime, endTime } = req.body
    if (!mongoose.isValidObjectId(quoteId)) return res.status(400).json({ message: 'Choose a quote to accept' })
    const quote = await QuoteModel.findById(quoteId)
    if (!quote) return res.status(404).json({ message: 'Quote not found' })
    if (quote.status !== 'pending') return res.status(409).json({ message: 'This quote is no longer available' })

    // ownership: only the customer who owns the request may accept its quotes
    const request = await ServiceRequestModel.findById(quote.serviceRequest)
    if (!request || !sameId(request.customer, req.user._id)) {
      return res.status(403).json({ message: 'You can only book quotes on your own requests' })
    }
    if (!OPEN_REQUEST_STATUSES.includes(request.status)) return res.status(409).json({ message: 'This request is no longer open for booking' })

    const provider = await ProviderProfileModel.findById(quote.provider)
    if (!provider || provider.verificationStatus !== 'verified') return res.status(409).json({ message: 'This provider is not available for booking' })

    const dateKey = toDateKey(scheduledDate)
    const claim = await claimWindow(provider, dateKey, startTime, endTime, bookingId)
    if (!claim.ok) return res.status(claim.status).json({ message: claim.message })
    claimed = true; providerId = provider._id

    const booking = await BookingModel.create({
      _id: bookingId,
      serviceRequest: quote.serviceRequest, quote: quote._id, customer: req.user._id, provider: provider._id,
      scheduledDate: dateFromKey(dateKey), dateKey, startTime, endTime, price: quote.price,
      jobTimeline: [event(req.user, { status: 'scheduled', note: 'Booking confirmed', kind: 'system' })],
    })

    quote.status = 'accepted'
    await quote.save()
    // reject the other pending quotes on this request and tell those providers
    const losers = await QuoteModel.find({ serviceRequest: quote.serviceRequest, _id: { $ne: quote._id }, status: 'pending' }).populate('provider', 'user')
    await QuoteModel.updateMany({ _id: { $in: losers.map((q) => q._id) } }, { status: 'rejected' })
    await ServiceRequestModel.findByIdAndUpdate(quote.serviceRequest, { status: 'booked' })

    await notify(provider.user, {
      type: 'BOOKING_CREATED', title: 'New booking confirmed',
      message: `${req.user.name} booked you for ${dateKey}, ${startTime}–${endTime}`, link: `/bookings/${booking._id}`,
    })
    await Promise.all(losers.map((q) => notify(q.provider?.user, {
      type: 'QUOTE_REJECTED', title: 'The customer chose another provider',
      message: request.title || request.description.slice(0, 80), link: '/quotes',
    })))
    res.status(201).json({ message: 'Booking confirmed', booking })
  } catch (err) {
    if (claimed) await releaseSlots(bookingId, providerId).catch(() => {})
    next(err)
  }
})

/* --------------------------------- listing --------------------------------- */

// list + filter own (or, for staff, all) bookings
bookingApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { status, from, to, search, providerId, customerId } = req.query
    const filter = {}
    if (req.user.role === 'customer') filter.customer = req.user._id
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      if (!profile) return res.status(200).json({ bookings: [] })
      filter.provider = profile._id
    }
    if (isStaff(req.user)) {
      if (mongoose.isValidObjectId(providerId)) filter.provider = providerId
      if (mongoose.isValidObjectId(customerId)) filter.customer = customerId
    }
    if (status) filter.status = { $in: String(status).split(',') }
    const f = toDateKey(from), t = toDateKey(to)
    if (f || t) filter.dateKey = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) }

    let bookings = await populateBooking(BookingModel.find(filter)).sort({ scheduledDate: -1, startTime: -1 }).limit(500).lean()
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i')
      bookings = bookings.filter((b) =>
        rx.test(b.customer?.name || '') || rx.test(b.provider?.user?.name || '') ||
        rx.test(b.serviceRequest?.category?.name || '') || rx.test(b.serviceRequest?.title || '') || rx.test(String(b._id).slice(-6)))
    }
    const ids = bookings.map((b) => b._id)
    const [invoices, reviews] = await Promise.all([
      InvoiceModel.find({ booking: { $in: ids } }).select('booking status total number').lean(),
      ReviewModel.find({ booking: { $in: ids } }).select('booking rating').lean(),
    ])
    const invBy = new Map(invoices.map((i) => [String(i.booking), i]))
    const revBy = new Map(reviews.map((r) => [String(r.booking), r]))
    res.status(200).json({
      bookings: bookings.map((b) => ({ ...b, invoice: invBy.get(String(b._id)) || null, review: revBy.get(String(b._id)) || null })),
    })
  } catch (err) { next(err) }
})

// single booking + its invoice, review and support cases
bookingApp.get('/:id', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Booking not found' })
    const booking = await populateBooking(BookingModel.findById(req.params.id))
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (!(await canAccessBooking(booking, req.user))) {
      return res.status(403).json({ message: 'You do not have access to this booking' })
    }
    const [invoice, review, cases] = await Promise.all([
      InvoiceModel.findOne({ booking: booking._id }),
      ReviewModel.findOne({ booking: booking._id }),
      DisputeModel.find({ booking: booking._id }).select('type subject status createdAt priority refundAmount').sort({ createdAt: -1 }),
    ])
    // drafts are the provider's private working copy
    const visibleInvoice = invoice && (invoice.status !== 'draft' || req.user.role !== 'customer') ? invoice : null
    res.status(200).json({ booking, invoice: visibleInvoice, review, cases })
  } catch (err) { next(err) }
})

/* ------------------------------ job tracking ------------------------------ */

const PROVIDER_NEXT = { scheduled: ['inProgress'], inProgress: ['awaitingConfirmation'] }
// operations can also close out a job the customer never confirmed
const MANAGER_NEXT = { ...PROVIDER_NEXT, awaitingConfirmation: ['completed'] }
const EVIDENCE_WINDOW = { before: ['scheduled', 'inProgress'], after: ['inProgress', 'awaitingConfirmation'] }

// finish a job: stamp it complete, count it for the provider, and make the invoice payable
async function finalizeCompletion(booking, actor, { confirmedByCustomer }) {
  booking.status = 'completed'
  booking.completedAt = new Date()
  booking.customerConfirmed = !!confirmedByCustomer
  booking.jobTimeline.push(event(actor, {
    status: 'completed', kind: 'status',
    note: confirmedByCustomer ? 'Customer confirmed completion' : 'Closed by operations (no customer response)',
  }))
  await booking.save()
  await ProviderProfileModel.findByIdAndUpdate(booking.provider, { $inc: { completedJobs: 1 } })

  let invoice = await ensureInvoiceForBooking(booking)
  if (invoice.status === 'draft') {
    invoice.status = 'issued'
    invoice.issuedAt = new Date()
    invoice.dueDate = new Date(Date.now() + 7 * 86400000)
    await invoice.save()
    await notify(booking.customer, { type: 'INVOICE_ISSUED', title: 'Your invoice is ready', message: `${invoice.number} — ₹${invoice.total.toLocaleString('en-IN')}`, link: `/invoices/${invoice._id}` })
  }
  await notify(await providerUserOf(booking), {
    type: 'BOOKING_COMPLETED', title: 'Job confirmed complete', message: `Booking ${short(booking)} is complete. Your invoice is now payable.`, link: `/bookings/${booking._id}`,
  })
}

// provider (own jobs) / operations: advance status, add notes, attach before/after evidence
bookingApp.put('/:id/status', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const { status, note } = req.body
    const attachments = cleanList(req.body.attachments)
    const before = cleanList(req.body.beforeEvidence), after = cleanList(req.body.afterEvidence)

    const booking = await BookingModel.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (!(await canAccessBooking(booking, req.user))) return res.status(403).json({ message: 'You can only update your own jobs' })
    if (!['scheduled', 'inProgress', 'awaitingConfirmation'].includes(booking.status)) {
      return res.status(409).json({ message: `This booking is ${booking.status} and can no longer be updated` })
    }

    if (before.length && !EVIDENCE_WINDOW.before.includes(booking.status)) return res.status(409).json({ message: 'Before-photos can only be added before the work is finished' })
    if (after.length && !(EVIDENCE_WINDOW.after.includes(booking.status) || status === 'awaitingConfirmation')) {
      return res.status(409).json({ message: 'Start the job before adding after-photos' })
    }

    const changingStatus = status && status !== booking.status
    if (changingStatus) {
      const table = req.user.role === 'provider' ? PROVIDER_NEXT : MANAGER_NEXT
      if (!(table[booking.status] || []).includes(status)) {
        return res.status(409).json({ message: `A ${booking.status} job cannot move to "${status}"` })
      }
      if (status === 'completed' && !note?.trim()) return res.status(400).json({ message: 'Add a note explaining why the job is being closed' })
    } else if (!note?.trim() && !attachments.length && !before.length && !after.length) {
      return res.status(400).json({ message: 'Add a note or attach evidence' })
    }

    if (changingStatus && status === 'completed') {
      // operations closing a job the customer never confirmed
      booking.jobTimeline.push(event(req.user, { status, kind: 'status', note, attachments: [...attachments, ...after] }))
      if (after.length) booking.afterEvidence.push(...after)
      await finalizeCompletion(booking, req.user, { confirmedByCustomer: false })
      await logAudit(req.user, 'BOOKING_FORCE_COMPLETED', 'Booking', booking._id, { note })
      return res.status(200).json({ message: 'Job closed', booking })
    }

    booking.jobTimeline.push(event(req.user, {
      status: changingStatus ? status : booking.status,
      kind: changingStatus ? 'status' : (before.length || after.length || attachments.length ? 'evidence' : 'note'),
      note: note?.trim() || (changingStatus ? `Status changed to ${status}` : undefined),
      attachments: [...attachments, ...before, ...after],
    }))
    if (before.length) booking.beforeEvidence.push(...before)
    if (after.length) booking.afterEvidence.push(...after)
    if (changingStatus) booking.status = status
    await booking.save()

    if (changingStatus) {
      if (status === 'awaitingConfirmation') {
        await ensureInvoiceForBooking(booking) // draft the provider can still add extras to
        await notify(booking.customer, {
          type: 'COMPLETION_REQUESTED', title: 'Work finished — please confirm',
          message: `Your provider marked booking ${short(booking)} as done. Review the work and confirm.`, link: `/bookings/${booking._id}`,
        })
      } else {
        await notify(booking.customer, {
          type: 'BOOKING_STATUS_UPDATED', title: 'Job started', message: `Your provider has started booking ${short(booking)}.`, link: `/bookings/${booking._id}`,
        })
      }
    } else {
      await notify(booking.customer, { type: 'BOOKING_STATUS_UPDATED', title: 'Update on your booking', message: note || 'New photos were added.', link: `/bookings/${booking._id}` })
    }
    res.status(200).json({ message: 'Booking updated', booking })
  } catch (err) { next(err) }
})

// customer confirms the finished work -> completed
bookingApp.put('/:id/confirm', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const booking = await BookingModel.findOne({ _id: req.params.id, customer: req.user._id })
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (booking.status !== 'awaitingConfirmation') {
      return res.status(409).json({ message: booking.status === 'completed' ? 'You already confirmed this job' : 'The provider has not marked this job as finished yet' })
    }
    await finalizeCompletion(booking, req.user, { confirmedByCustomer: true })
    res.status(200).json({ message: 'Job confirmed complete', booking })
  } catch (err) { next(err) }
})

// customer says the work is not actually done -> back to in progress
bookingApp.put('/:id/reject-completion', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const reason = String(req.body.reason || '').trim()
    if (reason.length < 5) return res.status(400).json({ message: 'Tell the provider what still needs to be fixed' })
    const booking = await BookingModel.findOne({ _id: req.params.id, customer: req.user._id })
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (booking.status !== 'awaitingConfirmation') return res.status(409).json({ message: 'There is no completed work waiting for your confirmation' })
    booking.status = 'inProgress'
    booking.jobTimeline.push(event(req.user, { status: 'inProgress', kind: 'status', note: `Customer asked for more work: ${reason}` }))
    await booking.save()
    await notify(await providerUserOf(booking), { type: 'COMPLETION_REJECTED', title: 'Customer asked for more work', message: reason, link: `/bookings/${booking._id}` })
    res.status(200).json({ message: 'Sent back to the provider', booking })
  } catch (err) { next(err) }
})

/* ------------------ cancel / reschedule / reassign ------------------ */

const CANCELLABLE = {
  customer: ['scheduled'],
  provider: ['scheduled', 'inProgress'],
  staff: ['scheduled', 'inProgress', 'awaitingConfirmation', 'disputed'],
}

// customer / provider / support / ops / admin
bookingApp.put('/:id/cancel', verifyToken, authorizeRoles('customer', 'provider', ...STAFF_ROLES), async (req, res, next) => {
  try {
    const reason = String(req.body.reason || '').trim()
    if (reason.length < 3) return res.status(400).json({ message: 'Please give a reason for the cancellation' })
    const booking = await BookingModel.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (!(await canAccessBooking(booking, req.user))) return res.status(403).json({ message: 'You can only cancel your own bookings' })

    const allowed = CANCELLABLE[isStaff(req.user) ? 'staff' : req.user.role]
    if (!allowed.includes(booking.status)) {
      const hint = req.user.role === 'customer' && booking.status === 'inProgress' ? ' The job is already under way — contact support or raise a dispute.' : ''
      return res.status(409).json({ message: `A ${booking.status} booking cannot be cancelled.${hint}` })
    }

    booking.status = 'cancelled'
    booking.cancellation = { by: req.user._id, byRole: req.user.role, reason, at: new Date() }
    booking.jobTimeline.push(event(req.user, { status: 'cancelled', kind: 'status', note: reason }))
    await booking.save()
    await releaseSlots(booking._id) // hand the time back to the provider's calendar

    await QuoteModel.findByIdAndUpdate(booking.quote, { status: 'cancelled' })
    // the customer's own cancellation ends the request; a provider/staff cancellation re-opens it for new quotes
    await ServiceRequestModel.findByIdAndUpdate(booking.serviceRequest, req.user.role === 'customer' ? { status: 'cancelled', cancelReason: reason } : { status: 'open' })
    // an unpaid invoice is voided; a paid one stays and is handled as a refund by support
    await InvoiceModel.updateOne({ booking: booking._id, status: { $in: ['draft', 'issued'] } }, { status: 'void' })
    const paid = await InvoiceModel.exists({ booking: booking._id, status: 'paid' })

    const providerUser = await providerUserOf(booking)
    const msg = `${reason}${paid ? ' — a refund can be requested from Support.' : ''}`
    if (req.user.role !== 'customer') await notify(booking.customer, { type: 'BOOKING_CANCELLED', title: 'Your booking was cancelled', message: msg, link: `/bookings/${booking._id}` })
    if (req.user.role !== 'provider') await notify(providerUser, { type: 'BOOKING_CANCELLED', title: 'A booking was cancelled', message: reason, link: `/bookings/${booking._id}` })
    if (isStaff(req.user)) await logAudit(req.user, 'BOOKING_CANCELLED', 'Booking', booking._id, { reason, refundPending: !!paid })

    res.status(200).json({ message: 'Booking cancelled', booking })
  } catch (err) { next(err) }
})

// customer / operations: move a scheduled booking to another slot (re-runs the availability engine)
bookingApp.put('/:id/reschedule', verifyToken, authorizeRoles('customer', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const booking = await BookingModel.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (!(await canAccessBooking(booking, req.user))) return res.status(403).json({ message: 'You can only reschedule your own bookings' })
    if (booking.status !== 'scheduled') return res.status(409).json({ message: 'Only scheduled bookings can be rescheduled' })

    const { scheduledDate, startTime, endTime } = req.body
    const dateKey = toDateKey(scheduledDate)
    const provider = await ProviderProfileModel.findById(booking.provider)

    await releaseSlots(booking._id, provider._id)
    const claim = await claimWindow(provider, dateKey, startTime, endTime, booking._id)
    if (!claim.ok) {
      // the move failed, so put the booking's original slot back
      await reserveSlots(provider._id, booking.dateKey, booking.startTime, booking.endTime, booking._id).catch(() => {})
      return res.status(claim.status).json({ message: claim.message })
    }

    const old = `${booking.dateKey} ${booking.startTime}–${booking.endTime}`
    booking.dateKey = dateKey; booking.scheduledDate = dateFromKey(dateKey)
    booking.startTime = startTime; booking.endTime = endTime
    booking.rescheduleCount += 1
    booking.jobTimeline.push(event(req.user, { status: booking.status, kind: 'system', note: `Rescheduled from ${old} to ${dateKey} ${startTime}–${endTime}` }))
    await booking.save()

    const other = req.user.role === 'customer' ? await providerUserOf(booking) : booking.customer
    await notify(other, { type: 'BOOKING_RESCHEDULED', title: 'Booking rescheduled', message: `New time: ${dateKey}, ${startTime}–${endTime}`, link: `/bookings/${booking._id}` })
    if (req.user.role !== 'customer') {
      await notify(await providerUserOf(booking), { type: 'BOOKING_RESCHEDULED', title: 'Booking rescheduled', message: `New time: ${dateKey}, ${startTime}–${endTime}`, link: `/bookings/${booking._id}` })
      await logAudit(req.user, 'BOOKING_RESCHEDULED', 'Booking', booking._id, { from: old, to: `${dateKey} ${startTime}–${endTime}` })
    }
    res.status(200).json({ message: 'Booking rescheduled', booking })
  } catch (err) { next(err) }
})

// operations: hand a scheduled booking to a different verified provider (e.g. no-show, provider unavailable)
bookingApp.put('/:id/reassign', verifyToken, authorizeRoles(...MANAGER_ROLES), async (req, res, next) => {
  try {
    const { providerId, reason } = req.body
    if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: 'Choose a provider' })
    if (String(reason || '').trim().length < 3) return res.status(400).json({ message: 'Record why the booking is being reassigned' })
    const booking = await BookingModel.findById(req.params.id)
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (booking.status !== 'scheduled') return res.status(409).json({ message: 'Only scheduled bookings can be reassigned' })
    if (sameId(booking.provider, providerId)) return res.status(400).json({ message: 'That provider is already assigned' })

    const next_ = await ProviderProfileModel.findById(providerId).populate('user', 'name')
    if (!next_ || next_.verificationStatus !== 'verified') return res.status(400).json({ message: 'Only verified providers can be assigned' })
    const prev = await ProviderProfileModel.findById(booking.provider).populate('user', 'name')

    const claim = await claimWindow(next_, booking.dateKey, booking.startTime, booking.endTime, booking._id)
    if (!claim.ok) return res.status(claim.status).json({ message: `${next_.user?.name} can't take this slot: ${claim.message}` })
    await releaseSlots(booking._id, prev._id)

    booking.provider = next_._id
    booking.jobTimeline.push(event(req.user, { status: booking.status, kind: 'system', note: `Reassigned from ${prev.user?.name} to ${next_.user?.name}: ${reason}` }))
    await booking.save()
    await logAudit(req.user, 'BOOKING_REASSIGNED', 'Booking', booking._id, { from: prev.user?.name, to: next_.user?.name, reason })

    await notify(prev.user?._id, { type: 'BOOKING_REASSIGNED', title: 'A booking was reassigned away from you', message: reason, link: '/bookings' })
    await notify(next_.user?._id, { type: 'BOOKING_REASSIGNED', title: 'A booking was assigned to you', message: `${booking.dateKey}, ${booking.startTime}–${booking.endTime}`, link: `/bookings/${booking._id}` })
    await notify(booking.customer, { type: 'BOOKING_REASSIGNED', title: 'Your provider changed', message: `${next_.user?.name} will now handle your booking. ${reason}`, link: `/bookings/${booking._id}` })
    res.status(200).json({ message: 'Provider reassigned', booking })
  } catch (err) { next(err) }
})

/* -------------------------------- reviews -------------------------------- */

const EDIT_WINDOW_MS = 14 * 86400000

bookingApp.post('/:id/review', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const rating = Number(req.body.rating)
    const comment = String(req.body.comment || '').trim()
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Choose a rating from 1 to 5 stars' })
    const booking = await BookingModel.findById(req.params.id)
    if (!booking || booking.status !== 'completed') return res.status(400).json({ message: 'You can only review completed bookings' })
    if (!sameId(booking.customer, req.user._id)) return res.status(403).json({ message: 'You can only review your own bookings' })
    if (await ReviewModel.exists({ booking: booking._id })) return res.status(409).json({ message: 'You already reviewed this booking — you can edit your review instead' })

    const review = await ReviewModel.create({ booking: booking._id, customer: req.user._id, provider: booking.provider, rating, comment })
    await recomputeProviderRating(booking.provider)
    await notify(await providerUserOf(booking), {
      type: 'REVIEW_RECEIVED', title: `You received a ${rating}★ review`, message: comment || 'No comment left.', link: `/reviews`,
    })
    res.status(201).json({ message: 'Review submitted', review })
  } catch (err) { next(err) }
})

bookingApp.put('/:id/review', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const review = await ReviewModel.findOne({ booking: req.params.id, customer: req.user._id })
    if (!review) return res.status(404).json({ message: 'Review not found' })
    if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) return res.status(409).json({ message: 'Reviews can only be edited within 14 days' })
    if (req.body.rating !== undefined) {
      const rating = Number(req.body.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Choose a rating from 1 to 5 stars' })
      review.rating = rating
    }
    if (req.body.comment !== undefined) review.comment = String(req.body.comment).trim()
    review.editedAt = new Date()
    await review.save()
    await recomputeProviderRating(review.provider)
    res.status(200).json({ message: 'Review updated', review })
  } catch (err) { next(err) }
})

// customer removes their own review; admin / ops can moderate any review
bookingApp.delete('/:id/review', verifyToken, authorizeRoles('customer', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const review = await ReviewModel.findOne({ booking: req.params.id, ...(req.user.role === 'customer' ? { customer: req.user._id } : {}) })
    if (!review) return res.status(404).json({ message: 'Review not found' })
    await review.deleteOne()
    await recomputeProviderRating(review.provider)
    if (req.user.role !== 'customer') await logAudit(req.user, 'REVIEW_REMOVED', 'Review', review._id, { reason: req.body?.reason, rating: review.rating })
    res.status(200).json({ message: 'Review removed' })
  } catch (err) { next(err) }
})

// provider publicly replies to a review of their work
bookingApp.put('/:id/review/reply', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim()
    if (!text) return res.status(400).json({ message: 'Write a reply first' })
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    const review = await ReviewModel.findOne({ booking: req.params.id, provider: profile?._id })
    if (!review) return res.status(404).json({ message: 'Review not found' })
    review.providerReply = { text: text.slice(0, 1000), at: new Date() }
    await review.save()
    await notify(review.customer, { type: 'REVIEW_REPLY', title: 'Your provider replied to your review', message: text.slice(0, 120), link: `/bookings/${req.params.id}` })
    res.status(200).json({ message: 'Reply posted', review })
  } catch (err) { next(err) }
})

bookingApp.get('/:id/review', verifyToken, async (req, res, next) => {
  try {
    const booking = await BookingModel.findById(req.params.id)
    if (!booking || !(await canAccessBooking(booking, req.user))) return res.status(404).json({ message: 'Review not found' })
    res.status(200).json({ review: await ReviewModel.findOne({ booking: req.params.id }) })
  } catch (err) { next(err) }
})
