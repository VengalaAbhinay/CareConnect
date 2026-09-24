import exp from 'express'
import { ServiceCategoryModel } from '../Models/ServiceCategoryModel.js'
import { ServiceRequestModel } from '../Models/ServiceRequestModel.js'
import { QuoteModel } from '../Models/QuoteModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { classifyRequest, rankProviders } from '../services/aiService.js'
import { notify, logAudit } from '../services/activityService.js'

export const serviceApp = exp.Router()

/* ---------- Service Categories ---------- */

// public: list categories, optional search
serviceApp.get('/categories', async (req, res, next) => {
  try {
    const { search, includeInactive } = req.query
    const filter = includeInactive === 'true' ? {} : { isActive: true }
    if (search) filter.name = { $regex: search, $options: 'i' }
    const categories = await ServiceCategoryModel.find(filter).sort({ name: 1 })
    res.status(200).json({ categories })
  } catch (err) { next(err) }
})

serviceApp.post('/categories', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const category = await ServiceCategoryModel.create(req.body)
    await logAudit(req.user, 'CATEGORY_CREATED', 'ServiceCategory', category._id, { name: category.name })
    res.status(201).json({ message: "Category created", category })
  } catch (err) { next(err) }
})

serviceApp.put('/categories/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const category = await ServiceCategoryModel.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req.user, 'CATEGORY_UPDATED', 'ServiceCategory', category._id, { changes: req.body })
    res.status(200).json({ message: "Category updated", category })
  } catch (err) { next(err) }
})

serviceApp.delete('/categories/:id', verifyToken, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const category = await ServiceCategoryModel.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    await logAudit(req.user, 'CATEGORY_DEACTIVATED', 'ServiceCategory', category._id, { name: category?.name })
    res.status(200).json({ message: "Category deactivated", category })
  } catch (err) { next(err) }
})

/* ---------- Service Requests ---------- */

// customer creates a request
serviceApp.post('/requests', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const { description, category, requiredSkills, serviceArea, preferredDate } = req.body
    const request = await ServiceRequestModel.create({
      customer: req.user._id, description, category, requiredSkills, serviceArea, preferredDate
    })
    res.status(201).json({ message: "Service request created", request })
  } catch (err) { next(err) }
})

// AI: classify free-text description into a category + required skills.
// Optionally persists the classification directly onto a request via requestId in the body.
serviceApp.post('/classify', verifyToken, async (req, res, next) => {
  try {
    const { description, requestId } = req.body
    const categories = await ServiceCategoryModel.find({ isActive: true })
    const classification = await classifyRequest(description, categories)

    if (requestId) {
      const request = await ServiceRequestModel.findByIdAndUpdate(
        requestId,
        { category: classification.category, requiredSkills: classification.requiredSkills },
        { new: true }
      )
      if (request) {
        await notify(request.customer, {
          type: 'REQUEST_CLASSIFIED',
          title: 'Your request was categorized',
          message: `Classified as "${classification.categoryName}"`,
          link: `/requests/${request._id}`,
        })
      }
    }

    res.status(200).json({ classification })
  } catch (err) { next(err) }
})

// AI: rank suitable verified providers for a request
serviceApp.get('/requests/:id/suggested-providers', verifyToken, async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findById(req.params.id)
    if (!request) return res.status(404).json({ message: "Request not found" })

    const candidates = await ProviderProfileModel.find({
      serviceAreas: request.serviceArea,
      verificationStatus: 'verified'
    }).populate('user', '-password')

    const suggestions = await rankProviders(request, candidates)
    res.status(200).json({ suggestions })
  } catch (err) { next(err) }
})

// single request
serviceApp.get('/requests/:id', verifyToken, async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findById(req.params.id)
      .populate('category')
      .populate('customer', '-password')
    if (!request) return res.status(404).json({ message: "Request not found" })
    // customers may only view their own requests; providers/staff can view
    // any (providers need this to browse + quote open requests)
    if (req.user.role === 'customer' && request.customer._id.toString() !== req.user._id) {
      return res.status(403).json({ message: "You do not have access to this request" })
    }
    res.status(200).json({ request })
  } catch (err) { next(err) }
})

// list + search + filter.
// customer -> own requests. provider -> open requests matching their service areas (browsable).
// admin/ops -> all requests, filterable.
serviceApp.get('/requests', verifyToken, async (req, res, next) => {
  try {
    const { status, serviceArea, category, search } = req.query
    let filter = {}

    if (req.user.role === 'customer') {
      filter.customer = req.user._id
    } else if (req.user.role === 'provider') {
      filter.status = status || 'open'
      const profile = await ProviderProfileModel.findOne({ user: req.user._id })
      if (profile?.serviceAreas?.length && !serviceArea) filter.serviceArea = { $in: profile.serviceAreas }
    }

    if (status && req.user.role !== 'provider') filter.status = status
    if (serviceArea) filter.serviceArea = serviceArea
    if (category) filter.category = category
    if (search) filter.description = { $regex: search, $options: 'i' }

    const requests = await ServiceRequestModel.find(filter)
      .populate('category')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 })
    res.status(200).json({ requests })
  } catch (err) { next(err) }
})

serviceApp.put('/requests/:id/cancel', verifyToken, authorizeRoles('customer'), async (req, res, next) => {
  try {
    const request = await ServiceRequestModel.findOneAndUpdate(
      { _id: req.params.id, customer: req.user._id },
      { status: 'cancelled' },
      { new: true }
    )
    res.status(200).json({ message: "Request cancelled", request })
  } catch (err) { next(err) }
})

/* ---------- Quotes ---------- */

serviceApp.post('/quotes', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!providerProfile) return res.status(400).json({ message: "Create a provider profile first" })
    if (providerProfile.verificationStatus !== 'verified') {
      return res.status(403).json({ message: "Your provider profile must be verified before quoting" })
    }

    const { serviceRequest, price, estimatedDuration, notes } = req.body
    const quote = await QuoteModel.create({
      serviceRequest, provider: providerProfile._id, price, estimatedDuration, notes
    })
    const request = await ServiceRequestModel.findByIdAndUpdate(serviceRequest, { status: 'quoted' })

    if (request) {
      await notify(request.customer, {
        type: 'QUOTE_RECEIVED',
        title: 'New quote received',
        message: `A provider quoted ₹${price} for your request`,
        link: `/requests/${request._id}`,
      })
    }

    res.status(201).json({ message: "Quote submitted", quote })
  } catch (err) { next(err) }
})

// quotes for a request (customer comparing quotes).
// Restricted to the owning customer + platform staff — other providers
// should not be able to see a competitor's price/notes on the same request.
serviceApp.get('/requests/:id/quotes', verifyToken, async (req, res, next) => {
  try {
    if (req.user.role === 'customer' || req.user.role === 'provider') {
      const request = await ServiceRequestModel.findById(req.params.id)
      if (!request) return res.status(404).json({ message: "Request not found" })
      const isOwner = req.user.role === 'customer' && request.customer.toString() === req.user._id
      if (!isOwner) {
        return res.status(403).json({ message: "You do not have access to these quotes" })
      }
    }
    const quotes = await QuoteModel.find({ serviceRequest: req.params.id })
      .populate({ path: 'provider', populate: { path: 'user', select: '-password' } })
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
      .populate({ path: 'serviceRequest', populate: { path: 'category' } })
      .sort({ createdAt: -1 })
    res.status(200).json({ quotes })
  } catch (err) { next(err) }
})

// provider withdraws their own pending quote
serviceApp.put('/quotes/:id/withdraw', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const providerProfile = await ProviderProfileModel.findOne({ user: req.user._id })
    const quote = await QuoteModel.findOneAndUpdate(
      { _id: req.params.id, provider: providerProfile?._id, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    )
    if (!quote) return res.status(404).json({ message: "Quote not found or not withdrawable" })
    res.status(200).json({ message: "Quote withdrawn", quote })
  } catch (err) { next(err) }
})