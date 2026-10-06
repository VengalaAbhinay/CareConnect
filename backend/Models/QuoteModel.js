import { Schema, model } from 'mongoose'

const quoteSchema = new Schema({
  serviceRequest: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  price: { type: Number, required: true, min: 1 },
  estimatedDuration: { type: String }, // e.g. "2 hours"
  notes: { type: String },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'cancelled'],
    default: 'pending'
  }
}, { timestamps: true })

quoteSchema.index({ serviceRequest: 1, provider: 1 })

export const QuoteModel = model('Quote', quoteSchema)
