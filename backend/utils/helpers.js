// Shared, dependency-free helpers used across the API layer.

export const STAFF_ROLES = ['admin', 'operationsManager', 'supportAgent']
export const MANAGER_ROLES = ['admin', 'operationsManager']

// booking statuses that still hold the provider's calendar
export const ACTIVE_BOOKING_STATUSES = ['scheduled', 'inProgress', 'awaitingConfirmation', 'disputed']

// user fields that are safe to show to other (non-staff) users
export const PUBLIC_USER = 'name'
// fields a booking's two parties may see of each other (never the password hash)
export const PARTY_USER = 'name email phone address'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ------------------------------- dates -------------------------------- */

export function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// accepts 'YYYY-MM-DD' (from <input type="date">) or anything Date can parse
export function toDateKey(input) {
  if (!input) return null
  if (typeof input === 'string' && isDateKey(input)) return input
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export const dateFromKey = (key) => new Date(`${key}T00:00:00.000Z`)
export const weekdayOf = (key) => WEEKDAYS[dateFromKey(key).getUTCDay()]

// "today" in the business timezone (default IST, UTC+05:30) so that a booking
// made at 1am IST for "today" is not judged against the UTC calendar day.
export function todayKey() {
  const offsetMin = Number(process.env.BUSINESS_TZ_OFFSET_MIN ?? 330)
  return new Date(Date.now() + offsetMin * 60000).toISOString().slice(0, 10)
}

export function addDaysKey(key, days) {
  const d = dateFromKey(key)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/* ------------------------------- times -------------------------------- */

export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/* --------------------------- lists / strings --------------------------- */

// accepts an array or a comma separated string; trims, drops empties, de-dupes (case-insensitive)
export function cleanList(input) {
  const arr = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : []
  const seen = new Set()
  const out = []
  for (const raw of arr) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9\s,]/g, ' ').replace(/\s+/g, ' ').trim()

// Forgiving service-area comparison: "Kukatpally" matches "Kukatpally, Hyderabad",
// and a city-wide provider ("Hyderabad") matches any locality inside that city.
export function areaMatches(a, b) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 3 && y.includes(x)) return true
  if (y.length >= 3 && x.includes(y)) return true
  return x.split(',')[0].trim() === y.split(',')[0].trim()
}

export const anyAreaMatches = (areas = [], target) => areas.some((a) => areaMatches(a, target))

// mongoose ObjectId / populated doc / string -> string id
export const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : '')
export const sameId = (a, b) => idOf(a) !== '' && idOf(a) === idOf(b)

export const money = (n) => Math.round((Number(n) || 0) * 100) / 100
