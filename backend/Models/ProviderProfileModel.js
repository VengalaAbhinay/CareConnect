import { Schema, model } from 'mongoose'

const providerProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  headline: { type: String, trim: true, maxlength: 120 },
  bio: { type: String, trim: true, maxlength: 1000 },
  skills: [{ type: String }],
  serviceAreas: [{ type: String }],
  experienceYears: { type: Number, default: 0, min: 0 },
  hourlyRate: { type: Number, default: 0, min: 0 }, // indicative pricing shown on the profile
  documents: [{ type: String }], // uploaded verification documents (paths or URLs)
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verificationNote: { type: String }, // reason shown to the provider when rejected
  verifiedAt: { type: Date },
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  // weekly working windows. Actual bookings are tracked in SlotLock (unique index),
  // which is what makes double-booking impossible.
  availability: [{
    day: { type: String, enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
    startTime: { type: String }, // '09:00'
    endTime: { type: String }    // '18:00'
  }]
}, { timestamps: true })

providerProfileSchema.index({ verificationStatus: 1, rating: -1 })

export const ProviderProfileModel = model('ProviderProfile', providerProfileSchema)
