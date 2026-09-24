import { Schema, model } from 'mongoose'

const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String },
  actorRole: { type: String },
  action: { type: String, required: true }, // e.g. 'PROVIDER_VERIFIED', 'CATEGORY_CREATED'
  targetType: { type: String }, // e.g. 'ProviderProfile', 'ServiceCategory', 'User', 'Dispute'
  targetId: { type: Schema.Types.ObjectId },
  details: { type: Schema.Types.Mixed },
}, { timestamps: true })

auditLogSchema.index({ createdAt: -1 })

export const AuditLogModel = model('AuditLog', auditLogSchema)
