import { useState, useMemo } from 'react'

// ─── Parse message into text / table / columns / sheet blocks ─────────────────
function parseRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))
}

function parseMarkdownTable(raw) {
  const lines = raw.trim().split('\n').filter(l => l.includes('|'))
  if (lines.length < 2) return null
  const rows = lines.map(parseRow)
  let header = rows[0]
  let body = rows.slice(1)
  if (body.length && isSeparatorRow(body[0])) body = body.slice(1)
  if (!header.length || !body.length) return null
  return { headers: header, rows: body }
}

function parseDelimited(text, delim) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null
  const rows = lines.map(l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, '')))
  return { headers: rows[0], rows: rows.slice(1) }
}

function tryParseJsonTable(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  try {
    const data = JSON.parse(trimmed)
    if (!Array.isArray(data) || data.length < 1 || typeof data[0] !== 'object') return null
    const keys = Object.keys(data[0])
    if (!keys.length) return null
  const rows = data.map(obj => keys.map(k => {
      const v = obj[k]
      if (v == null) return '—'
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    }))
    return { headers: keys, rows, title: null }
  } catch {
    return null
  }
}

function parseColumnsBlock(raw) {
  const parts = raw.split(/\n---+\n/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  return parts.map(part => {
    const lines = part.split('\n')
    const first = lines[0]
    const titleMatch = first.match(/^#+\s+(.+)$/) || first.match(/^\*\*(.+)\*\*$/)
    const title = titleMatch ? titleMatch[1] : first.slice(0, 40)
    const body = titleMatch ? lines.slice(1).join('\n').trim() : lines.slice(1).join('\n').trim() || first
    return { title, body }
  })
}

export function parseMessageBlocks(text) {
  if (!text?.trim()) return [{ type: 'text', content: text || '' }]

  const blocks = []
  let cursor = 0
  const str = text

  const matchers = []

  const fenceRe = /```(csv|sheet|table|tsv|tabular)?\s*\n([\s\S]*?)```/gi
  let m
  while ((m = fenceRe.exec(str)) !== null) {
    const lang = (m[1] || 'csv').toLowerCase()
    const body = m[2]
    let table = parseDelimited(body, lang === 'tsv' ? '\t' : ',')
    if (!table) table = parseMarkdownTable(body)
    if (table) {
      matchers.push({
        start: m.index,
        end: m.index + m[0].length,
        block: { type: lang === 'sheet' ? 'sheet' : 'table', ...table, title: null },
      })
    }
  }

  const columnsRe = /:::columns\s*\n([\s\S]*?)\n:::/gi
  while ((m = columnsRe.exec(str)) !== null) {
    const cols = parseColumnsBlock(m[1])
    if (cols) {
      matchers.push({ start: m.index, end: m.index + m[0].length, block: { type: 'columns', columns: cols } })
    }
  }

  const tableRe = /(?:^|\n)((?:\|[^\n]+\|\n)(?:\|[-:\s|]+\|\n)(?:\|[^\n]+\|\n?)+)/g
  while ((m = tableRe.exec(str)) !== null) {
    const table = parseMarkdownTable(m[1])
    if (table) {
      const start = m.index + (m[0].startsWith('\n') ? 1 : 0)
      matchers.push({ start, end: m.index + m[0].length, block: { type: 'table', ...table, title: null } })
    }
  }

  matchers.sort((a, b) => a.start - b.start)

  const merged = []
  for (const match of matchers) {
    if (merged.some(x => match.start < x.end && match.end > x.start)) continue
    merged.push(match)
  }
  merged.sort((a, b) => a.start - b.start)

  for (const match of merged) {
    if (match.start > cursor) {
      const slice = str.slice(cursor, match.start).trim()
      if (slice) blocks.push(...splitTextAndJson(slice))
    }
    blocks.push(match.block)
    cursor = match.end
  }

  if (cursor < str.length) {
    const slice = str.slice(cursor).trim()
    if (slice) blocks.push(...splitTextAndJson(slice))
  }

  if (!blocks.length) blocks.push({ type: 'text', content: text })
  return blocks
}

function splitTextAndJson(slice) {
  const jsonTable = tryParseJsonTable(slice)
  if (jsonTable) return [{ type: 'table', ...jsonTable }]
  return [{ type: 'text', content: slice }]
}

export function messageHasRichLayout(text) {
  if (!text) return false
  return /```(csv|sheet|table|tsv)|:::columns|\|[-:\s|]+\|/.test(text) || /^\s*\[\s*\{/.test(text.trim())
}

// ─── Inline text (bold, bullets) ──────────────────────────────────────────────
function renderInline(line) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0
  let match
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index))
    const tok = match[0]
    if (tok.startsWith('**')) {
      parts.push(<strong key={match.index} style={{ color: 'var(--text)', fontWeight: 600 }}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      parts.push(<code key={match.index} style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{tok.slice(1, -1)}</code>)
    } else {
      parts.push(<em key={match.index}>{tok.slice(1, -1)}</em>)
    }
    last = match.index + tok.length
  }
  if (last < line.length) parts.push(line.slice(last))
  return parts.length ? parts : line
}

function TextBlock({ content }) {
  const lines = content.split('\n')
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {lines.map((line, i) => {
        if (/^#{1,3}\s/.test(line)) {
          const level = line.match(/^#+/)[0].length
          const text = line.replace(/^#+\s*/, '')
          const size = level === 1 ? 16 : level === 2 ? 15 : 14
          return <p key={i} style={{ fontSize: size, fontWeight: 700, color: 'var(--text)', margin: '10px 0 6px' }}>{renderInline(text)}</p>
        }
        if (/^[-*]\s/.test(line)) {
          return <p key={i} style={{ margin: '4px 0 4px 14px', position: 'relative' }}><span style={{ position: 'absolute', left: -12 }}>•</span>{renderInline(line.replace(/^[-*]\s/, ''))}</p>
        }
        if (!line.trim()) return <br key={i} />
        return <span key={i}>{renderInline(line)}{i < lines.length - 1 ? '\n' : ''}</span>
      })}
    </div>
  )
}

// ─── Table / Sheet UI ─────────────────────────────────────────────────────────
function ChatDataTable({ headers, rows, title, variant = 'table' }) {
  const [copied, setCopied] = useState(false)
  const isSheet = variant === 'sheet'

  const exportCSV = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `aura-export-${Date.now()}.csv`
    a.click()
  }

  const copyTable = async () => {
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n')
    await navigator.clipboard.writeText(tsv)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const colLabel = (i) => (isSheet ? String.fromCharCode(65 + (i % 26)) : null)

  return (
    <div style={{ margin: '12px 0', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: isSheet ? '#10b981' : 'var(--accent)', letterSpacing: 0.5 }}>
          {isSheet ? '📊 Sheet' : '📋 Table'}{title ? ` · ${title}` : ''} · {rows.length} rows
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={copyTable} className="chat-table-btn">{copied ? '✓ Copied' : '📋 Copy'}</button>
          <button type="button" onClick={exportCSV} className="chat-table-btn">⬇ CSV</button>
        </div>
      </div>
      <div className="chat-table-scroll" style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border2)', background: isSheet ? 'rgba(16,185,129,0.04)' : 'rgba(0,0,0,0.2)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: headers.length * 100 }}>
          <thead>
            <tr>
              {isSheet && <th style={thStyle(true, true)}>#</th>}
              {headers.map((h, i) => (
                <th key={i} style={thStyle(isSheet, false)}>
                  {isSheet && <span style={{ fontSize: 9, opacity: 0.6, display: 'block' }}>{colLabel(i)}</span>}
                  {renderInline(h.replace(/\*\*/g, ''))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                {isSheet && <td style={tdStyle(true)}>{ri + 1}</td>}
                {row.map((cell, ci) => (
                  <td key={ci} style={tdStyle(false)}>{renderInline(String(cell ?? '—'))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle = (sheet, corner) => ({
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: 11,
  color: sheet ? '#10b981' : 'var(--accent)',
  background: sheet ? 'rgba(16,185,129,0.12)' : 'rgba(59,142,240,0.12)',
  borderBottom: '1px solid var(--border2)',
  borderRight: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  ...(corner ? { width: 36 } : {}),
})

const tdStyle = (rowNum) => ({
  padding: '8px 12px',
  color: 'var(--text2)',
  borderBottom: '1px solid var(--border)',
  borderRight: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'top',
  lineHeight: 1.5,
  maxWidth: 280,
  ...(rowNum ? { color: 'var(--text3)', textAlign: 'center', width: 36 } : {}),
})

function ChatColumns({ columns }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(columns.length, 3)}, minmax(0, 1fr))`, gap: 10, margin: '12px 0', width: '100%' }}>
      {columns.map((col, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{col.title}</p>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{col.body}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function ChatMessageContent({ text }) {
  const blocks = useMemo(() => parseMessageBlocks(text), [text])

  return (
    <div className="chat-rich-content">
      {blocks.map((block, i) => {
        if (block.type === 'text') return <TextBlock key={i} content={block.content} />
        if (block.type === 'columns') return <ChatColumns key={i} columns={block.columns} />
        if (block.type === 'sheet') return <ChatDataTable key={i} headers={block.headers} rows={block.rows} title={block.title} variant="sheet" />
        if (block.type === 'table') return <ChatDataTable key={i} headers={block.headers} rows={block.rows} title={block.title} variant="table" />
        return null
      })}
    </div>
  )
}
