import { Schema, model } from 'mongoose'

const serviceRequestSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true }, // free text, AI-classified
  category: { type: Schema.Types.ObjectId, ref: 'ServiceCategory' },
  requiredSkills: [{ type: String }], // filled by AI classification
  serviceArea: { type: String, required: true },
  preferredDate: { type: Date },
  status: {
    type: String,
    enum: ['open', 'quoted', 'booked', 'cancelled', 'closed'],
    default: 'open'
  }
}, { timestamps: true })

export const ServiceRequestModel = model('ServiceRequest', serviceRequestSchema)
