import exp from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { UserModel } from '../Models/UserModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { DisputeModel } from '../Models/DisputeModel.js'
import { InvoiceModel } from '../Models/InvoiceModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { AuditLogModel } from '../Models/AuditLogModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'
import { STAFF_ROLES, MANAGER_ROLES, escapeRegex, money } from '../utils/helpers.js'

export const adminApp = exp.Router()

const EMAIL_RE = /^\S+@\S+\.\S+$/
const findByEmail = (email) => UserModel.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */

// list users: search + role/active filters + pagination
adminApp.get('/users', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const { role, search, isActive, page = 1, limit = 25 } = req.query
    const filter = {}
    if (role) filter.role = role
    if (isActive !== undefined) filter.isActive = isActive === 'true'
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i')
      filter.$or = [{ name: re }, { email: re }, { phone: re }]
    }
    const p = Math.max(1, Number(page) || 1)
    const l = Math.min(100, Math.max(1, Number(limit) || 25))

    const [users, total] = await Promise.all([
      UserModel.find(filter).select('-password').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
      UserModel.countDocuments(filter),
    ])
    res.status(200).json({ users, total, page: p, pages: Math.max(1, Math.ceil(total / l)) })
  } catch (err) { next(err) }
})

// admin creates a staff account (admin / operationsManager / supportAgent).
// Only a full admin may mint another admin; ops managers may create support agents.
adminApp.post('/users', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const { name, email, role, phone } = req.body
    if (!name?.trim()) return res.status(400).json({ message: 'Full name is required' })
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ message: 'Enter a valid email address' })
    if (!STAFF_ROLES.includes(role)) return res.status(400).json({ message: 'Role must be admin, operationsManager or supportAgent' })
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only an admin can create another admin account' })
    }
    if (await findByEmail(email.trim())) return res.status(409).json({ message: 'Email already registered' })

    // temp password: staff member resets it via "change password" after first login
    const tempPassword = crypto.randomBytes(6).toString('base64url')
    const user = await UserModel.create({
      name: name.trim(), email: email.trim(), phone,
      role, password: await bcrypt.hash(tempPassword, 10),
    })

    await logAudit(req.user, 'STAFF_CREATED', 'User', user._id, { role })
    await notify(user._id, {
      type: 'GENERAL',
      title: 'Your CareConnect staff account was created',
      message: `You were added as ${role}. Sign in with your email and the temporary password shared with you, then change it.`,
      link: '/login',
    })

    const { password: _pw, ...safeUser } = user.toObject()
    res.status(201).json({ message: 'Staff account created', user: safeUser, tempPassword })
  } catch (err) { next(err) }
})

// change a user's role or active status
adminApp.put('/users/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id) && req.body.isActive === false) {
      return res.status(400).json({ message: "You can't deactivate your own account" })
    }
    const { role, isActive, name, phone } = req.body
    const update = {}
    if (role !== undefined) update.role = role
    if (isActive !== undefined) update.isActive = isActive
    if (name !== undefined) update.name = String(name).trim()
    if (phone !== undefined) update.phone = String(phone).trim()

    const user = await UserModel.findByIdAndUpdate(
      req.params.id, update, { new: true, runValidators: true }
    ).select('-password')
    if (!user) return res.status(404).json({ message: "User not found" })

    await logAudit(req.user, 'USER_UPDATED', 'User', user._id, update)
    if (role !== undefined || isActive !== undefined) {
      await notify(user._id, {
        type: 'GENERAL',
        title: 'Your account was updated',
        message: role ? `Your role is now "${role}"` : (isActive === false ? 'Your account was deactivated' : 'Your account was reactivated'),
        link: '/dashboard',
      })
    }

    res.status(200).json({ message: "User updated", user })
  } catch (err) { next(err) }
})

/* ------------------------------------------------------------------ */
/* analytics                                                           */
/* ------------------------------------------------------------------ */

adminApp.get('/analytics/overview', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const [
      totalUsers, totalBookings, activeDisputes, unassignedCases, escalatedCases, completedBookings,
      totalProviders, verifiedProviders, pendingVerifications, openRequests, bookingsByStatus,
      paidRevenueAgg, pendingInvoicesAgg, refundedAgg
    ] = await Promise.all([
      UserModel.countDocuments(),
      BookingModel.countDocuments(),
      DisputeModel.countDocuments({ status: { $in: ['open', 'investigating', 'escalated'] } }),
      DisputeModel.countDocuments({ status: { $in: ['open', 'investigating'] }, assignedTo: null }),
      DisputeModel.countDocuments({ status: 'escalated' }),
      BookingModel.countDocuments({ status: 'completed' }),
      ProviderProfileModel.countDocuments(),
      ProviderProfileModel.countDocuments({ verificationStatus: 'verified' }),
      ProviderProfileModel.countDocuments({ verificationStatus: 'pending' }),
      ServiceRequestModel.countDocuments({ status: 'open' }),
      BookingModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      InvoiceModel.aggregate([
        { $match: { status: { $in: ['paid', 'partiallyRefunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' }, platformFee: { $sum: '$platformFee' }, payout: { $sum: '$providerPayout' } } }
      ]),
      InvoiceModel.aggregate([
        { $match: { status: 'issued' } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]),
      InvoiceModel.aggregate([
        { $group: { _id: null, total: { $sum: '$refundedAmount' } } }
      ]),
    ])

    res.status(200).json({
      totalUsers, totalBookings, activeDisputes, unassignedCases, escalatedCases, completedBookings,
      totalProviders, verifiedProviders, pendingVerifications, openRequests,
      bookingsByStatus: Object.fromEntries(bookingsByStatus.map(b => [b._id, b.count])),
      totalRevenue: money(paidRevenueAgg[0]?.total || 0),
      platformFeeRevenue: money(paidRevenueAgg[0]?.platformFee || 0),
      providerPayouts: money(paidRevenueAgg[0]?.payout || 0),
      pendingInvoiceTotal: money(pendingInvoicesAgg[0]?.total || 0),
      pendingInvoiceCount: pendingInvoicesAgg[0]?.count || 0,
      totalRefunded: money(refundedAgg[0]?.total || 0),
    })
  } catch (err) { next(err) }
})

// paid revenue for the last N months (default 6), bucketed by calendar month
adminApp.get('/analytics/revenue-trend', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6))
    const since = new Date()
    since.setUTCDate(1)
    since.setUTCMonth(since.getUTCMonth() - (months - 1))
    since.setUTCHours(0, 0, 0, 0)

    const rows = await InvoiceModel.find(
      { status: { $in: ['paid', 'partiallyRefunded'] }, paidAt: { $gte: since } },
      { paidAt: 1, total: 1, platformFee: 1 }
    ).lean()

    // bucket in JS rather than via $year/$month — keeps this portable across
    // Mongo-compatible backends that don't implement those aggregation operators
    const buckets = new Map()
    for (const row of rows) {
      const d = new Date(row.paidAt)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const bucket = buckets.get(key) || { revenue: 0, platformFee: 0, bookings: 0 }
      bucket.revenue += row.total || 0
      bucket.platformFee += row.platformFee || 0
      bucket.bookings += 1
      buckets.set(key, bucket)
    }

    // fill in months with zero revenue so the chart has no gaps
    const trend = []
    const cursor = new Date(since)
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
      const row = buckets.get(key)
      trend.push({
        month: key,
        revenue: money(row?.revenue || 0),
        platformFee: money(row?.platformFee || 0),
        bookings: row?.bookings || 0,
      })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    res.status(200).json({ trend })
  } catch (err) { next(err) }
})

// leaderboard of providers by completed jobs / rating / earnings
adminApp.get('/analytics/top-providers', verifyToken, authorizeRoles(...STAFF_ROLES), async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const [byJobs, earningsAgg] = await Promise.all([
      ProviderProfileModel.find({ verificationStatus: 'verified' })
        .sort({ completedJobs: -1, rating: -1 })
        .limit(limit)
        .populate('user', 'name email'),
      InvoiceModel.aggregate([
        { $match: { status: { $in: ['paid', 'partiallyRefunded'] } } },
        { $group: { _id: '$provider', payout: { $sum: '$providerPayout' }, jobs: { $sum: 1 } } },
        { $sort: { payout: -1 } },
        { $limit: limit },
      ]),
    ])
    const payoutById = new Map(earningsAgg.map(e => [String(e._id), e.payout]))

    res.status(200).json({
      byJobs: byJobs.map(p => ({
        providerId: p._id, name: p.user?.name, email: p.user?.email,
        completedJobs: p.completedJobs, rating: p.rating, ratingCount: p.ratingCount,
        earnings: money(payoutById.get(String(p._id)) || 0),
      })),
      byEarnings: earningsAgg.map(e => ({ providerId: e._id, earnings: money(e.payout), jobs: e.jobs })),
    })
  } catch (err) { next(err) }
})

// audit trail
adminApp.get('/audit-logs', verifyToken, authorizeRoles(...MANAGER_ROLES), async (req, res, next) => {
  try {
    const { action, targetType, actor, limit = 200 } = req.query
    const filter = {}
    if (action) filter.action = action
    if (targetType) filter.targetType = targetType
    if (actor) filter.actor = actor
    const logs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(Math.min(500, Number(limit) || 200))
    res.status(200).json({ logs })
  } catch (err) { next(err) }
})
