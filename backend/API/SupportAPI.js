import exp from 'express'
import mongoose from 'mongoose'
import { DisputeModel } from '../Models/DisputeModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { InvoiceModel } from '../Models/InvoiceModel.js'
import { UserModel } from '../Models/UserModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, notifyRoles, logAudit } from '../services/activityService.js'
import { STAFF_ROLES, MANAGER_ROLES, PARTY_USER, escapeRegex, cleanList, sameId, money } from '../utils/helpers.js'

export const supportApp = exp.Router()

const isStaff = (u) => STAFF_ROLES.includes(u.role)
const isManager = (u) => MANAGER_ROLES.includes(u.role)
const ACTIVE = ['open', 'investigating', 'escalated']
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 }
// support agents may refund up to this amount on their own; more needs operations sign-off
const SUPPORT_REFUND_LIMIT = () => Number(process.env.SUPPORT_REFUND_LIMIT || 2000)

const bookingSelect = 'dateKey startTime endTime price status customer provider serviceRequest'
const populateCase = (q) => q
  .populate({
    path: 'booking', select: bookingSelect,
    populate: [
      { path: 'customer', select: PARTY_USER },
      { path: 'provider', select: 'user', populate: { path: 'user', select: PARTY_USER } },
      { path: 'serviceRequest', select: 'title category', populate: { path: 'category', select: 'name' } },
    ],
  })
  .populate('raisedBy', 'name role email phone')
  .populate('assignedTo', 'name role')
  .populate('handledBy', 'name role')

// which bookings is this (non-staff) user a party to?
async function myBookingIds(user) {
  if (user.role === 'customer') return (await BookingModel.find({ customer: user._id }).select('_id')).map((b) => b._id)
  if (user.role === 'provider') {
    const p = await ProviderProfileModel.findOne({ user: user._id })
    return p ? (await BookingModel.find({ provider: p._id }).select('_id')).map((b) => b._id) : []
  }
  return []
}

async function canSeeCase(user, c) {
  if (isStaff(user)) return true
  if (sameId(c.raisedBy, user._id)) return true
  if (!c.booking) return false
  const b = await BookingModel.findById(c.booking?._id || c.booking).select('customer provider')
  if (!b) return false
  if (user.role === 'customer') return sameId(b.customer, user._id)
  const p = await ProviderProfileModel.findOne({ user: user._id })
  return !!p && sameId(b.provider, p._id)
}

// non-staff never see internal notes or escalation reasoning
function shapeCase(user, c) {
  const o = typeof c.toObject === 'function' ? c.toObject() : { ...c }
  if (!isStaff(user)) {
    o.messages = (o.messages || []).filter((m) => !m.internal)
    delete o.escalationNote
    delete o.escalatedBy
    delete o.handledBy
    if (o.assignedTo) o.assignedTo = { _id: o.assignedTo._id, name: o.assignedTo.name }
  }
  return o
}

const otherBookingParties = async (booking, exceptUserId) => {
  const p = await ProviderProfileModel.findById(booking.provider).select('user')
  return [booking.customer, p?.user].filter((id) => id && String(id) !== String(exceptUserId))
}

/* ------------------------------ raise a case ------------------------------ */

// customer / provider raises a dispute, complaint or refund request
supportApp.post('/cases', verifyToken, authorizeRoles('customer', 'provider'), async (req, res, next) => {
  try {
    const type = req.body.type || 'dispute'
    const reason = String(req.body.reason || '').trim()
    const subject = String(req.body.subject || '').trim()
    if (!['dispute', 'complaint', 'refund'].includes(type)) return res.status(400).json({ message: 'Choose what kind of case this is' })
    if (reason.length < 10) return res.status(400).json({ message: 'Describe the issue in at least 10 characters so support can help' })
    if (type === 'refund' && req.user.role !== 'customer') return res.status(403).json({ message: 'Only customers can request refunds' })

    let booking = null
    if (req.body.bookingId) {
      if (!mongoose.isValidObjectId(req.body.bookingId)) return res.status(400).json({ message: 'Unknown booking' })
      booking = await BookingModel.findById(req.body.bookingId)
      if (!booking) return res.status(404).json({ message: 'Booking not found' })
      const mine = req.user.role === 'customer' ? sameId(booking.customer, req.user._id)
        : sameId(booking.provider, (await ProviderProfileModel.findOne({ user: req.user._id }))?._id)
      if (!mine) return res.status(403).json({ message: "You can only raise cases on bookings you're part of" })
    } else if (type !== 'complaint') {
      return res.status(400).json({ message: 'Choose the booking this relates to' })
    }

    if (booking && type === 'dispute') {
      if (booking.status === 'cancelled') return res.status(409).json({ message: 'This booking was cancelled, so it cannot be disputed' })
      if (await DisputeModel.exists({ booking: booking._id, type: 'dispute', status: { $in: ACTIVE } })) {
        return res.status(409).json({ message: 'There is already an open dispute on this booking — add your message to it instead' })
      }
    }
    if (booking && type === 'refund') {
      const paid = await InvoiceModel.exists({ booking: booking._id, status: { $in: ['paid', 'partiallyRefunded'] } })
      if (!paid) return res.status(400).json({ message: 'There is no payment on record for this booking, so there is nothing to refund' })
    }

    const c = await DisputeModel.create({
      type, subject: subject || (type === 'complaint' ? 'Complaint' : type === 'refund' ? 'Refund request' : 'Booking dispute'),
      booking: booking?._id, raisedBy: req.user._id, raisedByRole: req.user.role, reason,
      attachments: cleanList(req.body.attachments),
      priority: booking?.status === 'inProgress' && type === 'dispute' ? 'high' : 'normal',
    })

    if (booking && type === 'dispute') {
      booking.statusBeforeDispute = booking.status
      booking.status = 'disputed'
      booking.jobTimeline.push({ status: 'disputed', kind: 'system', note: 'A dispute was raised', by: req.user._id, byName: req.user.name, byRole: req.user.role, createdAt: new Date() })
      await booking.save()
      for (const uid of await otherBookingParties(booking, req.user._id)) {
        await notify(uid, { type: 'DISPUTE_RAISED', title: 'A dispute was raised on your booking', message: reason.slice(0, 140), link: `/bookings/${booking._id}` })
      }
    }
    await notifyRoles(['supportAgent', 'operationsManager'], {
      type: 'DISPUTE_RAISED', title: `New ${type === 'refund' ? 'refund request' : type}`, message: `${req.user.name}: ${c.subject}`, link: `/cases/${c._id}`,
    })
    res.status(201).json({ message: 'Your case was submitted — our support team will respond shortly', case: c })
  } catch (err) { next(err) }
})

/* ---------------------------------- lists ---------------------------------- */

supportApp.get('/cases', verifyToken, async (req, res, next) => {
  try {
    const { status, type, priority, assignedTo, search, bookingId } = req.query
    const filter = {}
    if (!isStaff(req.user)) {
      filter.$or = [{ raisedBy: req.user._id }, { booking: { $in: await myBookingIds(req.user) } }]
    }
    if (status) filter.status = { $in: String(status).split(',') }
    if (type) filter.type = type
    if (priority) filter.priority = priority
    if (mongoose.isValidObjectId(bookingId)) filter.booking = bookingId
    if (isStaff(req.user) && assignedTo) {
      if (assignedTo === 'me') filter.assignedTo = req.user._id
      else if (assignedTo === 'unassigned') filter.assignedTo = null
      else if (mongoose.isValidObjectId(assignedTo)) filter.assignedTo = assignedTo
    }
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' }
      filter.$and = [...(filter.$and || []), { $or: [{ subject: rx }, { reason: rx }] }]
    }
    const cases = await populateCase(DisputeModel.find(filter)).sort({ createdAt: -1 }).limit(500)
    res.status(200).json({ cases: cases.map((c) => {
      const o = shapeCase(req.user, c)
      o.messageCount = o.messages.length
      delete o.messages // the list stays light; the thread loads with the case
      return o
    }) })
  } catch (err) { next(err) }
})

// support console numbers
supportApp.get('/stats', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const cases = await DisputeModel.find().select('status type priority assignedTo createdAt resolvedAt refundAmount refundProcessedAt').lean()
    const active = cases.filter((c) => ACTIVE.includes(c.status))
    const resolved = cases.filter((c) => c.status === 'resolved' && c.resolvedAt)
    const hours = (a, b) => (new Date(b) - new Date(a)) / 3600000
    res.status(200).json({
      total: cases.length,
      byStatus: Object.fromEntries(['open', 'investigating', 'escalated', 'resolved', 'rejected'].map((s) => [s, cases.filter((c) => c.status === s).length])),
      byType: Object.fromEntries(['dispute', 'complaint', 'refund'].map((t) => [t, cases.filter((c) => c.type === t).length])),
      unassigned: active.filter((c) => !c.assignedTo).length,
      mine: active.filter((c) => sameId(c.assignedTo, req.user._id)).length,
      urgent: active.filter((c) => ['high', 'urgent'].includes(c.priority)).length,
      overSla: active.filter((c) => hours(c.createdAt, Date.now()) > 24).length, // target: first response / resolution within 24h
      avgResolutionHours: resolved.length ? Math.round((resolved.reduce((n, c) => n + hours(c.createdAt, c.resolvedAt), 0) / resolved.length) * 10) / 10 : null,
      refundedTotal: cases.filter((c) => c.refundProcessedAt).reduce((n, c) => n + (c.refundAmount || 0), 0),
    })
  } catch (err) { next(err) }
})

// one case with its full thread
supportApp.get('/cases/:id', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Case not found' })
    const c = await populateCase(DisputeModel.findById(req.params.id))
    if (!c || !(await canSeeCase(req.user, c))) return res.status(404).json({ message: 'Case not found' })
    const invoice = c.booking ? await InvoiceModel.findOne({ booking: c.booking._id }).select('number status total refundedAmount subtotal tax paidAt paymentMethod') : null
    res.status(200).json({ case: shapeCase(req.user, c), invoice: invoice && (isStaff(req.user) || invoice.status !== 'draft') ? invoice : null })
  } catch (err) { next(err) }
})

/* --------------------------- customer communication --------------------------- */

supportApp.post('/cases/:id/messages', verifyToken, async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim()
    if (!text) return res.status(400).json({ message: 'Write a message first' })
    const c = await DisputeModel.findById(req.params.id)
    if (!c || !(await canSeeCase(req.user, c))) return res.status(404).json({ message: 'Case not found' })
    const staff = isStaff(req.user)
    if (!staff && !ACTIVE.includes(c.status)) return res.status(409).json({ message: 'This case is closed. Raise a new case if the problem continues.' })
    const internal = staff && !!req.body.internal

    c.messages.push({
      sender: req.user._id, senderName: req.user.name, senderRole: req.user.role,
      text: text.slice(0, 2000), attachments: cleanList(req.body.attachments), internal,
    })
    // the first staff reply picks the case up
    if (staff && !internal && c.status === 'open') {
      c.status = 'investigating'
      if (!c.assignedTo) c.assignedTo = req.user._id
    }
    await c.save()

    if (!internal) {
      if (staff) {
        const targets = new Set([String(c.raisedBy)])
        if (c.booking && c.type === 'dispute') {
          const b = await BookingModel.findById(c.booking).select('customer provider')
          if (b) (await otherBookingParties(b, req.user._id)).forEach((id) => targets.add(String(id)))
        }
        for (const id of targets) await notify(id, { type: 'CASE_MESSAGE', title: 'Support replied to your case', message: text.slice(0, 120), link: `/cases/${c._id}` })
      } else if (c.assignedTo) {
        await notify(c.assignedTo, { type: 'CASE_MESSAGE', title: 'New reply on a case', message: `${req.user.name}: ${text.slice(0, 100)}`, link: `/cases/${c._id}` })
      } else {
        await notifyRoles(['supportAgent', 'operationsManager'], { type: 'CASE_MESSAGE', title: 'New reply on an unassigned case', message: `${req.user.name}: ${text.slice(0, 100)}`, link: `/cases/${c._id}` }, req.user._id)
      }
    }
    res.status(201).json({ message: 'Message sent', case: shapeCase(req.user, c) })
  } catch (err) { next(err) }
})

/* ---------------------------- staff: work the case ---------------------------- */

// claim / assign
supportApp.put('/cases/:id/assign', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const c = await DisputeModel.findById(req.params.id)
    if (!c) return res.status(404).json({ message: 'Case not found' })
    if (!ACTIVE.includes(c.status)) return res.status(409).json({ message: 'This case is already closed' })

    let target = req.body.assignedTo
    if (target === 'me') target = req.user._id
    if (!isManager(req.user) && target && !sameId(target, req.user._id)) return res.status(403).json({ message: 'You can only assign cases to yourself' })
    if (!isManager(req.user) && !target) return res.status(403).json({ message: 'Only operations can unassign a case' })
    if (c.status === 'escalated' && !isManager(req.user)) return res.status(403).json({ message: 'Escalated cases are handled by operations' })

    if (target) {
      const staff = await UserModel.findOne({ _id: target, role: { $in: STAFF_ROLES }, isActive: true }).select('name')
      if (!staff) return res.status(400).json({ message: 'Choose an active staff member' })
      c.assignedTo = staff._id
      if (c.status === 'open') c.status = 'investigating'
      if (!sameId(staff._id, req.user._id)) await notify(staff._id, { type: 'CASE_ASSIGNED', title: 'A case was assigned to you', message: c.subject, link: `/cases/${c._id}` })
    } else {
      c.assignedTo = undefined
    }
    await c.save()
    res.status(200).json({ message: target ? 'Case assigned' : 'Case unassigned', case: await populateCase(DisputeModel.findById(c._id)) })
  } catch (err) { next(err) }
})

// support -> operations
supportApp.put('/cases/:id/escalate', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const note = String(req.body.note || '').trim()
    if (note.length < 10) return res.status(400).json({ message: 'Explain why this needs operations (at least 10 characters)' })
    const c = await DisputeModel.findById(req.params.id)
    if (!c) return res.status(404).json({ message: 'Case not found' })
    if (!['open', 'investigating'].includes(c.status)) return res.status(409).json({ message: `A ${c.status} case cannot be escalated` })

    c.status = 'escalated'
    c.escalatedBy = req.user._id
    c.escalatedAt = new Date()
    c.escalationNote = note
    c.assignedTo = undefined // lands in the operations queue for a manager to claim
    if (PRIORITY_RANK[c.priority] < PRIORITY_RANK.high) c.priority = 'high'
    c.messages.push({ sender: req.user._id, senderName: req.user.name, senderRole: req.user.role, text: `Escalated to operations: ${note}`, internal: true })
    await c.save()

    await logAudit(req.user, 'CASE_ESCALATED', 'Dispute', c._id, { subject: c.subject, note })
    await notifyRoles(MANAGER_ROLES, { type: 'CASE_ESCALATED', title: 'A case was escalated', message: `${c.subject} — ${note.slice(0, 100)}`, link: `/cases/${c._id}` }, req.user._id)
    await notify(c.raisedBy, { type: 'DISPUTE_UPDATED', title: 'Your case was escalated', message: 'A senior operations manager is now reviewing it.', link: `/cases/${c._id}` })
    res.status(200).json({ message: 'Escalated to operations', case: await populateCase(DisputeModel.findById(c._id)) })
  } catch (err) { next(err) }
})

// update status / priority; resolve with notes and (optionally) a refund
supportApp.put('/cases/:id', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const { status, priority, resolutionNotes } = req.body
    const c = await DisputeModel.findById(req.params.id)
    if (!c) return res.status(404).json({ message: 'Case not found' })
    if (c.status === 'escalated' && !isManager(req.user)) return res.status(403).json({ message: 'This case was escalated — operations will resolve it' })

    if (priority !== undefined) {
      if (!(priority in PRIORITY_RANK)) return res.status(400).json({ message: 'Unknown priority' })
      c.priority = priority
    }

    const closing = status && ['resolved', 'rejected'].includes(status)
    if (status && !['open', 'investigating', 'resolved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Unknown status' })
    if (status === 'open' && !isManager(req.user)) return res.status(403).json({ message: 'Only operations can re-open a case' })
    if (!ACTIVE.includes(c.status) && status && !isManager(req.user)) return res.status(409).json({ message: 'This case is already closed' })

    let refundApplied = 0
    if (closing) {
      if (String(resolutionNotes || '').trim().length < 10) return res.status(400).json({ message: 'Add resolution notes (at least 10 characters) — the customer will see them' })
      c.resolutionNotes = String(resolutionNotes).trim()

      const refund = money(req.body.refundAmount)
      if (refund < 0) return res.status(400).json({ message: 'Refund cannot be negative' })
      if (refund > 0 && status === 'rejected') return res.status(400).json({ message: 'A rejected case cannot include a refund' })
      if (refund > 0 && !c.refundProcessedAt) {
        if (!c.booking) return res.status(400).json({ message: 'Only booking-related cases can be refunded' })
        const invoice = await InvoiceModel.findOne({ booking: c.booking, status: { $in: ['paid', 'partiallyRefunded'] } })
        if (!invoice) return res.status(400).json({ message: 'No payment is recorded for this booking, so there is nothing to refund' })
        const refundable = money(invoice.total - invoice.refundedAmount)
        if (refund > refundable) return res.status(400).json({ message: `At most ₹${refundable} can still be refunded on ${invoice.number}` })
        if (req.user.role === 'supportAgent' && refund > SUPPORT_REFUND_LIMIT()) {
          return res.status(403).json({ message: `Refunds above ₹${SUPPORT_REFUND_LIMIT()} need operations approval — escalate this case` })
        }
        invoice.refundedAmount = money(invoice.refundedAmount + refund)
        invoice.status = invoice.refundedAmount >= invoice.total ? 'refunded' : 'partiallyRefunded'
        invoice.refunds.push({ amount: refund, by: req.user._id, caseId: c._id, note: c.resolutionNotes.slice(0, 200) })
        await invoice.save()
        c.refundAmount = refund
        c.refundProcessedAt = new Date()
        refundApplied = refund
        await notify(c.raisedBy, { type: 'INVOICE_REFUNDED', title: `₹${refund.toLocaleString('en-IN')} refunded`, message: `${invoice.number}: ${c.resolutionNotes.slice(0, 100)}`, link: `/invoices/${invoice._id}` })
      }
      c.resolvedAt = new Date()
    }
    if (status) c.status = status
    if (status === 'investigating' && !c.assignedTo) c.assignedTo = req.user._id
    if (status === 'open' || status === 'investigating') c.resolvedAt = undefined
    c.handledBy = req.user._id
    await c.save()

    // give the booking back its normal status once no dispute is active on it
    if (closing && c.booking && c.type === 'dispute') {
      const stillActive = await DisputeModel.exists({ booking: c.booking, type: 'dispute', status: { $in: ACTIVE }, _id: { $ne: c._id } })
      const b = await BookingModel.findById(c.booking)
      if (b && b.status === 'disputed' && !stillActive) {
        b.status = b.statusBeforeDispute || 'completed'
        b.statusBeforeDispute = undefined
        b.jobTimeline.push({ status: b.status, kind: 'system', note: `Dispute ${status}`, by: req.user._id, byName: req.user.name, byRole: req.user.role, createdAt: new Date() })
        await b.save()
      }
    }

    if (closing) {
      await logAudit(req.user, status === 'resolved' ? 'DISPUTE_RESOLVED' : 'DISPUTE_REJECTED', 'Dispute', c._id, { type: c.type, refund: refundApplied || undefined })
      const parties = new Set([String(c.raisedBy)])
      if (c.booking && c.type === 'dispute') {
        const b = await BookingModel.findById(c.booking).select('customer provider')
        if (b) (await otherBookingParties(b, req.user._id)).forEach((id) => parties.add(String(id)))
      }
      for (const id of parties) await notify(id, { type: 'DISPUTE_UPDATED', title: `Your case was ${status}`, message: c.resolutionNotes.slice(0, 140), link: `/cases/${c._id}` })
    } else if (status === 'investigating') {
      await notify(c.raisedBy, { type: 'DISPUTE_UPDATED', title: 'Support is looking into your case', message: c.subject, link: `/cases/${c._id}` })
    }
    res.status(200).json({ message: closing ? `Case ${status}` : 'Case updated', case: await populateCase(DisputeModel.findById(c._id)) })
  } catch (err) { next(err) }
})
