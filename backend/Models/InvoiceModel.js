import { Schema, model } from 'mongoose'

const lineItemSchema = new Schema({
  description: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false })

const invoiceSchema = new Schema({
  number: { type: String, required: true, unique: true },
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  lineItems: [lineItemSchema],
  subtotal: { type: Number, default: 0 },
  taxPercent: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },           // what the customer pays (subtotal + tax)
  platformFeePercent: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },     // CareConnect commission, taken from the provider
  providerPayout: { type: Number, default: 0 },  // subtotal - platformFee
  status: {
    type: String,
    enum: ['draft', 'issued', 'paid', 'void', 'partiallyRefunded', 'refunded'],
    default: 'draft'
  },
  notes: { type: String },
  issuedAt: { type: Date },
  dueDate: { type: Date },
  paidAt: { type: Date },
  paymentMethod: { type: String, enum: ['upi', 'card', 'netbanking', 'cash'] },
  paymentReference: { type: String },
  refundedAmount: { type: Number, default: 0 },
  refunds: [{
    amount: Number,
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    caseId: { type: Schema.Types.ObjectId, ref: 'Dispute' },
    note: String,
    _id: false
  }]
}, { timestamps: true })

invoiceSchema.index({ customer: 1, createdAt: -1 })
invoiceSchema.index({ provider: 1, createdAt: -1 })

export const InvoiceModel = model('Invoice', invoiceSchema)
