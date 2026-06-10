import { useState, useEffect, useRef, useCallback } from 'react'
import { runCompetitorAgent, CompetitorReport } from './CompetitorAgent.jsx'
import { runConsultantAgent, ConsultantReport } from './BusinessConsultantAgent.jsx'
import { runFinancialAgent, FinancialSnapshotUI } from './FinancialAgent.jsx'
import { runProposalAgent, ProposalUI, InvoiceUI } from './ProposalAgent.jsx'
import { BrainstormPage } from './BrainstormAgent.jsx'
import { GuidebookPage } from './GuidebookPage.jsx'
import { ChatMessageContent, messageHasRichLayout } from './ChatMessageContent.jsx'

// ─── helpers ─────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
const nowTime = () => new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
const truncate = (str, n) => str?.length > n ? str.slice(0,n)+'…' : str

function groupChats(chats) {
  const g = { Today:[], Yesterday:[], 'Last 7 days':[], 'Last 30 days':[] }
  const d = new Date(); d.setHours(0,0,0,0)
  chats.forEach(c => {
    const diff = (d - new Date(c.createdAt)) / 86400000
    if (diff < 1) g['Today'].push(c)
    else if (diff < 2) g['Yesterday'].push(c)
    else if (diff < 7) g['Last 7 days'].push(c)
    else g['Last 30 days'].push(c)
  })
  return g
}

function buildSystemPrompt(biz) {
  const formatting = `
FORMATTING (important — the chat UI renders these beautifully):
- Use markdown TABLES when comparing options, listing items, budgets, timelines, or any row/column data:
  | Column A | Column B |
  |----------|----------|
  | value    | value    |
- For spreadsheet-style data (many rows, numbers, trackers), use a \`\`\`sheet code block with CSV rows (comma-separated), or a markdown table.
- For side-by-side comparisons (2–3 options), use :::columns blocks:
  :::columns
  **Option A**
  details here
  ---
  **Option B**
  details here
  :::
- When the user asks for a table, sheet, columns, or structured breakdown — always use one of the formats above instead of plain prose lists.`

  if (!biz) return `You are AURA, a premium AI assistant. Be helpful, intelligent, and concise.${formatting}`
  return `You are AURA, a dedicated AI business consultant for ${biz.name}.

BUSINESS PROFILE:
• Name: ${biz.name}
• Industry: ${biz.industry} | Stage: ${biz.stage} | Location: ${biz.location||'N/A'}
• Monthly Revenue: ${biz.revenue||'N/A'} | Monthly Expenses: ${biz.expenses||'N/A'}
• Pricing Model: ${biz.pricingModel||'N/A'} | Avg Deal / Order Value: ${biz.avgDeal||'N/A'}
• Products / Services: ${biz.services||'N/A'}
• Unique Value Proposition: ${biz.uvp||'N/A'}
• Target Customers: ${biz.targetCustomers||'N/A'} | Customer Type: ${biz.customerType||'N/A'}
• Market / Geography: ${biz.market||'N/A'}
• Main Competitors: ${biz.competitors||'N/A'}
• How They're Different: ${biz.differentiation||'N/A'}
• Team Size: ${biz.team||'N/A'} | Key Roles: ${biz.keyRoles||'N/A'}
• Marketing Channels Currently Used: ${biz.marketingChannels||'N/A'}
• Biggest Challenge: ${biz.challenge||'N/A'}
• 6-Month Goal: ${biz.goal||'N/A'}
• Additional Notes: ${biz.notes||'None'}

Always give advice that is hyper-specific to this business. Reference their numbers, customers, services, and competitors by name. Never be generic.${formatting}`
}

// ─── Always require password on every open ────────────────────────────────────
localStorage.removeItem('aura_auth')

// ─── Newsletter Page ──────────────────────────────────────────────────────────
function NewsletterPage({ bizData }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  const [error, setError] = useState(null)

  const fetchNews = async () => {
    setLoading(true)
    setError(null)
    try {
      const serperKey = import.meta.env.VITE_SERPER_API_KEY
      const orKey = import.meta.env.VITE_OPENROUTER_API_KEY

      const queries = [
        `${bizData?.industry} industry news 2025`,
        `AI tools for ${bizData?.industry} business`,
        `business growth ${bizData?.industry} latest`,
        `startup trends ${bizData?.industry} 2025`,
      ]

      const results = await Promise.all(queries.map(q =>
        fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, num: 5, tbs: 'qdr:w' })
        }).then(r => r.json()).catch(() => ({ organic: [] }))
      ))

      const seen = new Set()
      const allItems = []
      for (const r of results) {
        for (const item of (r.organic || [])) {
          if (!seen.has(item.title) && item.title) {
            seen.add(item.title)
            allItems.push({ title: item.title, snippet: item.snippet, link: item.link, source: item.displayLink || '' })
          }
        }
      }

      const top = allItems.slice(0, 15)

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [{
            role: 'user',
            content: `You are a business intelligence analyst for "${bizData?.name}" — a ${bizData?.industry} business.
Their goal: ${bizData?.goal}. Their challenge: ${bizData?.challenge}.

Here are recent news items:
${JSON.stringify(top)}

Pick the 6 most relevant and impactful ones for this business. For each, explain WHY it matters to them specifically.

Return ONLY valid JSON array (no markdown):
[
  {
    "title": "Short punchy headline (max 8 words)",
    "summary": "What happened in 1-2 sentences",
    "relevance": "Why this specifically matters for ${bizData?.name} — be direct and specific, mention a real impact",
    "category": "one of: AI Tools, Market Trend, Growth Opportunity, Industry News, Competitor Watch, Tech Update",
    "impact": "high or medium or low",
    "source": "source domain",
    "link": "original URL"
  }
]`
          }]
        })
      })
      const data = await res.json()
      const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(raw)
      setCards(parsed)
      setLastFetched(new Date())
      localStorage.setItem('aura_newsletter', JSON.stringify({ cards: parsed, fetched: new Date().toISOString() }))
    } catch(e) {
      setError('Could not load news. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem('aura_newsletter')
    if (cached) {
      try {
        const { cards: c, fetched } = JSON.parse(cached)
        const age = (Date.now() - new Date(fetched)) / 1000 / 60 / 60
        if (age < 24) { setCards(c); setLastFetched(new Date(fetched)); return }
      } catch(e) {}
    }
    fetchNews()
  }, [])

  const categoryColor = (cat) => {
    const map = { 'AI Tools':'#3b8ef0', 'Market Trend':'#8b5cf6', 'Growth Opportunity':'#10b981', 'Industry News':'#06b6d4', 'Competitor Watch':'#ef4444', 'Tech Update':'#06b6d4' }
    return map[cat] || '#3b8ef0'
  }

  const impactStyle = (impact) => {
    if (impact === 'high')   return { bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.25)',   color:'#ef4444' }
    if (impact === 'medium') return { bg:'rgba(6,182,212,0.1)',   border:'rgba(6,182,212,0.25)',   color:'#06b6d4' }
    return                          { bg:'rgba(255,255,255,0.05)', border:'rgba(255,255,255,0.1)', color:'var(--text3)' }
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'28px 32px', animation:'fadeIn 0.3s ease' }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
          <div>
            <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:-0.5, marginBottom:6 }}>📰 Business Intelligence</h2>
            <p style={{ fontSize:14, color:'var(--text2)', lineHeight:1.6 }}>Latest news filtered for <strong style={{ color:'var(--text)' }}>{bizData?.name}</strong> — only what matters to your {bizData?.industry} business.</p>
            {lastFetched && <p style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Last updated: {lastFetched.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} · {lastFetched.toLocaleDateString()}</p>}
          </div>
          <button onClick={fetchNews} disabled={loading} style={{ padding:'9px 18px', borderRadius:10, background:loading?'var(--surface2)':'linear-gradient(135deg,var(--accent),#5b6af0)', border:'none', color:loading?'var(--text3)':'#fff', fontFamily:'var(--font)', fontSize:13, fontWeight:600, cursor:loading?'not-allowed':'pointer', whiteSpace:'nowrap' }}>
            {loading ? '⏳ Fetching...' : '🔄 Refresh'}
          </button>
        </div>

        {loading && cards.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:16 }}>
            <div style={{ display:'flex', gap:6 }}>{[0,1,2].map(i=><div key={i} style={{ width:10, height:10, borderRadius:'50%', background:'var(--accent)', animation:`wave 1.3s ease-in-out ${i*0.15}s infinite` }}/>)}</div>
            <p style={{ fontSize:13, color:'var(--text2)' }}>Scanning the web for news relevant to {bizData?.name}...</p>
          </div>
        )}

        {error && <div style={{ padding:'16px 20px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, color:'#ef4444', fontSize:13 }}>{error}</div>}

        {!loading && cards.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {cards.map((card, i) => {
              const cc = categoryColor(card.category)
              const imp = impactStyle(card.impact)
              return (
                <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, padding:'18px 20px', transition:'all 0.2s', animation:`fadeIn 0.4s ease ${i*0.05}s both` }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=cc; e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=`0 4px 20px ${cc}18` }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:99, background:`${cc}18`, border:`1px solid ${cc}35`, color:cc, letterSpacing:0.5 }}>{card.category}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:99, background:imp.bg, border:`1px solid ${imp.border}`, color:imp.color, letterSpacing:0.5, textTransform:'uppercase' }}>{card.impact} impact</span>
                    {card.source && <span style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto' }}>{card.source}</span>}
                  </div>
                  <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:6, lineHeight:1.4 }}>{card.title}</h3>
                  <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.7, marginBottom:12 }}>{card.summary}</p>
                  <div style={{ background:`${cc}08`, border:`1px solid ${cc}25`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:cc, letterSpacing:1, marginBottom:4 }}>WHY THIS MATTERS TO YOU</p>
                    <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>{card.relevance}</p>
                  </div>
                  {card.link && <a href={card.link} target="_blank" rel="noreferrer" style={{ fontSize:11, color:cc, textDecoration:'none', fontWeight:600 }}>Read full article →</a>}
                </div>
              )
            })}
          </div>
        )}

        {!loading && cards.length === 0 && !error && (
          <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text3)', fontSize:13 }}>No news loaded yet. Click Refresh to fetch the latest.</div>
        )}

        <p style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginTop:24, lineHeight:1.7 }}>News cached for 24 hours · Powered by Serper + GPT-4o-mini · Filtered for {bizData?.industry}</p>
      </div>
    </div>
  )
}

// ─── SplashScreen ─────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div className="bg-texture"/>
      <h1 style={{ fontFamily:'var(--font-display)', fontSize:52, fontWeight:300, letterSpacing:14, color:'#fff', position:'relative', zIndex:1, animation:'breatheGlow 2s ease-in-out infinite' }}>AURA</h1>
      <p style={{ color:'var(--text3)', fontSize:11, letterSpacing:5, marginTop:12, position:'relative', zIndex:1 }}>BUSINESS INTELLIGENCE</p>
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'var(--surface2)' }}>
        <div style={{ height:'100%', background:'linear-gradient(90deg,var(--accent),#7c3aed)', animation:'loadBar 2.4s ease forwards', borderRadius:99 }}/>
      </div>
    </div>
  )
}

// ─── PasswordScreen ───────────────────────────────────────────────────────────
function PasswordScreen({ onUnlock }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  const [shake, setShake] = useState(false)
  const ref = useRef()

  const attempt = () => {
    if (val === '123') { localStorage.setItem('aura_auth','1'); onUnlock() }
    else { setErr(true); setShake(true); setVal(''); setTimeout(()=>setShake(false),400); ref.current?.focus() }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:999, animation:'fadeIn 0.5s ease' }}>
      <div className="bg-texture"/>
      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:40, fontWeight:300, letterSpacing:12, color:'#fff', marginBottom:8, animation:'breatheGlow 3s ease-in-out infinite' }}>AURA</h1>
        <p style={{ color:'var(--text2)', fontSize:11, letterSpacing:3, marginBottom:36 }}>PROTECTED ACCESS</p>
        <div className={shake ? 'animate-shake' : ''} style={{ width:300, display:'flex', flexDirection:'column', gap:12 }}>
          <input ref={ref} type="password" value={val} onChange={e=>{setVal(e.target.value);setErr(false)}} onKeyDown={e=>e.key==='Enter'&&attempt()} placeholder="Enter password..." autoFocus
            style={{ width:'100%', padding:'14px 22px', borderRadius:999, background:'var(--surface)', border:`1px solid ${err?'var(--danger)':'var(--accent)'}`, boxShadow:err?'0 0 16px rgba(239,68,68,0.3)':'0 0 16px var(--accent-glow)', color:'var(--text)', fontFamily:'var(--font)', fontSize:14, outline:'none', textAlign:'center', letterSpacing:4 }}/>
          {err && <p style={{ color:'var(--danger)', fontSize:12, textAlign:'center', animation:'fadeIn 0.3s ease' }}>Incorrect password</p>}
          <button onClick={attempt} style={{ width:'100%', padding:'13px', borderRadius:999, background:'linear-gradient(135deg,var(--accent),#5b6af0)', border:'none', color:'#fff', fontFamily:'var(--font)', fontSize:14, fontWeight:600, cursor:'pointer', boxShadow:'0 4px 24px rgba(59,142,240,0.3)' }}>ENTER</button>
        </div>
      </div>
    </div>
  )
}

// ─── OnboardingScreen (6 steps) ─────────────────────────────────────────────
function OnboardingScreen({ onComplete, onCancel }) {
  const [step, setStep] = useState(1)
  const TOTAL = 6
  const [data, setData] = useState({
    name:'', location:'', revenue:'', expenses:'', pricingModel:'', avgDeal:'',
    services:'', uvp:'', targetCustomers:'', market:'',
    competitors:'', differentiation:'', keyRoles:'', marketingChannels:'',
    goal:'', notes:''
  })
  const [selIndustry,  setSelIndustry]  = useState('')
  const [selStage,     setSelStage]     = useState('')
  const [selTeam,      setSelTeam]      = useState('')
  const [selCustomerType, setSelCustomerType] = useState('')
  const [selChallenge, setSelChallenge] = useState('')
  const [selMarketing, setSelMarketing] = useState([])
  const up = (k, v) => setData(p => ({ ...p, [k]: v }))
  const toggleMarketing = (v) => setSelMarketing(p => p.includes(v) ? p.filter(x=>x!==v) : [...p, v])

  const industries    = ['E-commerce','Freelancing','Agency','Retail','Food & Beverage','Tech / SaaS','Consulting','Real Estate','Education','Healthcare','Other']
  const stages        = ['Just starting out','Early growth (0–1 yr)','Established (1–3 yrs)','Scaling up (3+ yrs)']
  const teams         = ['Just me','2–5 people','6–15 people','16–50 people','50+ people']
  const customerTypes = ['B2B — other businesses','B2C — individual consumers','Both B2B and B2C']
  const challenges    = ['Getting more clients','Managing expenses','Marketing & social media','Hiring & team','Cash flow issues','Pricing services','Scaling operations','Competition']
  const marketingOpts = ['Instagram','Facebook','LinkedIn','TikTok','Google Ads','SEO / Blog','Email Marketing','Referrals / Word of mouth','Cold outreach','None yet']
  const pricingModels = ['One-time project fee','Monthly retainer','Hourly rate','Product / per-unit sale','Subscription','Commission-based','Mixed']

  const chip = (selected) => ({
    padding:'7px 14px', borderRadius:99, fontSize:12, cursor:'pointer', fontFamily:'var(--font)', transition:'all 0.15s',
    background:selected?'var(--accent-dim)':'var(--surface2)',
    border:`1px solid ${selected?'var(--accent)':'var(--border2)'}`,
    color:selected?'var(--accent)':'var(--text2)'
  })
  const inp = { width:'100%', padding:'11px 14px', borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text)', fontFamily:'var(--font)', fontSize:14, outline:'none' }
  const label = (txt, req) => (
    <p style={{ fontSize:11, color:'var(--text2)', marginBottom:6, fontWeight:500 }}>
      {txt} {req && <span style={{ color:'var(--accent)' }}>*</span>}
    </p>
  )
  const focusInp  = e => e.target.style.borderColor = 'var(--accent)'
  const blurInp   = e => e.target.style.borderColor = 'var(--border2)'

  const canNext = {
    1: data.name && selIndustry && selStage,
    2: true,
    3: data.services,
    4: data.targetCustomers && selCustomerType,
    5: true,
    6: data.goal,
  }

  const finish = () => {
    const biz = {
      ...data,
      industry: selIndustry, stage: selStage, team: selTeam,
      customerType: selCustomerType, challenge: selChallenge,
      marketingChannels: selMarketing.join(', '),
    }
    localStorage.setItem('aura_business', JSON.stringify(biz))
    onComplete(biz)
  }

  const stepMeta = [
    { icon:'🏢', title:'Business Basics',           sub:'Name, industry, stage & location' },
    { icon:'💰', title:'Revenue & Finances',         sub:'Numbers that drive your decisions' },
    { icon:'📦', title:'Products & Services',        sub:'What you sell and why people buy it' },
    { icon:'👥', title:'Target Customers & Market',  sub:'Who you serve and where' },
    { icon:'🔍', title:'Competition & Positioning',  sub:'Who you compete with and how you win' },
    { icon:'⚙️', title:'Team, Operations & Goals',   sub:'Your people, channels and ambitions' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:998, animation:'fadeIn 0.4s ease', overflowY:'auto', padding:'20px 0' }}>
      <div className="bg-texture"/>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:20, width:560, padding:'32px 40px', position:'relative', zIndex:1, margin:'auto' }}>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,var(--accent),#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✦</div>
          <span style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:300, letterSpacing:4 }}>AURA</span>
          {onCancel && (
            <button onClick={onCancel} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border2)', borderRadius:8, padding:'5px 12px', color:'var(--text2)', fontFamily:'var(--font)', fontSize:12, cursor:'pointer', transition:'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--danger)';e.currentTarget.style.color='var(--danger)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.color='var(--text2)'}}>✕ Cancel</button>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:24 }}>
          {Array.from({length:TOTAL}).map((_,i) => (
            <div key={i} style={{ flex: i+1===step ? 3 : 1, height:4, borderRadius:99, background: i+1<step?'var(--accent)': i+1===step?'linear-gradient(90deg,var(--accent),#7c3aed)':'var(--surface2)', transition:'all 0.4s ease' }}/>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>{stepMeta[step-1].icon}</div>
          <div>
            <p style={{ fontSize:11, color:'var(--accent)', letterSpacing:2, fontWeight:700 }}>STEP {step} OF {TOTAL}</p>
            <h2 style={{ fontSize:19, fontWeight:700, letterSpacing:-0.5, lineHeight:1.2 }}>{stepMeta[step-1].title}</h2>
          </div>
        </div>
        <p style={{ fontSize:13, color:'var(--text2)', marginBottom:22, lineHeight:1.6 }}>{stepMeta[step-1].sub}</p>

        {step===1 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              {label('Business Name', true)}
              <input value={data.name} onChange={e=>up('name',e.target.value)} placeholder="e.g. Apex Digital Agency" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
            <div>
              {label('Industry', true)}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{industries.map(i=><button key={i} onClick={()=>setSelIndustry(i)} style={chip(selIndustry===i)}>{i}</button>)}</div>
            </div>
            <div>
              {label('Business Stage', true)}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{stages.map(s=><button key={s} onClick={()=>setSelStage(s)} style={chip(selStage===s)}>{s}</button>)}</div>
            </div>
            <div>
              {label('City / Country')}
              <input value={data.location} onChange={e=>up('location',e.target.value)} placeholder="e.g. New York, USA" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        {step===2 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                {label('Monthly Revenue')}
                <input value={data.revenue} onChange={e=>up('revenue',e.target.value)} placeholder="e.g. USD 8,000" style={{...inp,fontSize:13}} onFocus={focusInp} onBlur={blurInp}/>
              </div>
              <div>
                {label('Monthly Expenses')}
                <input value={data.expenses} onChange={e=>up('expenses',e.target.value)} placeholder="e.g. USD 3,500" style={{...inp,fontSize:13}} onFocus={focusInp} onBlur={blurInp}/>
              </div>
            </div>
            <div>
              {label('Pricing Model')}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{pricingModels.map(p=><button key={p} onClick={()=>up('pricingModel',p)} style={chip(data.pricingModel===p)}>{p}</button>)}</div>
            </div>
            <div>
              {label('Average Deal / Order Value')}
              <input value={data.avgDeal} onChange={e=>up('avgDeal',e.target.value)} placeholder="e.g. USD 1,200 per project" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        {step===3 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              {label('What do you sell? (products / services)', true)}
              <textarea value={data.services} onChange={e=>up('services',e.target.value)} placeholder="e.g. Social media management, paid ads, SEO, website design" rows={3} style={{...inp,resize:'none',lineHeight:1.6}} onFocus={focusInp} onBlur={blurInp}/>
            </div>
            <div>
              {label('Your Unique Value Proposition')}
              <input value={data.uvp} onChange={e=>up('uvp',e.target.value)} placeholder="e.g. We guarantee results in 60 days or full refund" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        {step===4 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              {label('Who are your target customers?', true)}
              <input value={data.targetCustomers} onChange={e=>up('targetCustomers',e.target.value)} placeholder="e.g. Restaurant owners, e-commerce brands under $1M revenue" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
            <div>
              {label('Customer Type', true)}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{customerTypes.map(c=><button key={c} onClick={()=>setSelCustomerType(c)} style={chip(selCustomerType===c)}>{c}</button>)}</div>
            </div>
            <div>
              {label('Market / Geography')}
              <input value={data.market} onChange={e=>up('market',e.target.value)} placeholder="e.g. US market, local city, global remote clients" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        {step===5 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              {label('Main Competitors')}
              <input value={data.competitors} onChange={e=>up('competitors',e.target.value)} placeholder="e.g. WebFX, Thrive Agency, local freelancers" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
            <div>
              {label('How are you different from competitors?')}
              <textarea value={data.differentiation} onChange={e=>up('differentiation',e.target.value)} placeholder="e.g. We specialise in food & beverage brands. Faster turnaround, lower price than agencies." rows={3} style={{...inp,resize:'none',lineHeight:1.6}} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        {step===6 && (
          <div style={{ animation:'fadeIn 0.3s ease', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                {label('Team Size')}
                <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{teams.map(t=><button key={t} onClick={()=>setSelTeam(t)} style={chip(selTeam===t)}>{t}</button>)}</div>
              </div>
              <div>
                {label('Key Roles / Who does what')}
                <input value={data.keyRoles} onChange={e=>up('keyRoles',e.target.value)} placeholder="e.g. Me (sales+delivery), 1 VA" style={{...inp,fontSize:13}} onFocus={focusInp} onBlur={blurInp}/>
              </div>
            </div>
            <div>
              {label('Marketing Channels You Currently Use')}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{marketingOpts.map(m=><button key={m} onClick={()=>toggleMarketing(m)} style={chip(selMarketing.includes(m))}>{m}</button>)}</div>
            </div>
            <div>
              {label('Biggest Challenge Right Now')}
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{challenges.map(c=><button key={c} onClick={()=>setSelChallenge(c)} style={chip(selChallenge===c)}>{c}</button>)}</div>
            </div>
            <div>
              {label('6-Month Goal', true)}
              <input value={data.goal} onChange={e=>up('goal',e.target.value)} placeholder="e.g. Hit USD 15,000/month and hire a second person" style={inp} onFocus={focusInp} onBlur={blurInp}/>
            </div>
            <div>
              {label('Anything else AURA should know?')}
              <textarea value={data.notes} onChange={e=>up('notes',e.target.value)} placeholder="e.g. We only take on 5 clients at a time. Recently lost a big client..." rows={2} style={{...inp,resize:'none',lineHeight:1.6}} onFocus={focusInp} onBlur={blurInp}/>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginTop:24 }}>
          {step > 1 && (
            <button onClick={()=>setStep(s=>s-1)} style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid var(--border2)', background:'var(--surface2)', color:'var(--text2)', fontFamily:'var(--font)', fontSize:14, cursor:'pointer' }}>← Back</button>
          )}
          {step < TOTAL ? (
            <button onClick={()=>canNext[step]&&setStep(s=>s+1)} disabled={!canNext[step]}
              style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:canNext[step]?'linear-gradient(135deg,var(--accent),#5b6af0)':'var(--surface2)', color:canNext[step]?'#fff':'var(--text3)', fontFamily:'var(--font)', fontSize:14, fontWeight:600, cursor:canNext[step]?'pointer':'not-allowed' }}>
              Continue →
            </button>
          ) : (
            <button onClick={()=>canNext[6]&&finish()} disabled={!canNext[6]}
              style={{ flex:2, padding:'12px', borderRadius:10, border:'none', background:canNext[6]?'linear-gradient(135deg,var(--accent),#5b6af0)':'var(--surface2)', color:canNext[6]?'#fff':'var(--text3)', fontFamily:'var(--font)', fontSize:14, fontWeight:600, cursor:canNext[6]?'pointer':'not-allowed' }}>
              Launch AURA 🚀
            </button>
          )}
        </div>

        {!canNext[step] && step !== 1 && step !== 3 && step !== 4 && step !== 6 && (
          <p style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginTop:10 }}>All fields on this step are optional — click Continue to skip</p>
        )}
      </div>
    </div>
  )
}

// ─── Icon Rail ────────────────────────────────────────────────────────────────
function IconRail({ page, setPage }) {
  const mainItems = [
    { id:'chat',       icon:'💬', label:'Chat' },
    { id:'agents',     icon:'⚡', label:'Agents' },
    { id:'brainstorm', icon:'💡', label:'Brainstorm' },
    { id:'newsletter', icon:'📰', label:'Newsletter' },
  ]
  const guideItem = { id:'guide', icon:'📖', label:'Guidebook' }

  const railBtn = (item) => ({
    width:38, height:38, borderRadius:10,
    border:`1px solid ${page===item.id?'var(--accent)':'transparent'}`,
    background:page===item.id?'var(--accent-dim)':'transparent',
    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:17, transition:'all 0.15s',
    color:page===item.id?'var(--accent)':'var(--text3)',
  })

  return (
    <div style={{ width:56, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', alignSelf:'stretch', padding:'14px 0 12px', gap:6, flexShrink:0, zIndex:10 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:300, letterSpacing:3, color:'var(--accent)', marginBottom:14 }}>✦</div>
      {mainItems.map(item => (
        <button key={item.id} onClick={()=>setPage(item.id)} title={item.label} style={railBtn(item)}
          onMouseEnter={e=>{ if(page!==item.id){ e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='var(--text2)' }}}
          onMouseLeave={e=>{ if(page!==item.id){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text3)' }}}>
          {item.icon}
        </button>
      ))}
      <div style={{ flex:1, minHeight:12 }}/>
      <button onClick={()=>setPage(guideItem.id)} title={guideItem.label} style={railBtn(guideItem)}
        onMouseEnter={e=>{ if(page!==guideItem.id){ e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='var(--text2)' }}}
        onMouseLeave={e=>{ if(page!==guideItem.id){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text3)' }}}>
        {guideItem.icon}
      </button>
    </div>
  )
}

// ─── Chat Sidebar ─────────────────────────────────────────────────────────────
function ChatSidebar({ open, chats, activeChatId, bizData, onNew, onSelect, onDelete, onEditBiz, searchQuery, setSearchQuery }) {
  const groups = groupChats(chats.filter(c=>c.title?.toLowerCase().includes(searchQuery.toLowerCase())))
  if (!open) return null
  return (
    <div style={{ width:220, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', height:'100%', flexShrink:0, animation:'slideInLeft 0.25s ease' }}>
      <div style={{ padding:'14px 12px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:'var(--text3)', letterSpacing:1.5, textTransform:'uppercase', fontWeight:600 }}>Chats</span>
        <button onClick={onNew} style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:7, width:26, height:26, cursor:'pointer', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all 0.2s' }}
          onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.transform='rotate(15deg)'}}
          onMouseLeave={e=>{e.currentTarget.style.color='var(--text2)';e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='rotate(0)'}}>✏</button>
      </div>
      {bizData && (
        <div style={{ margin:'10px 8px 4px', background:'var(--surface2)', borderRadius:10, padding:'10px 12px', border:'1px solid var(--border2)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <div style={{ width:26, height:26, borderRadius:7, background:'linear-gradient(135deg,var(--accent-dim),rgba(124,58,237,0.2))', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{bizData.name?.charAt(0)?.toUpperCase()}</div>
              <div>
                <p style={{ fontSize:11, fontWeight:600, lineHeight:1.2 }}>{truncate(bizData.name,16)}</p>
                <p style={{ fontSize:10, color:'var(--accent)' }}>{bizData.industry}</p>
              </div>
            </div>
            <button onClick={onEditBiz} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:12 }} onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}>✎</button>
          </div>
        </div>
      )}
      <div style={{ padding:'8px 8px 4px' }}>
        <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search..." style={{ width:'100%', padding:'6px 10px', borderRadius:999, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)', fontFamily:'var(--font)', fontSize:11, outline:'none' }} onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'4px 6px' }}>
        {Object.entries(groups).map(([label,items])=>items.length===0?null:(
          <div key={label} style={{ marginBottom:8 }}>
            <p style={{ fontSize:9, color:'var(--text3)', letterSpacing:1.5, textTransform:'uppercase', padding:'4px 6px 4px', fontWeight:600 }}>{label}</p>
            {items.map(chat=><ChatItem key={chat.id} chat={chat} active={chat.id===activeChatId} onSelect={onSelect} onDelete={onDelete}/>)}
          </div>
        ))}
        {chats.length===0 && <p style={{ color:'var(--text3)', fontSize:11, textAlign:'center', marginTop:20 }}>No chats yet</p>}
      </div>
    </div>
  )
}

function ChatItem({ chat, active, onSelect, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onSelect(chat.id)}
      style={{ padding:'7px 8px', borderRadius:8, cursor:'pointer', marginBottom:2, display:'flex', alignItems:'center', justifyContent:'space-between', background:active?'var(--surface3)':hov?'rgba(255,255,255,0.03)':'transparent', borderLeft:active?'2px solid var(--accent)':'2px solid transparent', transition:'all 0.15s' }}>
      <p style={{ fontSize:11, color:active?'var(--text)':'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>{truncate(chat.title,30)||'New Chat'}</p>
      {hov && <button onClick={e=>{e.stopPropagation();onDelete(chat.id)}} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:12, padding:'0 2px', marginLeft:4 }} onMouseEnter={e=>e.target.style.color='var(--danger)'} onMouseLeave={e=>e.target.style.color='var(--text3)'}>✕</button>}
    </div>
  )
}

// ─── Agents Page ──────────────────────────────────────────────────────────────
function AgentsPage({ bizData, onSendToChat, activeAgent, setActiveAgent }) {

  const agents = [
    { id:'lead-agent',        icon:'🎯', name:'Lead Generation',       desc:'Find real leads from LinkedIn, Google Maps, Instagram, TikTok & more',                              status:'live', color:'#3b8ef0' },
    { id:'consultant-agent',  icon:'🧠', name:'Business Consultant',   desc:'Pick an area — Growth, Marketing, Sales, Cost-Cutting, Strategy or Problem-Solving — get real advice tailored to your business', status:'live', color:'#f97316' },
    { id:'competitor-agent',  icon:'🔍', name:'Competitor Research',   desc:'Research competitors, compare side by side, and find market gaps — max 5 results',                  status:'live', color:'#8b5cf6' },
    { id:'financial-agent',   icon:'📊', name:'Financial Snapshot',    desc:'P&L breakdown, profit margin, burn rate, goal progress and 3 specific actions — in seconds',        status:'live', color:'#06b6d4' },
    { id:'proposal-agent',    icon:'📝', name:'Proposal & Invoice',    desc:'Generate professional proposals and invoices in seconds — scoped, priced, and ready to send',        status:'live', color:'#10b981' },
  ]

  const agentMeta = {
    'lead-agent':       { color:'#3b8ef0', bg:'rgba(59,142,240,0.08)',  border:'rgba(59,142,240,0.25)',  icon:'🎯', label:'Lead Generation Agent is Active',      hint:'Go to Chat — e.g. "Find 10 marketing agencies in Dubai on Google Maps"' },
    'consultant-agent': { color:'#f97316', bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.25)', icon:'🧠', label:'Business Consultant Agent is Active',    hint:'Pick an area: Growth · Marketing · Sales · Cost-Cutting · Strategy · Problem-Solving' },
    'competitor-agent': { color:'#8b5cf6', bg:'rgba(139,92,246,0.08)', border:'rgba(139,92,246,0.25)', icon:'🔍', label:'Competitor Research Agent is Active',    hint:'Go to Chat — e.g. "Research XYZ Agency" or "Compare A vs B"' },
    'financial-agent':  { color:'#06b6d4', bg:'rgba(6,182,212,0.08)',   border:'rgba(6,182,212,0.25)',   icon:'📊', label:'Financial Snapshot Agent is Active',     hint:'Go to Chat — e.g. "Analyze my business this month" or "Revenue $18k, expenses $9k"' },
    'proposal-agent':   { color:'#10b981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.25)', icon:'📝', label:'Proposal & Invoice Agent is Active',     hint:'Go to Chat — e.g. "Write a proposal for Mike, web design, $2,000" or "Invoice for Sara, $1,500"' },
  }
  const meta = activeAgent ? agentMeta[activeAgent] : null

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'28px 32px', animation:'fadeIn 0.3s ease' }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ marginBottom:28 }}>
          <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:-0.5, marginBottom:6 }}>⚡ AI Agents</h2>
          <p style={{ fontSize:14, color:'var(--text2)', lineHeight:1.6 }}>Powerful agents that do real work for {bizData?.name||'your business'} — not just answer questions.</p>
        </div>

        {meta && (
          <div style={{ marginBottom:20, padding:'12px 16px', background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:12, display:'flex', alignItems:'center', gap:10, animation:'fadeIn 0.3s ease' }}>
            <span style={{ fontSize:16 }}>{meta.icon}</span>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600, color:meta.color }}>{meta.label}</p>
              <p style={{ fontSize:11, color:'var(--text2)' }}>{meta.hint}</p>
            </div>
            <button onClick={()=>setActiveAgent(null)} style={{ padding:'6px 12px', borderRadius:8, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444', fontSize:11, cursor:'pointer', fontFamily:'var(--font)', fontWeight:600 }}>Turn Off</button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:16 }}>
          {agents.map(agent => (
            <div key={agent.id} style={{ background:'var(--surface)', border:`1px solid ${activeAgent===agent.id?agent.color:'var(--border2)'}`, borderRadius:14, padding:'20px', position:'relative', overflow:'hidden', transition:'all 0.2s', opacity:agent.status==='soon'?0.6:1, boxShadow:activeAgent===agent.id?`0 0 20px ${agent.color}30`:'' }}
              onMouseEnter={e=>{ if(agent.status==='live'){ e.currentTarget.style.borderColor=agent.color; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${agent.color}20` }}}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=activeAgent===agent.id?agent.color:'var(--border2)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow=activeAgent===agent.id?`0 0 20px ${agent.color}30`:'' }}>

              <div style={{ position:'absolute', top:12, right:12, padding:'3px 8px', borderRadius:99, background:agent.status==='live'?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.06)', border:`1px solid ${agent.status==='live'?'rgba(16,185,129,0.3)':'rgba(255,255,255,0.1)'}`, fontSize:9, color:agent.status==='live'?'var(--success)':'var(--text3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>
                {agent.status==='live'?'LIVE':'SOON'}
              </div>

              <div style={{ fontSize:28, marginBottom:12 }}>{agent.icon}</div>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{agent.name}</h3>
              <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, marginBottom:16 }}>{agent.desc}</p>

              {agent.status==='live' ? (
                <button onClick={()=>{ setActiveAgent(prev=>prev===agent.id?null:agent.id); if(activeAgent!==agent.id) onSendToChat() }}
                  style={{ width:'100%', padding:'9px', borderRadius:9, border:`1px solid ${activeAgent===agent.id?'rgba(239,68,68,0.3)':agent.color}`, background:activeAgent===agent.id?'rgba(239,68,68,0.08)':'transparent', color:activeAgent===agent.id?'#ef4444':agent.color, fontFamily:'var(--font)', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.2s' }}>
                  {activeAgent===agent.id ? '⏹ Deactivate' : '▶ Activate Agent'}
                </button>
              ) : (
                <div style={{ width:'100%', padding:'9px', borderRadius:9, border:'1px solid var(--border)', background:'transparent', color:'var(--text3)', fontFamily:'var(--font)', fontSize:12, fontWeight:600, textAlign:'center' }}>Coming Soon</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop:28, padding:'16px 20px', background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12 }}>
          <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
            💡 <strong style={{ color:'var(--text)' }}>How agents work:</strong> Activate an agent, then go to Chat and describe what you want. The agent will handle the task and show results directly in your conversation — like a real employee working for {bizData?.name||'your business'}.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────
function WelcomeScreen({ bizData, activeAgent, onSuggestion }) {
  const suggestions = activeAgent==='lead-agent' ? [
    { icon:'📍', title:'Find restaurants on Google Maps', sub:'e.g. in New York, Chicago' },
    { icon:'💼', title:'Find leads on LinkedIn', sub:'by industry or job title' },
    { icon:'📸', title:'Find influencers on Instagram', sub:'by niche or hashtag' },
  ] : activeAgent==='competitor-agent' ? [
    { icon:'🔍', title:'Research a competitor', sub:'e.g. "Research XYZ Agency"' },
    { icon:'⚖️', title:'Compare two competitors', sub:'e.g. "Compare A vs B"' },
    { icon:'🗺️', title:'Find my competitors', sub:'e.g. in my city or online' },
  ] : activeAgent==='financial-agent' ? [
    { icon:'📊', title:'Analyze my business this month', sub:'Full P&L + action plan' },
    { icon:'💰', title:'Revenue $18k expenses $9k', sub:'Quick snapshot from numbers' },
    { icon:'📈', title:'Compare to last month', sub:'Track your progress over time' },
  ] : activeAgent==='consultant-agent' ? [
    { icon:'📈', title:'Growth advice', sub:'How to grow my business right now' },
    { icon:'📣', title:'Marketing advice', sub:'How to get more clients & visibility' },
    { icon:'💸', title:'Cost-cutting advice', sub:'Where to reduce expenses smartly' },
  ] : activeAgent==='proposal-agent' ? [
    { icon:'📝', title:'Write a proposal for a client', sub:'project, budget, timeline' },
    { icon:'🧾', title:'Create an invoice for Ahmed', sub:'USD 1,500, due in 7 days' },
    { icon:'📄', title:'Proposal for web design project', sub:'scope, deliverables, price' },
  ] : bizData ? [
    { icon:'📈', title:'Grow my revenue', sub:`Strategy for ${truncate(bizData.name,18)}` },
    { icon:'💰', title:'Analyze my expenses', sub:'Find where to save money' },
    { icon:'🎯', title:truncate(bizData.challenge,28)||'My main challenge', sub:'Get a specific action plan' },
  ] : [
    { icon:'💡', title:'Explain a concept', sub:'Break down any topic simply' },
    { icon:'✍️', title:'Write something', sub:'Emails, essays, creative ideas' },
    { icon:'⚙️', title:'Solve a problem', sub:'Logic, math, strategy' },
  ]

  const agentHeader = {
    'lead-agent':       { badge:'🎯 Lead Generation Agent Active',       badgeBg:'rgba(59,142,240,0.1)',  badgeBorder:'rgba(59,142,240,0.25)',  badgeColor:'var(--accent)',   title:'What leads are you looking for?',       sub:'Tell me the platform, niche, and location' },
    'competitor-agent': { badge:'🔍 Competitor Research Agent Active',   badgeBg:'rgba(139,92,246,0.1)', badgeBorder:'rgba(139,92,246,0.25)', badgeColor:'#8b5cf6',         title:'Who do you want to research?',          sub:'Single research · Compare two · Find competitors · Customer complaints' },
    'consultant-agent': { badge:'🧠 Business Consultant Agent Active',   badgeBg:'rgba(249,115,22,0.1)', badgeBorder:'rgba(249,115,22,0.25)', badgeColor:'#f97316',         title:'What area do you want advice on?',      sub:'Growth · Marketing · Sales · Cost-Cutting · Strategy · Problem-Solving' },
    'financial-agent':  { badge:'📊 Financial Snapshot Agent Active',    badgeBg:'rgba(6,182,212,0.1)',  badgeBorder:'rgba(6,182,212,0.25)',  badgeColor:'#06b6d4',  title:"What are your numbers?",                sub:"Tell me revenue & expenses — I'll give you a full CFO-level breakdown" },
    'proposal-agent':   { badge:'📝 Proposal & Invoice Agent Active',    badgeBg:'rgba(16,185,129,0.1)', badgeBorder:'rgba(16,185,129,0.25)', badgeColor:'#10b981',         title:'Proposal or Invoice?',                  sub:'e.g. "Proposal for Ahmed, web design, $80k" or "Invoice for Ahmed, $45k"' },
  }
  const h = activeAgent ? agentHeader[activeAgent] : null

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, animation:'fadeIn 0.5s ease' }}>
      <div style={{ fontSize:26, marginBottom:14, filter:'drop-shadow(0 0 12px var(--accent))' }}>✦</div>
      {h ? (
        <>
          <div style={{ padding:'6px 16px', borderRadius:99, background:h.badgeBg, border:`1px solid ${h.badgeBorder}`, fontSize:12, color:h.badgeColor, fontWeight:600, marginBottom:12 }}>{h.badge}</div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:600, textAlign:'center', letterSpacing:-0.5 }}>{h.title}</h2>
          <p style={{ color:'var(--text2)', marginTop:8, fontSize:14, textAlign:'center' }}>{h.sub}</p>
        </>
      ) : bizData ? (
        <>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:600, textAlign:'center', letterSpacing:-0.5 }}>Welcome back, <span style={{ color:'var(--accent)' }}>{truncate(bizData.name,20)}</span></h2>
          <p style={{ color:'var(--text2)', marginTop:8, fontSize:14, textAlign:'center' }}>Your {bizData.industry} business AI. What shall we work on?</p>
        </>
      ) : (
        <>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:600, textAlign:'center' }}>Hello. I am <span style={{ color:'var(--accent)' }}>AURA.</span></h2>
          <p style={{ color:'var(--text2)', marginTop:8, fontSize:14, textAlign:'center' }}>Your intelligent AI assistant.</p>
        </>
      )}
      <div style={{ display:'flex', gap:12, marginTop:32, flexWrap:'wrap', justifyContent:'center' }}>
        {suggestions.map((s,i) => (
          <button key={i} onClick={()=>onSuggestion(s.title)} style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:14, padding:'16px 18px', cursor:'pointer', textAlign:'left', width:165, fontFamily:'var(--font)', color:'var(--text)', animation:`slideInLeft 0.4s ease ${i*0.1}s both`, transition:'all 0.2s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.transform='scale(1.03)';e.currentTarget.style.boxShadow='0 0 20px var(--accent-dim)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='none'}}>
            <div style={{ fontSize:20, marginBottom:7 }}>{s.icon}</div>
            <p style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>{s.title}</p>
            <p style={{ fontSize:11, color:'var(--text2)' }}>{s.sub}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Leads Table ──────────────────────────────────────────────────────────────
function LeadsTable({ leads, platform }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(null)
  if (!leads?.length) return null

  const exportCSV = () => {
    const keys = Object.keys(leads[0])
    const rows = [keys.join(','), ...leads.map(l=>keys.map(k=>`"${(l[k]||'—').toString().replace(/"/g,'""')}"`).join(','))]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}))
    a.download = `leads-${platform}-${Date.now()}.csv`; a.click()
  }

  const copyAll = () => {
    const text = leads.map(l => `${l['#']}. ${l.name}\n   ${l.description}\n   Contact: ${l.contact}\n   Website: ${l.website}\n   Score: ${l.outreach_score}/10 — ${l.score_reason}\n   Opener: ${l.ai_opener}`).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  const scoreColor = (s) => s >= 8 ? '#10b981' : s >= 6 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ marginTop:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <span style={{ fontSize:12, color:'var(--success)', fontWeight:600 }}>✅ {leads.length} enriched leads found</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={copyAll} style={{ padding:'5px 10px', borderRadius:7, background:copied?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.06)', border:`1px solid ${copied?'var(--success)':'var(--border2)'}`, color:copied?'var(--success)':'var(--text2)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>{copied?'✅ Copied!':'📋 Copy All'}</button>
          <button onClick={exportCSV} style={{ padding:'5px 10px', borderRadius:7, background:'rgba(255,255,255,0.06)', border:'1px solid var(--border2)', color:'var(--text2)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>⬇ CSV</button>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {leads.map((lead, i) => (
          <div key={i} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border2)', borderRadius:12, overflow:'hidden', transition:'border-color 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(59,142,240,0.3)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border2)'}>
            <div style={{ padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:9, background:`${scoreColor(lead.outreach_score)}18`, border:`1px solid ${scoreColor(lead.outreach_score)}40`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:700, color:scoreColor(lead.outreach_score), lineHeight:1 }}>{lead.outreach_score}</span>
                <span style={{ fontSize:8, color:scoreColor(lead.outreach_score), opacity:0.7 }}>/10</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{lead.name}</span>
                  {lead.location && lead.location !== '—' && <span style={{ fontSize:10, color:'var(--text3)' }}>📍 {lead.location}</span>}
                </div>
                <p style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5, marginBottom:6 }}>{lead.description}</p>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:2 }}>
                  {lead.contact && lead.contact !== '—' && <span style={{ fontSize:11, color:'var(--accent)', background:'rgba(59,142,240,0.08)', padding:'2px 8px', borderRadius:99, border:'1px solid rgba(59,142,240,0.2)' }}>📞 {lead.contact}</span>}
                  {lead.website && lead.website !== '—' && <a href={lead.website.startsWith('http')?lead.website:'https://'+lead.website} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#10b981', textDecoration:'none', background:'rgba(16,185,129,0.08)', padding:'2px 8px', borderRadius:99, border:'1px solid rgba(16,185,129,0.2)' }}>🌐 Website</a>}
                  {lead.facebook && lead.facebook !== '—' && <a href={lead.facebook} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#4f9eff', textDecoration:'none', background:'rgba(79,158,255,0.08)', padding:'2px 8px', borderRadius:99, border:'1px solid rgba(79,158,255,0.2)' }}>📘 Facebook</a>}
                  {lead.instagram && lead.instagram !== '—' && <a href={lead.instagram} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#e1306c', textDecoration:'none', background:'rgba(225,48,108,0.08)', padding:'2px 8px', borderRadius:99, border:'1px solid rgba(225,48,108,0.2)' }}>📸 Instagram</a>}
                </div>
              </div>
              <button onClick={()=>setExpanded(expanded===i?null:i)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:4, flexShrink:0, transition:'color 0.2s' }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}>
                {expanded===i?'▲':'▼'}
              </button>
            </div>
            <div style={{ padding:'0 14px 10px', paddingLeft:62 }}>
              <span style={{ fontSize:10, color:scoreColor(lead.outreach_score), background:`${scoreColor(lead.outreach_score)}12`, padding:'2px 8px', borderRadius:99, border:`1px solid ${scoreColor(lead.outreach_score)}25` }}>{lead.score_reason}</span>
            </div>
            {expanded===i && (
              <div style={{ margin:'0 14px 12px', padding:'10px 14px', background:'rgba(59,142,240,0.06)', border:'1px solid rgba(59,142,240,0.2)', borderRadius:10, animation:'fadeIn 0.2s ease' }}>
                <p style={{ fontSize:10, color:'var(--accent)', fontWeight:600, marginBottom:5, letterSpacing:0.5 }}>✉️ AI-GENERATED OUTREACH OPENER</p>
                <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.7, fontStyle:'italic' }}>"{lead.ai_opener}"</p>
                <button onClick={()=>navigator.clipboard.writeText(lead.ai_opener)} style={{ marginTop:8, padding:'4px 10px', borderRadius:7, background:'rgba(59,142,240,0.1)', border:'1px solid rgba(59,142,240,0.25)', color:'var(--accent)', fontSize:10, cursor:'pointer', fontFamily:'var(--font)' }}>Copy opener</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Chat copy / selection helpers ───────────────────────────────────────────
function getMessageCopyText(msg) {
  if (msg.text) return msg.text
  if (msg.proposal) return `Proposal for ${msg.proposal.clientName}: ${msg.proposal.projectTitle}`
  if (msg.invoice) return `Invoice ${msg.invoice.invoiceNumber} for ${msg.invoice.clientName}`
  return ''
}

function formatUserMessageForApi(m) {
  if (m.replyQuote) return `[Replying to this excerpt from the conversation]\n"${m.replyQuote}"\n\n${m.text}`
  return m.text
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text)
}

function SelectionToolbar({ toolbar, onCopy, onReply }) {
  if (!toolbar) return null
  return (
    <div
      className="chat-selection-toolbar"
      style={{ position:'fixed', left:toolbar.x, top:toolbar.y, transform:'translate(-50%, calc(-100% - 8px))', background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:8, display:'flex', gap:4, padding:'4px 6px', boxShadow:'0 4px 16px rgba(0,0,0,0.4)', zIndex:100 }}
      onMouseDown={e=>e.preventDefault()}
    >
      <button type="button" onClick={()=>onCopy(toolbar.text)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:11, padding:'4px 8px', borderRadius:6, fontFamily:'var(--font)', fontWeight:600 }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>📋 Copy</button>
      <button type="button" onClick={()=>onReply(toolbar.text)} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11, padding:'4px 8px', borderRadius:6, fontFamily:'var(--font)', fontWeight:600 }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(59,142,240,0.1)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>↩ Reply</button>
    </div>
  )
}

function useChatTextSelection(chatContainerRef, enabled) {
  const [toolbar, setToolbar] = useState(null)

  useEffect(() => {
    if (!enabled) { setToolbar(null); return }

    const hide = () => setToolbar(null)

    const onMouseUp = () => {
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        const text = sel?.toString().trim()
        if (!text) { setToolbar(null); return }
        if (!sel.rangeCount) return
        const node = sel.getRangeAt(0).commonAncestorContainer
        if (!chatContainerRef.current?.contains(node)) { setToolbar(null); return }
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        if (!rect.width && !rect.height) { setToolbar(null); return }
        setToolbar({ x: rect.left + rect.width / 2, y: rect.top, text })
      })
    }

    const el = chatContainerRef.current
    document.addEventListener('mouseup', onMouseUp)
    el?.addEventListener('scroll', hide, { passive:true })
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      el?.removeEventListener('scroll', hide)
    }
  }, [enabled, chatContainerRef])

  return [toolbar, setToolbar]
}

// ─── Message ──────────────────────────────────────────────────────────────────
function Message({ msg, bizData, onResearch, onReplyToText }) {
  const isUser = msg.role==='user'
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasLeads = !!msg.leads
  const hasCompetitor = !!msg.competitorReport
  const hasConsultant = !!msg.consultantReport
  const hasFinancial = !!msg.financialSnapshot
  const hasProposal = !!msg.proposal
  const hasInvoice = !!msg.invoice
  const hasRichText = messageHasRichLayout(msg.text)
  const isWide = hasLeads || hasCompetitor || hasConsultant || hasFinancial || hasProposal || hasInvoice || hasRichText
  const agentLabel = hasLeads ? '· 🎯 Lead Agent' : hasCompetitor ? '· 🔍 Competitor Agent' : hasConsultant ? '· 🧠 Consultant Agent' : hasFinancial ? '· 📊 Financial Agent' : hasProposal ? '· 📝 Proposal Writer' : hasInvoice ? '· 🧾 Invoice Writer' : ''
  const copyText = getMessageCopyText(msg)
  const canCopy = !!copyText

  const handleCopy = async (e) => {
    e.stopPropagation()
    if (!copyText) return
    await copyToClipboard(copyText)
    setCopied(true)
    setTimeout(()=>setCopied(false), 1500)
  }

  const handleReply = (e) => {
    e.stopPropagation()
    if (copyText && onReplyToText) onReplyToText(copyText)
  }

  return (
    <div className="animate-msg chat-message" style={{ display:'flex', flexDirection:isUser?'row-reverse':'row', gap:10, alignItems:'flex-start', marginBottom:16 }}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      {!isUser && <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:'linear-gradient(135deg,var(--accent),#5b6af0)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, marginTop:4 }}>✦</div>}
      <div style={{ maxWidth:isWide?'95%':'72%', width:isWide?'95%':'auto', display:'flex', flexDirection:'column', alignItems:isUser?'flex-end':'flex-start', position:'relative' }}>
        {!isUser && <span style={{ fontSize:10, color:'var(--accent)', letterSpacing:1.5, marginBottom:4, fontWeight:600 }}>AURA {agentLabel}</span>}
        {hover && canCopy && (
          <div style={{ display:'flex', gap:4, marginBottom:4, alignSelf:isUser?'flex-end':'flex-start' }}>
            <button type="button" onClick={handleCopy} style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:6, color:copied?'var(--success)':'var(--text2)', cursor:'pointer', fontSize:11, padding:'3px 8px', fontFamily:'var(--font)', fontWeight:600, transition:'all 0.15s' }}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            {onReplyToText && (
              <button type="button" onClick={handleReply} style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:6, color:'var(--accent)', cursor:'pointer', fontSize:11, padding:'3px 8px', fontFamily:'var(--font)', fontWeight:600, transition:'all 0.15s' }}>
                ↩ Reply
              </button>
            )}
          </div>
        )}
        <div className="chat-message-body" style={{ padding:'11px 16px', borderRadius:isUser?'18px 18px 4px 18px':'18px 18px 18px 4px', background:isUser?'var(--surface3)':'var(--surface2)', borderLeft:!isUser?'2px solid var(--accent)':'none', color:'var(--text)', fontSize:14, lineHeight:1.7, wordBreak:'break-word', width:isWide?'100%':'auto', userSelect:'text' }}>
          {msg.replyQuote && (
            <div style={{ borderLeft:'2px solid var(--accent)', paddingLeft:10, marginBottom:10, fontSize:12, color:'var(--text2)', lineHeight:1.55, opacity:0.95 }}>
              {msg.replyQuote.length > 220 ? msg.replyQuote.slice(0, 220) + '…' : msg.replyQuote}
            </div>
          )}
          {msg.text ? <ChatMessageContent text={msg.text} /> : null}
          {hasLeads && <LeadsTable leads={msg.leads} platform={msg.platform}/>}
          {hasCompetitor && <CompetitorReport report={msg.competitorReport} bizData={bizData} onResearch={onResearch}/>}
          {hasConsultant && <ConsultantReport report={msg.consultantReport}/>}
          {hasFinancial && <FinancialSnapshotUI snapshot={msg.financialSnapshot} bizData={bizData}/>}
          {hasProposal && <ProposalUI proposal={msg.proposal} bizData={bizData}/>}
          {hasInvoice && <InvoiceUI invoice={msg.invoice} bizData={bizData}/>}
        </div>
        <span style={{ fontSize:10, color:'var(--text3)', marginTop:4, padding:'0 4px' }}>{msg.time}</span>
      </div>
    </div>
  )
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="animate-msg" style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:16 }}>
      <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:'linear-gradient(135deg,var(--accent),#5b6af0)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✦</div>
      <div style={{ padding:'14px 18px', borderRadius:'18px 18px 18px 4px', background:'var(--surface2)', borderLeft:'2px solid var(--accent)', display:'flex', gap:5, alignItems:'center' }}>
        {[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', animation:`wave 1.3s ease-in-out ${i*0.15}s infinite` }}/>)}
      </div>
    </div>
  )
}

// ─── Input Bar ────────────────────────────────────────────────────────────────
function InputBar({ onSend, disabled, activeAgent, replyTo, onClearReply }) {
  const [val, setVal] = useState('')
  const [focused, setFocused] = useState(false)
  const [idle, setIdle] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const idleTimer = useRef()
  const inputRef = useRef()
  const fileRef = useRef()

  const resetIdle = () => { setIdle(false); clearTimeout(idleTimer.current); idleTimer.current = setTimeout(()=>setIdle(true),3000) }
  useEffect(()=>{ resetIdle(); return ()=>clearTimeout(idleTimer.current) },[])
  useEffect(()=>{ if (replyTo) inputRef.current?.focus() }, [replyTo])

  const send = () => {
    const t = val.trim()
    if ((!t && !attachedFile) || disabled) return
    const fileToSend = attachedFile
    setVal('')
    setAttachedFile(null)
    resetIdle()
    onSend(t || `Please analyze the attached file: ${fileToSend?.name}`, fileToSend)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachedFile(file)
    e.target.value = ''
  }

  const agentConfig = {
    'lead-agent':       { placeholder:'e.g. "Find 10 restaurants in New York on Google Maps"',                            banner:{ bg:'rgba(59,142,240,0.08)',  border:'rgba(59,142,240,0.2)',  color:'var(--accent)',   icon:'🎯', text:'Lead Generation Agent is Active' },                               footer:'Powered by Serper — real leads from real platforms' },
    'consultant-agent': { placeholder:'e.g. "Growth advice" · "Marketing advice" · "How do I fix my cash flow?"',        banner:{ bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.2)', color:'#f97316',         icon:'🧠', text:'Business Consultant — Growth · Marketing · Sales · Cost-Cutting · Strategy · Problem-Solving' }, footer:'Powered by Serper + GPT — real market data + AI strategy for your business' },
    'competitor-agent': { placeholder:'e.g. "Research XYZ Agency" · "Compare A vs B" · "Find my competitors in NYC"',    banner:{ bg:'rgba(139,92,246,0.08)', border:'rgba(139,92,246,0.2)', color:'#8b5cf6',         icon:'🔍', text:'Competitor Research Agent — Single · Compare · Find · Complaints' },      footer:'Powered by Serper + GPT-4o — real competitor data from the web' },
    'financial-agent':  { placeholder:'e.g. "Revenue $18k, expenses $9k this month" or "Analyze my business"', banner:{ bg:'rgba(6,182,212,0.08)',  border:'rgba(6,182,212,0.2)',  color:'#06b6d4',  icon:'📊', text:'Financial Snapshot Agent — P&L · Margin · Burn Rate · Actions' },      footer:'No API needed — pure AI analysis of your numbers' },
    'proposal-agent':   { placeholder:'e.g. "Proposal for Ahmed, web design, $8,000" or "Invoice for Ahmed, $1,500, due in 7 days"', banner:{ bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)', color:'#10b981', icon:'📝', text:'Proposal & Invoice — describe what you need' }, footer:'AI detects intent automatically — just describe what you need' },
  }

  const cfg = activeAgent ? agentConfig[activeAgent] : null
  const placeholder = cfg?.placeholder || 'Ask AURA anything about your business...'
  const footer = cfg?.footer || 'AURA knows your business. Ask anything.'
  const hasContent = val.trim() || attachedFile

  return (
    <div style={{ padding:'8px 20px 16px' }}>
      {cfg && (
        <div style={{ maxWidth:720, margin:'0 auto 6px', display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:cfg.banner.bg, border:`1px solid ${cfg.banner.border}`, borderRadius:99 }}>
          <span style={{ fontSize:11 }}>{cfg.banner.icon}</span>
          <span style={{ fontSize:11, color:cfg.banner.color, fontWeight:500, flex:1 }}>{cfg.banner.text}</span>
        </div>
      )}
      <div style={{ maxWidth:720, margin:'0 auto' }}>

        {replyTo && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:8, padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border2)', borderLeft:'3px solid var(--accent)', borderRadius:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:10, fontWeight:700, color:'var(--accent)', letterSpacing:0.8, marginBottom:4 }}>REPLYING TO</p>
              <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>{replyTo.excerpt}</p>
            </div>
            <button type="button" onClick={onClearReply} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:2, flexShrink:0 }} title="Cancel reply"
              onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}>✕</button>
          </div>
        )}

        {attachedFile && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'8px 14px', background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10 }}>
            <span style={{ fontSize:16 }}>📎</span>
            <span style={{ fontSize:12, color:'var(--success)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachedFile.name}</span>
            <span style={{ fontSize:11, color:'var(--text3)', flexShrink:0 }}>{(attachedFile.size/1024).toFixed(1)} KB</span>
            <button onClick={()=>setAttachedFile(null)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:2, flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}>✕</button>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface)', border:`1px solid ${focused?'var(--accent)':'rgba(59,142,240,0.35)'}`, borderRadius:999, padding:'10px 14px', boxShadow:focused?'0 0 0 1px var(--accent), 0 0 24px var(--accent-glow)':'0 0 12px rgba(59,142,240,0.2)', animation:idle&&!focused?'pulseGlow 2.5s ease-in-out infinite':'none', transition:'border-color 0.3s, box-shadow 0.3s' }}>
          <input ref={fileRef} type="file" style={{ display:'none' }} onChange={handleFile} accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.json,.md"/>
          <button onClick={()=>fileRef.current?.click()} title="Attach file" style={{ background:'none', border:'none', color:attachedFile?'var(--success)':'var(--text3)', fontSize:16, cursor:'pointer', padding:'0 4px', flexShrink:0, transition:'color 0.2s' }}
            onMouseEnter={e=>{ if(!attachedFile) e.currentTarget.style.color='var(--accent)' }}
            onMouseLeave={e=>{ if(!attachedFile) e.currentTarget.style.color='var(--text3)' }}>📎</button>
          <input ref={inputRef} value={val} onChange={e=>{setVal(e.target.value);resetIdle()}} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} onFocus={()=>{setFocused(true);resetIdle()}} onBlur={()=>setFocused(false)} placeholder={replyTo ? 'Write your reply...' : placeholder} disabled={disabled} autoComplete="off"
            style={{ flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'var(--font)', fontSize:14 }}/>
          <button onClick={send} disabled={disabled||!hasContent} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:hasContent?'linear-gradient(135deg,var(--accent),#5b6af0)':'var(--surface2)', color:hasContent?'#fff':'var(--text3)', cursor:hasContent?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0, transition:'all 0.2s', boxShadow:hasContent?'0 0 12px rgba(59,142,240,0.4)':'none' }}>➤</button>
        </div>
        <p style={{ fontSize:10, color:'var(--text3)', textAlign:'center', marginTop:6 }}>{footer}</p>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('splash')
  const [page, setPage] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeAgent, setActiveAgent] = useState(null)
  const [bizData, setBizData] = useState(()=>JSON.parse(localStorage.getItem('aura_business')||'null'))
  const [editingBiz, setEditingBiz] = useState(false)
  const [chats, setChats] = useState(()=>JSON.parse(localStorage.getItem('aura_chats')||'[]'))
  const [activeChatId, setActiveChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const chatContainerRef = useRef(null)
  const bottomRef = useRef()
  const [selectionToolbar, setSelectionToolbar] = useChatTextSelection(chatContainerRef, page === 'chat' && messages.length > 0)

  useEffect(()=>{ localStorage.setItem('aura_chats',JSON.stringify(chats)) },[chats])
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[messages,typing])

  const onSplashDone = useCallback(() => setScreen('password'), [])

  const saveCurrentChat = useCallback((msgs,id)=>{
    if (!id||msgs.length===0) return
    setChats(prev=>prev.map(c=>c.id===id?{...c,messages:msgs,title:msgs[0]?.text||'New Chat'}:c))
  },[])

  const newChat = ()=>{ saveCurrentChat(messages,activeChatId); setActiveChatId(null); setMessages([]); setReplyTo(null); setSelectionToolbar(null) }
  const selectChat = id=>{ saveCurrentChat(messages,activeChatId); const c=chats.find(x=>x.id===id); if(c){setActiveChatId(id);setMessages(c.messages||[])}; setReplyTo(null); setSelectionToolbar(null) }
  const deleteChat = id=>{ setChats(prev=>prev.filter(c=>c.id!==id)); if(activeChatId===id){setActiveChatId(null);setMessages([])} }
  const editBiz = ()=>{ setEditingBiz(true) }
  const onActivateAgent = () => setPage('chat')

  const sendMessage = useCallback(async (text, file) => {
    const quote = replyTo?.excerpt
    if (quote) setReplyTo(null)
    setSelectionToolbar(null)

    let fileContent = null
    const imgTypes = ['image/png','image/jpeg','image/gif','image/webp','image/jpg']
    const isImage = file && imgTypes.includes(file.type)

    if (file && !isImage) {
      try {
        fileContent = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result)
          r.onerror = rej
          r.readAsText(file)
        })
      } catch(e) {
        fileContent = `[Could not read file contents]`
      }
    }

    const userPrompt = text && text !== `Please analyze the attached file: ${file?.name}` ? text : 'Please analyze this file and help me with it.'
    const displayText = file
      ? `📎 ${file.name}${text && text !== `Please analyze the attached file: ${file?.name}` ? `\n\n${text}` : ''}`
      : text
    const userMsg = { role:'user', text:displayText, time:nowTime(), ...(quote ? { replyQuote: quote } : {}) }

    const apiText = (() => {
      if (!file) return quote ? formatUserMessageForApi(userMsg) : text
      if (isImage) return `${userPrompt}\n\n[Note: User attached an image "${file.name}" but image processing is not supported. Let them know and ask them to describe what's in the image instead.]`
      if (fileContent) return `${userPrompt}\n\n--- File: ${file.name} ---\n${fileContent.slice(0, 12000)}${fileContent.length > 12000 ? '\n[...file truncated at 12000 chars...]' : ''}`
      return userPrompt
    })()

    let currentId = activeChatId
    let newMessages = [...messages, userMsg]

    if (!currentId) {
      currentId = uid()
      setChats(prev=>[{id:currentId,title:text,messages:[],createdAt:Date.now()},...prev])
      setActiveChatId(currentId)
    }

    setMessages(newMessages)
    setTyping(true)

    try {
      // ── Lead Generation Agent ─────────────────────────────────────────────
      if (activeAgent==='lead-agent') {
        const serperKey = import.meta.env.VITE_SERPER_API_KEY
        const orKey = import.meta.env.VITE_OPENROUTER_API_KEY

        const parseRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method:'POST',
          headers:{'Authorization':`Bearer ${orKey}`,'Content-Type':'application/json'},
          body:JSON.stringify({
            model:'openai/gpt-4o-mini',
            messages:[{ role:'user', content:`Extract lead search parameters from: "${apiText}"
Return ONLY valid JSON:
{"query":"restaurants","location":"New York","platform":"google_maps","count":10}
platform: google_maps, linkedin, instagram, twitter, youtube, reddit
count: number requested, default 5, max 20
location: city name if mentioned, empty string if not
No markdown, just JSON.` }]
          })
        })
        const parseData = await parseRes.json()
        const params = JSON.parse(parseData.choices[0].message.content.trim())
        const count = Math.min(params.count || 5, 20)
        const q = params.query
        const loc = params.location

        const buildQueries = (platform) => {
          switch(platform) {
            case 'linkedin': return [`${q} ${loc} site:linkedin.com/company`,`${q} ${loc} site:linkedin.com/in`,`${q} agency ${loc} linkedin.com`]
            case 'instagram': return [`${q} ${loc} site:instagram.com`,`${q} business ${loc} instagram`,`${q} ${loc} instagram contact`]
            case 'twitter': return [`${q} ${loc} site:twitter.com`,`${q} ${loc} site:x.com`,`${q} business ${loc} twitter`]
            default: return [
              `${q} in ${loc} contact phone address -site:tripadvisor.com -site:yelp.com -blog -list`,
              `${q} ${loc} website email -"top 10" -"best" -directory`,
              `${q} ${loc} services pricing contact us`,
              `${q} near ${loc} booking reservation WhatsApp`,
              `"${q}" "${loc}" official site`,
            ]
          }
        }

        const queries = buildQueries(params.platform)
        const searchPromises = queries.map(sq =>
          fetch('https://google.serper.dev/search', {
            method:'POST',
            headers:{'X-API-KEY':serperKey,'Content-Type':'application/json'},
            body:JSON.stringify({ q: sq, num: 10, gl: 'us' })
          }).then(r=>r.json()).catch(()=>({ organic:[] }))
        )
        const searchResults = await Promise.all(searchPromises)

        const seen = new Set()
        const combined = []
        for (const result of searchResults) {
          const items = [...(result.organic||[]), ...(result.places||[])]
          for (const item of items) {
            const key = (item.title||'').toLowerCase().trim()
            if (!seen.has(key) && key.length > 0) { seen.add(key); combined.push(item) }
          }
        }

        if (!combined.length) throw new Error('No results found. Try a different search query or location.')

        const topRaw = combined.slice(0, Math.min(count * 3, 40))
        const batchSize = 6
        const totalBatches = Math.ceil(Math.min(count, topRaw.length) / batchSize)
        let allLeads = []

        for (let b = 0; b < totalBatches; b++) {
          const batch = topRaw.slice(b * batchSize, (b + 1) * batchSize)
          const batchClean = batch.map(r => {
            const link = r.link || ''
            const snippet = r.snippet || ''
            const isFb = link.includes('facebook.com')
            const isIg = link.includes('instagram.com')
            const fbMatch = snippet.match(/facebook\.com\/[\w.]+/)
            const igMatch = snippet.match(/instagram\.com\/[\w.]+/)
            return {
              title: r.title, snippet,
              website: (!isFb && !isIg && link) ? link : null,
              facebook: isFb ? link : (fbMatch ? 'https://' + fbMatch[0] : null),
              instagram: isIg ? link : (igMatch ? 'https://' + igMatch[0] : null),
              address: r.address || null, phone: r.phoneNumber || null, rating: r.rating || null,
            }
          })
          const enrichRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method:'POST',
            headers:{'Authorization':`Bearer ${orKey}`,'Content-Type':'application/json'},
            body:JSON.stringify({
              model:'openai/gpt-4o-mini',
              messages:[{ role:'user', content:`You are a lead generation expert for "${bizData?.name||'a business'}" in the ${bizData?.industry||'general'} industry.

Raw search results for "${q}" in "${loc}":
${JSON.stringify(batchClean)}

For each REAL business (skip blogs, lists, directories, review sites), return a JSON array:
[{"name":"Business name","description":"What they do in 1 sentence","location":"City","contact":"phone or email or —","website":"official website URL only, NOT Facebook/Instagram, put — if none","facebook":"Facebook page URL if found else —","instagram":"Instagram URL if found else —","outreach_score":8,"score_reason":"Why good lead in 1 sentence","ai_opener":"Cold message opener"}]

ai_opener rules:
- NEVER say "I'd love to", "Would you be open to", "Could we"
- Start with something specific about THEIR business
- Mention a specific result but VARY the numbers every time — rotate between: 25%, 30%, 35%, 45%, 50%, 60% and rotate metrics: 'more clients', 'more bookings', 'more walk-ins', 'higher engagement', 'more leads', 'more revenue' — never use the same combo twice in one batch
- End with a statement not a question: "Sending you our case study." or "Worth a 10 min call this week."
- Max 2 sentences. Use "${bizData?.name||'our business'}" as sender name
- Sound confident and direct, not salesy

Score 1-10 based on how much they need what ${bizData?.name||'this business'} offers.
SKIP any result that is a blog, list, directory, or review site.
Return ONLY the JSON array, no markdown.` }]
            })
          })
          const enrichData = await enrichRes.json()
          try {
            const raw = enrichData.choices[0].message.content.trim().replace(/```json|```/g,'').trim()
            const batch_leads = JSON.parse(raw)
            allLeads = [...allLeads, ...batch_leads]
          } catch(e) { /* skip bad batch */ }
        }

        if (!allLeads.length) throw new Error('Could not process results. Please try again.')

        const seenNames = new Set()
        const uniqueLeads = []
        for (const lead of allLeads) {
          const key = lead.name?.toLowerCase().trim()
          if (key && !seenNames.has(key)) { seenNames.add(key); uniqueLeads.push(lead) }
        }

        const finalLeads = uniqueLeads.slice(0, count).map((l,i) => ({ '#':i+1, ...l }))
        const summaryText = `Found ${finalLeads.length} high-quality leads for "${q}"${loc ? ` in ${loc}` : ''} — scored and enriched with AI-generated outreach openers. Click ▼ on any lead to see the personalized opener.`
        const aiMsg = { role:'ai', text:summaryText, time:nowTime(), leads:finalLeads, platform:params.platform }
        const finalMessages = [...newMessages, aiMsg]
        setMessages(finalMessages)
        setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
        return
      }

      // ── Competitor Research Agent ─────────────────────────────────────────
      if (activeAgent==='competitor-agent') {
        const result = await runCompetitorAgent(apiText, bizData)
        const aiMsg = { role:'ai', text:result.text, time:nowTime(), competitorReport:result.competitorReport }
        const finalMessages = [...newMessages, aiMsg]
        setMessages(finalMessages)
        setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
        return
      }

      // ── Business Consultant Agent ─────────────────────────────────────────
      if (activeAgent==='consultant-agent') {
        const result = await runConsultantAgent({
          text: apiText,
          bizData,
          serperKey: import.meta.env.VITE_SERPER_API_KEY,
          orKey: import.meta.env.VITE_OPENROUTER_API_KEY,
        })
        const summaryText = `${result.area.emoji} **${result.area.label} Analysis for ${bizData?.name}** — score, priorities, action plan & consultant thinking below.`
        const aiMsg = { role:'ai', text:summaryText, time:nowTime(), consultantReport:result }
        const finalMessages = [...newMessages, aiMsg]
        setMessages(finalMessages)
        setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
        return
      }

      // ── Financial Snapshot Agent ──────────────────────────────────────────
      if (activeAgent==='financial-agent') {
        const snapshot = await runFinancialAgent({ text: apiText, bizData, orKey: import.meta.env.VITE_OPENROUTER_API_KEY })
        const summaryText = `Here's your financial snapshot for ${snapshot.period}. Profit margin: ${snapshot.margin?.toFixed(1)}% · Health: ${snapshot.health}. See full breakdown below.`
        const aiMsg = { role:'ai', text:summaryText, time:nowTime(), financialSnapshot:snapshot }
        const finalMessages = [...newMessages, aiMsg]
        setMessages(finalMessages)
        setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
        return
      }

      // ── Proposal & Invoice Agent ──────────────────────────────────────────
      if (activeAgent==='proposal-agent') {
        const result = await runProposalAgent({ text: apiText, bizData, orKey: import.meta.env.VITE_OPENROUTER_API_KEY })
        let aiMsg
        if (result.type === 'invoice') {
          const inv = result.invoice
          const summaryText = `Here's invoice ${inv.invoiceNumber} for ${inv.clientName} — total due ${inv.total}, due ${inv.dueDate}. Download the PDF or copy it to send.`
          aiMsg = { role:'ai', text:summaryText, time:nowTime(), invoice:inv }
        } else {
          const proposal = result.proposal
          const summaryText = `Here's your proposal for ${proposal.clientName} — ${proposal.projectTitle}. Total investment: ${proposal.investment?.total}. Click the tabs to review each section, then hit Copy All or Download PDF to send it.`
          aiMsg = { role:'ai', text:summaryText, time:nowTime(), proposal }
        }
        const finalMessages = [...newMessages, aiMsg]
        setMessages(finalMessages)
        setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
        return
      }

      // ── Normal AI Chat ────────────────────────────────────────────────────
      const apiMessages = [
        { role:'system', content:buildSystemPrompt(bizData) },
        ...newMessages.map((m, idx) => {
          if (m.role !== 'user') return { role:'assistant', content: m.text || '' }
          if (idx === newMessages.length - 1) return { role:'user', content: apiText }
          return { role:'user', content: formatUserMessageForApi(m) }
        })
      ]

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{'Authorization':`Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({ model:'openai/gpt-oss-120b', messages: apiMessages })
      })
      const data = await response.json()
      if (!data?.choices?.[0]?.message?.content) {
        const errMsg = data?.error?.message || data?.error?.code || JSON.stringify(data)
        throw new Error(`API error: ${errMsg}`)
      }
      const aiMsg = { role:'ai', text:data.choices[0].message.content, time:nowTime() }
      const finalMessages = [...newMessages, aiMsg]
      setMessages(finalMessages)
      setChats(prev=>prev.map(c=>c.id===currentId?{...c,messages:finalMessages,title:text}:c))
    } catch(e) {
      setMessages(prev=>[...prev,{ role:'ai', text:`Sorry, I ran into an error: ${e.message}`, time:nowTime() }])
    } finally {
      setTyping(false)
    }
  }, [activeAgent, activeChatId, messages, bizData, replyTo])

  const handleSelectionCopy = async (text) => {
    await copyToClipboard(text)
    setSelectionToolbar(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleSelectionReply = (text) => {
    setReplyTo({ excerpt: text })
    setSelectionToolbar(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleReplyToMessage = (text) => {
    setReplyTo({ excerpt: text.length > 500 ? text.slice(0, 500) + '…' : text })
  }

  const activeChat = chats.find(c=>c.id===activeChatId)

  const headerBadge = () => {
    if (activeAgent==='lead-agent')       return <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(59,142,240,0.1)',  border:'1px solid rgba(59,142,240,0.25)',  fontSize:11, color:'var(--accent)',   fontWeight:600 }}>🎯 Lead Agent ON</div>
    if (activeAgent==='consultant-agent') return <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(249,115,22,0.1)', border:'1px solid rgba(249,115,22,0.25)', fontSize:11, color:'#f97316',         fontWeight:600 }}>🧠 Consultant ON</div>
    if (activeAgent==='competitor-agent') return <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.25)', fontSize:11, color:'#8b5cf6',         fontWeight:600 }}>🔍 Competitor ON</div>
    if (activeAgent==='financial-agent')  return <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(6,182,212,0.1)',  border:'1px solid rgba(6,182,212,0.25)',  fontSize:11, color:'#06b6d4',        fontWeight:600 }}>📊 Financial ON</div>
    if (activeAgent==='proposal-agent')   return <div style={{ padding:'3px 10px', borderRadius:99, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', fontSize:11, color:'#10b981',        fontWeight:600 }}>📝 Proposal & Invoice ON</div>
    return null
  }

  if (screen === 'splash') return <SplashScreen onDone={onSplashDone}/>
  if (screen === 'password') return <PasswordScreen onUnlock={()=>setScreen('app')}/>

  if (screen === 'app' && (bizData === null || editingBiz)) {
    return (
      <OnboardingScreen
        onComplete={d=>{ setBizData(d); setEditingBiz(false); setScreen('app') }}
        onCancel={editingBiz && bizData ? ()=>setEditingBiz(false) : null}
      />
    )
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', flexDirection:'column' }}>
      <div className="bg-texture"/>

      <div style={{ height:'var(--header-height)', background:'rgba(9,13,22,0.95)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:12, position:'relative', zIndex:10, flexShrink:0, backdropFilter:'blur(12px)' }}>
        {page==='chat' && (
          <button onClick={()=>setSidebarOpen(o=>!o)} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:17, padding:4, transition:'color 0.2s' }} onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text2)'}>☰</button>
        )}
        <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
          <span style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:300, letterSpacing:8, color:'#fff' }}>AURA</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {headerBadge()}
          <span style={{ fontSize:11, color:'var(--text3)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeChat?truncate(activeChat.title,20):bizData.name}</span>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative', zIndex:1 }}>
        <IconRail page={page} setPage={setPage}/>

        {page==='chat' && (
          <ChatSidebar open={sidebarOpen} chats={chats} activeChatId={activeChatId} bizData={bizData} onNew={newChat} onSelect={selectChat} onDelete={deleteChat} onEditBiz={editBiz} searchQuery={searchQuery} setSearchQuery={setSearchQuery}/>
        )}

        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {page==='chat' && (
            <>
              <div ref={chatContainerRef} style={{ flex:1, overflowY:'auto', padding:'8px 20px 0' }}>
                <div style={{ maxWidth:720, margin:'0 auto' }}>
                  {messages.length===0
                    ? <WelcomeScreen bizData={bizData} activeAgent={activeAgent} onSuggestion={sendMessage}/>
                    : messages.map((m,i)=><Message key={i} msg={m} bizData={bizData} onResearch={sendMessage} onReplyToText={handleReplyToMessage}/>)
                  }
                  {typing && <TypingIndicator/>}
                  <div ref={bottomRef}/>
                </div>
              </div>
              <SelectionToolbar toolbar={selectionToolbar} onCopy={handleSelectionCopy} onReply={handleSelectionReply}/>
              <InputBar onSend={sendMessage} disabled={typing} activeAgent={activeAgent} replyTo={replyTo} onClearReply={()=>setReplyTo(null)}/>
            </>
          )}
          {page==='agents' && (
            <AgentsPage bizData={bizData} onSendToChat={onActivateAgent} activeAgent={activeAgent} setActiveAgent={setActiveAgent}/>
          )}
          {page==='brainstorm' && (
            <BrainstormPage bizData={bizData}/>
          )}
          {page==='newsletter' && (
            <NewsletterPage bizData={bizData}/>
          )}
          {page==='guide' && (
            <GuidebookPage bizData={bizData} setPage={setPage}/>
          )}
        </div>
      </div>
    </div>
  )
}