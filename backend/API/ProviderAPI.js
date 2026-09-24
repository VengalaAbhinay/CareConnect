import exp from 'express'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'
import { verifyToken, authorizeRoles } from '../middlewares/auth.js'
import { notify, logAudit } from '../services/activityService.js'

export const providerApp = exp.Router()

// create/update own provider profile
providerApp.post('/profile', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const { skills, serviceAreas, experienceYears, documents, availability } = req.body
    const profile = await ProviderProfileModel.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, skills, serviceAreas, experienceYears, documents, availability },
      { new: true, upsert: true }
    )
    res.status(200).json({ message: "Profile saved", profile })
  } catch (err) { next(err) }
})

// get own profile
providerApp.get('/profile/me', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id }).populate('user', '-password')
    res.status(200).json({ profile })
  } catch (err) { next(err) }
})

// single provider profile (public-ish; used for viewing a provider's card)
providerApp.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findById(req.params.id).populate('user', '-password')
    if (!profile) return res.status(404).json({ message: "Provider not found" })
    res.status(200).json({ profile })
  } catch (err) { next(err) }
})

// list providers with search/filters (admin / ops / matching / browsing)
providerApp.get('/', verifyToken, async (req, res, next) => {
  try {
    const { serviceArea, skill, verificationStatus, search } = req.query
    const filter = {}
    if (serviceArea) filter.serviceAreas = serviceArea
    if (skill) filter.skills = skill
    if (verificationStatus) filter.verificationStatus = verificationStatus

    let providers = await ProviderProfileModel.find(filter).populate('user', '-password').sort({ rating: -1 })

    if (search) {
      const q = search.toLowerCase()
      providers = providers.filter((p) =>
        p.user?.name?.toLowerCase().includes(q) ||
        p.skills.some((s) => s.toLowerCase().includes(q)) ||
        p.serviceAreas.some((a) => a.toLowerCase().includes(q))
      )
    }

    res.status(200).json({ providers })
  } catch (err) { next(err) }
})

// admin: verify / reject a provider
providerApp.put('/:id/verify', verifyToken, authorizeRoles('admin', 'operationsManager'), async (req, res, next) => {
  try {
    const { verificationStatus } = req.body // 'verified' | 'rejected'
    const profile = await ProviderProfileModel.findByIdAndUpdate(
      req.params.id,
      { verificationStatus },
      { new: true }
    ).populate('user', '-password')
    if (!profile) return res.status(404).json({ message: "Provider not found" })

    await logAudit(req.user, `PROVIDER_${verificationStatus?.toUpperCase()}`, 'ProviderProfile', profile._id, {
      providerName: profile.user?.name
    })
    await notify(profile.user?._id, {
      type: verificationStatus === 'verified' ? 'PROVIDER_VERIFIED' : 'PROVIDER_REJECTED',
      title: verificationStatus === 'verified' ? 'You are verified!' : 'Verification update',
      message: verificationStatus === 'verified'
        ? 'Your provider profile has been verified. You can now submit quotes.'
        : 'Your provider profile was not approved. Please review and update your documents.',
      link: '/profile',
    })

    res.status(200).json({ message: "Verification updated", profile })
  } catch (err) { next(err) }
})

// availability: add a slot
providerApp.post('/availability', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const { day, startTime, endTime } = req.body
    const profile = await ProviderProfileModel.findOneAndUpdate(
      { user: req.user._id },
      { $push: { availability: { day, startTime, endTime } } },
      { new: true }
    )
    res.status(200).json({ message: "Availability added", profile })
  } catch (err) { next(err) }
})

// availability: remove a slot by its subdocument index
providerApp.delete('/availability/:index', verifyToken, authorizeRoles('provider'), async (req, res, next) => {
  try {
    const profile = await ProviderProfileModel.findOne({ user: req.user._id })
    if (!profile) return res.status(404).json({ message: "Profile not found" })
    profile.availability.splice(Number(req.params.index), 1)
    await profile.save()
    res.status(200).json({ message: "Availability removed", profile })
  } catch (err) { next(err) }
})
