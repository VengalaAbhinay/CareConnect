import { NotificationModel } from '../Models/NotificationModel.js'
import { AuditLogModel } from '../Models/AuditLogModel.js'

// Create a notification for a user. Never throws — a notification failure
// should never break the primary request/booking/dispute flow.
export async function notify(userId, { type = 'GENERAL', title, message = '', link = '' }) {
  if (!userId) return
  try {
    await NotificationModel.create({ user: userId, type, title, message, link })
  } catch (err) {
    console.error('notify() failed:', err.message)
  }
}

// Record an admin/operations action for the audit trail. Never throws.
export async function logAudit(actorUser, action, targetType, targetId, details = {}) {
  try {
    await AuditLogModel.create({
      actor: actorUser._id,
      actorName: actorUser.name,
      actorRole: actorUser.role,
      action,
      targetType,
      targetId,
      details,
    })
  } catch (err) {
    console.error('logAudit() failed:', err.message)
  }
}
