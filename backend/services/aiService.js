// AI integration for CareConnect.
//
// Two features are AI-assisted:
//   1. classifyRequest(description, categories) — map a free-text service request
//      to a service category + required skills.
//   2. rankProviders(request, candidates)       — rank candidate providers for a
//      request using: skill match, service area, availability on the requested
//      date, and historical ratings (Bayesian-smoothed) + experience.
//
// If ANTHROPIC_API_KEY is set, Claude does the classification and writes the
// ranking reasons. If it isn't (or the call fails/times out), a transparent,
// deterministic heuristic produces the same response shape, so every feature
// works end-to-end offline. Availability is always computed by the platform
// itself (never guessed by the model).

import { getDayAvailability } from './availabilityService.js'
import { addDaysKey, todayKey, toDateKey, anyAreaMatches } from '../utils/helpers.js'

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const hasKey = () => !!process.env.ANTHROPIC_API_KEY

async function callClaude(systemPrompt, userPrompt, maxTokens = 700) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: maxTokens, system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)
    const data = await res.json()
    const text = (data.content || []).map((b) => b.text || '').join('')
    const match = text.match(/\{[\s\S]*\}/) // tolerate stray prose / code fences around the JSON
    if (!match) throw new Error('No JSON in model response')
    return JSON.parse(match[0])
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------- Classification (heuristic) ------------------------- */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'is', 'are', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'i', 'need', 'want',
  'please', 'with', 'at', 'it', 'this', 'that', 'have', 'has', 'not', 'working', 'work', 'be', 'me', 'can', 'get',
])

const stem = (w) => w.replace(/(ing|ed|es|s)$/, '')
const tokenize = (text = '') =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w)).map(stem)

// a few everyday words that don't literally appear in category names/skills
const SYNONYMS = {
  leak: ['plumbing'], tap: ['plumbing'], pipe: ['plumbing'], drain: ['plumbing'], toilet: ['plumbing'], flush: ['plumbing'],
  geyser: ['plumbing', 'electrical'], bulb: ['electrical'], switch: ['electrical'], socket: ['electrical'], fan: ['electrical'],
  wiring: ['electrical'], power: ['electrical'], mcb: ['electrical'], inverter: ['electrical'],
  fridge: ['appliance'], refrigerator: ['appliance'], washing: ['appliance'], machine: ['appliance'], ac: ['appliance'],
  microwave: ['appliance'], oven: ['appliance'], tv: ['appliance'],
  clean: ['cleaning'], sofa: ['cleaning'], carpet: ['cleaning'], dust: ['cleaning'], sanitize: ['cleaning'], mop: ['cleaning'],
  paint: ['maintenance'], carpenter: ['maintenance'], door: ['maintenance'], hinge: ['maintenance'], furniture: ['maintenance'],
}

function heuristicClassify(description, categories) {
  const tokens = new Set(tokenize(description))
  const boosts = new Set()
  tokens.forEach((t) => (SYNONYMS[t] || []).forEach((s) => boosts.add(s)))

  let best = null, bestScore = 0
  for (const cat of categories) {
    let score = 0
    const nameTokens = tokenize(cat.name)
    const skillTokens = (cat.requiredSkills || []).flatMap((s) => tokenize(s))
    const descTokens = tokenize(cat.description || '')
    for (const t of nameTokens) if (tokens.has(t)) score += 3
    for (const t of skillTokens) if (tokens.has(t)) score += 2
    for (const t of descTokens) if (tokens.has(t)) score += 1
    for (const b of boosts) if (nameTokens.includes(b) || skillTokens.includes(b)) score += 3
    if (score > bestScore) { bestScore = score; best = cat }
  }
  return {
    category: best ? best._id : null,
    categoryName: best ? best.name : 'Uncategorized',
    requiredSkills: best ? best.requiredSkills : [],
    confidence: best ? Math.min(0.95, bestScore / 8) : 0,
    method: 'heuristic',
  }
}

/* --------------------------- Ranking (heuristic) ---------------------------- */

const PRIOR_MEAN = 4.0   // assumed platform-average rating for providers with few reviews
const PRIOR_WEIGHT = 3   // "virtual reviews" — stops one 5★ review from beating fifty 4.8★ ones

const bayesianRating = (rating, count) => (((rating || 0) * (count || 0)) + PRIOR_MEAN * PRIOR_WEIGHT) / ((count || 0) + PRIOR_WEIGHT)

// availability signal for a provider against the request's preferred date
async function availabilitySignal(profile, preferredDate) {
  const dateKey = toDateKey(preferredDate)
  if (dateKey && dateKey >= todayKey()) {
    const day = await getDayAvailability(profile, dateKey)
    if (day.freeMinutes > 0) return { score: 1, status: 'available', dateKey, freeWindows: day.free }
    if (day.windows.length > 0) return { score: 0.15, status: 'fully_booked', dateKey, freeWindows: [] }
    return { score: 0, status: 'not_working', dateKey, freeWindows: [] }
  }
  // no (usable) date: how many of the next 7 days does the provider have free capacity?
  const start = todayKey()
  let open = 0
  for (let i = 0; i < 7; i++) {
    const d = await getDayAvailability(profile, addDaysKey(start, i))
    if (d.freeMinutes > 0) open++
  }
  return { score: open / 7, status: open ? 'flexible' : 'not_working', dateKey: null, freeWindows: [], openDaysNext7: open }
}

async function heuristicRank(request, candidates) {
  const required = (request.requiredSkills || []).map((s) => s.toLowerCase())
  const scored = []
  for (const p of candidates) {
    const skills = (p.skills || []).map((s) => s.toLowerCase())
    const matched = required.filter((s) => skills.some((ps) => ps === s || ps.includes(s) || s.includes(ps)))
    const skillCoverage = required.length ? matched.length / required.length : 0.5
    const ratingScore = bayesianRating(p.rating, p.ratingCount) / 5
    const experienceScore = Math.min(1, (p.experienceYears || 0) / 10)
    const availability = await availabilitySignal(p, request.preferredDate)
    const areaExact = anyAreaMatches(p.serviceAreas, request.serviceArea)

    const score = skillCoverage * 0.35 + ratingScore * 0.25 + availability.score * 0.25 + experienceScore * 0.1 + (areaExact ? 0.05 : 0)
    const bits = [
      required.length ? `${matched.length}/${required.length} required skills` : 'general skills',
      p.ratingCount ? `${(p.rating || 0).toFixed(1)}★ from ${p.ratingCount} review${p.ratingCount > 1 ? 's' : ''}` : 'new on the platform',
      `${p.experienceYears || 0}y experience`,
      availability.status === 'available' ? 'free on your preferred date'
        : availability.status === 'fully_booked' ? 'fully booked on your preferred date'
        : availability.status === 'not_working' ? 'not working on your preferred date'
        : `${availability.openDaysNext7}/7 days open this week`,
    ]
    scored.push({
      provider: p, score: Number(score.toFixed(3)), skillOverlap: matched.length, matchedSkills: matched,
      availability, reason: bits.join(', '), method: 'heuristic',
      breakdown: {
        skills: Number(skillCoverage.toFixed(2)), rating: Number(ratingScore.toFixed(2)),
        availability: Number(availability.score.toFixed(2)), experience: Number(experienceScore.toFixed(2)),
      },
    })
  }
  return scored.sort((a, b) => b.score - a.score)
}

/* ------------------------------ Public API ---------------------------------- */

export async function classifyRequest(description, categories) {
  if (!categories.length) {
    return { category: null, categoryName: 'Uncategorized', requiredSkills: [], confidence: 0, method: 'none' }
  }
  if (!hasKey()) return heuristicClassify(description, categories)

  try {
    const catList = categories.map((c) => ({ id: String(c._id), name: c.name, skills: c.requiredSkills }))
    const result = await callClaude(
      'You classify a home-services request into exactly one category from the provided list. ' +
      'Respond with ONLY minified JSON: {"categoryId": string|null, "requiredSkills": string[], "confidence": number}. ' +
      'requiredSkills must be drawn from the matched category\'s skills. confidence is 0-1.',
      `Categories: ${JSON.stringify(catList)}\nRequest description: ${JSON.stringify(String(description).slice(0, 1500))}`
    )
    const match = categories.find((c) => String(c._id) === result.categoryId)
    return {
      category: match ? match._id : null,
      categoryName: match ? match.name : 'Uncategorized',
      requiredSkills: result.requiredSkills?.length ? result.requiredSkills : (match?.requiredSkills || []),
      confidence: Number(result.confidence ?? 0.5),
      method: 'claude',
    }
  } catch (err) {
    console.error('AI classify failed, using heuristic fallback:', err.message)
    return heuristicClassify(description, categories)
  }
}

export async function rankProviders(request, candidates) {
  if (!candidates.length) return []
  const ranked = await heuristicRank(request, candidates)
  if (!hasKey()) return ranked

  // Let Claude re-order and explain, using the platform-computed signals as evidence.
  try {
    const evidence = ranked.map((r) => ({
      id: String(r.provider._id), skills: r.provider.skills, matchedSkills: r.matchedSkills,
      rating: r.provider.rating, ratingCount: r.provider.ratingCount, experienceYears: r.provider.experienceYears,
      availability: r.availability.status, heuristicScore: r.score,
    }))
    const result = await callClaude(
      'You rank home-service providers by fit for a customer request. Consider skills, historical ratings ' +
      '(weight the number of reviews), experience and availability. Never rank an unavailable provider above an ' +
      'available one of similar quality. Respond with ONLY minified JSON: ' +
      '{"ranked":[{"id": string, "score": number, "reason": string}]} best-first, score 0-1, reason <= 20 words.',
      `Request: ${JSON.stringify(String(request.description).slice(0, 800))}. Needs skills: ${JSON.stringify(request.requiredSkills || [])}, ` +
      `area: ${JSON.stringify(request.serviceArea)}, preferred date: ${toDateKey(request.preferredDate) || 'flexible'}.\n` +
      `Candidates: ${JSON.stringify(evidence)}`,
      1000
    )
    const byId = new Map(ranked.map((r) => [String(r.provider._id), r]))
    const aiOrdered = (result.ranked || []).filter((r) => byId.has(r.id)).map((r) => ({
      ...byId.get(r.id), score: Number(r.score ?? byId.get(r.id).score), reason: r.reason || byId.get(r.id).reason, method: 'claude',
    }))
    // keep any candidate the model omitted, after the ranked ones
    const seen = new Set(aiOrdered.map((r) => String(r.provider._id)))
    return [...aiOrdered, ...ranked.filter((r) => !seen.has(String(r.provider._id)))]
  } catch (err) {
    console.error('AI ranking failed, using heuristic ranking:', err.message)
    return ranked
  }
}
