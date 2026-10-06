import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, trim: true },
  role: {
    type: String,
    enum: ['admin', 'operationsManager', 'provider', 'customer', 'supportAgent'],
    default: 'customer'
  },
  address: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true })

export const UserModel = model('User', userSchema)
