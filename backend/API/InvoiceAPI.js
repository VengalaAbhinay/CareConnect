import exp from 'express'
import mongoose from 'mongoose'
import { InvoiceModel } from '../Models/InvoiceModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'
import { ensureInvoiceForBooking, categoryForBooking } from '../services/invoiceService.js'
import { computeTotals } from '../services/pricingService.js'
import { STAFF_ROLES, MANAGER_ROLES, PARTY_USER, escapeRegex, sameId } from '../utils/helpers.js'

export const invoiceApp = exp.Router()

const isStaff = (u) => STAFF_ROLES.includes(u.role)

const populateInvoice = (q) => q
  .populate('customer', PARTY_USER)
  .populate({ path: 'provider', populate: { path: 'user', select: PARTY_USER } })
  .populate({ path: 'booking', select: 'dateKey startTime endTime status serviceRequest customerConfirmed price', populate: { path: 'serviceRequest', select: 'title category serviceArea', populate: { path: 'category', select: 'name' } } })

// load an invoice the caller is allowed to see (customer: own & not draft, provider: own, staff: any)
async function loadAccessible(user, id) {
  if (!mongoose.isValidObjectId(id)) return { status: 404, message: 'Invoice not found' }
  const invoice = await InvoiceModel.findById(id)
  if (!invoice) return { status: 404, message: 'Invoice not found' }
  if (isStaff(user)) return { invoice }
  if (user.role === 'customer') {
    if (!sameId(invoice.customer, user._id) || invoice.status === 'draft') return { status: 404, message: 'Invoice not found' }
    return { invoice }
  }
  const profile = await ProviderProfileModel.findOne({ user: user._id })
  if (!profile || !sameId(invoice.provider, profile._id)) return { status: 403, message: 'You do not have access to this invoice' }
  return { invoice, profile }
}

// list
invoiceApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { status, search } = req.query
    const filter = {}
    if (req.user.role === 'customer') { filter.customer = req.user._id; filter.status = { $ne: 'draft' } }
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      if (!profile) return res.status(200).json({ invoices: [] })
      filter.provider = profile._id
    }
    if (status) filter.status = req.user.role === 'customer' ? { $in: String(status).split(',').filter((s) => s !== 'draft') } : { $in: String(status).split(',') }

    let invoices = await populateInvoice(InvoiceModel.find(filter)).sort({ createdAt: -1 }).limit(500).lean()
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i')
      invoices = invoices.filter((i) => rx.test(i.number) || rx.test(i.customer?.name || '') || rx.test(i.provider?.user?.name || '') || rx.test(i.booking?.serviceRequest?.category?.name || ''))
    }
    res.status(200).json({ invoices })
  } catch (err) { next(err) }
})

// one invoice (full detail for viewing / printing)
invoiceApp.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    const invoice = await populateInvoice(InvoiceModel.findById(found.invoice._id))
    res.status(200).json({ invoice })
  } catch (err) { next(err) }
})

// provider (or operations) drafts an invoice for a job that is finished or nearly so
invoiceApp.post('/', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const { bookingId } = req.body
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Choose a booking' })
    const booking = await BookingModel.findById(bookingId)
    if (!booking) return res.status(404).json({ message: 'Booking not found' })
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      if (!profile || !sameId(booking.provider, profile._id)) return res.status(403).json({ message: 'You can only invoice your own jobs' })
    }
    if (!['inProgress', 'awaitingConfirmation', 'completed'].includes(booking.status)) {
      return res.status(409).json({ message: 'Start the job before creating an invoice' })
    }
    const existing = await InvoiceModel.findOne({ booking: booking._id })
    if (existing) return res.status(409).json({ message: 'This booking already has an invoice', invoice: existing })
    const invoice = await ensureInvoiceForBooking(booking)
    res.status(201).json({ message: 'Invoice drafted', invoice })
  } catch (err) { next(err) }
})

// edit a DRAFT invoice. The accepted-quote line is locked to the agreed price — providers can only add extras.
invoiceApp.put('/:id', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    const invoice = found.invoice
    if (invoice.status !== 'draft') return res.status(409).json({ message: 'Only draft invoices can be edited' })

    const booking = await BookingModel.findById(invoice.booking)
    const extras = (Array.isArray(req.body.lineItems) ? req.body.lineItems : []).slice(1, 11) // first row is the locked quote line
    for (const li of extras) {
      if (!String(li.description || '').trim()) return res.status(400).json({ message: 'Every extra charge needs a description' })
      if (!(Number(li.unitPrice) >= 0) || !(Number(li.quantity || 1) > 0)) return res.status(400).json({ message: 'Extra charges need a valid quantity and price' })
    }
    const base = { description: invoice.lineItems[0]?.description || 'Service — as per accepted quote', quantity: 1, unitPrice: booking.price }
    Object.assign(invoice, computeTotals([base, ...extras], await categoryForBooking(booking)))
    if (req.body.notes !== undefined) invoice.notes = String(req.body.notes).slice(0, 500)
    await invoice.save()
    res.status(200).json({ message: 'Invoice saved', invoice })
  } catch (err) { next(err) }
})

// provider sends the invoice to the customer
invoiceApp.put('/:id/issue', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    const invoice = found.invoice
    if (invoice.status !== 'draft') return res.status(409).json({ message: `This invoice is already ${invoice.status}` })
    const booking = await BookingModel.findById(invoice.booking)
    if (!['awaitingConfirmation', 'completed'].includes(booking.status)) return res.status(409).json({ message: 'Mark the work as finished before issuing the invoice' })

    invoice.status = 'issued'
    invoice.issuedAt = new Date()
    invoice.dueDate = new Date(Date.now() + 7 * 86400000)
    await invoice.save()
    await notify(invoice.customer, { type: 'INVOICE_ISSUED', title: 'You have a new invoice', message: `${invoice.number} — ₹${invoice.total.toLocaleString('en-IN')}`, link: `/invoices/${invoice._id}` })
    res.status(200).json({ message: 'Invoice sent to the customer', invoice })
  } catch (err) { next(err) }
})

// record a payment. NOTE: this is a simulated payment step — there is no payment gateway behind it.
invoiceApp.put('/:id/pay', verifyToken, authorizeRoles('customer', 'provider'), async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    const invoice = found.invoice
    if (invoice.status !== 'issued') return res.status(409).json({ message: invoice.status === 'paid' ? 'This invoice is already paid' : `A ${invoice.status} invoice cannot be paid` })
    const booking = await BookingModel.findById(invoice.booking)
    if (booking.status !== 'completed') return res.status(409).json({ message: 'Confirm the completed work before paying' })

    const method = req.user.role === 'provider' ? 'cash' : req.body.method
    if (!['upi', 'card', 'netbanking', 'cash'].includes(method)) return res.status(400).json({ message: 'Choose a payment method' })
    if (req.user.role === 'customer' && method === 'cash') return res.status(400).json({ message: 'Choose UPI, card or net banking' })

    invoice.status = 'paid'
    invoice.paidAt = new Date()
    invoice.paymentMethod = method
    invoice.paymentReference = `PAY-${Date.now().toString(36).toUpperCase()}`
    await invoice.save()

    const profile = found.profile || (await ProviderProfileModel.findById(invoice.provider))
    if (req.user.role === 'customer') {
      await notify(profile?.user, { type: 'INVOICE_PAID', title: 'Payment received', message: `${invoice.number} — ₹${invoice.total.toLocaleString('en-IN')} via ${method.toUpperCase()}`, link: `/invoices/${invoice._id}` })
    } else {
      await notify(invoice.customer, { type: 'INVOICE_PAID', title: 'Cash payment recorded', message: `${invoice.number} was marked as paid in cash.`, link: `/invoices/${invoice._id}` })
    }
    res.status(200).json({ message: 'Payment recorded', invoice })
  } catch (err) { next(err) }
})

// void an unpaid invoice (provider on their own, or admin / ops)
invoiceApp.put('/:id/void', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    const invoice = found.invoice
    if (!['draft', 'issued'].includes(invoice.status)) return res.status(409).json({ message: `A ${invoice.status} invoice cannot be voided` })
    invoice.status = 'void'
    await invoice.save()
    if (req.user.role !== 'provider') await logAudit(req.user, 'INVOICE_VOIDED', 'Invoice', invoice._id, { number: invoice.number })
    if (invoice.issuedAt) await notify(invoice.customer, { type: 'GENERAL', title: 'An invoice was voided', message: invoice.number, link: `/invoices/${invoice._id}` })
    res.status(200).json({ message: 'Invoice voided', invoice })
  } catch (err) { next(err) }
})

// delete a draft
invoiceApp.delete('/:id', verifyToken, authorizeRoles('provider', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const found = await loadAccessible(req.user, req.params.id)
    if (!found.invoice) return res.status(found.status).json({ message: found.message })
    if (found.invoice.status !== 'draft') return res.status(409).json({ message: 'Only drafts can be deleted — void an issued invoice instead' })
    await found.invoice.deleteOne()
    res.status(200).json({ message: 'Draft deleted' })
  } catch (err) { next(err) }
})
