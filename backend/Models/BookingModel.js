import { Schema, model } from 'mongoose'

const jobEventSchema = new Schema({
  status: { type: String },
  kind: { type: String, enum: ['status', 'note', 'evidence', 'system'], default: 'status' },
  note: { type: String },
  attachments: [{ type: String }],
  by: { type: Schema.Types.ObjectId, ref: 'User' },
  byName: { type: String },
  byRole: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false })

const bookingSchema = new Schema({
  serviceRequest: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
  quote: { type: Schema.Types.ObjectId, ref: 'Quote', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  scheduledDate: { type: Date, required: true }, // UTC midnight of dateKey
  dateKey: { type: String, required: true },     // 'YYYY-MM-DD' (timezone-proof calendar day)
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  price: { type: Number, required: true },
  status: {
    type: String,
    // scheduled -> inProgress -> awaitingConfirmation -> completed, or cancelled / disputed at the side
    enum: ['scheduled', 'inProgress', 'awaitingConfirmation', 'completed', 'cancelled', 'disputed'],
    default: 'scheduled'
  },
  statusBeforeDispute: { type: String },
  jobTimeline: [jobEventSchema],
  beforeEvidence: [{ type: String }],
  afterEvidence: [{ type: String }],
  customerConfirmed: { type: Boolean, default: false },
  completedAt: { type: Date },
  rescheduleCount: { type: Number, default: 0 },
  cancellation: {
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String },
    reason: { type: String },
    at: { type: Date }
  }
}, { timestamps: true })

bookingSchema.index({ customer: 1, scheduledDate: -1 })
bookingSchema.index({ provider: 1, dateKey: 1 })
bookingSchema.index({ status: 1 })

export const BookingModel = model('Booking', bookingSchema)
