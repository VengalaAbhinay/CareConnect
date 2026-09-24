import exp from 'express'
import { UserModel } from '../Models/UserModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { DisputeModel } from '../Models/DisputeModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { AuditLogModel } from '../Models/AuditLogModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'

export const adminApp = exp.Router()

// list all users, with search + role filter
adminApp.get('/users', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const { role, search, isActive } = req.query
    const filter = {}
    if (role) filter.role = role
    if (isActive !== undefined) filter.isActive = isActive === 'true'
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }
    const users = await UserModel.find(filter).select('-password').sort({ createdAt: -1 })
    res.status(200).json({ users })
  } catch (err) { next(err) }
})

// change a user's role or active status
adminApp.put('/users/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { role, isActive } = req.body
    const update = {}
    if (role !== undefined) update.role = role
    if (isActive !== undefined) update.isActive = isActive

    const user = await UserModel.findByIdAndUpdate(
      req.params.id, update, { new: true }
    ).select('-password')
    if (!user) return res.status(404).json({ message: "User not found" })

    await logAudit(req.user, 'USER_UPDATED', 'User', user._id, update)
    await notify(user._id, {
      type: 'GENERAL',
      title: 'Your account was updated',
      message: role ? `Your role is now "${role}"` : (isActive === false ? 'Your account was deactivated' : 'Your account was reactivated'),
      link: '/dashboard',
    })

    res.status(200).json({ message: "User updated", user })
  } catch (err) { next(err) }
})

// basic + extended analytics
adminApp.get('/analytics/overview', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const [
      totalUsers, totalBookings, activeDisputes, completedBookings,
      totalProviders, verifiedProviders, openRequests, bookingsByStatus, revenueAgg
    ] = await Promise.all([
      UserModel.countDocuments(),
      BookingModel.countDocuments(),
      DisputeModel.countDocuments({ status: { $in: ['open', 'investigating'] } }),
      BookingModel.countDocuments({ status: 'completed' }),
      ProviderProfileModel.countDocuments(),
      ProviderProfileModel.countDocuments({ verificationStatus: 'verified' }),
      ServiceRequestModel.countDocuments({ status: 'open' }),
      BookingModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      BookingModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ])
    ])

    res.status(200).json({
      totalUsers, totalBookings, activeDisputes, completedBookings,
      totalProviders, verifiedProviders, openRequests,
      bookingsByStatus: Object.fromEntries(bookingsByStatus.map(b => [b._id, b.count])),
      totalRevenue: revenueAgg[0]?.total || 0,
    })
  } catch (err) { next(err) }
})

// audit trail
adminApp.get('/audit-logs', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const { action, targetType } = req.query
    const filter = {}
    if (action) filter.action = action
    if (targetType) filter.targetType = targetType
    const logs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(200)
    res.status(200).json({ logs })
  } catch (err) { next(err) }
})
