import { Schema, model } from 'mongoose'

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: {
    type: String,
    enum: ['admin', 'operationsManager', 'provider', 'customer', 'supportAgent'],
    default: 'customer'
  },
  address: { type: String },
  isActive: { type: Boolean, default: true }
}, { timestamps: true })

export const UserModel = model('User', userSchema)
