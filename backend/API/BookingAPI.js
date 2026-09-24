import exp from 'express'
import { BookingModel } from '../Models/BookingModel.js'
import { QuoteModel } from '../Models/QuoteModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { ReviewModel } from '../Models/ReviewModel.js'
import { DisputeModel } from '../Models/DisputeModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'

export const bookingApp = exp.Router()

const populateBooking = (query) => query
  .populate('customer', '-password')
  .populate({ path: 'provider', populate: { path: 'user', select: '-password' } })
  .populate({ path: 'serviceRequest', populate: { path: 'category' } })

// customer accepts a quote -> creates booking, checks slot overlap
bookingApp.post('/', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const { quoteId, scheduledDate, startTime, endTime } = req.body
    const quote = await QuoteModel.findById(quoteId)
    if (!quote) return res.status(404).json({ message: "Quote not found" })
    if (quote.status !== 'pending') return res.status(409).json({ message: "This quote is no longer available" })

    // Ownership check: only the customer who owns the underlying service
    // request may accept its quotes. Without this, any authenticated
    // customer could accept a quote (and create a booking) that belongs to
    // someone else's request.
    const owningRequest = await ServiceRequestModel.findById(quote.serviceRequest)
    if (!owningRequest || owningRequest.customer.toString() !== req.user._id) {
      return res.status(403).json({ message: "You can only book quotes on your own requests" })
    }

    const provider = await ProviderProfileModel.findById(quote.provider)

    // prevent overlapping bookings for this provider on this date
    const overlap = provider.bookedSlots.some(slot =>
      slot.date.toDateString() === new Date(scheduledDate).toDateString() &&
      startTime < slot.endTime && endTime > slot.startTime
    )
    if (overlap) return res.status(409).json({ message: "Provider is unavailable at that time" })

    const booking = await BookingModel.create({
      serviceRequest: quote.serviceRequest,
      quote: quote._id,
      customer: req.user._id,
      provider: provider._id,
      scheduledDate, startTime, endTime,
      price: quote.price,
      jobTimeline: [{ status: 'scheduled', note: 'Booking created' }]
    })

    quote.status = 'accepted'
    await quote.save()
    // reject the other pending quotes on this request
    await QuoteModel.updateMany(
      { serviceRequest: quote.serviceRequest, _id: { $ne: quote._id }, status: 'pending' },
      { status: 'rejected' }
    )
    await ServiceRequestModel.findByIdAndUpdate(quote.serviceRequest, { status: 'booked' })
    provider.bookedSlots.push({ date: scheduledDate, startTime, endTime, booking: booking._id })
    await provider.save()

    await notify(provider.user, {
      type: 'BOOKING_CREATED',
      title: 'New booking confirmed',
      message: `A customer booked you for ${new Date(scheduledDate).toLocaleDateString()} ${startTime}-${endTime}`,
      link: `/bookings/${booking._id}`,
    })

    res.status(201).json({ message: "Booking confirmed", booking })
  } catch (err) { next(err) }
})

// list + filter own (or, for admin/ops, all) bookings
bookingApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { status, from, to } = req.query
    let filter = {}
    if (req.user.role === 'customer') filter.customer = req.user._id
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      filter.provider = profile?._id
    }
    if (status) filter.status = status
    if (from || to) {
      filter.scheduledDate = {}
      if (from) filter.scheduledDate.$gte = new Date(from)
      if (to) filter.scheduledDate.$lte = new Date(to)
    }

    const bookings = await populateBooking(BookingModel.find(filter)).sort({ scheduledDate: -1 })
    res.status(200).json({ bookings })
  } catch (err) { next(err) }
})

// helper: is req.user a party to this booking (its customer, or its
// assigned provider), or platform staff? Used for ownership checks below.
async function canAccessBooking(booking, user) {
  if (['admin', 'operationsManager', 'supportAgent'].includes(user.role)) return true
  if (user.role === 'customer') return booking.customer.toString() === user._id
  if (user.role === 'provider') {
    const profile = await ProviderProfileModel.findOne({ user: user._id })
    return !!profile && booking.provider.toString() === profile._id.toString()
  }
  return false
}

// single booking (full timeline)
bookingApp.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const booking = await populateBooking(BookingModel.findById(req.params.id))
    if (!booking) return res.status(404).json({ message: "Booking not found" })
    if (!(await canAccessBooking(booking, req.user))) {
      return res.status(403).json({ message: "You do not have access to this booking" })
    }
    res.status(200).json({ booking })
  } catch (err) { next(err) }
})

// update job status / add timeline event / attach evidence
bookingApp.put('/:id/status', verifyToken, authorizeRoles('provider', 'operationsManager', 'admin'), async (req, res, next) => {
  try {
    const { status, note, attachments, beforeEvidence, afterEvidence } = req.body

    const existing = await BookingModel.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: "Booking not found" })
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      if (!profile || existing.provider.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "You can only update your own jobs" })
      }
    }

    const pushFields = { jobTimeline: { status, note, attachments } }
    if (beforeEvidence?.length) pushFields.beforeEvidence = { $each: beforeEvidence }
    if (afterEvidence?.length) pushFields.afterEvidence = { $each: afterEvidence }

    const finalUpdate = { $push: pushFields }
    if (status) finalUpdate.status = status

    const booking = await BookingModel.findByIdAndUpdate(req.params.id, finalUpdate, { new: true })
    if (!booking) return res.status(404).json({ message: "Booking not found" })

    await notify(booking.customer, {
      type: 'BOOKING_STATUS_UPDATED',
      title: 'Job status updated',
      message: `Your booking is now "${status || booking.status}"`,
      link: `/bookings/${booking._id}`,
    })

    res.status(200).json({ message: "Booking updated", booking })
  } catch (err) { next(err) }
})

// customer confirms job completion
bookingApp.put('/:id/confirm', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const booking = await BookingModel.findOneAndUpdate(
      { _id: req.params.id, customer: req.user._id },
      {
        customerConfirmed: true, status: 'completed',
        $push: { jobTimeline: { status: 'completed', note: 'Customer confirmed completion' } }
      },
      { new: true }
    )
    if (!booking) return res.status(404).json({ message: "Booking not found" })

    const provider = await ProviderProfileModel.findById(booking.provider)
    await notify(provider?.user, {
      type: 'BOOKING_COMPLETED',
      title: 'Job confirmed complete',
      message: `The customer confirmed job completion for booking #${booking._id.toString().slice(-6)}`,
      link: `/bookings/${booking._id}`,
    })

    res.status(200).json({ message: "Job confirmed complete", booking })
  } catch (err) { next(err) }
})

bookingApp.put('/:id/cancel', verifyToken, authorizeRoles('customer', 'provider', 'admin', 'operationsManager'), async (req, res, next) => {
  try {
    const existing = await BookingModel.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: "Booking not found" })
    if (!(await canAccessBooking(existing, req.user))) {
      return res.status(403).json({ message: "You can only cancel your own bookings" })
    }

    const booking = await BookingModel.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', $push: { jobTimeline: { status: 'cancelled', note: req.body.reason } } },
      { new: true }
    )
    if (!booking) return res.status(404).json({ message: "Booking not found" })

    const provider = await ProviderProfileModel.findById(booking.provider)
    const notifyTarget = req.user.role === 'customer' ? provider?.user : booking.customer
    await notify(notifyTarget, {
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      message: req.body.reason || 'A booking was cancelled',
      link: `/bookings/${booking._id}`,
    })

    res.status(200).json({ message: "Booking cancelled", booking })
  } catch (err) { next(err) }
})

/* ---------- Reviews ---------- */

bookingApp.post('/:id/review', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const { rating, comment } = req.body
    const booking = await BookingModel.findById(req.params.id)
    if (!booking || booking.status !== 'completed') {
      return res.status(400).json({ message: "Can only review completed bookings" })
    }
    if (booking.customer.toString() !== req.user._id) {
      return res.status(403).json({ message: "You can only review your own bookings" })
    }

    const review = await ReviewModel.create({
      booking: booking._id, customer: req.user._id, provider: booking.provider, rating, comment
    })

    const provider = await ProviderProfileModel.findById(booking.provider)
    const newCount = provider.ratingCount + 1
    provider.rating = ((provider.rating * provider.ratingCount) + rating) / newCount
    provider.ratingCount = newCount
    await provider.save()

    await notify(provider.user, {
      type: 'REVIEW_RECEIVED',
      title: 'You received a new review',
      message: `${rating}★ — "${comment || ''}"`.trim(),
      link: `/bookings/${booking._id}`,
    })

    res.status(201).json({ message: "Review submitted", review })
  } catch (err) { next(err) }
})

bookingApp.get('/:id/review', verifyToken, async (req, res, next) => {
  try {
    const review = await ReviewModel.findOne({ booking: req.params.id })
    res.status(200).json({ review })
  } catch (err) { next(err) }
})

/* ---------- Disputes ---------- */

bookingApp.post('/:id/dispute', verifyToken, async (req, res, next) => {
  try {
    const { reason } = req.body
    const target = await BookingModel.findById(req.params.id)
    if (!target) return res.status(404).json({ message: "Booking not found" })
    if (!(await canAccessBooking(target, req.user)) || !['customer', 'provider'].includes(req.user.role)) {
      return res.status(403).json({ message: "You can only dispute bookings you're party to" })
    }

    const dispute = await DisputeModel.create({
      booking: req.params.id, raisedBy: req.user._id, reason
    })
    const booking = await BookingModel.findByIdAndUpdate(req.params.id, { status: 'disputed' })

    if (booking) {
      const provider = await ProviderProfileModel.findById(booking.provider)
      const otherParty = req.user._id.toString() === booking.customer.toString() ? provider?.user : booking.customer
      await notify(otherParty, {
        type: 'DISPUTE_RAISED',
        title: 'A dispute was raised on your booking',
        message: reason,
        link: `/bookings/${booking._id}`,
      })
    }

    res.status(201).json({ message: "Dispute raised", dispute })
  } catch (err) { next(err) }
})

bookingApp.get('/disputes/all', verifyToken, authorizeRoles('admin', 'operationsManager', 'supportAgent'), async (req, res, next) => {
  try {
    const { status } = req.query
    const filter = status ? { status } : {}
    const disputes = await DisputeModel.find(filter)
      .populate({ path: 'booking', populate: [{ path: 'customer', select: '-password' }, { path: 'provider', populate: { path: 'user', select: '-password' } }] })
      .populate('raisedBy', '-password')
      .sort({ createdAt: -1 })
    res.status(200).json({ disputes })
  } catch (err) { next(err) }
})

// a user's own disputes (across bookings they're party to)
bookingApp.get('/disputes/mine', verifyToken, async (req, res, next) => {
  try {
    const disputes = await DisputeModel.find({ raisedBy: req.user._id })
      .populate('booking')
      .sort({ createdAt: -1 })
    res.status(200).json({ disputes })
  } catch (err) { next(err) }
})

bookingApp.put('/disputes/:id', verifyToken, authorizeRoles('admin', 'operationsManager', 'supportAgent'), async (req, res, next) => {
  try {
    const { status, resolutionNotes, refundAmount } = req.body
    const dispute = await DisputeModel.findByIdAndUpdate(
      req.params.id,
      { status, resolutionNotes, refundAmount, handledBy: req.user._id },
      { new: true }
    ).populate('booking')

    if (!dispute) return res.status(404).json({ message: "Dispute not found" })

    await logAudit(req.user, 'DISPUTE_RESOLVED', 'Dispute', dispute._id, { status, refundAmount })

    const booking = dispute.booking
    if (booking) {
      const provider = await ProviderProfileModel.findById(booking.provider)
      await notify(booking.customer, {
        type: 'DISPUTE_UPDATED',
        title: `Dispute ${status}`,
        message: resolutionNotes || '',
        link: `/bookings/${booking._id}`,
      })
      await notify(provider?.user, {
        type: 'DISPUTE_UPDATED',
        title: `Dispute ${status}`,
        message: resolutionNotes || '',
        link: `/bookings/${booking._id}`,
      })
    }

    res.status(200).json({ message: "Dispute updated", dispute })
  } catch (err) { next(err) }
})