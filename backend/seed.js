// One-off seed script.
//
// Creates:
//  - one demo account per staff role (admin, operationsManager, supportAgent),
//    plus a demo customer and THREE demo providers (two verified, one still
//    pending) — internal roles are NOT selectable on the public registration
//    form (see UserAPI.js), so they only exist via this script or a direct
//    DB edit.
//  - a starter set of service categories, each with its own pricing policy
//    (price-range enforcement, platform fee %, tax %)
//  - three demo bookings so every dashboard has something real to show:
//      1. a COMPLETED, reviewed, paid job (plumbing)
//      2. an IN-PROGRESS job with an open support complaint (cleaning)
//      3. a SCHEDULED job on a real future slot claimed through the actual
//         availability engine, so the calendar / SlotLock collection isn't empty
//
// Usage:  cd backend && node seed.js
// Re-running is safe — existing records are detected and skipped/reused.

import { connect, disconnect } from 'mongoose'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { UserModel } from './Models/UserModel.js'
import { ServiceCategoryModel } from './Models/ServiceCategoryModel.js'
import { ProviderProfileModel } from './Models/ProviderProfileModel.js'
import { ServiceRequestModel } from './Models/ServiceRequestModel.js'
import { QuoteModel } from './Models/QuoteModel.js'
import { BookingModel } from './Models/BookingModel.js'
import { ReviewModel } from './Models/ReviewModel.js'
import { DisputeModel } from './Models/DisputeModel.js'
import { reserveSlots } from './services/availabilityService.js'
import { ensureInvoiceForBooking } from './services/invoiceService.js'
import { recomputeProviderRating } from './services/ratingService.js'
import { todayKey, addDaysKey, weekdayOf, dateFromKey } from './utils/helpers.js'

config()

const accounts = [
  { name: 'Platform Admin', email: 'admin@careconnect.dev', password: 'Admin@123', role: 'admin' },
  { name: 'Ops Manager', email: 'ops@careconnect.dev', password: 'Ops@1234', role: 'operationsManager' },
  { name: 'Support Agent', email: 'support@careconnect.dev', password: 'Support@123', role: 'supportAgent' },
  { name: 'Demo Provider', email: 'provider@careconnect.dev', password: 'Provider@123', role: 'provider', phone: '9876500001' },
  { name: 'Priya Cleaning Co.', email: 'provider2@careconnect.dev', password: 'Provider@123', role: 'provider', phone: '9876500003' },
  { name: 'Ravi Electricals', email: 'provider3@careconnect.dev', password: 'Provider@123', role: 'provider', phone: '9876500004' },
  { name: 'Demo Customer', email: 'customer@careconnect.dev', password: 'Customer@123', role: 'customer', phone: '9876500002' },
]

const categories = [
  { name: 'Appliance Repair', description: 'Fixing washing machines, fridges, ACs, microwaves.', requiredSkills: ['appliance repair', 'electrical'], basePriceRange: { min: 300, max: 2500 }, platformFeePercent: 12, taxPercent: 18 },
  { name: 'Cleaning', description: 'Home deep cleaning, sofa/carpet cleaning, bathroom cleaning.', requiredSkills: ['cleaning', 'housekeeping'], basePriceRange: { min: 200, max: 1500 }, platformFeePercent: 10, taxPercent: 0 },
  { name: 'Electrical Work', description: 'Wiring, switchboards, fan/light installation, inverter setup.', requiredSkills: ['electrical', 'wiring'], basePriceRange: { min: 150, max: 3000 }, platformFeePercent: 12, taxPercent: 18 },
  { name: 'Plumbing', description: 'Leak repair, tap/pipe fitting, bathroom fittings.', requiredSkills: ['plumbing'], basePriceRange: { min: 150, max: 2500 }, platformFeePercent: 12, taxPercent: 18 },
  { name: 'Maintenance', description: 'General home maintenance, carpentry, painting touch-ups.', requiredSkills: ['carpentry', 'maintenance'], basePriceRange: { min: 200, max: 3000 }, platformFeePercent: 10, taxPercent: 5 },
]

async function upsertUser(acc) {
  let user = await UserModel.findOne({ email: acc.email })
  if (user) { console.log(`Skip (exists): ${acc.email}`); return user }
  const hashedPassword = await bcrypt.hash(acc.password, 10)
  user = await UserModel.create({ ...acc, password: hashedPassword })
  console.log(`Created ${acc.role}: ${acc.email} / ${acc.password}`)
  return user
}

async function upsertProviderProfile(userId, data) {
  let profile = await ProviderProfileModel.findOne({ user: userId })
  if (profile) { console.log(`Skip (exists): provider profile for ${userId}`); return profile }
  profile = await ProviderProfileModel.create({ user: userId, ...data })
  console.log(`Created provider profile (${data.verificationStatus}): ${data.skills?.join(', ')}`)
  return profile
}

// first date on/after `fromKey` that falls on `dayName`
function nextWeekday(fromKey, dayName) {
  let key = fromKey
  for (let i = 0; i < 14; i++) {
    if (weekdayOf(key) === dayName) return key
    key = addDaysKey(key, 1)
  }
  return fromKey
}

async function seed() {
  await connect(process.env.DB_URL)
  console.log('Connected to DB for seeding...')

  const users = {}
  for (const acc of accounts) {
    const key = { provider: 'provider', provider2: 'provider2', provider3: 'provider3' }[acc.email.split('@')[0]]
      || (acc.role === 'customer' ? 'customer' : acc.role)
    users[key] = await upsertUser(acc)
  }

  const createdCategories = {}
  for (const cat of categories) {
    let existing = await ServiceCategoryModel.findOne({ name: cat.name })
    if (!existing) {
      existing = await ServiceCategoryModel.create(cat)
      console.log(`Created category: ${cat.name}`)
    } else {
      console.log(`Skip (exists): category ${cat.name}`)
    }
    createdCategories[cat.name] = existing
  }

  // --- Provider 1: plumbing/electrical/appliance, verified ---
  const providerProfile = await upsertProviderProfile(users.provider._id, {
    headline: 'Fast, reliable home repairs',
    bio: '6 years fixing taps, wiring and appliances across Hyderabad. Same-day visits for urgent jobs.',
    skills: ['plumbing', 'electrical', 'appliance repair'],
    serviceAreas: ['Kukatpally, Hyderabad', 'Madhapur, Hyderabad'],
    experienceYears: 6,
    hourlyRate: 300,
    documents: [],
    verificationStatus: 'verified',
    verifiedAt: new Date(),
    availability: [
      { day: 'Monday', startTime: '09:00', endTime: '18:00' },
      { day: 'Tuesday', startTime: '09:00', endTime: '18:00' },
      { day: 'Wednesday', startTime: '09:00', endTime: '18:00' },
    ],
  })

  // --- Provider 2: cleaning, verified, city-wide ---
  const providerProfile2 = await upsertProviderProfile(users.provider2._id, {
    headline: 'Deep cleaning specialists',
    bio: 'Team of trained house-cleaners. We bring our own equipment and eco-friendly supplies.',
    skills: ['cleaning', 'housekeeping'],
    serviceAreas: ['Hyderabad'],
    experienceYears: 4,
    hourlyRate: 250,
    documents: [],
    verificationStatus: 'verified',
    verifiedAt: new Date(),
    availability: [
      { day: 'Thursday', startTime: '10:00', endTime: '17:00' },
      { day: 'Friday', startTime: '10:00', endTime: '17:00' },
      { day: 'Saturday', startTime: '10:00', endTime: '17:00' },
    ],
  })

  // --- Provider 3: electrician, still pending verification (demo for the admin queue) ---
  await upsertProviderProfile(users.provider3._id, {
    headline: 'Licensed electrician',
    bio: 'Specialising in inverter installs and rewiring. New to CareConnect.',
    skills: ['electrical', 'wiring'],
    serviceAreas: ['Gachibowli, Hyderabad'],
    experienceYears: 3,
    hourlyRate: 280,
    documents: ['/uploads/sample-license-placeholder.pdf'],
    verificationStatus: 'pending',
    availability: [
      { day: 'Monday', startTime: '11:00', endTime: '19:00' },
      { day: 'Wednesday', startTime: '11:00', endTime: '19:00' },
    ],
  })

  /* ---------------------------------------------------------------- */
  /* Chain 1: completed, reviewed, paid plumbing job                   */
  /* ---------------------------------------------------------------- */
  const plumbing = createdCategories['Plumbing']
  let demoRequest = await ServiceRequestModel.findOne({ customer: users.customer._id, description: /kitchen tap/i })
  if (!demoRequest) {
    demoRequest = await ServiceRequestModel.create({
      customer: users.customer._id,
      title: 'Leaking kitchen tap',
      description: 'My kitchen tap is leaking continuously and needs a new washer.',
      category: plumbing._id,
      requiredSkills: plumbing.requiredSkills,
      serviceArea: 'Kukatpally, Hyderabad',
      address: '12-3-456, Road No. 4, Kukatpally, Hyderabad',
      preferredDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      urgency: 'normal',
      status: 'booked',
    })
    console.log('Created demo service request (plumbing, completed chain)')
  } else {
    console.log('Skip (exists): demo service request (plumbing)')
  }

  let demoQuote = await QuoteModel.findOne({ serviceRequest: demoRequest._id, provider: providerProfile._id })
  if (!demoQuote) {
    demoQuote = await QuoteModel.create({
      serviceRequest: demoRequest._id,
      provider: providerProfile._id,
      price: 450,
      estimatedDuration: '1 hour',
      notes: 'Can come today evening, will replace the washer and check for other leaks.',
      status: 'accepted',
    })
    console.log('Created demo quote (plumbing)')
  } else {
    console.log('Skip (exists): demo quote (plumbing)')
  }

  let demoBooking = await BookingModel.findOne({ quote: demoQuote._id })
  if (!demoBooking) {
    const yesterdayKey = addDaysKey(todayKey(), -1)
    demoBooking = await BookingModel.create({
      serviceRequest: demoRequest._id,
      quote: demoQuote._id,
      customer: users.customer._id,
      provider: providerProfile._id,
      scheduledDate: dateFromKey(yesterdayKey),
      dateKey: yesterdayKey,
      startTime: '17:00',
      endTime: '18:00',
      price: demoQuote.price,
      status: 'completed',
      customerConfirmed: true,
      completedAt: new Date(),
      jobTimeline: [
        { status: 'scheduled', kind: 'system', note: 'Booking created', byName: 'System' },
        { status: 'inProgress', kind: 'status', note: 'Provider started the job', byName: users.provider.name },
        { status: 'awaitingConfirmation', kind: 'status', note: 'Washer replaced, leak fixed', byName: users.provider.name },
        { status: 'completed', kind: 'system', note: 'Customer confirmed completion', byName: users.customer.name },
      ],
    })
    console.log('Created demo booking (completed, plumbing)')
  } else {
    console.log('Skip (exists): demo booking (plumbing)')
  }

  const demoInvoice = await ensureInvoiceForBooking(demoBooking)
  if (demoInvoice.status === 'draft') {
    demoInvoice.status = 'paid'
    demoInvoice.issuedAt = demoBooking.completedAt || new Date()
    demoInvoice.paidAt = demoBooking.completedAt || new Date()
    demoInvoice.paymentMethod = 'upi'
    demoInvoice.paymentReference = 'DEMO-UPI-0001'
    await demoInvoice.save()
    providerProfile.completedJobs += 1
    await providerProfile.save()
    console.log('Created + paid demo invoice (plumbing)')
  } else {
    console.log('Skip (exists): demo invoice (plumbing) already', demoInvoice.status)
  }

  let demoReview = await ReviewModel.findOne({ booking: demoBooking._id })
  if (!demoReview) {
    demoReview = await ReviewModel.create({
      booking: demoBooking._id,
      customer: users.customer._id,
      provider: providerProfile._id,
      rating: 5,
      comment: 'Quick and tidy work, fixed it in 40 minutes.',
      providerReply: { text: 'Thank you! Always happy to help.', at: new Date() },
    })
    await recomputeProviderRating(providerProfile._id)
    console.log('Created demo review and recomputed provider rating')
  } else {
    console.log('Skip (exists): demo review (plumbing)')
  }

  /* ---------------------------------------------------------------- */
  /* Chain 2: in-progress cleaning job with an open support complaint  */
  /* ---------------------------------------------------------------- */
  const cleaning = createdCategories['Cleaning']
  let request2 = await ServiceRequestModel.findOne({ customer: users.customer._id, description: /deep clean/i })
  if (!request2) {
    request2 = await ServiceRequestModel.create({
      customer: users.customer._id,
      title: 'Full home deep cleaning',
      description: 'Need a full deep clean of a 2BHK before guests arrive — kitchen, bathrooms, sofas.',
      category: cleaning._id,
      requiredSkills: cleaning.requiredSkills,
      serviceArea: 'Hyderabad',
      address: '8-1-284, Filmnagar, Hyderabad',
      preferredDate: new Date(),
      urgency: 'urgent',
      status: 'booked',
    })
    console.log('Created demo service request (cleaning, in-progress chain)')
  } else {
    console.log('Skip (exists): demo service request (cleaning)')
  }

  let quote2 = await QuoteModel.findOne({ serviceRequest: request2._id, provider: providerProfile2._id })
  if (!quote2) {
    quote2 = await QuoteModel.create({
      serviceRequest: request2._id,
      provider: providerProfile2._id,
      price: 900,
      estimatedDuration: '3 hours',
      notes: 'Team of 2, will bring supplies.',
      status: 'accepted',
    })
    console.log('Created demo quote (cleaning)')
  } else {
    console.log('Skip (exists): demo quote (cleaning)')
  }

  let booking2 = await BookingModel.findOne({ quote: quote2._id })
  if (!booking2) {
    const todaysKey = todayKey()
    booking2 = await BookingModel.create({
      serviceRequest: request2._id,
      quote: quote2._id,
      customer: users.customer._id,
      provider: providerProfile2._id,
      scheduledDate: dateFromKey(todaysKey),
      dateKey: todaysKey,
      startTime: '10:00',
      endTime: '13:00',
      price: quote2.price,
      status: 'inProgress',
      jobTimeline: [
        { status: 'scheduled', kind: 'system', note: 'Booking created', byName: 'System' },
        { status: 'inProgress', kind: 'status', note: 'Team arrived and started cleaning', byName: users.provider2.name },
      ],
    })
    console.log('Created demo booking (in-progress, cleaning)')
  } else {
    console.log('Skip (exists): demo booking (cleaning)')
  }

  let demoCase = await DisputeModel.findOne({ booking: booking2._id })
  if (!demoCase) {
    demoCase = await DisputeModel.create({
      type: 'complaint',
      subject: 'Team arrived late',
      booking: booking2._id,
      raisedBy: users.customer._id,
      raisedByRole: 'customer',
      reason: 'The team was booked for 10:00 but only arrived at 10:45. Please note this for future bookings.',
      priority: 'low',
      status: 'open',
      messages: [{
        sender: users.customer._id, senderName: users.customer.name, senderRole: 'customer',
        text: 'The team was booked for 10:00 but only arrived at 10:45.',
      }],
    })
    booking2.status = 'disputed'
    booking2.statusBeforeDispute = 'inProgress'
    await booking2.save()
    console.log('Created demo support case (complaint, unassigned) — visible in the support queue')
  } else {
    console.log('Skip (exists): demo support case')
  }

  /* ---------------------------------------------------------------- */
  /* Chain 3: a real, scheduled future booking (exercises SlotLock)    */
  /* ---------------------------------------------------------------- */
  const electrical = createdCategories['Electrical Work']
  let request3 = await ServiceRequestModel.findOne({ customer: users.customer._id, description: /inverter/i })
  if (!request3) {
    request3 = await ServiceRequestModel.create({
      customer: users.customer._id,
      title: 'Inverter installation',
      description: 'Need a new inverter installed and connected to the main switchboard.',
      category: electrical._id,
      requiredSkills: electrical.requiredSkills,
      serviceArea: 'Kukatpally, Hyderabad',
      address: '12-3-456, Road No. 4, Kukatpally, Hyderabad',
      urgency: 'flexible',
      status: 'booked',
    })
    console.log('Created demo service request (electrical, scheduled chain)')
  } else {
    console.log('Skip (exists): demo service request (electrical)')
  }

  let quote3 = await QuoteModel.findOne({ serviceRequest: request3._id, provider: providerProfile._id })
  if (!quote3) {
    quote3 = await QuoteModel.create({
      serviceRequest: request3._id,
      provider: providerProfile._id,
      price: 1200,
      estimatedDuration: '2 hours',
      notes: 'Will need access to the main switchboard.',
      status: 'accepted',
    })
    console.log('Created demo quote (electrical)')
  } else {
    console.log('Skip (exists): demo quote (electrical)')
  }

  let booking3 = await BookingModel.findOne({ quote: quote3._id })
  if (!booking3) {
    const futureKey = nextWeekday(addDaysKey(todayKey(), 1), 'Monday') // matches provider 1's Monday window
    booking3 = await BookingModel.create({
      serviceRequest: request3._id,
      quote: quote3._id,
      customer: users.customer._id,
      provider: providerProfile._id,
      scheduledDate: dateFromKey(futureKey),
      dateKey: futureKey,
      startTime: '10:00',
      endTime: '12:00',
      price: quote3.price,
      status: 'scheduled',
      jobTimeline: [{ status: 'scheduled', kind: 'system', note: 'Booking created', byName: 'System' }],
    })
    const claimed = await reserveSlots(providerProfile._id, futureKey, '10:00', '12:00', booking3._id)
    console.log(claimed
      ? `Created demo booking (scheduled, electrical, ${futureKey} 10:00-12:00) and claimed real calendar slots`
      : 'Created demo booking (scheduled, electrical) but slot claim skipped (already held)')
  } else {
    console.log('Skip (exists): demo booking (electrical, scheduled)')
  }

  console.log('\nSeed complete. Demo login credentials (change these in production):')
  accounts.forEach((a) => console.log(`  ${a.role.padEnd(18)} ${a.email.padEnd(28)} /  ${a.password}`))
  console.log('\nDemo data now includes:')
  console.log('  - a completed, reviewed, paid plumbing job (provider@careconnect.dev)')
  console.log('  - an in-progress cleaning job with an open support complaint (provider2@careconnect.dev)')
  console.log('  - a real scheduled electrical job claimed through the live availability engine')
  console.log('  - a third provider (provider3@careconnect.dev) still pending verification, for the admin queue')
  console.log('\nCreate a fresh request as the demo customer to exercise the live AI-classify -> quote -> book flow.')

  await disconnect()
}

seed().catch((err) => { console.error(err); process.exit(1) })
