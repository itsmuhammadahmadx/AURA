import { useState } from 'react'

// ─── Snapshot storage ─────────────────────────────────────────────────────────
export function getSnapshots() {
  try { return JSON.parse(localStorage.getItem('aura_snapshots') || '[]') } catch { return [] }
}
export function saveSnapshot(snapshot) {
  const snapshots = getSnapshots()
  snapshots.unshift(snapshot)
  localStorage.setItem('aura_snapshots', JSON.stringify(snapshots.slice(0, 12))) // keep last 12
}

// ─── Run Financial Agent ──────────────────────────────────────────────────────
export async function runFinancialAgent({ text, bizData, orKey }) {
  const snapshots = getSnapshots()
  const lastSnapshot = snapshots[0] || null

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a sharp business financial analyst. Analyze this business and return a JSON snapshot.

Business: ${bizData?.name || 'Unknown'} | Industry: ${bizData?.industry || 'General'} | Stage: ${bizData?.stage || 'Growing'} | Goal: ${bizData?.goal || 'Grow revenue'} | Team: ${bizData?.team || 'Unknown'}
Onboarding revenue: ${bizData?.revenue || 'not set'} | Onboarding expenses: ${bizData?.expenses || 'not set'}

User's message: "${text}"

${lastSnapshot ? `Last snapshot (${lastSnapshot.date}): Revenue ${lastSnapshot.revenue}, Expenses ${lastSnapshot.expenses}, Profit ${lastSnapshot.profit}` : 'No previous snapshot.'}

Extract the numbers from the user's message if provided. If not provided, use onboarding data. Make reasonable estimates if partial data given.

Return ONLY valid JSON:
{
  "revenue": 150000,
  "expenses": 80000,
  "profit": 70000,
  "margin": 46.7,
  "burnRate": 80000,
  "currency": "USD",
  "period": "this month",
  "health": "good",
  "healthReason": "one sentence why",
  "goalProgress": 60,
  "goalNote": "You're at 60% of your USD 150,000/month goal",
  "warnings": ["warning 1 if any", "warning 2 if any"],
  "actions": [
    {"title": "Action title", "detail": "Specific actionable step", "impact": "high"},
    {"title": "Action title", "detail": "Specific actionable step", "impact": "medium"},
    {"title": "Action title", "detail": "Specific actionable step", "impact": "low"}
  ],
  "vsLastMonth": {
    "revenueChange": 12.5,
    "expenseChange": -5.2,
    "profitChange": 18.3
  },
  "insight": "One sharp CFO-level insight specific to this business and industry"
}

health must be one of: "great" | "good" | "warning" | "critical"
goalProgress: 0-100 (percentage toward their stated goal)
vsLastMonth: only fill if last snapshot exists, otherwise null
actions: exactly 3 actions, specific to their industry and numbers, not generic
impact: "high" | "medium" | "low"
currency: detect from context (USD, GBP, EUR, AED, etc) or use USD as default
All numbers as integers (no decimals except margin and percentage changes)
No markdown, just JSON.`
      }]
    })
  })

  const data = await res.json()
  const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const snapshot = JSON.parse(raw)
  snapshot.date = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  snapshot.timestamp = Date.now()
  saveSnapshot(snapshot)
  return snapshot
}

// ─── Financial Snapshot UI ────────────────────────────────────────────────────
export function FinancialSnapshotUI({ snapshot, bizData }) {
  const [showHistory, setShowHistory] = useState(false)
  const snapshots = getSnapshots()
  const hasHistory = snapshots.length > 1

  if (!snapshot) return null

  const fmt = (n) => {
    if (!n && n !== 0) return '—'
    const abs = Math.abs(n)
    if (abs >= 1000000) return `${(n/1000000).toFixed(1)}M`
    if (abs >= 1000) return `${(n/1000).toFixed(0)}K`
    return n.toLocaleString()
  }

  const healthColor = {
    great:    '#10b981',
    good:     '#3b8ef0',
    warning:  '#f59e0b',
    critical: '#ef4444',
  }[snapshot.health] || '#3b8ef0'

  const healthBg = {
    great:    'rgba(16,185,129,0.08)',
    good:     'rgba(59,142,240,0.08)',
    warning:  'rgba(245,158,11,0.08)',
    critical: 'rgba(239,68,68,0.08)',
  }[snapshot.health] || 'rgba(59,142,240,0.08)'

  const impactColor = { high:'#10b981', medium:'#f59e0b', low:'var(--text3)' }

  const changeIcon = (val) => val > 0 ? '↑' : val < 0 ? '↓' : '→'
  const changeColor = (val, inverse = false) => {
    if (val === 0 || val === null) return 'var(--text3)'
    const good = inverse ? val < 0 : val > 0
    return good ? '#10b981' : '#ef4444'
  }

  return (
    <div style={{ marginTop:14 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ padding:'4px 12px', borderRadius:99, background:healthBg, border:`1px solid ${healthColor}40`, fontSize:12, color:healthColor, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>
            {snapshot.health === 'great' ? '🚀' : snapshot.health === 'good' ? '✅' : snapshot.health === 'warning' ? '⚠️' : '🚨'} {snapshot.health}
          </div>
          <span style={{ fontSize:11, color:'var(--text3)' }}>{snapshot.period} · {snapshot.date}</span>
        </div>
        {hasHistory && (
          <button onClick={() => setShowHistory(h => !h)}
            style={{ padding:'4px 10px', borderRadius:7, border:'1px solid var(--border2)', background:'rgba(255,255,255,0.04)', color:'var(--text3)', fontSize:11, cursor:'pointer', fontFamily:'var(--font)' }}>
            📅 History
          </button>
        )}
      </div>

      {/* Main metrics grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
        {[
          { label:'Revenue',      value:snapshot.revenue,  prefix:snapshot.currency, key:'revenue',  inverse:false },
          { label:'Expenses',     value:snapshot.expenses, prefix:snapshot.currency, key:'expenses', inverse:true  },
          { label:'Profit',       value:snapshot.profit,   prefix:snapshot.currency, key:'profit',   inverse:false },
        ].map(m => {
          const change = snapshot.vsLastMonth?.[`${m.key}Change`]
          return (
            <div key={m.label} style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:12, padding:'14px 16px' }}>
              <p style={{ fontSize:10, color:'var(--text3)', fontWeight:600, letterSpacing:1, marginBottom:8, textTransform:'uppercase' }}>{m.label}</p>
              <p style={{ fontSize:20, fontWeight:800, color:'var(--text)', lineHeight:1, marginBottom:6 }}>
                <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>{m.prefix} </span>
                {fmt(m.value)}
              </p>
              {change != null && (
                <p style={{ fontSize:11, color:changeColor(change, m.inverse), fontWeight:600 }}>
                  {changeIcon(change)} {Math.abs(change)}% vs last month
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Margin + Burn Rate row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:12, padding:'14px 16px' }}>
          <p style={{ fontSize:10, color:'var(--text3)', fontWeight:600, letterSpacing:1, marginBottom:8, textTransform:'uppercase' }}>Profit Margin</p>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <p style={{ fontSize:22, fontWeight:800, color: snapshot.margin >= 40 ? '#10b981' : snapshot.margin >= 20 ? '#f59e0b' : '#ef4444' }}>
              {snapshot.margin?.toFixed(1)}%
            </p>
          </div>
          <div style={{ marginTop:8, height:4, background:'var(--surface3)', borderRadius:99 }}>
            <div style={{ height:'100%', width:`${Math.min(snapshot.margin, 100)}%`, background: snapshot.margin >= 40 ? '#10b981' : snapshot.margin >= 20 ? '#f59e0b' : '#ef4444', borderRadius:99, transition:'width 0.6s ease' }}/>
          </div>
        </div>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:12, padding:'14px 16px' }}>
          <p style={{ fontSize:10, color:'var(--text3)', fontWeight:600, letterSpacing:1, marginBottom:8, textTransform:'uppercase' }}>Burn Rate</p>
          <p style={{ fontSize:20, fontWeight:800, color:'var(--text)', lineHeight:1, marginBottom:4 }}>
            <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>{snapshot.currency} </span>
            {fmt(snapshot.burnRate)}<span style={{ fontSize:11, color:'var(--text3)', fontWeight:400 }}>/mo</span>
          </p>
          <p style={{ fontSize:10, color:'var(--text2)', marginTop:6 }}>
            {snapshot.profit > 0 ? `✅ Revenue covers expenses` : `⚠️ Expenses exceed revenue`}
          </p>
        </div>
      </div>

      {/* Goal progress */}
      {snapshot.goalNote && (
        <div style={{ marginBottom:14, padding:'12px 16px', background:'rgba(59,142,240,0.06)', border:'1px solid rgba(59,142,240,0.2)', borderRadius:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <p style={{ fontSize:12, color:'var(--accent)', fontWeight:600 }}>🎯 Goal Progress</p>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>{snapshot.goalProgress}%</p>
          </div>
          <div style={{ height:6, background:'var(--surface2)', borderRadius:99, marginBottom:8 }}>
            <div style={{ height:'100%', width:`${Math.min(snapshot.goalProgress, 100)}%`, background:'linear-gradient(90deg,var(--accent),#7c3aed)', borderRadius:99, transition:'width 0.8s ease' }}/>
          </div>
          <p style={{ fontSize:11, color:'var(--text2)' }}>{snapshot.goalNote}</p>
        </div>
      )}

      {/* Warnings */}
      {snapshot.warnings?.length > 0 && (
        <div style={{ marginBottom:14, display:'flex', flexDirection:'column', gap:6 }}>
          {snapshot.warnings.map((w, i) => (
            <div key={i} style={{ padding:'10px 14px', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, display:'flex', gap:8 }}>
              <span style={{ fontSize:13 }}>⚠️</span>
              <p style={{ fontSize:12, color:'#f59e0b', lineHeight:1.5 }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* CFO Insight */}
      {snapshot.insight && (
        <div style={{ marginBottom:14, padding:'12px 16px', background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:12, display:'flex', gap:10 }}>
          <span style={{ fontSize:14 }}>💡</span>
          <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.6, fontStyle:'italic' }}>{snapshot.insight}</p>
        </div>
      )}

      {/* 3 Actions */}
      {snapshot.actions?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <p style={{ fontSize:11, color:'var(--text3)', fontWeight:700, letterSpacing:1, marginBottom:10, textTransform:'uppercase' }}>📋 Action Plan</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {snapshot.actions.map((action, i) => (
              <div key={i} style={{ padding:'12px 14px', background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:10, display:'flex', gap:12, alignItems:'flex-start' }}>
                <div style={{ width:24, height:24, borderRadius:6, background:`${impactColor[action.impact]}18`, border:`1px solid ${impactColor[action.impact]}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:impactColor[action.impact], flexShrink:0, marginTop:1 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{action.title}</p>
                  <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{action.detail}</p>
                </div>
                <span style={{ fontSize:9, color:impactColor[action.impact], background:`${impactColor[action.impact]}15`, padding:'2px 8px', borderRadius:99, border:`1px solid ${impactColor[action.impact]}30`, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap', marginTop:2 }}>{action.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health reason */}
      <div style={{ padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, display:'flex', gap:8 }}>
        <span style={{ fontSize:13 }}>📊</span>
        <p style={{ fontSize:11, color:'var(--text2)', lineHeight:1.6 }}>{snapshot.healthReason}</p>
      </div>

      {/* History panel */}
      {showHistory && hasHistory && (
        <div style={{ marginTop:14, animation:'fadeIn 0.25s ease' }}>
          <p style={{ fontSize:11, color:'var(--text3)', fontWeight:700, letterSpacing:1, marginBottom:10, textTransform:'uppercase' }}>📅 Snapshot History</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {snapshots.slice(0, 6).map((s, i) => (
              <div key={i} style={{ padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: healthColor, flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:'var(--text2)' }}>{s.date}</span>
                </div>
                <div style={{ display:'flex', gap:16 }}>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>Rev: <span style={{ color:'var(--text)', fontWeight:600 }}>{s.currency} {fmt(s.revenue)}</span></span>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>Profit: <span style={{ color: s.profit >= 0 ? '#10b981' : '#ef4444', fontWeight:600 }}>{s.currency} {fmt(s.profit)}</span></span>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>Margin: <span style={{ color:'var(--text)', fontWeight:600 }}>{s.margin?.toFixed(1)}%</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}