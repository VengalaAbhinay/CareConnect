import { Schema, model } from 'mongoose'

const serviceCategorySchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  basePriceRange: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  requiredSkills: [{ type: String }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true })

export const ServiceCategoryModel = model('ServiceCategory', serviceCategorySchema)
