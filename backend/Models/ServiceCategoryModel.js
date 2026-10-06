import { Schema, model } from 'mongoose'

const serviceCategorySchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String },
  // ---- pricing policy (managed by the Platform Admin) ----
  basePriceRange: {
    min: { type: Number, default: 0, min: 0 },
    max: { type: Number, default: 0, min: 0 }
  },
  enforcePriceRange: { type: Boolean, default: true }, // reject quotes outside basePriceRange
  platformFeePercent: { type: Number, default: 10, min: 0, max: 100 }, // deducted from the provider payout
  taxPercent: { type: Number, default: 0, min: 0, max: 100 }, // added to the customer's invoice (e.g. GST)
  requiredSkills: [{ type: String }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true })

export const ServiceCategoryModel = model('ServiceCategory', serviceCategorySchema)
