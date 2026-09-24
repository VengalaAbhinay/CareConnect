import { Schema, model } from 'mongoose'

const reviewSchema = new Schema({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String }
}, { timestamps: true })

export const ReviewModel = model('Review', reviewSchema)
