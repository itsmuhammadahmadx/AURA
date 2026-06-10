import { useState, useEffect, useRef } from 'react'

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const STORAGE_KEY = 'aura_brainstorm_sessions'

// ─── Storage ──────────────────────────────────────────────────────────────────
export function getBrainstormSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function saveBrainstormSession(session) {
  const sessions = getBrainstormSessions()
  const entry = {
    ...session,
    id: session.id || Date.now().toString(36),
    savedAt: new Date().toISOString(),
    title: session.title || session.messages?.find(m => m.role === 'user')?.text?.slice(0, 48) || 'Brainstorm',
  }
  const idx = sessions.findIndex(s => s.id === entry.id)
  if (idx >= 0) sessions[idx] = entry
  else sessions.unshift(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 30)))
  return entry
}

export function deleteBrainstormSession(id) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getBrainstormSessions().filter(s => s.id !== id)))
}

// ─── System prompt ────────────────────────────────────────────────────────────
export function buildBrainstormSystemPrompt(biz, mode = 'brainstorm', focus = null) {
  const bizCtx = biz
    ? `Business: ${biz.name} | Industry: ${biz.industry} | Stage: ${biz.stage || 'Growing'}
Revenue: ${biz.revenue || 'N/A'} | Team: ${biz.team || 'N/A'}
Goal: ${biz.goal} | Challenge: ${biz.challenge}
Notes: ${biz.notes || 'None'}`
    : 'No business profile — give broadly applicable ideas.'

  const modeInstructions = {
    brainstorm: `MODE: Full brainstorm. Generate 12–18 ideas TOTAL across all four categories (quantity first — aim for 3–5 per category).`,
    deepen: `MODE: Go deeper on what the user asked. Produce 6–10 sub-ideas, tactics, risks, and next steps. Use categories where they fit.`,
    wilder: `MODE: Wilder angle. Push past safe thinking — skew toward bold, contrarian, and wild card (10–15 ideas).`,
    challenge: `MODE: Challenge assumptions. Surface blind spots, risks, and "what if the opposite were true?" insights.`,
    refine: `MODE: Refine and build on the conversation. Add new ideas that connect to prior messages — don't repeat old ones verbatim.`,
  }

  return `You are AURA Brainstorm Engine — a conversational brainstorming partner, NOT a generic assistant.

YOUR JOB:
- Diverge: many distinct ideas, not one polished essay
- Challenge assumptions about the business
- Think in categories: practical / bold / contrarian / wild card
- Build on conversation history — reference what they said before
- Quantity first, quality second

${bizCtx}

${modeInstructions[mode] || modeInstructions.brainstorm}
${focus ? `FOCUS: "${focus}"` : ''}

CONVERSATION: Include a warm, direct "reply" (1–3 sentences) acknowledging their message before the structured ideas.

MULTI-PERSPECTIVE (every response): Designer, Skeptic, Business operator, First-principles — each 1–2 sentences, specific to this business.

PROACTIVE FOLLOW-UPS (required): 3–4 clickable next steps in followUps array.

Return ONLY valid JSON (no markdown):
{
  "reply": "conversational acknowledgment of their message",
  "topic": "current brainstorm topic",
  "headline": "one punchy line summarizing this response",
  "perspectives": [
    { "lens": "Designer", "emoji": "🎨", "take": "..." },
    { "lens": "Skeptic", "emoji": "🔍", "take": "..." },
    { "lens": "Business operator", "emoji": "💼", "take": "..." },
    { "lens": "First-principles", "emoji": "⚛️", "take": "..." }
  ],
  "categories": {
    "practical": [{ "id": 1, "title": "...", "detail": "...", "firstStep": "..." }],
    "bold": [{ "id": 2, "title": "...", "detail": "...", "firstStep": "..." }],
    "contrarian": [{ "id": 3, "title": "...", "detail": "...", "firstStep": "..." }],
    "wildCard": [{ "id": 4, "title": "...", "detail": "...", "firstStep": "..." }]
  },
  "followUps": [
    { "text": "Want me to go deeper on idea #3?", "mode": "deepen", "focusHint": "idea title" },
    { "text": "Should I try a wilder angle?", "mode": "wilder", "focusHint": "" }
  ],
  "stats": { "totalIdeas": 14, "topPick": "strongest idea and why in one sentence" }
}

Use unique ids across all ideas. firstStep required for each idea.`
}

// ─── API ──────────────────────────────────────────────────────────────────────
export async function runBrainstorm({ userMessage, bizData, orKey, mode = 'brainstorm', focus = null, chatHistory = [] }) {
  const historyMessages = chatHistory.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'user'
      ? m.text
      : m.brainstorm
        ? `[Previous brainstorm]\nReply: ${m.brainstorm.reply || ''}\nTopic: ${m.brainstorm.topic}\nHeadline: ${m.brainstorm.headline}\nIdeas summary: ${m.brainstorm.stats?.totalIdeas || 0} ideas generated`
        : m.text || '',
  }))

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: buildBrainstormSystemPrompt(bizData, mode, focus) },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
    }),
  })

  const data = await res.json()
  if (!data?.choices?.[0]?.message?.content) throw new Error('No response from AI')
  const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  const result = JSON.parse(raw)
  result.mode = mode
  result.generatedAt = new Date().toISOString()
  return result
}

// ─── UI pieces ────────────────────────────────────────────────────────────────
const CATEGORY_META = {
  practical:  { label: 'Practical ideas',  emoji: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
  bold:       { label: 'Bold ideas',       emoji: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)' },
  contrarian: { label: 'Contrarian ideas', emoji: '🟡', color: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.25)' },
  wildCard:   { label: 'Wild Card ideas',  emoji: '⚡', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)' },
}

function IdeaCard({ idea, meta, index }) {
  return (
    <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 10, padding: '12px 14px', animation: `fadeIn 0.35s ease ${index * 0.04}s both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}18`, padding: '2px 8px', borderRadius: 99 }}>#{idea.id}</span>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{idea.title}</h4>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{idea.detail}</p>
      {idea.firstStep && (
        <div style={{ fontSize: 11, color: meta.color, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, lineHeight: 1.5 }}>
          <strong>First step:</strong> {idea.firstStep}
        </div>
      )}
    </div>
  )
}

function BrainstormResults({ result, onFollowUp, loading, compact }) {
  if (!result) return null
  const cats = result.categories || {}
  const total = Object.values(cats).reduce((n, arr) => n + (arr?.length || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 14 : 18, marginTop: 10 }}>
      {result.headline && (
        <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#06b6d4', letterSpacing: 1, marginBottom: 4 }}>{total} IDEAS · {result.topic}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>{result.headline}</p>
          {result.stats?.topPick && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>⭐ {result.stats.topPick}</p>}
        </div>
      )}

      {!compact && result.perspectives?.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 8 }}>MULTIPLE PERSPECTIVES</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {result.perspectives.map((p, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>{p.emoji} {p.lens}</p>
                <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.55 }}>{p.take}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.entries(CATEGORY_META).map(([key, meta]) => {
        const ideas = cats[key] || []
        if (!ideas.length) return null
        return (
          <div key={key}>
            <p style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {meta.emoji} {meta.label} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}>({ideas.length})</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ideas.map((idea, i) => <IdeaCard key={idea.id || i} idea={idea} meta={meta} index={i} />)}
            </div>
          </div>
        )
      })}

      {result.followUps?.length > 0 && (
        <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 8 }}>💬 SUGGESTED NEXT</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.followUps.map((fu, i) => (
              <button key={i} disabled={loading} onClick={() => onFollowUp(fu)}
                style={{ padding: '8px 14px', borderRadius: 99, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4', fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                {fu.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Brainstorm Chat Message (with Copy + Reply) ──────────────────────────────
function BrainstormChatMessage({ msg, onFollowUp, loading, onReply }) {
  const isUser = msg.role === 'user'
  const hasBrainstorm = !!msg.brainstorm
  const [hover, setHover] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyText = msg.brainstorm
    ? `${msg.brainstorm.reply || ''}\n\n${msg.brainstorm.headline || ''}\n\nTop pick: ${msg.brainstorm.stats?.topPick || ''}`
    : msg.text || ''

  const handleCopy = async (e) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleReply = (e) => {
    e.stopPropagation()
    if (onReply) onReply(copyText)
  }

  return (
    <div className="animate-msg" style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,#06b6d4,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginTop: 4 }}>💡</div>
      )}
      <div style={{ maxWidth: hasBrainstorm ? '95%' : '72%', width: hasBrainstorm ? '95%' : 'auto', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {!isUser && <span style={{ fontSize: 10, color: '#06b6d4', letterSpacing: 1.5, marginBottom: 4, fontWeight: 600 }}>BRAINSTORM ENGINE</span>}

        {/* Copy + Reply buttons — show on hover for AI messages */}
        {!isUser && hover && copyText && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignSelf: 'flex-start' }}>
            <button type="button" onClick={handleCopy}
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 6, color: copied ? '#10b981' : 'var(--text2)', cursor: 'pointer', fontSize: 11, padding: '3px 8px', fontFamily: 'var(--font)', fontWeight: 600, transition: 'all 0.15s' }}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <button type="button" onClick={handleReply}
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 6, color: '#06b6d4', cursor: 'pointer', fontSize: 11, padding: '3px 8px', fontFamily: 'var(--font)', fontWeight: 600, transition: 'all 0.15s' }}>
              ↩ Reply
            </button>
          </div>
        )}

        <div style={{
          padding: '11px 16px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'var(--surface3)' : 'var(--surface2)',
          borderLeft: !isUser ? '2px solid #06b6d4' : 'none',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          width: hasBrainstorm ? '100%' : 'auto',
          userSelect: 'text',
        }}>
          {msg.replyQuote && (
            <div style={{ borderLeft: '2px solid #06b6d4', paddingLeft: 10, marginBottom: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, opacity: 0.95 }}>
              {msg.replyQuote.length > 220 ? msg.replyQuote.slice(0, 220) + '…' : msg.replyQuote}
            </div>
          )}
          {msg.text}
          {hasBrainstorm && <BrainstormResults result={msg.brainstorm} onFollowUp={onFollowUp} loading={loading} />}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, padding: '0 4px' }}>{msg.time}</span>
      </div>
    </div>
  )
}

function BrainstormTypingIndicator() {
  return (
    <div className="animate-msg" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,#06b6d4,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>💡</div>
      <div style={{ padding: '14px 18px', borderRadius: '18px 18px 18px 4px', background: 'var(--surface2)', borderLeft: '2px solid #06b6d4', display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#06b6d4', animation: `wave 1.3s ease-in-out ${i * 0.15}s infinite` }} />)}
      </div>
    </div>
  )
}

function BrainstormInputBar({ onSend, disabled, replyTo, onClearReply }) {
  const [val, setVal] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef()

  useEffect(() => { if (replyTo) inputRef.current?.focus() }, [replyTo])

  const send = () => {
    const t = val.trim()
    if (!t || disabled) return
    setVal('')
    onSend(t)
  }

  return (
    <div style={{ padding: '8px 20px 16px', borderTop: '1px solid var(--border)', background: 'rgba(9,13,22,0.6)', backdropFilter: 'blur(8px)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Reply preview */}
        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderLeft: '3px solid #06b6d4', borderRadius: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#06b6d4', letterSpacing: 0.8, marginBottom: 4 }}>REPLYING TO</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{replyTo}</p>
            </div>
            <button type="button" onClick={onClearReply} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>✕</button>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface)',
          border: `1px solid ${focused ? '#06b6d4' : 'rgba(6,182,212,0.35)'}`,
          borderRadius: 999, padding: '10px 14px',
          boxShadow: focused ? '0 0 0 1px #06b6d4, 0 0 24px rgba(6,182,212,0.25)' : '0 0 12px rgba(6,182,212,0.12)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
          <input
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={replyTo ? 'Write your reply...' : 'What do you want to brainstorm? e.g. "New revenue streams" or "Go deeper on idea #3"'}
            disabled={disabled}
            autoComplete="off"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14 }}
          />
          <button
            onClick={send}
            disabled={disabled || !val.trim()}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none',
              background: val.trim() ? 'linear-gradient(135deg,#06b6d4,#8b5cf6)' : 'var(--surface2)',
              color: val.trim() ? '#fff' : 'var(--text3)',
              cursor: val.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
              boxShadow: val.trim() ? '0 0 12px rgba(6,182,212,0.4)' : 'none',
            }}
          >➤</button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 6 }}>
          🟢 Practical · 🔴 Bold · 🟡 Contrarian · ⚡ Wild Card — sessions saved automatically
        </p>
      </div>
    </div>
  )
}

function BrainstormWelcome({ bizData, onSuggestion }) {
  const suggestions = bizData ? [
    { icon: '🎯', title: `Solve: ${(bizData.challenge || 'my main challenge').slice(0, 32)}`, sub: 'Challenge-focused brainstorm' },
    { icon: '💰', title: 'New revenue streams for my business', sub: '12–18 categorized ideas' },
    { icon: '📈', title: `Ideas to reach: ${(bizData.goal || 'my goal').slice(0, 28)}`, sub: 'Goal-aligned brainstorming' },
  ] : [
    { icon: '💡', title: 'Brainstorm a side business idea', sub: 'Full structured session' },
    { icon: '🚀', title: 'Ways to grow faster this quarter', sub: 'Practical + bold ideas' },
    { icon: '🔍', title: 'Challenge my current strategy', sub: 'Skeptic + contrarian lens' },
  ]

  return (
    <div style={{ textAlign: 'center', padding: '16px 16px 8px', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
        What should we brainstorm{bizData ? ` for ${bizData.name}` : ''}?
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 16px' }}>
        Type anything below — you'll get categorized ideas, multi-perspective takes, and proactive follow-ups. Keep chatting to refine.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 640, margin: '0 auto' }}>
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => onSuggestion(s.title)}
            style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border2)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.transform = 'translateY(0)' }}>
            <p style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.35 }}>{s.title}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>{s.sub}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Brainstorm Page (chat layout) ────────────────────────────────────────────
export function BrainstormPage({ bizData }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState(() => getBrainstormSessions())
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [showSessions, setShowSessions] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const bottomRef = useRef(null)
  const orKey = import.meta.env.VITE_OPENROUTER_API_KEY

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const persistSession = (msgs, sessionId) => {
    const saved = saveBrainstormSession({
      id: sessionId || undefined,
      messages: msgs,
      bizName: bizData?.name,
      title: msgs.find(m => m.role === 'user')?.text,
    })
    setActiveSessionId(saved.id)
    setSessions(getBrainstormSessions())
    return saved.id
  }

  const sendMessage = async (text, opts = {}) => {
    if (!text?.trim() || loading) return
    const quote = replyTo
    if (quote) setReplyTo(null)
    const userMsg = { role: 'user', text: text.trim(), time: nowTime(), ...(quote ? { replyQuote: quote } : {}) }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setLoading(true)

    const isFirst = messages.length === 0
    const mode = opts.mode || (isFirst ? 'brainstorm' : 'refine')
    const userContent = quote ? `[Replying to: "${quote.slice(0, 200)}"]\n\n${text.trim()}` : text.trim()

    try {
      const result = await runBrainstorm({
        userMessage: userContent,
        bizData,
        orKey,
        mode,
        focus: opts.focus || null,
        chatHistory: messages,
      })

      const aiMsg = {
        role: 'ai',
        text: result.reply || result.headline || 'Here are your brainstorm ideas:',
        time: nowTime(),
        brainstorm: result,
      }
      const finalMessages = [...nextMessages, aiMsg]
      setMessages(finalMessages)
      persistSession(finalMessages, activeSessionId)
    } catch {
      setMessages([...nextMessages, { role: 'ai', text: 'Sorry, I could not brainstorm right now. Check your API key and try again.', time: nowTime() }])
    } finally {
      setLoading(false)
    }
  }

  const handleFollowUp = (fu) => {
    sendMessage(fu.text, { mode: fu.mode || 'refine', focus: fu.focusHint || fu.text })
  }

  const handleReply = (text) => {
    setReplyTo(text.length > 300 ? text.slice(0, 300) + '…' : text)
  }

  const loadSession = (s) => {
    setActiveSessionId(s.id)
    if (s.messages?.length) {
      setMessages(s.messages)
    } else if (s.result) {
      setMessages([
        { role: 'user', text: s.topic || 'Brainstorm', time: nowTime() },
        { role: 'ai', text: s.result.reply || s.result.headline || '', time: nowTime(), brainstorm: s.result },
      ])
    } else {
      setMessages([])
    }
    setShowSessions(false)
    setReplyTo(null)
  }

  const newSession = () => {
    setActiveSessionId(null)
    setMessages([])
    setShowSessions(false)
    setReplyTo(null)
  }

  const removeSession = (id, e) => {
    e.stopPropagation()
    deleteBrainstormSession(id)
    setSessions(getBrainstormSessions())
    if (activeSessionId === id) newSession()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(9,13,22,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setShowSessions(s => !s)} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 11 }}>
            {showSessions ? '✕' : '☰'} Sessions{sessions.length ? ` (${sessions.length})` : ''}
          </button>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>💡 AI Brainstorming</h2>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>{bizData?.name || 'Your business'} · Chat to brainstorm</p>
          </div>
        </div>
        <button onClick={newSession} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text2)', fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          + New
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sessions drawer */}
        {showSessions && (
          <div style={{ width: 200, borderRight: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', padding: 12, flexShrink: 0, animation: 'slideInLeft 0.2s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 10 }}>SAVED SESSIONS</p>
            {sessions.length === 0 && <p style={{ fontSize: 11, color: 'var(--text3)' }}>No sessions yet</p>}
            {sessions.map(s => (
              <div key={s.id} onClick={() => loadSession(s)}
                style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: activeSessionId === s.id ? 'rgba(6,182,212,0.12)' : 'transparent', border: `1px solid ${activeSessionId === s.id ? '#06b6d4' : 'transparent'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, flex: 1 }}>{(s.title || 'Session').slice(0, 32)}</p>
                  <button onClick={e => removeSession(s.id, e)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10 }}>✕</button>
                </div>
                <p style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>{new Date(s.savedAt).toLocaleDateString()} · {(s.messages?.length || 0)} msgs</p>
              </div>
            ))}
          </div>
        )}

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 0' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {messages.length === 0
                ? <BrainstormWelcome bizData={bizData} onSuggestion={sendMessage} />
                : messages.map((m, i) => (
                  <BrainstormChatMessage key={i} msg={m} onFollowUp={handleFollowUp} loading={loading} onReply={handleReply} />
                ))
              }
              {loading && <BrainstormTypingIndicator />}
              <div ref={bottomRef} />
            </div>
          </div>
          <BrainstormInputBar onSend={sendMessage} disabled={loading} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
        </div>
      </div>
    </div>
  )
}
