import { Schema, model } from 'mongoose'

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'REQUEST_CLASSIFIED', 'REQUEST_UPDATED', 'REQUEST_CANCELLED', 'PROVIDER_INVITED',
      'QUOTE_RECEIVED', 'QUOTE_UPDATED', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'QUOTE_WITHDRAWN',
      'BOOKING_CREATED', 'BOOKING_STATUS_UPDATED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED',
      'BOOKING_RESCHEDULED', 'BOOKING_REASSIGNED', 'COMPLETION_REQUESTED', 'COMPLETION_REJECTED',
      'INVOICE_ISSUED', 'INVOICE_PAID', 'INVOICE_REFUNDED',
      'REVIEW_RECEIVED', 'REVIEW_REPLY',
      'DISPUTE_RAISED', 'DISPUTE_UPDATED', 'CASE_MESSAGE', 'CASE_ESCALATED', 'CASE_ASSIGNED',
      'PROVIDER_VERIFIED', 'PROVIDER_REJECTED', 'VERIFICATION_SUBMITTED', 'GENERAL'
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
