import { InvoiceModel } from '../Models/InvoiceModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { computeTotals } from './pricingService.js'

const invoiceNumber = () => {
  const d = new Date()
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return `INV-${ym}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

// Create a draft invoice for a booking (one per booking). The first line is the accepted quote.
export async function ensureInvoiceForBooking(booking, extraItems = []) {
  const existing = await InvoiceModel.findOne({ booking: booking._id })
  if (existing) return existing
  const request = await ServiceRequestModel.findById(booking.serviceRequest).populate('category')
  const items = [
    { description: `${request?.category?.name || 'Service'} — as per accepted quote`, quantity: 1, unitPrice: booking.price },
    ...extraItems,
  ]
  const totals = computeTotals(items, request?.category)
  return InvoiceModel.create({
    number: invoiceNumber(), booking: booking._id, customer: booking.customer, provider: booking.provider, ...totals,
  })
}

// The pricing policy (fee / tax) that applies to a booking is its category's.
export async function categoryForBooking(booking) {
  const request = await ServiceRequestModel.findById(booking.serviceRequest).populate('category')
  return request?.category || null
}
