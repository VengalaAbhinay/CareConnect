import { Schema, model } from 'mongoose'

// "Support case": a dispute on a booking, a complaint, or a refund request.
// (Model name kept as 'Dispute' so existing collections keep working.)
const messageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  senderName: { type: String },
  senderRole: { type: String },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  attachments: [{ type: String }],
  internal: { type: Boolean, default: false }, // staff-only note, hidden from customers/providers
  createdAt: { type: Date, default: Date.now }
}, { _id: false })

const disputeSchema = new Schema({
  type: { type: String, enum: ['dispute', 'complaint', 'refund'], default: 'dispute' },
  subject: { type: String, trim: true, maxlength: 140 },
  booking: { type: Schema.Types.ObjectId, ref: 'Booking' }, // optional for general complaints
  raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  raisedByRole: { type: String },
  reason: { type: String, required: true, trim: true, maxlength: 3000 },
  attachments: [{ type: String }],
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: {
    type: String,
    enum: ['open', 'investigating', 'escalated', 'resolved', 'rejected'],
    default: 'open'
  },
  messages: [messageSchema],
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  escalatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  escalatedAt: { type: Date },
  escalationNote: { type: String },
  resolutionNotes: { type: String },
  refundAmount: { type: Number, default: 0 },
  refundProcessedAt: { type: Date }, // set once the refund has been applied to the invoice (never applied twice)
  handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date }
}, { timestamps: true })

disputeSchema.index({ status: 1, createdAt: -1 })
disputeSchema.index({ booking: 1 })
disputeSchema.index({ raisedBy: 1, createdAt: -1 })

export const DisputeModel = model('Dispute', disputeSchema)
