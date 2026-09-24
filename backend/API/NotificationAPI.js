import exp from 'express'
import { NotificationModel } from '../Models/NotificationModel.js'
import { verifyToken } from '../middlewares/auth.js'

export const notificationApp = exp.Router()

// list current user's notifications (most recent first)
notificationApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { unreadOnly } = req.query
    const filter = { user: req.user._id }
    if (unreadOnly === 'true') filter.read = false
    const notifications = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(100)
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
    res.status(200).json({ notification })
  } catch (err) { next(err) }
})

notificationApp.put('/read-all', verifyToken, async (req, res, next) => {
  try {
    await NotificationModel.updateMany({ user: req.user._id, read: false }, { read: true })
    res.status(200).json({ message: "All notifications marked as read" })
  } catch (err) { next(err) }
})
