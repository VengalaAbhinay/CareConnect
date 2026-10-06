import exp from 'express'
import mongoose from 'mongoose'
import { ServiceCategoryModel } from '../Models/ServiceCategoryModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { QuoteModel } from '../Models/QuoteModel.js'
import { BookingModel } from '../Models/BookingModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { classifyRequest, rankProviders } from '../services/aiService.js'
import { checkQuotePrice } from '../services/pricingService.js'
import { notify, logAudit } from '../services/activityService.js'
import {
  STAFF_ROLES, MANAGER_ROLES, PUBLIC_USER, cleanList, escapeRegex, anyAreaMatches, toDateKey, todayKey, sameId
} from '../utils/helpers.js'

export const serviceApp = exp.Router()

const isStaff = (u) => STAFF_ROLES.includes(u.role)
const OPEN_STATUSES = ['open', 'quoted']

/* ---------- Service Categories (+ pricing policy) ---------- */

// clamp + validate the editable category fields
function categoryPayload(body) {
  const out = {}
  if (body.name !== undefined) {
    if (!String(body.name).trim()) throw Object.assign(new Error('Category name is required'), { status: 400 })
    out.name = String(body.name).trim()
  }
  if (body.description !== undefined) out.description = body.description
  if (body.requiredSkills !== undefined) out.requiredSkills = cleanList(body.requiredSkills).map((s) => s.toLowerCase())
  if (body.isActive !== undefined) out.isActive = !!body.isActive
  if (body.enforcePriceRange !== undefined) out.enforcePriceRange = !!body.enforcePriceRange
  for (const k of ['platformFeePercent', 'taxPercent']) {
    if (body[k] !== undefined) {
      const v = Number(body[k])
      if (!Number.isFinite(v) || v < 0 || v > 100) throw Object.assign(new Error(`${k === 'taxPercent' ? 'Tax' : 'Platform fee'} must be between 0 and 100%`), { status: 400 })
      out[k] = v
    }
  }
  if (body.basePriceRange !== undefined) {
    const min = Number(body.basePriceRange?.min) || 0, max = Number(body.basePriceRange?.max) || 0
    if (min < 0 || max < 0 || (max && min > max)) throw Object.assign(new Error('Minimum price cannot exceed the maximum price'), { status: 400 })
    out.basePriceRange = { min, max }
  }
  return out
}

// public: list categories, optional search
serviceApp.get('/categories', async (req, res, next) => {
  try {
    const { search, includeInactive } = req.query
    const filter = includeInactive === 'true' ? {} : { isActive: true }
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' }
    const categories = await ServiceCategoryModel.find(filter).sort({ name: 1 })
    res.status(200).json({ categories })
  } catch (err) { next(err) }
})

serviceApp.post('/categories', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const category = await ServiceCategoryModel.create(categoryPayload(req.body))
    await logAudit(req.user, 'CATEGORY_CREATED', 'ServiceCategory', category._id, { name: category.name })
    res.status(201).json({ message: 'Category created', category })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A category with this name already exists' })
    next(err)
  }
})

serviceApp.put('/categories/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const changes = categoryPayload(req.body)
    const category = await ServiceCategoryModel.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true })
    if (!category) return res.status(404).json({ message: 'Category not found' })
    await logAudit(req.user, 'CATEGORY_UPDATED', 'ServiceCategory', category._id, { name: category.name, changes })
    res.status(200).json({ message: 'Category updated', category })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A category with this name already exists' })
    next(err)
  }
})

serviceApp.delete('/categories/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const category = await ServiceCategoryModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!category) return res.status(404).json({ message: 'Category not found' })
    await logAudit(req.user, 'CATEGORY_DEACTIVATED', 'ServiceCategory', category._id, { name: category.name })
    res.status(200).json({ message: 'Category deactivated', category })
  } catch (err) { next(err) }
})

/* ---------- Service Requests ---------- */

async function requestPayload(body, { partial = false } = {}) {
  const out = {}
  const bad = (m) => Object.assign(new Error(m), { status: 400 })
  if (!partial || body.description !== undefined) {
    const d = String(body.description || '').trim()
    if (d.length < 10) throw bad('Describe the problem in at least 10 characters so providers can quote accurately')
    out.description = d
  }
  if (!partial || body.serviceArea !== undefined) {
    if (!String(body.serviceArea || '').trim()) throw bad('Service area is required')
    out.serviceArea = String(body.serviceArea).trim()
  }
  if (body.title !== undefined) out.title = String(body.title).trim().slice(0, 120)
  if (body.address !== undefined) out.address = String(body.address).trim()
  if (body.requiredSkills !== undefined) out.requiredSkills = cleanList(body.requiredSkills).map((s) => s.toLowerCase())
  if (body.urgency !== undefined) {
    if (!['flexible', 'normal', 'urgent'].includes(body.urgency)) throw bad('Urgency must be flexible, normal or urgent')
    out.urgency = body.urgency
  }
  if (body.budget !== undefined && body.budget !== '' && body.budget !== null) {
    const b = Number(body.budget)
    if (!Number.isFinite(b) || b < 0) throw bad('Budget must be a positive number')
    out.budget = b
  } else if (body.budget === '' || body.budget === null) out.budget = undefined
  if (body.preferredDate !== undefined && body.preferredDate !== '' && body.preferredDate !== null) {
    const k = toDateKey(body.preferredDate)
    if (!k) throw bad('Choose a valid preferred date')
    if (k < todayKey()) throw bad('Preferred date cannot be in the past')
    out.preferredDate = new Date(`${k}T00:00:00.000Z`)
  }
  if (body.category !== undefined && body.category !== '' && body.category !== null) {
    if (!mongoose.isValidObjectId(body.category)) throw bad('Unknown category')
    const cat = await ServiceCategoryModel.findOne({ _id: body.category, isActive: true })
    if (!cat) throw bad('That category is no longer available')
    out.category = cat._id
  }
  return out
}

// customer creates a request
serviceApp.post('/requests', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const data = await requestPayload(req.body)
    if (!data.title) data.title = data.description.slice(0, 60)
    const request = await ServiceRequestModel.create({ ...data, customer: req.user._id })
    res.status(201).json({ message: 'Service request created', request })
  } catch (err) { next(err) }
})

// AI: classify free-text description into a category + required skills.
// Optionally persists the classification directly onto the caller's own request via requestId.
serviceApp.post('/classify', verifyToken, async (req, res, next) => {
  try {
    const { description, requestId } = req.body
    if (!String(description || '').trim()) return res.status(400).json({ message: 'Describe what you need first' })
    const categories = await ServiceCategoryModel.find({ isActive: true })
    const classification = await classifyRequest(description, categories)

    if (requestId && mongoose.isValidObjectId(requestId)) {
      const request = await ServiceRequestModel.findOne({
        _id: requestId, ...(req.user.role === 'customer' ? { customer: req.user._id } : {})
      })
      if (request && classification.category) {
        request.category = classification.category
        request.requiredSkills = classification.requiredSkills
        await request.save()
        await notify(request.customer, {
          type: 'REQUEST_CLASSIFIED', title: 'Your request was categorised',
          message: `Classified as "${classification.categoryName}"`, link: `/requests/${request._id}`,
        })
      }
    }
    res.status(200).json({ classification })
  } catch (err) { next(err) }
})

// scrub what a viewer isn't entitled to see on a request
function shapeRequestFor(user, request, { hasAcceptedQuote = false } = {}) {
  const r = typeof request.toObject === 'function' ? request.toObject() : request
  if (user.role === 'provider') {
    if (!hasAcceptedQuote) delete r.address // exact address is only shared with the booked provider
    if (r.customer && typeof r.customer === 'object') r.customer = { _id: r.customer._id, name: r.customer.name }
    delete r.invitedProviders
  }
  return r
}

// AI: rank suitable verified providers for a request (owner or staff)
serviceApp.get('/requests/:id/suggested-providers', verifyToken, authorizeRoles('customer', 'admin', 'operationsManager'), async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findById(req.params.id)
    if (!request) return res.status(404).json({ message: 'Request not found' })
    if (req.user.role === 'customer' && !sameId(request.customer, req.user._id)) {
      return res.status(403).json({ message: 'You do not have access to this request' })
    }
    const verified = await ProviderProfileModel.find({ verificationStatus: 'verified' })
      .populate('user', req.user.role === 'customer' ? PUBLIC_USER : '-password')
    const candidates = verified.filter((p) => anyAreaMatches(p.serviceAreas, request.serviceArea))
    const invitedIds = new Set((request.invitedProviders || []).map((i) => String(i.provider)))
    const quoted = new Set((await QuoteModel.find({ serviceRequest: request._id, status: { $in: ['pending', 'accepted'] } }).select('provider')).map((q) => String(q.provider)))

    const suggestions = (await rankProviders(request, candidates)).map((s) => ({
      ...s, invited: invitedIds.has(String(s.provider._id)), quoted: quoted.has(String(s.provider._id)),
    }))
    res.status(200).json({ suggestions })
  } catch (err) { next(err) }
})

// single request
serviceApp.get('/requests/:id', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Request not found' })
    const request = await ServiceRequestModel.findById(req.params.id).populate('category').populate('customer', 'name email phone')
    if (!request) return res.status(404).json({ message: 'Request not found' })

    let hasAcceptedQuote = false
    if (req.user.role === 'customer' && !sameId(request.customer, req.user._id)) {
      return res.status(403).json({ message: 'You do not have access to this request' })
    }
    if (req.user.role === 'provider') {
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      const mine = profile ? await QuoteModel.findOne({ serviceRequest: request._id, provider: profile._id, status: 'accepted' }) : null
      hasAcceptedQuote = !!mine
      const involved = mine || (profile && (await QuoteModel.exists({ serviceRequest: request._id, provider: profile._id })))
      if (!involved && !OPEN_STATUSES.includes(request.status)) {
        return res.status(403).json({ message: 'This request is no longer open' })
      }
    }
    res.status(200).json({ request: shapeRequestFor(req.user, request, { hasAcceptedQuote }) })
  } catch (err) { next(err) }
})

// list + search + filter.
// customer -> own requests. provider -> open requests in their service areas (+ ones they were invited to).
// staff -> all requests, filterable.
serviceApp.get('/requests', verifyToken, async (req, res, next) => {
  try {
    const { status, serviceArea, category, search, urgency } = req.query
    const filter = {}
    if (req.user.role === 'customer') filter.customer = req.user._id
    if (req.user.role === 'provider') filter.status = status && OPEN_STATUSES.includes(status) ? status : { $in: OPEN_STATUSES }
    else if (status) filter.status = status
    if (category && mongoose.isValidObjectId(category)) filter.category = category
    if (urgency) filter.urgency = urgency
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' }
      filter.$or = [{ description: rx }, { title: rx }, { serviceArea: rx }]
    }

    let requests = await ServiceRequestModel.find(filter)
      .populate('category').populate('customer', 'name email phone').sort({ createdAt: -1 }).limit(500).lean()

    let profile = null
    if (req.user.role === 'provider') {
      profile = await ProviderProfileModel.findOne({ user: req.user._id })
      const areas = profile?.serviceAreas || []
      requests = requests.filter((r) =>
        !areas.length || anyAreaMatches(areas, r.serviceArea) ||
        (r.invitedProviders || []).some((i) => profile && String(i.provider) === String(profile._id)))
    }
    if (serviceArea) requests = requests.filter((r) => anyAreaMatches([r.serviceArea], serviceArea))

    // quote counts (and, for a provider, their own quote on each request)
    const quotes = await QuoteModel.find({ serviceRequest: { $in: requests.map((r) => r._id) } }).select('serviceRequest provider status price').lean()
    const bySr = new Map()
    quotes.forEach((q) => { const k = String(q.serviceRequest); (bySr.get(k) || bySr.set(k, []).get(k)).push(q) })

    requests = requests.map((r) => {
      const qs = bySr.get(String(r._id)) || []
      const live = qs.filter((q) => ['pending', 'accepted'].includes(q.status))
      const out = { ...r, quoteCount: live.length, lowestQuote: live.length ? Math.min(...live.map((q) => q.price)) : null }
      if (profile) {
        const mine = qs.filter((q) => String(q.provider) === String(profile._id)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        out.myQuote = mine.find((q) => ['pending', 'accepted'].includes(q.status)) || null
        out.invited = (r.invitedProviders || []).some((i) => String(i.provider) === String(profile._id))
        return shapeRequestFor(req.user, out)
      }
      return out
    })
    if (profile) requests.sort((a, b) => Number(b.invited) - Number(a.invited))
    res.status(200).json({ requests })
  } catch (err) { next(err) }
})

// customer edits their request while it is still open for quotes
serviceApp.put('/requests/:id', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findOne({ _id: req.params.id, customer: req.user._id })
    if (!request) return res.status(404).json({ message: 'Request not found' })
    if (!OPEN_STATUSES.includes(request.status)) {
      return res.status(409).json({ message: `A ${request.status} request can no longer be edited` })
    }
    const changes = await requestPayload(req.body, { partial: true })
    Object.assign(request, changes)
    await request.save()

    // providers with a live quote should know the job changed under them
    const live = await QuoteModel.find({ serviceRequest: request._id, status: 'pending' }).populate('provider', 'user')
    await Promise.all(live.map((q) => notify(q.provider?.user, {
      type: 'REQUEST_UPDATED', title: 'A request you quoted was updated',
      message: 'The customer changed the request details. Review your quote.', link: `/requests/${request._id}`,
    })))
    res.status(200).json({ message: 'Request updated', request })
  } catch (err) { next(err) }
})

// cancel a request (its owner, or support/ops/admin on the customer's behalf)
serviceApp.put('/requests/:id/cancel', verifyToken, authorizeRoles('customer', ...STAFF_ROLES), async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...(req.user.role === 'customer' ? { customer: req.user._id } : {}) }
    const request = await ServiceRequestModel.findOne(filter)
    if (!request) return res.status(404).json({ message: 'Request not found' })
    if (!OPEN_STATUSES.includes(request.status)) {
      return res.status(409).json({
        message: request.status === 'booked' ? 'This request already has a booking — cancel the booking instead' : `This request is already ${request.status}`
      })
    }
    request.status = 'cancelled'
    request.cancelReason = req.body?.reason || (isStaff(req.user) ? 'Cancelled by support' : 'Cancelled by customer')
    await request.save()

    const pending = await QuoteModel.find({ serviceRequest: request._id, status: 'pending' }).populate('provider', 'user')
    await QuoteModel.updateMany({ serviceRequest: request._id, status: 'pending' }, { status: 'rejected' })
    await Promise.all(pending.map((q) => notify(q.provider?.user, {
      type: 'REQUEST_CANCELLED', title: 'A request you quoted was cancelled', message: request.title || request.description.slice(0, 80), link: '/quotes',
    })))
    if (isStaff(req.user)) {
      await logAudit(req.user, 'REQUEST_CANCELLED', 'ServiceRequest', request._id, { reason: request.cancelReason })
      await notify(request.customer, { type: 'REQUEST_CANCELLED', title: 'Your request was cancelled', message: request.cancelReason, link: `/requests/${request._id}` })
    }
    res.status(200).json({ message: 'Request cancelled', request })
  } catch (err) { next(err) }
})

// permanently delete a request (only if nothing depends on it)
serviceApp.delete('/requests/:id', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findOne({ _id: req.params.id, customer: req.user._id })
    if (!request) return res.status(404).json({ message: 'Request not found' })
    const hasBooking = await BookingModel.exists({ serviceRequest: request._id })
    const quoteCount = await QuoteModel.countDocuments({ serviceRequest: request._id, status: { $in: ['pending', 'accepted'] } })
    if (hasBooking) return res.status(409).json({ message: 'This request has a booking, so it must be kept for your records' })
    if (request.status !== 'cancelled' && quoteCount > 0) return res.status(409).json({ message: 'Cancel the request first — providers have already quoted' })
    await QuoteModel.deleteMany({ serviceRequest: request._id })
    await request.deleteOne()
    res.status(200).json({ message: 'Request deleted' })
  } catch (err) { next(err) }
})

// invite a provider to quote (customer, on their own request) or assign one (operations / admin)
serviceApp.post('/requests/:id/invite', verifyToken, authorizeRoles('customer', ...MANAGER_ROLES), async (req, res, next) => {
  try {
    const { providerId } = req.body
    if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ message: 'Choose a provider' })
    const request = await ServiceRequestModel.findById(req.params.id)
    if (!request) return res.status(404).json({ message: 'Request not found' })
    if (req.user.role === 'customer' && !sameId(request.customer, req.user._id)) {
      return res.status(403).json({ message: 'You can only invite providers to your own requests' })
    }
    if (!OPEN_STATUSES.includes(request.status)) return res.status(409).json({ message: 'This request is no longer open for quotes' })
    const provider = await ProviderProfileModel.findById(providerId)
    if (!provider || provider.verificationStatus !== 'verified') return res.status(400).json({ message: 'Only verified providers can be invited' })
    if ((request.invitedProviders || []).some((i) => sameId(i.provider, provider._id))) {
      return res.status(409).json({ message: 'This provider has already been invited' })
    }

    request.invitedProviders.push({ provider: provider._id, invitedBy: req.user._id, byRole: req.user.role })
    await request.save()
    const assigned = req.user.role !== 'customer'
    await notify(provider.user, {
      type: 'PROVIDER_INVITED',
      title: assigned ? 'Operations assigned you a request' : 'A customer invited you to quote',
      message: request.title || request.description.slice(0, 90),
      link: `/requests/${request._id}`,
    })
    if (assigned) {
      await logAudit(req.user, 'PROVIDER_ASSIGNED_TO_REQUEST', 'ServiceRequest', request._id, { providerId: provider._id })
      await notify(request.customer, { type: 'PROVIDER_INVITED', title: 'A provider was invited to your request', message: 'Our operations team invited a matching provider to quote.', link: `/requests/${request._id}` })
    }
    res.status(200).json({ message: assigned ? 'Provider assigned' : 'Invitation sent', request })
  } catch (err) { next(err) }
})

/* ---------- Quotes ---------- */

serviceApp.post('/quotes', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!providerProfile) return res.status(400).json({ message: 'Create a provider profile first' })
    if (providerProfile.verificationStatus !== 'verified') {
      return res.status(403).json({ message: 'Your provider profile must be verified before quoting' })
    }

    const { serviceRequest, price, estimatedDuration, notes } = req.body
    if (!mongoose.isValidObjectId(serviceRequest)) return res.status(400).json({ message: 'Choose a request to quote' })
    const request = await ServiceRequestModel.findById(serviceRequest).populate('category')
    if (!request) return res.status(404).json({ message: 'Request not found' })
    if (!OPEN_STATUSES.includes(request.status)) return res.status(409).json({ message: 'This request is no longer open for quotes' })

    const priceError = checkQuotePrice(request.category, price)
    if (priceError) return res.status(400).json({ message: priceError })

    const existing = await QuoteModel.findOne({ serviceRequest, provider: providerProfile._id, status: { $in: ['pending', 'accepted'] } })
    if (existing) return res.status(409).json({ message: 'You have already quoted this request — edit your existing quote instead' })

    const quote = await QuoteModel.create({
      serviceRequest, provider: providerProfile._id, price: Number(price), estimatedDuration, notes
    })
    request.status = 'quoted'
    await request.save()

    await notify(request.customer, {
      type: 'QUOTE_RECEIVED', title: 'New quote received',
      message: `${req.user.name} quoted ₹${Number(price).toLocaleString('en-IN')} for "${request.title || request.description.slice(0, 50)}"`,
      link: `/requests/${request._id}`,
    })
    res.status(201).json({ message: 'Quote submitted', quote })
  } catch (err) { next(err) }
})

// provider edits their own pending quote
serviceApp.put('/quotes/:id', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    const quote = await QuoteModel.findOne({ _id: req.params.id, provider: providerProfile?._id })
    if (!quote) return res.status(404).json({ message: 'Quote not found' })
    if (quote.status !== 'pending') return res.status(409).json({ message: `A ${quote.status} quote can no longer be edited` })

    const request = await ServiceRequestModel.findById(quote.serviceRequest).populate('category')
    if (!request || !OPEN_STATUSES.includes(request.status)) return res.status(409).json({ message: 'This request is no longer open for quotes' })

    const { price, estimatedDuration, notes } = req.body
    if (price !== undefined) {
      const err = checkQuotePrice(request.category, price)
      if (err) return res.status(400).json({ message: err })
      quote.price = Number(price)
    }
    if (estimatedDuration !== undefined) quote.estimatedDuration = estimatedDuration
    if (notes !== undefined) quote.notes = notes
    await quote.save()

    await notify(request.customer, {
      type: 'QUOTE_UPDATED', title: 'A quote was updated',
      message: `${req.user.name} revised their quote to ₹${quote.price.toLocaleString('en-IN')}`, link: `/requests/${request._id}`,
    })
    res.status(200).json({ message: 'Quote updated', quote })
  } catch (err) { next(err) }
})

// quotes for a request (customer comparing quotes). Owning customer + staff only —
// competing providers must never see each other's price / notes.
serviceApp.get('/requests/:id/quotes', verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Request not found' })
    if (req.user.role === 'customer' || req.user.role === 'provider') {
      const request = await ServiceRequestModel.findById(req.params.id)
      if (!request) return res.status(404).json({ message: 'Request not found' })
      if (!(req.user.role === 'customer' && sameId(request.customer, req.user._id))) {
        return res.status(403).json({ message: 'You do not have access to these quotes' })
      }
    }
    const quotes = await QuoteModel.find({ serviceRequest: req.params.id })
      .populate({ path: 'provider', populate: { path: 'user', select: req.user.role === 'customer' ? PUBLIC_USER : '-password' } })
      .sort({ price: 1 })
    res.status(200).json({ quotes })
  } catch (err) { next(err) }
})

// provider's own quotes, filterable by status
serviceApp.get('/quotes/mine', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const { status } = req.query
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!providerProfile) return res.status(200).json({ quotes: [] })

    const filter = { provider: providerProfile._id }
    if (status) filter.status = status

    const quotes = await QuoteModel.find(filter)
      .populate({ path: 'serviceRequest', select: '-address', populate: { path: 'category' } })
      .sort({ createdAt: -1 }).lean()
    const bookings = await BookingModel.find({ quote: { $in: quotes.map((q) => q._id) } }).select('quote status')
    const bookingByQuote = new Map(bookings.map((b) => [String(b.quote), b]))
    res.status(200).json({ quotes: quotes.map((q) => ({ ...q, booking: bookingByQuote.get(String(q._id)) || null })) })
  } catch (err) { next(err) }
})

// provider withdraws their own pending quote
serviceApp.put('/quotes/:id/withdraw', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    const quote = await QuoteModel.findOneAndUpdate(
      { _id: req.params.id, provider: providerProfile?._id, status: 'pending' },
      { status: 'withdrawn' },
      { new: true }
    )
    if (!quote) return res.status(404).json({ message: 'Quote not found or not withdrawable' })

    const stillLive = await QuoteModel.countDocuments({ serviceRequest: quote.serviceRequest, status: 'pending' })
    if (!stillLive) await ServiceRequestModel.updateOne({ _id: quote.serviceRequest, status: 'quoted' }, { status: 'open' })
    const request = await ServiceRequestModel.findById(quote.serviceRequest).select('customer title description')
    await notify(request?.customer, {
      type: 'QUOTE_WITHDRAWN', title: 'A provider withdrew their quote',
      message: request?.title || '', link: `/requests/${quote.serviceRequest}`,
    })
    res.status(200).json({ message: 'Quote withdrawn', quote })
  } catch (err) { next(err) }
})
