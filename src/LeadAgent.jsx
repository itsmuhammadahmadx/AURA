import { useState } from 'react'

// ─── Verified Apify Actor IDs ─────────────────────────────────────────────────
const ACTORS = {
  linkedin:    'harvestapi/linkedin-profile-search',
  instagram:   'apify/instagram-scraper',
  google_maps: 'compass/crawler-google-places',
  tiktok:      'clockworks/free-tiktok-scraper',
  facebook:    'apify/facebook-posts-scraper',
  reddit:      'trudax/reddit-scraper',
  twitter:     'apidojo/tweet-scraper',
}

// ─── Parse user prompt using AI ──────────────────────────────────────────────
async function parsePrompt(prompt, openrouterKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Extract lead generation parameters from this prompt: "${prompt}"
        
Return ONLY a JSON object with these fields:
{
  "platform": "linkedin" | "instagram" | "google_maps" | "tiktok" | "facebook" | "reddit" | "twitter",
  "query": "search keyword or topic",
  "location": "city or country if mentioned, empty string if not",
  "count": number of leads requested (default 10, max 20)
}

Examples:
- "find 10 digital marketing agencies in Karachi on Google Maps" → {"platform":"google_maps","query":"digital marketing agency","location":"Karachi","count":10}
- "get 5 leads from LinkedIn for software developers" → {"platform":"linkedin","query":"software developer","location":"","count":5}
- "find Instagram influencers in fashion" → {"platform":"instagram","query":"fashion influencer","location":"","count":10}

Return only valid JSON, no markdown, no explanation.`
      }]
    })
  })
  const data = await res.json()
  const text = data.choices[0].message.content.trim()
  return JSON.parse(text)
}

// ─── Run Apify Actor ──────────────────────────────────────────────────────────
async function runApifyActor(actorId, input, apifyToken) {
  // Start the actor run
  const runRes = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${apifyToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  const runData = await runRes.json()
  const runId = runData.data?.id
  if (!runId) throw new Error('Failed to start Apify actor: ' + JSON.stringify(runData))

  // Poll for completion
  let status = 'RUNNING'
  let attempts = 0
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 3000))
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`)
    const statusData = await statusRes.json()
    status = statusData.data?.status
    attempts++
    if (attempts > 40) throw new Error('Apify actor timed out after 2 minutes')
    if (status === 'FAILED' || status === 'ABORTED') throw new Error('Apify actor failed: ' + status)
  }

  // Fetch results
  const datasetId = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`)).json()).data?.defaultDatasetId
  const resultsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&limit=20`)
  const results = await resultsRes.json()
  return results
}

// ─── Build actor input per platform ──────────────────────────────────────────
function buildActorInput(platform, params) {
  switch (platform) {
    case 'linkedin':
      return { keywords: params.query, location: params.location || undefined, maxItems: params.count, scrapeType: 'short' }
    case 'instagram':
      return { search: params.query, searchType: 'hashtag', maxItems: params.count, resultsType: 'profiles' }
    case 'google_maps':
      return { searchStringsArray: [params.query + (params.location ? ` in ${params.location}` : '')], maxCrawledPlacesPerSearch: params.count, language: 'en' }
    case 'tiktok':
      return { searchQueries: [params.query], maxItems: params.count, resultsPerPage: params.count }
    case 'facebook':
      return { startUrls: [], searchQuery: params.query, maxItems: params.count }
    case 'reddit':
      return { startUrls: [`https://www.reddit.com/search/?q=${encodeURIComponent(params.query)}`], maxItems: params.count }
    case 'twitter':
      return { searchTerms: [params.query], maxTweets: params.count }
    default:
      return { query: params.query, maxItems: params.count }
  }
}

// ─── Normalize results per platform ──────────────────────────────────────────
function normalizeResults(platform, rawResults) {
  if (!rawResults || !Array.isArray(rawResults)) return []
  return rawResults.slice(0, 20).map((item, i) => {
    switch (platform) {
      case 'linkedin':
        return {
          id: i + 1,
          name: item.name || item.fullName || '—',
          title: item.headline || item.title || '—',
          location: item.location || '—',
          company: item.company || item.currentCompany || '—',
          profile_url: item.linkedinUrl || item.url || '—',
          email: item.email || '—',
          platform: 'LinkedIn'
        }
      case 'instagram':
        return {
          id: i + 1,
          name: item.fullName || item.username || '—',
          username: '@' + (item.username || '—'),
          followers: item.followersCount ? item.followersCount.toLocaleString() : '—',
          bio: item.biography ? item.biography.slice(0, 60) + '...' : '—',
          profile_url: item.url || `https://instagram.com/${item.username}`,
          verified: item.verified ? '✅' : '—',
          platform: 'Instagram'
        }
      case 'google_maps':
        return {
          id: i + 1,
          name: item.title || item.name || '—',
          category: item.categoryName || item.categories?.[0] || '—',
          address: item.address || item.street || '—',
          phone: item.phone || item.phoneUnformatted || '—',
          website: item.website || '—',
          rating: item.totalScore ? `${item.totalScore}⭐ (${item.reviewsCount} reviews)` : '—',
          platform: 'Google Maps'
        }
      case 'tiktok':
        return {
          id: i + 1,
          name: item.authorMeta?.name || item.author?.nickname || '—',
          username: '@' + (item.authorMeta?.id || item.author?.uniqueId || '—'),
          followers: item.authorMeta?.fans ? item.authorMeta.fans.toLocaleString() : '—',
          likes: item.diggCount ? item.diggCount.toLocaleString() : '—',
          profile_url: `https://tiktok.com/@${item.authorMeta?.id || ''}`,
          platform: 'TikTok'
        }
      case 'twitter':
        return {
          id: i + 1,
          name: item.author?.name || '—',
          username: '@' + (item.author?.userName || '—'),
          followers: item.author?.followers ? item.author.followers.toLocaleString() : '—',
          bio: item.author?.description?.slice(0, 60) + '...' || '—',
          profile_url: `https://twitter.com/${item.author?.userName}`,
          platform: 'Twitter/X'
        }
      case 'reddit':
        return {
          id: i + 1,
          name: item.author || '—',
          subreddit: 'r/' + (item.communityName || item.subreddit || '—'),
          title: item.title?.slice(0, 60) + '...' || '—',
          score: item.score ? item.score.toLocaleString() : '—',
          profile_url: item.url || '—',
          platform: 'Reddit'
        }
      default:
        return { id: i + 1, ...item, platform }
    }
  })
}

// ─── Table Component ──────────────────────────────────────────────────────────
function LeadsTable({ leads, platform }) {
  const [copied, setCopied] = useState(false)

  if (!leads.length) return null

  const keys = Object.keys(leads[0]).filter(k => k !== 'id')

  const copyTable = () => {
    const header = ['#', ...keys].join('\t')
    const rows = leads.map(l => [l.id, ...keys.map(k => l[k] || '—')].join('\t'))
    navigator.clipboard.writeText([header, ...rows].join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportCSV = () => {
    const header = ['#', ...keys].join(',')
    const rows = leads.map(l => [l.id, ...keys.map(k => `"${(l[k] || '—').toString().replace(/"/g, '""')}"`)])
    const csv = [header, ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `leads-${platform}-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: 20, animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{leads.length} leads found on {platform}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyTable} style={{ padding: '6px 14px', borderRadius: 8, background: copied ? 'rgba(16,185,129,0.15)' : 'var(--surface2)', border: `1px solid ${copied ? 'var(--success)' : 'var(--border2)'}`, color: copied ? 'var(--success)' : 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.2s' }}>
            {copied ? '✅ Copied!' : '📋 Copy Table'}
          </button>
          <button onClick={exportCSV} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font)' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border2)' }}>
              <th style={{ padding: '10px 14px', color: 'var(--text3)', fontWeight: 600, textAlign: 'left', letterSpacing: 1, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>#</th>
              {keys.map(k => (
                <th key={k} style={{ padding: '10px 14px', color: 'var(--text3)', fontWeight: 600, textAlign: 'left', letterSpacing: 1, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {k.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => (
              <tr key={lead.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,142,240,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}>
                <td style={{ padding: '10px 14px', color: 'var(--text3)', fontWeight: 600 }}>{lead.id}</td>
                {keys.map(k => (
                  <td key={k} style={{ padding: '10px 14px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {k === 'profile_url' && lead[k] !== '—'
                      ? <a href={lead[k]} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>🔗 View</a>
                      : lead[k] || '—'
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Lead Agent Component ────────────────────────────────────────────────
export default function LeadAgent({ bizData }) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('idle') // idle | parsing | running | done | error
  const [statusMsg, setStatusMsg] = useState('')
  const [leads, setLeads] = useState([])
  const [platform, setPlatform] = useState('')
  const [history, setHistory] = useState([])

  const suggestions = bizData ? [
    `Find 10 ${bizData.industry} businesses on Google Maps in ${bizData.challenge?.includes('client') ? 'Karachi' : 'Pakistan'}`,
    `Find 5 potential clients on LinkedIn for ${bizData.name}`,
    `Find Instagram influencers in ${bizData.industry} niche`,
  ] : [
    'Find 10 digital marketing agencies on Google Maps in Karachi',
    'Find 5 software developers on LinkedIn in Pakistan',
    'Find Instagram influencers in the fashion niche',
  ]

  const run = async () => {
    if (!prompt.trim()) return
    const apifyToken = import.meta.env.VITE_APIFY_TOKEN
    const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY
    if (!apifyToken) { setStatus('error'); setStatusMsg('VITE_APIFY_TOKEN not found in .env'); return }

    setStatus('parsing')
    setStatusMsg('🧠 Understanding your request...')
    setLeads([])

    try {
      // Step 1: Parse prompt with AI
      const params = await parsePrompt(prompt, openrouterKey)
      const actorId = ACTORS[params.platform]
      if (!actorId) throw new Error('Platform not supported: ' + params.platform)

      setPlatform(params.platform)
      setStatus('running')
      setStatusMsg(`🔍 Searching ${params.platform} for "${params.query}"${params.location ? ` in ${params.location}` : ''}...`)

      // Step 2: Build input and run actor
      const input = buildActorInput(params.platform, params)
      const raw = await runApifyActor(actorId, input, apifyToken)

      // Step 3: Normalize results
      const normalized = normalizeResults(params.platform, raw)
      if (!normalized.length) throw new Error('No results found. Try a different search query.')

      setLeads(normalized)
      setHistory(prev => [{ prompt, platform: params.platform, count: normalized.length, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 4)])
      setStatus('done')
      setStatusMsg('')
    } catch (e) {
      setStatus('error')
      setStatusMsg(e.message)
    }
  }

  const platformIcons = { linkedin: '💼', instagram: '📸', google_maps: '📍', tiktok: '🎵', facebook: '👤', reddit: '🔴', twitter: '🐦' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎯</div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Lead Generation Agent</h2>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Find real leads from LinkedIn, Instagram, Google Maps, TikTok & more</p>
          </div>
        </div>

        {/* Platform pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          {Object.entries(platformIcons).map(([p, icon]) => (
            <div key={p} style={{ padding: '4px 12px', borderRadius: 99, background: 'var(--surface2)', border: '1px solid var(--border2)', fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {icon} {p.replace('_', ' ')}
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      {status === 'idle' && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Quick searches</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setPrompt(s)} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}>
                🔍 {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()}
          placeholder='e.g. "Find 10 restaurant owners on Google Maps in Karachi"'
          disabled={status === 'parsing' || status === 'running'}
          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, outline: 'none', transition: 'border-color 0.2s' }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        />
        <button onClick={run} disabled={!prompt.trim() || status === 'parsing' || status === 'running'}
          style={{ padding: '12px 22px', borderRadius: 10, border: 'none', background: prompt.trim() && status !== 'running' ? 'linear-gradient(135deg, var(--accent), #5b6af0)' : 'var(--surface2)', color: prompt.trim() && status !== 'running' ? '#fff' : 'var(--text3)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: prompt.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
          {status === 'parsing' || status === 'running' ? '⏳ Running...' : '🚀 Find Leads'}
        </button>
      </div>

      {/* Status */}
      {(status === 'parsing' || status === 'running') && (
        <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: `wave 1.3s ease-in-out ${i*0.15}s infinite` }} />)}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{statusMsg}</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 16, animation: 'fadeIn 0.3s ease' }}>
          <p style={{ fontSize: 13, color: 'var(--danger)' }}>❌ {statusMsg}</p>
          <button onClick={() => setStatus('idle')} style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font)' }}>Try again →</button>
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {status === 'done' && leads.length > 0 && (
          <LeadsTable leads={leads} platform={platform} />
        )}

        {/* History */}
        {history.length > 0 && status === 'idle' && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Recent searches</p>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 12, color: 'var(--text2)' }}>
                <span>{platformIcons[h.platform]}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.prompt}</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{h.count} leads</span>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>{h.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
