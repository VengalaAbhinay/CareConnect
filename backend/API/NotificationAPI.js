import exp from 'express'
import { NotificationModel } from '../Models/NotificationModel.js'
import { verifyToken } from '../middlewares/auth.js'

export const notificationApp = exp.Router()

// list current user's notifications (most recent first)
notificationApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { unreadOnly, type, limit = 100 } = req.query
    const filter = { user: req.user._id }
    if (unreadOnly === 'true') filter.read = false
    if (type) filter.type = type
    const notifications = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(Math.min(200, Number(limit) || 100))
    const unreadCount = await NotificationModel.countDocuments({ user: req.user._id, read: false })
    res.status(200).json({ notifications, unreadCount })
  } catch (err) { next(err) }
})

notificationApp.put('/:id/read', verifyToken, async (req, res, next) => {
  try {
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    )
    if (!notification) return res.status(404).json({ message: 'Notification not found' })
    res.status(200).json({ notification })
  } catch (err) { next(err) }
})

notificationApp.put('/read-all', verifyToken, async (req, res, next) => {
  try {
    await NotificationModel.updateMany({ user: req.user._id, read: false }, { read: true })
    res.status(200).json({ message: "All notifications marked as read" })
  } catch (err) { next(err) }
})

// tidy up: remove already-read notifications older than 30 days
notificationApp.delete('/read', verifyToken, async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await NotificationModel.deleteMany({ user: req.user._id, read: true, createdAt: { $lt: cutoff } })
    res.status(200).json({ message: 'Old notifications cleared', deleted: result.deletedCount })
  } catch (err) { next(err) }
})
