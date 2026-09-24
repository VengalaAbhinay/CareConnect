// One-off seed script.
//
// Creates:
//  - one demo account per role (admin, operationsManager, supportAgent,
//    provider, customer) — internal roles (admin/ops/support) are NOT
//    selectable on the public registration form (see UserAPI.js), so they
//    only exist via this script or a direct DB edit.
//  - a starter set of service categories
//  - a verified provider profile for the demo provider
//  - one fully connected demo chain: ServiceRequest -> Quote -> Booking
//    (completed, customer-confirmed) -> Review, so the reviewer can log in
//    and immediately see a working history instead of an empty dashboard.
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

config()

const accounts = [
  { name: 'Platform Admin', email: 'admin@careconnect.dev', password: 'Admin@123', role: 'admin' },
  { name: 'Ops Manager', email: 'ops@careconnect.dev', password: 'Ops@1234', role: 'operationsManager' },
  { name: 'Support Agent', email: 'support@careconnect.dev', password: 'Support@123', role: 'supportAgent' },
  { name: 'Demo Provider', email: 'provider@careconnect.dev', password: 'Provider@123', role: 'provider', phone: '9876500001' },
  { name: 'Demo Customer', email: 'customer@careconnect.dev', password: 'Customer@123', role: 'customer', phone: '9876500002' },
]

const categories = [
  { name: 'Appliance Repair', description: 'Fixing washing machines, fridges, ACs, microwaves.', requiredSkills: ['appliance repair', 'electrical'], basePriceRange: { min: 300, max: 2500 } },
  { name: 'Cleaning', description: 'Home deep cleaning, sofa/carpet cleaning, bathroom cleaning.', requiredSkills: ['cleaning', 'housekeeping'], basePriceRange: { min: 200, max: 1500 } },
  { name: 'Electrical Work', description: 'Wiring, switchboards, fan/light installation, inverter setup.', requiredSkills: ['electrical', 'wiring'], basePriceRange: { min: 150, max: 3000 } },
  { name: 'Plumbing', description: 'Leak repair, tap/pipe fitting, bathroom fittings.', requiredSkills: ['plumbing'], basePriceRange: { min: 150, max: 2500 } },
  { name: 'Maintenance', description: 'General home maintenance, carpentry, painting touch-ups.', requiredSkills: ['carpentry', 'maintenance'], basePriceRange: { min: 200, max: 3000 } },
]

async function upsertUser(acc) {
  let user = await UserModel.findOne({ email: acc.email })
  if (user) { console.log(`Skip (exists): ${acc.email}`); return user }
  const hashedPassword = await bcrypt.hash(acc.password, 10)
  user = await UserModel.create({ ...acc, password: hashedPassword })
  console.log(`Created ${acc.role}: ${acc.email} / ${acc.password}`)
  return user
}

async function seed() {
  await connect(process.env.DB_URL)
  console.log('Connected to DB for seeding...')

  const users = {}
  for (const acc of accounts) {
    const key = acc.role === 'provider' ? 'provider' : acc.role === 'customer' ? 'customer' : acc.role
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

  // --- Demo provider profile (verified, so it can quote immediately) ---
  let providerProfile = await ProviderProfileModel.findOne({ user: users.provider._id })
  if (!providerProfile) {
    providerProfile = await ProviderProfileModel.create({
      user: users.provider._id,
      skills: ['plumbing', 'electrical', 'appliance repair'],
      serviceAreas: ['Kukatpally, Hyderabad', 'Madhapur, Hyderabad'],
      experienceYears: 6,
      documents: [],
      verificationStatus: 'verified',
      availability: [
        { day: 'Monday', startTime: '09:00', endTime: '18:00' },
        { day: 'Tuesday', startTime: '09:00', endTime: '18:00' },
        { day: 'Wednesday', startTime: '09:00', endTime: '18:00' },
      ],
    })
    console.log('Created verified provider profile for provider@careconnect.dev')
  } else {
    console.log('Skip (exists): provider profile')
  }

  // --- Demo end-to-end chain: request -> quote -> booking -> review ---
  const plumbing = createdCategories['Plumbing']
  let demoRequest = await ServiceRequestModel.findOne({ customer: users.customer._id, description: /kitchen tap/i })
  if (!demoRequest) {
    demoRequest = await ServiceRequestModel.create({
      customer: users.customer._id,
      description: 'My kitchen tap is leaking continuously and needs a new washer.',
      category: plumbing._id,
      requiredSkills: plumbing.requiredSkills,
      serviceArea: 'Kukatpally, Hyderabad',
      preferredDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: 'booked',
    })
    console.log('Created demo service request')
  } else {
    console.log('Skip (exists): demo service request')
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
    console.log('Created demo quote')
  } else {
    console.log('Skip (exists): demo quote')
  }

  let demoBooking = await BookingModel.findOne({ quote: demoQuote._id })
  if (!demoBooking) {
    const scheduledDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday, so it can be shown "completed"
    demoBooking = await BookingModel.create({
      serviceRequest: demoRequest._id,
      quote: demoQuote._id,
      customer: users.customer._id,
      provider: providerProfile._id,
      scheduledDate,
      startTime: '17:00',
      endTime: '18:00',
      price: demoQuote.price,
      status: 'completed',
      customerConfirmed: true,
      jobTimeline: [
        { status: 'scheduled', note: 'Booking created', createdAt: scheduledDate },
        { status: 'inProgress', note: 'Provider started the job', createdAt: scheduledDate },
        { status: 'completed', note: 'Washer replaced, leak fixed', createdAt: scheduledDate },
        { status: 'completed', note: 'Customer confirmed completion', createdAt: scheduledDate },
      ],
      invoice: { amount: demoQuote.price, issuedAt: scheduledDate, paid: true },
    })
    console.log('Created demo booking (completed)')
  } else {
    console.log('Skip (exists): demo booking')
  }

  let demoReview = await ReviewModel.findOne({ booking: demoBooking._id })
  if (!demoReview) {
    demoReview = await ReviewModel.create({
      booking: demoBooking._id,
      customer: users.customer._id,
      provider: providerProfile._id,
      rating: 5,
      comment: 'Quick and tidy work, fixed it in 40 minutes.',
    })
    providerProfile.rating = ((providerProfile.rating * providerProfile.ratingCount) + 5) / (providerProfile.ratingCount + 1)
    providerProfile.ratingCount += 1
    await providerProfile.save()
    console.log('Created demo review and updated provider rating')
  } else {
    console.log('Skip (exists): demo review')
  }

  console.log('\nSeed complete. Demo login credentials (change these in production):')
  accounts.forEach((a) => console.log(`  ${a.role.padEnd(18)} ${a.email}  /  ${a.password}`))
  console.log('\nThe demo customer + demo provider already share one completed, reviewed booking.')
  console.log('Create a fresh request as the demo customer to exercise the live AI-classify -> quote -> book flow.')

  await disconnect()
}

seed().catch((err) => { console.error(err); process.exit(1) })