import { Schema, model } from 'mongoose'

const disputeSchema = new Schema({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'rejected'],
    default: 'open'
  },
  resolutionNotes: { type: String },
  refundAmount: { type: Number, default: 0 },
  handledBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

export const DisputeModel = model('Dispute', disputeSchema)
