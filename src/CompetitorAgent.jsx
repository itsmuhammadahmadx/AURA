import { useState } from 'react'

// ─── CompetitorAgent.jsx ──────────────────────────────────────────────────────
// Competitor Research Agent for AURA
// Max 5 competitors per research session
// Usage: import { runCompetitorAgent, CompetitorReport } from './CompetitorAgent'

const SERPER_KEY = '2024badf2a3650801e50c0d3f25daecc21e16e71'
const OR_KEY = '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'
const MAX_RESULTS = 5

// ─── Serper search ────────────────────────────────────────────────────────────
async function serperSearch(query, num = 10) {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num })
    })
    return await res.json()
  } catch {
    return { organic: [] }
  }
}

// ─── OpenRouter AI ────────────────────────────────────────────────────────────
async function aiCall(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

function safeJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

// ─── Parse intent ─────────────────────────────────────────────────────────────
async function parseIntent(text, bizData) {
  const bizContext = `Business: "${bizData?.name || 'unknown'}", Industry: "${bizData?.industry || 'general'}", Notes: "${bizData?.notes || ''}", Goal: "${bizData?.goal || ''}"`
  const raw = await aiCall(`
Parse this competitor research request.

${bizContext}

User said: "${text}"

Return ONLY valid JSON (no markdown):
{
  "mode": "single" | "compare" | "find" | "complaints",
  "competitors": ["Name1"],
  "location": "city or empty string",
  "industry": "the SPECIFIC service/niche (e.g. 'AI automation', 'chatbot development', 'web design') NOT generic like 'freelancing'"
}

Rules:
- "single" = research one competitor ("research XYZ", "tell me about ABC company")
- "compare" = compare two side by side ("compare A vs B", "A or B which is better")
- "find" = discover competitors ("find my competitors", "who are my competitors in Karachi")
- "complaints" = customer pain points ("what do customers complain about", "reviews problems")
- For "find"/"complaints" competitors array can be empty
- Max 2 names in competitors array
- industry: extract the ACTUAL service niche from the business context above, not just "freelancing"
`)
  return safeJSON(raw) || { mode: 'single', competitors: [text], location: '', industry: '' }
}

// ─── Research one competitor ──────────────────────────────────────────────────
async function researchOne(name, location, bizData) {
  const loc = location || ''
  const [s1, s2, s3] = await Promise.all([
    serperSearch(`${name} ${loc} services pricing about`),
    serperSearch(`${name} ${loc} reviews team founded`),
    serperSearch(`"${name}" complaints negative reviews site:trustpilot.com OR site:clutch.co OR site:reddit.com`),
  ])

  const snippets = [
    ...(s1.organic || []), ...(s2.organic || []), ...(s3.organic || [])
  ].slice(0, 25).map(r => ({ title: r.title, snippet: r.snippet, link: r.link }))

  const raw = await aiCall(`
You are a competitive intelligence analyst for "${bizData?.name || 'our business'}" in the ${bizData?.industry || 'general'} industry.

Research competitor "${name}" using these results:
${JSON.stringify(snippets)}

Return ONLY valid JSON (no markdown):
{
  "name": "${name}",
  "tagline": "their value prop in 1 sentence or —",
  "overview": "2 sentences about who they are",
  "website": "website URL or —",
  "location": "city, country or —",
  "founded": "year or —",
  "team_size": "estimated size or —",
  "services": [{"name": "Service", "price": "price or —", "details": "brief description"}],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "online_presence": {
    "website_quality": "strong" | "moderate" | "weak",
    "social_media": "active" | "moderate" | "inactive",
    "seo": "strong" | "moderate" | "weak",
    "review_score": "score or —",
    "notes": "1 sentence about online presence"
  },
  "target_customer": "who they serve in 1 sentence",
  "pricing_tier": "budget" | "mid-market" | "premium" | "enterprise",
  "how_to_beat": ["tactic 1", "tactic 2", "tactic 3"],
  "threat_level": 7,
  "threat_reason": "why this threat level in 1 sentence"
}

Be specific based on actual search results. Use "—" for missing info.
`)

  return safeJSON(raw) || {
    name,
    overview: 'Limited public information available.',
    tagline: '—', website: '—', location: '—', founded: '—', team_size: '—',
    services: [], strengths: ['Established presence'], weaknesses: ['Limited online info'],
    online_presence: { website_quality: 'moderate', social_media: 'moderate', seo: 'moderate', review_score: '—', notes: 'Limited data.' },
    target_customer: '—', pricing_tier: 'mid-market',
    how_to_beat: ['Differentiate on quality', 'Build stronger online presence', 'Target their weak spots'],
    threat_level: 5, threat_reason: 'Insufficient data to assess accurately.'
  }
}

// ─── Find competitors ─────────────────────────────────────────────────────────
async function findCompetitors(location, industry, bizData) {
  const ind = industry || bizData?.industry || 'business'
  const loc = location || ''

  // Build service-specific keywords from bizData notes/goal to get hyper-relevant results
  const serviceHint = bizData?.notes
    ? bizData.notes.slice(0, 60)
    : bizData?.goal
    ? bizData.goal.slice(0, 40)
    : ind

  // Use very specific local queries — avoids returning global platforms like Upwork/Fiverr
  const [s1, s2, s3] = await Promise.all([
    serperSearch(`"${serviceHint}" freelancer ${loc} contact hire`),
    serperSearch(`${serviceHint} agency ${loc} services portfolio`),
    serperSearch(`${serviceHint} expert ${loc} -upwork -fiverr -freelancer.com -guru -truelancer -indeed -linkedin`),
  ])

  const combined = [...(s1.organic || []), ...(s2.organic || []), ...(s3.organic || [])].slice(0, 25)

  const raw = await aiCall(`
Find REAL LOCAL competitors for "${bizData?.name || 'a business'}" which offers "${serviceHint}" services${loc ? ` in ${loc}` : ''}.

Search results:
${JSON.stringify(combined.map(r => ({ title: r.title, snippet: r.snippet, link: r.link })))}

CRITICAL RULES:
- NEVER include global platforms: Upwork, Fiverr, Freelancer.com, Guru, Truelancer, LinkedIn, Indeed, Toptal, PeoplePerHour
- ONLY include actual local businesses, agencies, or individual freelancers found in the results
- They must offer similar services to "${serviceHint}"
- If a result is from ${loc}, prioritize it heavily
- If you cannot find ${MAX_RESULTS} local competitors, return fewer — DO NOT fill with global platforms

Return ONLY a JSON array (max ${MAX_RESULTS}):
[{"name": "Business/Person Name", "snippet": "what they do in 1 sentence", "website": "URL or —", "why_competitor": "why they compete with ${bizData?.name || 'this business'} specifically"}]

Return empty array [] if no real local competitors found.
`)

  return safeJSON(raw) || []
}

// ─── Find complaints ──────────────────────────────────────────────────────────
async function findComplaints(competitors, location, bizData) {
  const ind = bizData?.industry || 'business'
  const names = competitors?.length ? competitors.join(' OR ') : ind
  const loc = location || ''

  const [s1, s2] = await Promise.all([
    serperSearch(`${names} ${loc} complaints bad reviews problems 2024`),
    serperSearch(`${ind} ${loc} customer complaints negative reviews`),
  ])

  const combined = [...(s1.organic || []), ...(s2.organic || [])].slice(0, 20)

  const raw = await aiCall(`
Analyze customer complaints about competitors in "${ind}"${loc ? ` in ${loc}` : ''}.

Results:
${JSON.stringify(combined.map(r => ({ title: r.title, snippet: r.snippet })))}

For "${bizData?.name || 'our business'}" to exploit these gaps.

Return ONLY valid JSON (no markdown):
{
  "top_complaints": [
    {"complaint": "specific complaint", "frequency": "very common" | "common" | "occasional", "opportunity": "how ${bizData?.name || 'we'} can win here"}
  ],
  "summary": "2 sentences about the biggest pain points",
  "your_advantage": "2 sentences on how ${bizData?.name || 'this business'} should position itself"
}

List max 5 complaints. Be specific and actionable.
`)

  return safeJSON(raw) || { top_complaints: [], summary: 'Could not retrieve data.', your_advantage: '' }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export async function runCompetitorAgent(text, bizData) {
  const intent = await parseIntent(text, bizData)
  const { mode, competitors, location, industry } = intent

  // ── Find mode ─────────────────────────────────────────────────────────────
  if (mode === 'find') {
    const found = await findCompetitors(location, industry, bizData)
    const limited = found.slice(0, MAX_RESULTS)
    if (!limited.length) {
      return {
        text: `I couldn't find local competitors with enough public info${location ? ` in ${location}` : ''}. Try being more specific — e.g. "Find AI automation agencies in Karachi" or name a specific competitor to research directly.`,
        competitorReport: null
      }
    }
    return {
      text: `Found ${limited.length} competitor${limited.length > 1 ? 's' : ''} in the ${industry || bizData?.industry || ''} space${location ? ` in ${location}` : ''}. Click any to research in depth.`,
      competitorReport: { mode: 'find', competitors: limited, location, industry }
    }
  }

  // ── Complaints mode ───────────────────────────────────────────────────────
  if (mode === 'complaints') {
    const data = await findComplaints(competitors, location, bizData)
    const names = competitors?.length ? competitors.join(' & ') : 'your competitors'
    return {
      text: `Here's what customers complain about with ${names} — and how ${bizData?.name || 'you'} can turn their pain into your gain.`,
      competitorReport: { mode: 'complaints', data, competitors }
    }
  }

  // ── Compare mode ──────────────────────────────────────────────────────────
  if (mode === 'compare' && competitors.length >= 2) {
    const [a, b] = await Promise.all([
      researchOne(competitors[0], location, bizData),
      researchOne(competitors[1], location, bizData),
    ])
    return {
      text: `Side-by-side comparison: ${competitors[0]} vs ${competitors[1]}. Threat levels and how ${bizData?.name || 'you'} can beat both.`,
      competitorReport: { mode: 'compare', competitors: [a, b] }
    }
  }

  // ── Single mode ───────────────────────────────────────────────────────────
  const name = competitors[0] || text
  const data = await researchOne(name, location, bizData)
  return {
    text: `Full intelligence report on ${data.name}. Threat level: ${data.threat_level}/10 — ${data.threat_reason}`,
    competitorReport: { mode: 'single', competitor: data }
  }
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────

// Shared styles
const pill = (color, bg) => ({
  fontSize: 10, padding: '2px 8px', borderRadius: 99,
  background: bg || `${color}18`, border: `1px solid ${color}30`,
  color, fontWeight: 600, letterSpacing: 0.4
})

const card = (extra = {}) => ({
  padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border2)', borderRadius: 10, ...extra
})

const threatColor = n => n >= 8 ? '#ef4444' : n >= 5 ? '#f59e0b' : '#10b981'

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '6px 14px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
          fontFamily: 'var(--font)', transition: 'all 0.15s',
          background: active === t ? 'var(--accent-dim)' : 'transparent',
          border: `1px solid ${active === t ? 'var(--accent)' : 'var(--border2)'}`,
          color: active === t ? 'var(--accent)' : 'var(--text2)'
        }}>{t}</button>
      ))}
    </div>
  )
}

// ─── Find Results ─────────────────────────────────────────────────────────────
function FindResults({ report, onResearch }) {
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>
        Click any competitor to get a full intelligence report
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {report.competitors.map((c, i) => (
          <div key={i} onClick={() => onResearch && onResearch(`Research ${c.name}`)}
            style={{ ...card(), cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,142,240,0.4)'; e.currentTarget.style.background = 'rgba(59,142,240,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{c.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{c.snippet}</p>
                {c.why_competitor && (
                  <p style={{ fontSize: 10, color: 'var(--accent)', marginTop: 5, fontStyle: 'italic' }}>⚡ {c.why_competitor}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>Research →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Complaints View ──────────────────────────────────────────────────────────
function ComplaintsView({ report }) {
  const { data } = report
  if (!data) return null
  const freqColor = f => f === 'very common' ? '#ef4444' : f === 'common' ? '#f59e0b' : '#10b981'

  return (
    <div style={{ marginTop: 14 }}>
      {data.summary && (
        <div style={{ ...card(), borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginBottom: 5 }}>📊 MARKET PAIN SUMMARY</p>
          <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>{data.summary}</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {(data.top_complaints || []).map((item, i) => (
          <div key={i} style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={pill(freqColor(item.frequency))}>{item.frequency}</span>
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>😤 {item.complaint}</p>
            <p style={{ fontSize: 11, color: '#10b981', lineHeight: 1.5 }}>💡 Opportunity: {item.opportunity}</p>
          </div>
        ))}
      </div>
      {data.your_advantage && (
        <div style={{ ...card(), borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.05)' }}>
          <p style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 5 }}>🎯 YOUR POSITIONING ADVANTAGE</p>
          <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>{data.your_advantage}</p>
        </div>
      )}
    </div>
  )
}

// ─── Compare View ─────────────────────────────────────────────────────────────
function CompareView({ report, bizData }) {
  const [tab, setTab] = useState('overview')
  const [a, b] = report.competitors
  const tabs = ['overview', 'services', 'presence', 'beat them']

  return (
    <div style={{ marginTop: 14 }}>
      {/* Score header */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 14 }}>
        <div style={{ ...card(), flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: threatColor(a?.threat_level) }}>{a?.threat_level ?? '?'}</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>/10 threat</span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{a?.pricing_tier}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 32 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>VS</span>
        </div>
        <div style={{ ...card(), flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b?.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: threatColor(b?.threat_level) }}>{b?.threat_level ?? '?'}</span>
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>/10 threat</span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{b?.pricing_tier}</p>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[a, b].map((c, i) => (
            <div key={i} style={card()}>
              <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>{c?.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{c?.overview}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {c?.location && c.location !== '—' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>📍 {c.location}</span>}
                {c?.founded && c.founded !== '—' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>📅 Est. {c.founded}</span>}
                {c?.team_size && c.team_size !== '—' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>👥 {c.team_size}</span>}
                {c?.pricing_tier && c.pricing_tier !== '—' && <span style={{ fontSize: 10, color: 'var(--accent)' }}>💰 {c.pricing_tier}</span>}
              </div>
              {c?.target_customer && c.target_customer !== '—' && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>🎯 {c.target_customer}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[a, b].map((c, i) => (
            <div key={i} style={card()}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{c?.name}</p>
              {(c?.services || []).length === 0
                ? <p style={{ fontSize: 11, color: 'var(--text3)' }}>No pricing data found</p>
                : (c.services || []).map((s, j) => (
                  <div key={j} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: j < c.services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: 12, fontWeight: 600 }}>{s.name}</p>
                      {s.price && s.price !== '—' && <span style={{ fontSize: 10, color: 'var(--success)' }}>{s.price}</span>}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{s.details}</p>
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      )}

      {tab === 'presence' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[a, b].map((c, i) => (
            <div key={i} style={card()}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>{c?.name}</p>
              {c?.online_presence && Object.entries({
                'Website': c.online_presence.website_quality,
                'Social Media': c.online_presence.social_media,
                'SEO': c.online_presence.seo
              }).map(([k, v]) => {
                const col = v === 'strong' ? '#10b981' : v === 'moderate' ? '#f59e0b' : '#ef4444'
                const pct = v === 'strong' ? 85 : v === 'moderate' ? 50 : 22
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{k}</span>
                      <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>{v}</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--surface3)', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })}
              {c?.online_presence?.review_score && c.online_presence.review_score !== '—' && (
                <p style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>⭐ {c.online_presence.review_score}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'beat them' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[a, b].map((c, i) => (
            <div key={i} style={{ ...card(), borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.03)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 10 }}>Beat {c?.name}</p>
              {(c?.how_to_beat || []).map((t, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--success)', flexShrink: 0 }}>▸</span>
                  <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>{t}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Single Report ────────────────────────────────────────────────────────────
function SingleReport({ competitor: c, bizData }) {
  const [tab, setTab] = useState('overview')
  const tabs = ['overview', 'services', 'strengths', 'online', 'beat them']
  if (!c) return null

  const tc = threatColor(c.threat_level)

  return (
    <div style={{ marginTop: 14 }}>
      {/* Header card */}
      <div style={{ ...card(), display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: `${tc}15`, border: `1px solid ${tc}35`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: tc, lineHeight: 1 }}>{c.threat_level}</span>
          <span style={{ fontSize: 8, color: tc, opacity: 0.7 }}>/10</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</p>
            {c.pricing_tier && c.pricing_tier !== '—' && (
              <span style={pill('var(--accent)', 'rgba(59,142,240,0.1)')}>{c.pricing_tier}</span>
            )}
            {c.website && c.website !== '—' && (
              <a href={c.website.startsWith('http') ? c.website : 'https://' + c.website}
                target="_blank" rel="noreferrer"
                style={{ ...pill('#10b981', 'rgba(16,185,129,0.08)'), textDecoration: 'none' }}>
                🌐 Visit
              </a>
            )}
          </div>
          {c.tagline && c.tagline !== '—' && (
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 4 }}>{c.tagline}</p>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {c.location && c.location !== '—' && <p style={{ fontSize: 10, color: 'var(--text3)' }}>📍 {c.location}</p>}
            {c.founded && c.founded !== '—' && <p style={{ fontSize: 10, color: 'var(--text3)' }}>📅 Est. {c.founded}</p>}
            {c.team_size && c.team_size !== '—' && <p style={{ fontSize: 10, color: 'var(--text3)' }}>👥 {c.team_size}</p>}
          </div>
          {c.threat_reason && (
            <p style={{ fontSize: 10, color: tc, marginTop: 6, fontStyle: 'italic' }}>⚠️ {c.threat_reason}</p>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={card()}>
            <p style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>ABOUT</p>
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>{c.overview}</p>
          </div>
          {c.target_customer && c.target_customer !== '—' && (
            <div style={card()}>
              <p style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>TARGET CUSTOMER</p>
              <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>{c.target_customer}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(c.services || []).length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>No pricing data found in public sources</p>
            : (c.services || []).map((s, i) => (
              <div key={i} style={{ ...card(), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{s.details}</p>
                </div>
                {s.price && s.price !== '—' && (
                  <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginLeft: 12, flexShrink: 0 }}>{s.price}</span>
                )}
              </div>
            ))
          }
        </div>
      )}

      {tab === 'strengths' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ ...card(), borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.04)' }}>
            <p style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 10 }}>✅ STRENGTHS</p>
            {(c.strengths || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--success)', fontSize: 11, flexShrink: 0 }}>▸</span>
                <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
          <div style={{ ...card(), borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
            <p style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginBottom: 10 }}>⚠️ WEAKNESSES</p>
            {(c.weaknesses || []).map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: '#ef4444', fontSize: 11, flexShrink: 0 }}>▸</span>
                <p style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>{w}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'online' && c.online_presence && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries({
            'Website Quality': c.online_presence.website_quality,
            'Social Media': c.online_presence.social_media,
            'SEO Strength': c.online_presence.seo
          }).map(([k, v]) => {
            const col = v === 'strong' ? '#10b981' : v === 'moderate' ? '#f59e0b' : '#ef4444'
            const pct = v === 'strong' ? 85 : v === 'moderate' ? 50 : 22
            return (
              <div key={k} style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{k}</span>
                  <span style={{ fontSize: 11, color: col, fontWeight: 600 }}>{v}</span>
                </div>
                <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 99 }} />
                </div>
              </div>
            )
          })}
          {c.online_presence.review_score && c.online_presence.review_score !== '—' && (
            <div style={card()}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>Review Score: </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>{c.online_presence.review_score}</span>
            </div>
          )}
          {c.online_presence.notes && (
            <p style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', padding: '0 2px' }}>{c.online_presence.notes}</p>
          )}
        </div>
      )}

      {tab === 'beat them' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
            Specific tactics for {bizData?.name || 'your business'} to outcompete {c.name}:
          </p>
          {(c.how_to_beat || []).map((t, i) => (
            <div key={i} style={{ ...card(), borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.04)', display: 'flex', gap: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>{i + 1}</span>
              <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{t}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main CompetitorReport export ─────────────────────────────────────────────
export function CompetitorReport({ report, bizData, onResearch }) {
  if (!report) return null
  const { mode } = report

  return (
    <div style={{ width: '100%' }}>
      {mode === 'find' && <FindResults report={report} onResearch={onResearch} />}
      {mode === 'complaints' && <ComplaintsView report={report} />}
      {mode === 'compare' && <CompareView report={report} bizData={bizData} />}
      {mode === 'single' && <SingleReport competitor={report.competitor} bizData={bizData} />}
    </div>
  )
}
