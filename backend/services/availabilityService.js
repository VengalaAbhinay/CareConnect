// Availability engine.
//
// A booking is only possible when:
//   1. the requested window is well formed (valid date, 15-minute grid, start < end, not in the past),
//   2. it sits inside one of the provider's published weekly working windows, and
//   3. none of its 15-minute cells is already locked by another booking.
//
// (3) is enforced by the UNIQUE index on SlotLock, so it stays correct even when
// two customers try to book the same provider at the same instant.

import { SlotLockModel } from '../Models/SlotLockModel.js'
import { isDateKey, isTime, toMin, toHHMM, weekdayOf, todayKey } from '../utils/helpers.js'

export const CELL_MIN = 15
export const MIN_DURATION_MIN = 30

export function validateWindow(dateKey, startTime, endTime) {
  if (!isDateKey(dateKey)) return 'Choose a valid date'
  if (!isTime(startTime) || !isTime(endTime)) return 'Choose a valid start and end time'
  const s = toMin(startTime), e = toMin(endTime)
  if (e <= s) return 'End time must be after the start time'
  if (s % CELL_MIN || e % CELL_MIN) return 'Times must be on a 15-minute boundary (e.g. 10:00, 10:15)'
  if (e - s < MIN_DURATION_MIN) return `A booking must be at least ${MIN_DURATION_MIN} minutes long`
  if (dateKey < todayKey()) return 'You cannot book a date in the past'
  return null
}

// is the window fully inside one of the provider's weekly working windows?
export function withinWeekly(profile, dateKey, startTime, endTime) {
  const day = weekdayOf(dateKey)
  const s = toMin(startTime), e = toMin(endTime)
  return (profile.availability || []).some(
    (w) => w.day === day && isTime(w.startTime) && isTime(w.endTime) && toMin(w.startTime) <= s && toMin(w.endTime) >= e
  )
}

const cellsFor = (startTime, endTime) => {
  const out = []
  for (let m = toMin(startTime); m < toMin(endTime); m += CELL_MIN) out.push(m / CELL_MIN)
  return out
}

// Atomically claim the window for a booking. Returns true on success, false if any cell is taken.
export async function reserveSlots(providerId, dateKey, startTime, endTime, bookingId) {
  try {
    await SlotLockModel.insertMany(
      cellsFor(startTime, endTime).map((cell) => ({ provider: providerId, dateKey, cell, booking: bookingId })),
      { ordered: true }
    )
    return true
  } catch (err) {
    await SlotLockModel.deleteMany({ booking: bookingId, provider: providerId }) // roll back only the cells we just claimed
    if (err?.code === 11000 || /E11000|duplicate key/i.test(err?.message || '')) return false
    throw err
  }
}

// free a booking's cells (optionally only those held on one provider's calendar)
export const releaseSlots = (bookingId, providerId) =>
  SlotLockModel.deleteMany({ booking: bookingId, ...(providerId ? { provider: providerId } : {}) })

// merge overlapping/adjacent [start,end] minute intervals
function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const out = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

function subtract(windows, taken) {
  const free = []
  for (const [ws, we] of windows) {
    let cursor = ws
    for (const [ts, te] of taken) {
      if (te <= cursor || ts >= we) continue
      if (ts > cursor) free.push([cursor, ts])
      cursor = Math.max(cursor, te)
    }
    if (cursor < we) free.push([cursor, we])
  }
  return free.filter(([s, e]) => e - s >= MIN_DURATION_MIN)
}

// What can a customer actually book on this day?
export async function getDayAvailability(profile, dateKey) {
  const day = weekdayOf(dateKey)
  const windows = mergeIntervals(
    (profile.availability || [])
      .filter((w) => w.day === day && isTime(w.startTime) && isTime(w.endTime) && toMin(w.endTime) > toMin(w.startTime))
      .map((w) => [toMin(w.startTime), toMin(w.endTime)])
  )
  const locks = await SlotLockModel.find({ provider: profile._id, dateKey }).select('cell')
  const taken = mergeIntervals(locks.map((l) => [l.cell * CELL_MIN, l.cell * CELL_MIN + CELL_MIN]))
  const free = subtract(windows, taken)
  const fmt = (arr) => arr.map(([s, e]) => ({ startTime: toHHMM(s), endTime: toHHMM(e) }))
  return {
    dateKey, weekday: day,
    windows: fmt(windows), booked: fmt(taken), free: fmt(free),
    freeMinutes: free.reduce((n, [s, e]) => n + (e - s), 0),
    isPast: dateKey < todayKey(),
  }
}

// Validate, then reserve. Returns { ok:true } or { ok:false, status, message }.
export async function claimWindow(profile, dateKey, startTime, endTime, bookingId) {
  const bad = validateWindow(dateKey, startTime, endTime)
  if (bad) return { ok: false, status: 400, message: bad }
  if (!withinWeekly(profile, dateKey, startTime, endTime)) {
    return { ok: false, status: 409, message: `This provider does not work ${weekdayOf(dateKey)}s ${startTime}–${endTime}. Pick one of their available windows.` }
  }
  const ok = await reserveSlots(profile._id, dateKey, startTime, endTime, bookingId)
  if (!ok) return { ok: false, status: 409, message: 'That time was just taken by another booking. Please choose a different slot.' }
  return { ok: true }
}
