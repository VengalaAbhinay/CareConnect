import { Schema, model } from 'mongoose'

const quoteSchema = new Schema({
  serviceRequest: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  price: { type: Number, required: true },
  estimatedDuration: { type: String }, // e.g. "2 hours"
  notes: { type: String },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true })

export const QuoteModel = model('Quote', quoteSchema)
