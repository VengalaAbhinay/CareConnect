import { Schema, model } from 'mongoose'

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'REQUEST_CLASSIFIED', 'QUOTE_RECEIVED', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED',
      'BOOKING_CREATED', 'BOOKING_STATUS_UPDATED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED',
      'REVIEW_RECEIVED', 'DISPUTE_RAISED', 'DISPUTE_UPDATED', 'PROVIDER_VERIFIED',
      'PROVIDER_REJECTED', 'GENERAL'
    ],
    default: 'GENERAL'
  },
  title: { type: String, required: true },
  message: { type: String },
  link: { type: String }, // frontend route hint, e.g. '/bookings/<id>'
  read: { type: Boolean, default: false },
}, { timestamps: true })

notificationSchema.index({ user: 1, read: 1, createdAt: -1 })

export const NotificationModel = model('Notification', notificationSchema)
