import { Schema, model } from 'mongoose'

// One document per provider per 15-minute cell that is booked.
// The UNIQUE index is the availability engine's guarantee: the database itself
// rejects any second booking that touches an already-taken cell, even when two
// customers submit at the same instant.
const slotLockSchema = new Schema({
  provider: { type: Schema.Types.ObjectId, ref: 'ProviderProfile', required: true },
  dateKey: { type: String, required: true },
  cell: { type: Number, required: true }, // minutes since midnight / 15
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true }
})

slotLockSchema.index({ provider: 1, dateKey: 1, cell: 1 }, { unique: true })

export const SlotLockModel = model('SlotLock', slotLockSchema)
