import { Schema, model } from 'mongoose'

const providerProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  skills: [{ type: String }],
  serviceAreas: [{ type: String }],
  experienceYears: { type: Number, default: 0 },
  documents: [{ type: String }], // URLs to verification docs
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  availability: [{
    day: { type: String }, // e.g. 'Monday'
    startTime: { type: String }, // '09:00'
    endTime: { type: String }    // '18:00'
  }],
  bookedSlots: [{
    date: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' }
  }]
}, { timestamps: true })

export const ProviderProfileModel = model('ProviderProfile', providerProfileSchema)
