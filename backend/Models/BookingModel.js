import { Schema, model } from 'mongoose'

const jobEventSchema = new Schema({
  status: { type: String },
  note: { type: String },
  attachments: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
}, { _id: false })

const bookingSchema = new Schema({
  serviceRequest: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
  quote: { type: Schema.Types.ObjectId, ref: 'Quote', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  scheduledDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  price: { type: Number, required: true },
  status: {
    type: String,
    enum: ['scheduled', 'inProgress', 'completed', 'cancelled', 'disputed'],
    default: 'scheduled'
  },
  jobTimeline: [jobEventSchema],
  beforeEvidence: [{ type: String }],
  afterEvidence: [{ type: String }],
  customerConfirmed: { type: Boolean, default: false },
  invoice: {
    amount: { type: Number },
    issuedAt: { type: Date },
    paid: { type: Boolean, default: false }
  }
}, { timestamps: true })

export const BookingModel = model('Booking', bookingSchema)
