import exp from 'express'
import mongoose from 'mongoose'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { ReviewModel } from '../Models/ReviewModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { QuoteModel } from '../Models/QuoteModel.js'
import { InvoiceModel } from '../Models/InvoiceModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, notifyRoles, logAudit } from '../services/activityService.js'
import { getDayAvailability } from '../services/availabilityService.js'
import {
  STAFF_ROLES, MANAGER_ROLES, PUBLIC_USER, WEEKDAYS, cleanList, isTime, toMin, isDateKey,
  anyAreaMatches, escapeRegex, todayKey, addDaysKey
} from '../utils/helpers.js'

export const providerApp = exp.Router()

const isStaff = (u) => STAFF_ROLES.includes(u.role)
// what a customer/provider may see of a provider's account: name only (no email / phone)
const userFields = (viewer) => (isStaff(viewer) ? '-password' : PUBLIC_USER)

/* --------------------------- own profile --------------------------- */

// create/update own provider profile
providerApp.post('/profile', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const { headline, bio, skills, serviceAreas, experienceYears, hourlyRate, documents } = req.body
    const set = {}
    if (headline !== undefined) set.headline = String(headline).slice(0, 120)
    if (bio !== undefined) set.bio = String(bio).slice(0, 1000)
    if (skills !== undefined) set.skills = cleanList(skills).map((s) => s.toLowerCase())
    if (serviceAreas !== undefined) set.serviceAreas = cleanList(serviceAreas)
    if (documents !== undefined) set.documents = cleanList(documents)
    if (experienceYears !== undefined) {
      const y = Number(experienceYears)
      if (!Number.isFinite(y) || y < 0 || y > 60) return res.status(400).json({ message: 'Experience must be between 0 and 60 years' })
      set.experienceYears = y
    }
    if (hourlyRate !== undefined) {
      const r = Number(hourlyRate)
      if (!Number.isFinite(r) || r < 0) return res.status(400).json({ message: 'Hourly rate cannot be negative' })
      set.hourlyRate = r
    }

    const existing = await ProviderProfileModel.findOne({ user: req.user._id })
    // a rejected provider who updates their profile is resubmitting for verification
    const resubmitting = existing?.verificationStatus === 'rejected'
    if (resubmitting) { set.verificationStatus = 'pending'; set.verificationNote = '' }

    const profile = await ProviderProfileModel.findOneAndUpdate(
      { user: req.user._id }, { $set: set, $setOnInsert: { user: req.user._id } }, { new: true, upsert: true, runValidators: true }
    )
    if (!existing || resubmitting) {
      await notifyRoles(MANAGER_ROLES, {
        type: 'VERIFICATION_SUBMITTED',
        title: resubmitting ? 'Provider resubmitted for verification' : 'New provider awaiting verification',
        message: `${req.user.name} ${resubmitting ? 'updated their profile after a rejection' : 'created a provider profile'}.`,
        link: '/providers',
      })
    }
    res.status(200).json({ message: 'Profile saved', profile })
  } catch (err) { next(err) }
})

// get own profile
providerApp.get('/profile/me', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id }).populate('user', '-password')
    res.status(200).json({ profile })
  } catch (err) { next(err) }
})

// dashboard numbers for the signed-in provider
providerApp.get('/stats/me', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!profile) return res.status(200).json({ stats: null })
    const [bookings, quotes, invoices] = await Promise.all([
      BookingModel.find({ provider: profile._id }).select('status dateKey price startTime endTime'),
      QuoteModel.find({ provider: profile._id }).select('status'),
      InvoiceModel.find({ provider: profile._id }).select('status providerPayout paidAt refundedAmount subtotal'),
    ])
    const today = todayKey()
    const monthStart = `${today.slice(0, 7)}-01`
    const paid = invoices.filter((i) => ['paid', 'partiallyRefunded'].includes(i.status))
    const decided = quotes.filter((q) => ['accepted', 'rejected'].includes(q.status)).length
    res.status(200).json({
      stats: {
        rating: profile.rating, ratingCount: profile.ratingCount,
        upcoming: bookings.filter((b) => b.status === 'scheduled' && b.dateKey >= today).length,
        today: bookings.filter((b) => ['scheduled', 'inProgress'].includes(b.status) && b.dateKey === today).length,
        inProgress: bookings.filter((b) => ['inProgress', 'awaitingConfirmation'].includes(b.status)).length,
        completed: bookings.filter((b) => b.status === 'completed').length,
        pendingQuotes: quotes.filter((q) => q.status === 'pending').length,
        acceptanceRate: decided ? Math.round((quotes.filter((q) => q.status === 'accepted').length / decided) * 100) : null,
        earningsMonth: paid.filter((i) => i.paidAt && i.paidAt.toISOString().slice(0, 7) === today.slice(0, 7)).reduce((n, i) => n + i.providerPayout, 0),
        earningsTotal: paid.reduce((n, i) => n + i.providerPayout, 0),
        awaitingPayment: invoices.filter((i) => i.status === 'issued').reduce((n, i) => n + i.subtotal, 0),
        draftInvoices: invoices.filter((i) => i.status === 'draft').length,
        monthStart,
      },
    })
  } catch (err) { next(err) }
})

/* ------------------- weekly availability (own) ------------------- */

function validateSlot({ day, startTime, endTime }, others = []) {
  if (!WEEKDAYS.includes(day)) return 'Choose a valid day of the week'
  if (!isTime(startTime) || !isTime(endTime)) return 'Choose a valid start and end time'
  if (toMin(endTime) <= toMin(startTime)) return 'End time must be after the start time'
  if (toMin(endTime) - toMin(startTime) < 30) return 'A working window must be at least 30 minutes'
  const clash = others.find((o) => o.day === day && toMin(startTime) < toMin(o.endTime) && toMin(endTime) > toMin(o.startTime))
  if (clash) return `Overlaps your existing ${day} window (${clash.startTime}–${clash.endTime})`
  return null
}

// availability: add a slot
providerApp.post('/availability', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const { day, startTime, endTime } = req.body
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!profile) return res.status(400).json({ message: 'Save your provider profile first' })
    const bad = validateSlot({ day, startTime, endTime }, profile.availability)
    if (bad) return res.status(400).json({ message: bad })
    profile.availability.push({ day, startTime, endTime })
    await profile.save()
    res.status(200).json({ message: 'Availability added', profile })
  } catch (err) { next(err) }
})

// availability: update a slot by its id
providerApp.put('/availability/:slotId', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    const slot = profile?.availability.id(req.params.slotId)
    if (!slot) return res.status(404).json({ message: 'Availability slot not found' })
    const next_ = { day: req.body.day ?? slot.day, startTime: req.body.startTime ?? slot.startTime, endTime: req.body.endTime ?? slot.endTime }
    const bad = validateSlot(next_, profile.availability.filter((s) => String(s._id) !== req.params.slotId))
    if (bad) return res.status(400).json({ message: bad })
    Object.assign(slot, next_)
    await profile.save()
    res.status(200).json({ message: 'Availability updated', profile })
  } catch (err) { next(err) }
})

// availability: remove a slot by its id
providerApp.delete('/availability/:slotId', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    const slot = profile.availability.id(req.params.slotId)
    if (!slot) return res.status(404).json({ message: 'Availability slot not found' })
    slot.deleteOne()
    await profile.save()
    res.status(200).json({ message: 'Availability removed', profile })
  } catch (err) { next(err) }
})

/* --------------------------- directory --------------------------- */

// list providers with search/filters.
// Customers & providers only ever see VERIFIED providers (name only, no contact details).
// Staff see everything, filterable by verification status.
providerApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { serviceArea, skill, verificationStatus, search, minRating, sort } = req.query
    const filter = {}
    if (isStaff(req.user)) {
      if (verificationStatus) filter.verificationStatus = verificationStatus
    } else {
      filter.verificationStatus = 'verified'
    }
    if (skill) filter.skills = new RegExp(`^${escapeRegex(skill)}$`, 'i')
    if (minRating) filter.rating = { $gte: Number(minRating) || 0 }

    let providers = await ProviderProfileModel.find(filter).populate('user', userFields(req.user))
    if (serviceArea) providers = providers.filter((p) => anyAreaMatches(p.serviceAreas, serviceArea))
    if (search) {
      const q = String(search).toLowerCase()
      providers = providers.filter((p) =>
        p.user?.name?.toLowerCase().includes(q) ||
        p.headline?.toLowerCase().includes(q) ||
        p.skills.some((s) => s.toLowerCase().includes(q)) ||
        p.serviceAreas.some((a) => a.toLowerCase().includes(q))
      )
    }
    const sorters = {
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      experience: (a, b) => b.experienceYears - a.experienceYears,
      reviews: (a, b) => b.ratingCount - a.ratingCount,
      price: (a, b) => (a.hourlyRate || Infinity) - (b.hourlyRate || Infinity),
    }
    providers.sort(sorters[sort] || sorters.rating)
    res.status(200).json({ providers })
  } catch (err) { next(err) }
})

// single provider profile — verified profiles are public to signed-in users; unverified only to the owner / staff
providerApp.get('/:id', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Provider not found' })
    const profile = await ProviderProfileModel.findById(req.params.id).populate('user', userFields(req.user))
    if (!profile) return res.status(404).json({ message: 'Provider not found' })
    const isOwner = req.user.role === 'provider' && String(profile.user?._id) === req.user._id
    if (profile.verificationStatus !== 'verified' && !isOwner && !isStaff(req.user)) {
      return res.status(404).json({ message: 'Provider not found' })
    }
    res.status(200).json({ profile })
  } catch (err) { next(err) }
})

// reviews about a provider (customer surnames are shortened for privacy)
providerApp.get('/:id/reviews', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Provider not found' })
    const reviews = await ReviewModel.find({ provider: req.params.id })
      .populate('customer', 'name').populate({ path: 'booking', select: 'serviceRequest', populate: { path: 'serviceRequest', select: 'category', populate: { path: 'category', select: 'name' } } })
      .sort({ createdAt: -1 }).limit(100)
    const short = (n = '') => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || 'Customer' }
    res.status(200).json({
      reviews: reviews.map((r) => ({
        _id: r._id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, editedAt: r.editedAt,
        providerReply: r.providerReply?.text ? r.providerReply : null,
        customerName: short(r.customer?.name), booking: r.booking?._id, category: r.booking?.serviceRequest?.category?.name,
      })),
    })
  } catch (err) { next(err) }
})

// what can be booked on a given day (working windows minus already-booked time)
providerApp.get('/:id/availability', verifyToken, async (req, res, next) => {
  try {
    const { date, days } = req.query
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Provider not found' })
    const profile = await ProviderProfileModel.findById(req.params.id)
    if (!profile) return res.status(404).json({ message: 'Provider not found' })
    if (days) { // a compact overview for the next N days (calendar strip in the booking dialog)
      const n = Math.min(Number(days) || 7, 21)
      const start = isDateKey(date) ? date : todayKey()
      const out = []
      for (let i = 0; i < n; i++) {
        const d = await getDayAvailability(profile, addDaysKey(start, i))
        out.push({ dateKey: d.dateKey, weekday: d.weekday, freeMinutes: d.freeMinutes, free: d.free })
      }
      return res.status(200).json({ days: out })
    }
    if (!isDateKey(date)) return res.status(400).json({ message: 'Provide ?date=YYYY-MM-DD' })
    res.status(200).json(await getDayAvailability(profile, date))
  } catch (err) { next(err) }
})

// admin / ops: verify / reject a provider
providerApp.put('/:id/verify', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const { verificationStatus, note } = req.body // 'verified' | 'rejected'
    if (!['verified', 'rejected', 'pending'].includes(verificationStatus)) {
      return res.status(400).json({ message: 'verificationStatus must be verified, rejected or pending' })
    }
    if (verificationStatus === 'rejected' && !note?.trim()) {
      return res.status(400).json({ message: 'Please tell the provider why their profile was rejected' })
    }
    const update = { verificationStatus, verificationNote: verificationStatus === 'rejected' ? note.trim() : '' }
    if (verificationStatus === 'verified') update.verifiedAt = new Date()
    const profile = await ProviderProfileModel.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('user', '-password')
    if (!profile) return res.status(404).json({ message: 'Provider not found' })

    await logAudit(req.user, `PROVIDER_${verificationStatus.toUpperCase()}`, 'ProviderProfile', profile._id, {
      providerName: profile.user?.name, note: note || undefined,
    })
    await notify(profile.user?._id, {
      type: verificationStatus === 'verified' ? 'PROVIDER_VERIFIED' : 'PROVIDER_REJECTED',
      title: verificationStatus === 'verified' ? 'You are verified!' : 'Verification update',
      message: verificationStatus === 'verified'
        ? 'Your provider profile has been verified. You can now submit quotes.'
        : `Your provider profile was not approved: ${note}`,
      link: '/profile',
    })
    res.status(200).json({ message: 'Verification updated', profile })
  } catch (err) { next(err) }
})
