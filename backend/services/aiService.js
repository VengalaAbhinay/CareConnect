// AI integration for CareConnect.
//
// Two features are AI-assisted, per the spec:
//   1. classifyRequest(description, categories) — map free-text service
//      requests to a service category + required skills.
//   2. rankProviders(request, candidates) — rank/score candidate providers
//      for a given request.
//
// If ANTHROPIC_API_KEY is present in the environment, both features call the
// real Claude API for a genuine AI classification/ranking. If it isn't set
// (e.g. local dev without a key), a transparent, deterministic heuristic
// fallback keeps every feature fully working end-to-end.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)
  const data = await res.json()
  const text = (data.content || []).map((b) => b.text || '').join('')
  const cleaned = text.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}

/* ---------------- Heuristic fallback (no external calls) ---------------- */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'is', 'are', 'and', 'or', 'to', 'for', 'of', 'in', 'on',
  'i', 'need', 'want', 'please', 'with', 'at', 'it', 'this', 'that', 'have', 'has',
])

function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
}

function heuristicClassify(description, categories) {
  const tokens = new Set(tokenize(description))
  let best = null
  let bestScore = 0

  for (const cat of categories) {
    let score = 0
    const nameTokens = tokenize(cat.name)
    const skillTokens = (cat.requiredSkills || []).flatMap((s) => tokenize(s))
    const descTokens = tokenize(cat.description || '')

    for (const t of nameTokens) if (tokens.has(t)) score += 3
    for (const t of skillTokens) if (tokens.has(t)) score += 2
    for (const t of descTokens) if (tokens.has(t)) score += 1

    if (score > bestScore) {
      bestScore = score
      best = cat
    }
  }

  return {
    category: best ? best._id : null,
    categoryName: best ? best.name : 'Uncategorized',
    requiredSkills: best ? best.requiredSkills : [],
    confidence: best ? Math.min(1, bestScore / 8) : 0,
    method: 'heuristic',
  }
}

function heuristicRankProviders(request, candidates) {
  const requiredSkills = (request.requiredSkills || []).map((s) => s.toLowerCase())
  return candidates
    .map((p) => {
      const providerSkills = (p.skills || []).map((s) => s.toLowerCase())
      const skillOverlap = requiredSkills.filter((s) => providerSkills.includes(s)).length
      const skillCoverage = requiredSkills.length ? skillOverlap / requiredSkills.length : 0.5
      const ratingScore = (p.rating || 0) / 5
      const experienceScore = Math.min(1, (p.experienceYears || 0) / 10)
      const score = skillCoverage * 0.55 + ratingScore * 0.3 + experienceScore * 0.15
      return {
        provider: p,
        score: Number(score.toFixed(3)),
        skillOverlap,
        reason: `${skillOverlap}/${requiredSkills.length || 0} required skills matched, ` +
          `${(p.rating || 0).toFixed(1)}★ rating, ${p.experienceYears || 0}y experience`,
      }
    })
    .sort((a, b) => b.score - a.score)
}

/* ---------------------------- Public API --------------------------------- */

export async function classifyRequest(description, categories) {
  if (!categories.length) {
    return { category: null, categoryName: 'Uncategorized', requiredSkills: [], confidence: 0, method: 'none' }
  }

  if (!ANTHROPIC_API_KEY) return heuristicClassify(description, categories)

  try {
    const catList = categories.map((c) => ({ id: String(c._id), name: c.name, skills: c.requiredSkills }))
    const result = await callClaude(
      'You classify a home-services request into exactly one category from the provided list. ' +
      'Respond with ONLY minified JSON: {"categoryId": string|null, "requiredSkills": string[], "confidence": number}. ' +
      'requiredSkills must be drawn from the matched category\'s skills. confidence is 0-1.',
      `Categories: ${JSON.stringify(catList)}\nRequest description: "${description}"`
    )
    const match = categories.find((c) => String(c._id) === result.categoryId)
    return {
      category: match ? match._id : null,
      categoryName: match ? match.name : 'Uncategorized',
      requiredSkills: result.requiredSkills?.length ? result.requiredSkills : (match?.requiredSkills || []),
      confidence: result.confidence ?? 0.5,
      method: 'claude',
    }
  } catch (err) {
    console.error('AI classify failed, using heuristic fallback:', err.message)
    return heuristicClassify(description, categories)
  }
}

export async function rankProviders(request, candidates) {
  if (!candidates.length) return []
  if (!ANTHROPIC_API_KEY) return heuristicRankProviders(request, candidates)

  try {
    const candidateList = candidates.map((p) => ({
      id: String(p._id),
      skills: p.skills,
      rating: p.rating,
      ratingCount: p.ratingCount,
      experienceYears: p.experienceYears,
    }))
    const result = await callClaude(
      'You rank home-service providers by fit for a request. ' +
      'Respond with ONLY minified JSON: {"ranked":[{"id": string, "score": number, "reason": string}]} ' +
      'sorted best-first, score 0-1.',
      `Request needs skills: ${JSON.stringify(request.requiredSkills || [])}, area: "${request.serviceArea}".\n` +
      `Candidates: ${JSON.stringify(candidateList)}`
    )
    const byId = new Map(candidates.map((p) => [String(p._id), p]))
    return (result.ranked || [])
      .filter((r) => byId.has(r.id))
      .map((r) => ({ provider: byId.get(r.id), score: r.score, reason: r.reason }))
  } catch (err) {
    console.error('AI ranking failed, using heuristic fallback:', err.message)
    return heuristicRankProviders(request, candidates)
  }
}
