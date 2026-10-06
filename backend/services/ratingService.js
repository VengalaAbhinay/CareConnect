import { ReviewModel } from '../Models/ReviewModel.js'
import { ProviderProfileModel } from '../Models/ProviderProfileModel.js'

// Recompute a provider's rating from all reviews (idempotent, so edits/deletes stay consistent).
export async function recomputeProviderRating(providerId) {
  const reviews = await ReviewModel.find({ provider: providerId }).select('rating')
  const count = reviews.length
  const avg = count ? reviews.reduce((n, r) => n + r.rating, 0) / count : 0
  await ProviderProfileModel.findByIdAndUpdate(providerId, {
    rating: Math.round(avg * 100) / 100,
    ratingCount: count,
  })
}
