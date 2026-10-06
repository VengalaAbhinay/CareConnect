import { Schema, model } from 'mongoose'

const serviceRequestSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true }, // free text, AI-classified
  category: { type: Schema.Types.ObjectId, ref: 'ServiceCategory' },
  requiredSkills: [{ type: String }], // filled by AI classification
  serviceArea: { type: String, required: true, trim: true },
  address: { type: String, trim: true }, // exact visit address (only shared with booked provider)
  preferredDate: { type: Date },
  urgency: { type: String, enum: ['flexible', 'normal', 'urgent'], default: 'normal' },
  budget: { type: Number, min: 0 },
  // providers a customer invited, or that operations assigned, to quote
  invitedProviders: [{
    provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile' },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String },
    at: { type: Date, default: Date.now },
    _id: false
  }],
  status: {
    type: String,
    enum: ['open', 'quoted', 'booked', 'cancelled', 'closed'],
    default: 'open'
  },
  cancelReason: { type: String }
}, { timestamps: true })

serviceRequestSchema.index({ customer: 1, createdAt: -1 })
serviceRequestSchema.index({ status: 1, serviceArea: 1 })

export const ServiceRequestModel = model('ServiceRequest', serviceRequestSchema)
