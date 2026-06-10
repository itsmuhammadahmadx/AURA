import { useState } from 'react'

// ─── Area config ──────────────────────────────────────────────────────────────
export const CONSULTANT_AREAS = [
  { id:'growth',          label:'Growth',          emoji:'📈', color:'#f97316', desc:'Scale revenue, expand markets, acquire customers' },
  { id:'marketing',       label:'Marketing',       emoji:'📣', color:'#3b8ef0', desc:'Visibility, branding, content, channels' },
  { id:'sales',           label:'Sales',           emoji:'💼', color:'#a855f7', desc:'Close more deals, improve conversion, pricing' },
  { id:'cost-cutting',    label:'Cost-Cutting',    emoji:'✂️', color:'#f59e0b', desc:'Reduce expenses, improve margins, lean ops' },
  { id:'strategy',        label:'Strategy',        emoji:'♟️', color:'#8b5cf6', desc:'Direction, positioning, competitive advantage' },
  { id:'problem-solving', label:'Problem-Solving', emoji:'🔧', color:'#ef4444', desc:'Fix a specific issue holding the business back' },
]

// ─── Runner ───────────────────────────────────────────────────────────────────
export async function runConsultantAgent({ text, bizData, serperKey, orKey }) {

  // Step 1 — detect area
  const detectRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: `The user said: "${text}"
Detect which consulting area they want advice on.
Return ONLY valid JSON — no markdown:
{"area":"growth"}
area must be exactly one of: growth, marketing, sales, cost-cutting, strategy, problem-solving` }]
    })
  })
  const detectData = await detectRes.json()
  const detected = JSON.parse(detectData.choices[0].message.content.trim().replace(/```json|```/g, '').trim())
  const area = CONSULTANT_AREAS.find(a => a.id === detected.area) || CONSULTANT_AREAS[0]

  // Step 2 — web search (2 parallel queries)
  const areaQueries = {
    growth:            [`${bizData?.industry} business growth strategies 2025`, `how to scale a ${bizData?.industry} business fast`],
    marketing:         [`${bizData?.industry} marketing trends 2025`, `best marketing channels ${bizData?.industry} small business`],
    sales:             [`${bizData?.industry} sales tactics 2025`, `how to close more clients ${bizData?.industry}`],
    'cost-cutting':    [`${bizData?.industry} cost reduction strategies`, `reduce expenses small ${bizData?.industry} business`],
    strategy:          [`${bizData?.industry} business strategy 2025`, `${bizData?.industry} industry trends opportunities`],
    'problem-solving': [`common problems ${bizData?.industry} business solutions`, `${bizData?.industry} business challenges overcome`],
  }

  const searchResults = await Promise.all((areaQueries[area.id] || areaQueries.growth).map(q =>
    fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 5 })
    }).then(r => r.json()).catch(() => ({ organic: [] }))
  ))

  const webContext = searchResults
    .flatMap(r => (r.organic || []).slice(0, 3).map(i => `• ${i.title}: ${i.snippet}`))
    .slice(0, 8).join('\n')

  const webSources = searchResults
    .flatMap(r => (r.organic || []).slice(0, 2).map(i => ({ title: i.title, link: i.link, source: i.displayLink || '' })))
    .slice(0, 4)

  // Step 3 — full structured consultant analysis
  const consultRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      max_tokens: 1800,
      messages: [{ role: 'user', content: `You are a senior business consultant hired by ${bizData?.name}.

BUSINESS BRIEF:
Name: ${bizData?.name} | Industry: ${bizData?.industry} | Revenue: ${bizData?.revenue || 'not shared'} | Expenses: ${bizData?.expenses || 'not shared'} | Team: ${bizData?.team || 'unknown'} | Stage: ${bizData?.stage || 'unknown'} | Challenge: ${bizData?.challenge || 'not shared'} | Goal: ${bizData?.goal || 'not shared'} | Notes: ${bizData?.notes || 'none'}

USER REQUEST: "${text}"
ADVICE AREA: ${area.label}

MARKET INTELLIGENCE (fresh from web):
${webContext}

Analyze this business and return ONLY valid JSON — no markdown, no explanation:
{
  "score": {
    "overall": 72,
    "breakdown": [
      { "dimension": "Revenue Health",     "score": 65, "note": "1 sentence honest assessment" },
      { "dimension": "Market Position",    "score": 78, "note": "1 sentence honest assessment" },
      { "dimension": "Team & Operations",  "score": 80, "note": "1 sentence honest assessment" },
      { "dimension": "Growth Potential",   "score": 70, "note": "1 sentence honest assessment" },
      { "dimension": "Financial Fitness",  "score": 68, "note": "1 sentence honest assessment" }
    ],
    "verdict": "2 sentence honest overall verdict about where this business stands right now — be direct, not flattering"
  },
  "priorities": [
    { "rank": 1, "title": "Short title", "why": "Why this is the #1 priority right now — specific to their stage and numbers", "urgency": "critical" },
    { "rank": 2, "title": "Short title", "why": "Why this is #2 — reference their challenge or goal", "urgency": "high" },
    { "rank": 3, "title": "Short title", "why": "Why this is #3", "urgency": "medium" }
  ],
  "actionPlan": [
    { "week": "Week 1–2",  "focus": "Focus label", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"] },
    { "week": "Week 3–4",  "focus": "Focus label", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"] },
    { "week": "Month 2",   "focus": "Focus label", "actions": ["Specific action 1", "Specific action 2"] },
    { "week": "Month 3",   "focus": "Focus label", "actions": ["Specific action 1", "Specific action 2"] }
  ],
  "thinking": {
    "situation": "1–2 sentences: where this business actually is right now — honest, direct, no sugarcoating",
    "complication": "1–2 sentences: the core problem or tension holding them back — what's really going on",
    "implication": "1–2 sentences: what happens if they don't fix this in the next 90 days",
    "recommendation": "2–3 sentences: what I would do if this were my business — confident, specific, first-person"
  }
}

Rules:
- Every field must reference ${bizData?.name} specifically — no generic advice
- Scores are integers 1–100. Be honest — don't give everyone 85s
- urgency is one of: critical, high, medium
- Action items must be concrete — "Post 3 reels this week targeting X" not "improve social media"
- Use the web market data to inform your recommendations
- thinking.recommendation should sound like a consultant who just reviewed their books — direct, real
- Return ONLY the JSON object` }]
    })
  })

  const consultData = await consultRes.json()
  const raw = consultData.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const analysis = JSON.parse(raw)

  return { area, analysis, webSources }
}

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 80 }) {
  const r = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ fill: 'var(--text)', fontSize: size * 0.22, fontWeight: 700, fontFamily: 'var(--font)', transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  )
}

// ─── ConsultantReport UI ──────────────────────────────────────────────────────
export function ConsultantReport({ report }) {
  const [tab, setTab] = useState('score')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  if (!report) return null

  const { area, analysis, webSources } = report
  const { score, priorities, actionPlan, thinking } = analysis
  const c = area.color

  const scoreColor = (s) => s >= 75 ? '#10b981' : s >= 55 ? '#f59e0b' : '#ef4444'
  const urgencyStyle = (u) => ({
    critical: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#ef4444',  label: 'CRITICAL' },
    high:     { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b',  label: 'HIGH' },
    medium:   { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', color: '#8b5cf6',  label: 'MEDIUM' },
  }[u] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', color: 'var(--text3)', label: u.toUpperCase() })

  const tabs = [
    { id:'score',    label:'📊 Score',      },
    { id:'priority', label:'🎯 Priorities', },
    { id:'plan',     label:'📋 Action Plan',},
    { id:'thinking', label:'🧠 Thinking',   },
  ]

  return (
    <div style={{ marginTop: 14 }}>

      {/* Area badge */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 14px', borderRadius:99, background:`${c}14`, border:`1px solid ${c}30` }}>
          <span style={{ fontSize:14 }}>{area.emoji}</span>
          <span style={{ fontSize:11, fontWeight:700, color:c, letterSpacing:0.8 }}>{area.label.toUpperCase()} ANALYSIS</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:16, background:'rgba(255,255,255,0.03)', borderRadius:10, padding:4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ flex:1, padding:'7px 4px', borderRadius:8, border:'none', background:tab===t.id?'var(--surface3)':'transparent', color:tab===t.id?'var(--text)':'var(--text3)', fontFamily:'var(--font)', fontSize:11, fontWeight:tab===t.id?700:500, cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SCORE TAB ── */}
      {tab==='score' && (
        <div style={{ animation:'fadeIn 0.25s ease' }}>
          {/* Overall score */}
          <div style={{ display:'flex', alignItems:'center', gap:20, padding:'18px 20px', background:'var(--surface2)', borderRadius:14, border:`1px solid ${scoreColor(score.overall)}25`, marginBottom:14 }}>
            <ScoreRing score={score.overall} color={scoreColor(score.overall)} size={88}/>
            <div>
              <p style={{ fontSize:11, color:'var(--text3)', letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>OVERALL BUSINESS SCORE</p>
              <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.7 }}>{score.verdict}</p>
            </div>
          </div>

          {/* Breakdown bars */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {score.breakdown.map((d, i) => (
              <div key={i} style={{ padding:'12px 14px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid var(--border2)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.dimension}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:scoreColor(d.score) }}>{d.score}</span>
                </div>
                <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:99, marginBottom:7, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${d.score}%`, background:scoreColor(d.score), borderRadius:99, transition:'width 0.8s ease' }}/>
                </div>
                <p style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{d.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PRIORITIES TAB ── */}
      {tab==='priority' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12, animation:'fadeIn 0.25s ease' }}>
          {priorities.map((p, i) => {
            const u = urgencyStyle(p.urgency)
            return (
              <div key={i} style={{ padding:'14px 16px', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px solid var(--border2)', display:'flex', gap:14, alignItems:'flex-start' }}>
                {/* Rank */}
                <div style={{ width:32, height:32, borderRadius:9, background:`${c}18`, border:`1px solid ${c}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:15, fontWeight:800, color:c }}>#{p.rank}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.title}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99, background:u.bg, border:`1px solid ${u.border}`, color:u.color, letterSpacing:0.8 }}>{u.label}</span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.65 }}>{p.why}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ACTION PLAN TAB ── */}
      {tab==='plan' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12, animation:'fadeIn 0.25s ease' }}>
          {actionPlan.map((phase, i) => (
            <div key={i} style={{ borderRadius:12, overflow:'hidden', border:'1px solid var(--border2)' }}>
              {/* Phase header */}
              <div style={{ padding:'10px 14px', background:`${c}10`, borderBottom:`1px solid ${c}20`, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:c, flexShrink:0 }}/>
                <span style={{ fontSize:12, fontWeight:700, color:c }}>{phase.week}</span>
                <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>— {phase.focus}</span>
              </div>
              {/* Actions */}
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                {phase.actions.map((action, j) => (
                  <div key={j} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${c}50`, flexShrink:0, marginTop:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:`${c}60` }}/>
                    </div>
                    <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.6 }}>{action}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── THINKING TAB ── */}
      {tab==='thinking' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeIn 0.25s ease' }}>
          {[
            { label:'SITUATION',      key:'situation',      icon:'📍', color:'#3b8ef0', desc:'Where the business is right now' },
            { label:'COMPLICATION',   key:'complication',   icon:'⚠️', color:'#f59e0b', desc:'The core tension or problem' },
            { label:'IMPLICATION',    key:'implication',    icon:'🔮', color:'#ef4444', desc:'What happens if this isn\'t fixed' },
            { label:'RECOMMENDATION', key:'recommendation', icon:'✅', color:'#10b981', desc:'What I would do' },
          ].map((block, i) => (
            <div key={i} style={{ padding:'14px 16px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:`1px solid ${block.color}20`, borderLeft:`3px solid ${block.color}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
                <span style={{ fontSize:13 }}>{block.icon}</span>
                <span style={{ fontSize:10, fontWeight:700, color:block.color, letterSpacing:1 }}>{block.label}</span>
                <span style={{ fontSize:10, color:'var(--text3)', marginLeft:2 }}>— {block.desc}</span>
              </div>
              <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.75 }}>{thinking[block.key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Web sources footer */}
      {webSources?.length > 0 && (
        <div style={{ marginTop:16 }}>
          <button onClick={() => setSourcesOpen(o => !o)}
            style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:11, fontFamily:'var(--font)', fontWeight:600, padding:0, display:'flex', alignItems:'center', gap:5 }}
            onMouseEnter={e => e.currentTarget.style.color = c}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
            {sourcesOpen ? '▲' : '▶'} {webSources.length} market sources used
          </button>
          {sourcesOpen && (
            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, animation:'fadeIn 0.2s ease' }}>
              {webSources.map((s, i) => (
                <a key={i} href={s.link} target="_blank" rel="noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border2)', textDecoration:'none', transition:'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = c}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}>
                  <span style={{ fontSize:10, color:c, fontWeight:700, fontFamily:'var(--font)', flexShrink:0 }}>{s.source}</span>
                  <span style={{ fontSize:11, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</span>
                  <span style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto', flexShrink:0 }}>↗</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Follow-up hint */}
      <div style={{ marginTop:14, padding:'8px 14px', borderRadius:9, background:`${c}08`, border:`1px solid ${c}20` }}>
        <p style={{ fontSize:11, color:'var(--text2)', lineHeight:1.6 }}>
          <span style={{ color:c, fontWeight:600 }}>Want to go deeper?</span> Ask a follow-up — e.g. "Expand on priority #1" or "Give me a detailed week 1 plan"
        </p>
      </div>
    </div>
  )
}