// ─── AURA User Guidebook ──────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'chat',
    icon: '💬',
    name: 'Chat',
    color: '#3b8ef0',
    summary: 'Your main AI business assistant — ask anything about your company.',
    howTo: [
      'Click 💬 Chat in the left sidebar.',
      'Type your question in the message bar at the bottom and press Enter or ➤.',
      'Use the ☰ menu (top-left) to open chat history, start a new chat, or search past conversations.',
      'AURA uses your business profile from onboarding — advice is tailored to your industry, goals, and challenges.',
    ],
    examples: [
      '"How can I reduce expenses this month?"',
      '"Give me a 30-day plan to get more clients"',
      '"What should I focus on as a solo founder?"',
    ],
  },
  {
    id: 'agents',
    icon: '⚡',
    name: 'AI Agents',
    color: '#8b5cf6',
    summary: 'Specialized agents that do real work — not just chat. Activate one, then use Chat.',
    howTo: [
      'Click ⚡ Agents in the sidebar.',
      'Pick an agent and click ▶ Activate Agent.',
      'Go to 💬 Chat — the input bar shows which agent is active.',
      'Describe your task in plain language. Results appear inline in the conversation.',
      'Click Turn Off on the Agents page or deactivate the card when done.',
    ],
    subAgents: [
      { icon: '🎯', name: 'Lead Generation', tip: 'Find leads on Google Maps, LinkedIn, Instagram, TikTok. Example: "Find 10 restaurants in Karachi on Google Maps"' },
      { icon: '📈', name: 'Business Consultant', tip: 'Analyze your business, identify growth opportunities, and get strategic recommendations. Try: "Analyze my business and identify weaknesses" or "Create a 90-day growth plan for my business"' },
      { icon: '🔍', name: 'Competitor Research', tip: 'Research one competitor, compare two, or find competitors in your area.' },
      { icon: '📊', name: 'Financial Snapshot', tip: 'Share revenue & expenses or say "Analyze my business this month" for P&L, margin, and 3 actions.' },
      { icon: '📝', name: 'Proposal & Invoice', tip: 'Describe client, project, and price — AURA generates a proposal or invoice.' },
    ],
  },
  {
    id: 'brainstorm',
    icon: '💡',
    name: 'AI Brainstorming',
    color: '#06b6d4',
    summary: 'Structured idea generation — practical, bold, contrarian, and wild card ideas in a chat flow.',
    howTo: [
      'Click 💡 Brainstorm in the sidebar.',
      'Type what you want to explore in the message bar (or tap a suggestion card).',
      'Each reply includes categorized ideas, multiple perspectives, and suggested follow-ups.',
      'Keep chatting to refine — e.g. "Go deeper on idea #3" or "Try a wilder angle".',
      'Use ☰ Sessions to reopen saved brainstorm threads.',
    ],
    examples: [
      '"New revenue streams for my business"',
      '"How do I solve my biggest challenge?"',
      'Click a follow-up chip to continue the session',
    ],
  },
  {
    id: 'newsletter',
    icon: '📰',
    name: 'Newsletter',
    color: '#d48406',
    summary: 'Business intelligence — news filtered for your industry and goals.',
    howTo: [
      'Click 📰 Newsletter in the sidebar.',
      'News loads automatically (cached for 24 hours).',
      'Each card shows why the story matters to your business specifically.',
      'Click 🔄 Refresh to fetch the latest articles.',
    ],
    examples: [],
  },
]

const QUICK_START = [
  { step: 1, title: 'Set up your business', body: 'On first launch, complete the 3-step onboarding — name, industry, revenue, goals, and challenges. AURA personalizes everything from this.' },
  { step: 2, title: 'Start with Chat', body: 'Ask one real question about your business to see tailored advice.' },
  { step: 3, title: 'Try an Agent', body: 'Activate Lead Generation or Financial Snapshot, then switch to Chat for hands-on results.' },
  { step: 4, title: 'Brainstorm & stay informed', body: 'Use Brainstorm for ideas and Newsletter for industry news.' },
]

function SectionCard({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, padding: '20px 22px', marginBottom: 16, ...style }}>
      {children}
    </div>
  )
}

function FeatureBlock({ feature, onGoTo }) {
  return (
    <SectionCard id={`guide-${feature.id}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${feature.color}18`, border: `1px solid ${feature.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
          {feature.icon}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{feature.name}</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{feature.summary}</p>
        </div>
        <button
          onClick={() => onGoTo(feature.id)}
          style={{ padding: '8px 14px', borderRadius: 8, background: `${feature.color}15`, border: `1px solid ${feature.color}40`, color: feature.color, fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Open {feature.icon}
        </button>
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10 }}>HOW TO USE</p>
      <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text2)', fontSize: 13, lineHeight: 1.8 }}>
        {feature.howTo.map((line, i) => (
          <li key={i} style={{ marginBottom: 6 }}>{line}</li>
        ))}
      </ol>

      {feature.subAgents && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10 }}>AVAILABLE AGENTS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {feature.subAgents.map((a, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{a.icon} {a.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{a.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {feature.examples?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 8 }}>TRY SAYING</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {feature.examples.map((ex, i) => (
              <span key={i} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>{ex}</span>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

export function GuidebookPage({ bizData, setPage }) {
  const sidebarMap = [
    { icon: '💬', label: 'Chat', desc: 'AI assistant & agent results' },
    { icon: '⚡', label: 'Agents', desc: 'Activate specialized tools' },
    { icon: '💡', label: 'Brainstorm', desc: 'Structured idea sessions' },
    { icon: '📰', label: 'Newsletter', desc: 'Filtered industry news' },
    { icon: '📖', label: 'Guidebook', desc: 'You are here — bottom of sidebar' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 6 }}>📖 AURA Guidebook</h2>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
            Everything you need to use AURA properly{bizData ? ` — built for ${bizData.name}` : ''}. Use the sidebar icons to jump between features; this guide lives at the bottom of the sidebar.
          </p>
        </div>

        {/* Sidebar map */}
        <SectionCard>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.2, marginBottom: 14 }}>SIDEBAR MAP</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sidebarMap.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < sidebarMap.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>{item.desc}</p>
                </div>
                {item.label !== 'Guidebook' && setPage && (
                  <button onClick={() => setPage({ Chat: 'chat', Agents: 'agents', Brainstorm: 'brainstorm', Newsletter: 'newsletter' }[item.label])}
                    style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                    Go →
                  </button>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 14, lineHeight: 1.6 }}>
            Main features sit in the middle of the sidebar. <strong style={{ color: 'var(--text2)' }}>📖 Guidebook</strong> is pinned at the lowest spot so help is always one click away.
          </p>
        </SectionCard>

        {/* Quick start */}
        <SectionCard>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: 1.2, marginBottom: 14 }}>QUICK START (4 STEPS)</p>
          {QUICK_START.map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 14, marginBottom: s.step < 4 ? 16 : 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#10b981', flexShrink: 0 }}>{s.step}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{s.title}</p>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </SectionCard>

        {/* Jump nav */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {FEATURES.map(f => (
            <a key={f.id} href={`#guide-${f.id}`}
              style={{ padding: '8px 14px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text2)', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = f.color; e.currentTarget.style.color = f.color }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}>
              {f.icon} {f.name}
            </a>
          ))}
        </div>

        {/* Feature guides */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 12 }}>FEATURE GUIDES</p>
        {FEATURES.map(f => (
          <FeatureBlock key={f.id} feature={f} onGoTo={setPage} />
        ))}

        {/* Tips */}
        <SectionCard>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.2, marginBottom: 12 }}>TIPS FOR BEST RESULTS</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: 13, lineHeight: 1.85 }}>
            <li>Be specific — include numbers, locations, and client names when relevant.</li>
            <li>Update your business profile (✎ on the chat sidebar card) if your goals change.</li>
            <li>One agent at a time — deactivate before switching to avoid mixed behavior.</li>
            <li>Brainstorm sessions auto-save; use Sessions to continue later.</li>
            <li>Newsletter refreshes daily — check back for industry updates.</li>
            <li>Chats, sessions, and business data are stored in your browser (localStorage) — clearing browser data will reset them.</li>
          </ul>
        </SectionCard>

        {/* API note */}
        <SectionCard style={{ marginBottom: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1.2, marginBottom: 8 }}>SETUP NOTE</p>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            AURA needs API keys in your <code style={{ color: 'var(--accent)' }}>.env</code> file: <strong>VITE_OPENROUTER_API_KEY</strong> (AI), <strong>VITE_SERPER_API_KEY</strong> (search & leads). Google Workspace requires connecting your account on the Agents page.
          </p>
        </SectionCard>

        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 24 }}>
          AURA Business Intelligence · Guidebook v1
        </p>
      </div>
    </div>
  )
}
