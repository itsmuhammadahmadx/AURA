import { useState } from 'react'

// ─── Invoice number helper ────────────────────────────────────────────────────
function getNextInvoiceNumber() {
  const last = parseInt(localStorage.getItem('aura_invoice_counter') || '1000')
  const next = last + 1
  localStorage.setItem('aura_invoice_counter', next.toString())
  return `INV-${next}`
}

// ─── Proposal PDF ─────────────────────────────────────────────────────────────
function downloadProposalPDF(proposal, bizData) {
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',sans-serif; color:#1a1a2e; padding:48px; background:#fff; }
  .header { border-bottom:3px solid #ef4444; padding-bottom:24px; margin-bottom:32px; display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { font-size:22px; font-weight:700; color:#ef4444; }
  .meta { text-align:right; font-size:13px; color:#666; line-height:1.8; }
  .title { font-size:28px; font-weight:700; margin-bottom:6px; color:#1a1a2e; }
  .subtitle { font-size:14px; color:#666; margin-bottom:32px; }
  .section { margin-bottom:28px; }
  .section-title { font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#ef4444; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid #f0f0f0; }
  .summary { font-size:14px; line-height:1.8; color:#333; background:#fef2f2; padding:16px 20px; border-radius:8px; border-left:4px solid #ef4444; }
  .phase { display:flex; gap:14px; margin-bottom:12px; }
  .phase-num { width:28px; height:28px; background:#ef4444; color:white; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0; }
  .phase-content h4 { font-size:13px; font-weight:700; margin-bottom:3px; }
  .phase-content p { font-size:12px; color:#555; line-height:1.6; }
  .badge { display:inline-block; background:#fff3f3; color:#ef4444; border:1px solid #fecaca; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600; margin-left:8px; }
  .deliverable { display:flex; gap:10px; align-items:center; margin-bottom:8px; font-size:13px; }
  .deliverable::before { content:'✓'; color:#ef4444; font-weight:700; }
  .milestone { display:flex; justify-content:space-between; align-items:flex-start; padding:10px 0; border-bottom:1px solid #f0f0f0; }
  .milestone:last-child { border-bottom:none; }
  .milestone-name { font-size:13px; font-weight:600; }
  .milestone-date { font-size:12px; color:#ef4444; font-weight:600; white-space:nowrap; margin-left:12px; }
  .milestone-desc { font-size:12px; color:#666; margin-top:2px; }
  .investment-total { background:linear-gradient(135deg,#fef2f2,#fdf4ff); border:2px solid #ef4444; border-radius:10px; padding:20px; text-align:center; margin-bottom:16px; }
  .investment-amount { font-size:32px; font-weight:700; color:#ef4444; }
  .investment-terms { font-size:13px; color:#666; margin-top:4px; }
  .breakdown-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0; font-size:13px; }
  .breakdown-row:last-child { border-bottom:none; }
  .why-item { display:flex; gap:8px; margin-bottom:10px; font-size:13px; line-height:1.6; }
  .why-item::before { content:'✦'; color:#ef4444; font-weight:700; flex-shrink:0; }
  .terms-item { display:flex; gap:8px; margin-bottom:8px; font-size:12px; color:#555; line-height:1.6; }
  .terms-item::before { content:'•'; color:#ef4444; flex-shrink:0; }
  .closing { margin-top:32px; padding:20px 24px; background:#fef2f2; border-radius:8px; border-left:4px solid #ef4444; font-style:italic; font-size:14px; color:#333; line-height:1.7; }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; font-size:11px; color:#999; }
  @media print { body { padding:32px; } }
</style></head><body>
  <div class="header">
    <div><div class="brand">${proposal.bizName || bizData?.name}</div><div style="font-size:12px;color:#666;margin-top:4px;">${bizData?.industry}</div></div>
    <div class="meta"><div><strong>Prepared for:</strong> ${proposal.clientName}</div><div><strong>Project:</strong> ${proposal.projectType}</div><div><strong>Valid until:</strong> ${proposal.validUntil}</div></div>
  </div>
  <div class="title">${proposal.projectTitle}</div>
  <div class="subtitle">Proposal from ${bizData?.name} → ${proposal.clientName}</div>
  <div class="section"><div class="section-title">Executive Summary</div><div class="summary">${proposal.executiveSummary}</div></div>
  <div class="section"><div class="section-title">Scope of Work</div>${proposal.scopeOfWork?.map((p,i)=>`<div class="phase"><div class="phase-num">${i+1}</div><div class="phase-content"><h4>${p.phase} <span class="badge">${p.duration}</span></h4><p>${p.description}</p></div></div>`).join('')}</div>
  <div class="section"><div class="section-title">Deliverables</div>${proposal.deliverables?.map(d=>`<div class="deliverable">${d}</div>`).join('')}</div>
  <div class="section"><div class="section-title">Timeline — ${proposal.timeline?.totalDuration} total</div>${proposal.timeline?.milestones?.map(m=>`<div class="milestone"><div><div class="milestone-name">${m.name}</div><div class="milestone-desc">${m.description}</div></div><div class="milestone-date">${m.date}</div></div>`).join('')}</div>
  <div class="section"><div class="section-title">Investment</div><div class="investment-total"><div class="investment-amount">${proposal.investment?.total}</div><div class="investment-terms">${proposal.investment?.paymentTerms}</div></div>${proposal.investment?.breakdown?.map(b=>`<div class="breakdown-row"><div><strong>${b.item}</strong> <span style="color:#999;font-size:11px;">${b.note}</span></div><div style="color:#ef4444;font-weight:600;">${b.amount}</div></div>`).join('')}</div>
  <div class="section"><div class="section-title">Why ${bizData?.name}</div>${proposal.whyUs?.map(w=>`<div class="why-item">${w}</div>`).join('')}</div>
  <div class="section"><div class="section-title">Terms & Conditions</div>${proposal.terms?.map(t=>`<div class="terms-item">${t}</div>`).join('')}</div>
  <div class="closing">"${proposal.closingLine}"</div>
  <div class="footer"><div>${bizData?.name} · ${bizData?.industry}</div><div>Generated by AURA · Valid until ${proposal.validUntil}</div></div>
</body></html>`
  const blob = new Blob([content], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 500) }
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────
function downloadInvoicePDF(invoice, bizData) {
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',sans-serif; color:#1a1a2e; padding:48px; background:#fff; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
  .brand { font-size:26px; font-weight:700; color:#10b981; }
  .brand-sub { font-size:12px; color:#999; margin-top:4px; }
  .invoice-label { font-size:32px; font-weight:800; color:#1a1a2e; text-align:right; letter-spacing:-1px; }
  .invoice-num { font-size:14px; color:#10b981; font-weight:600; text-align:right; margin-top:4px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-bottom:32px; padding:24px; background:#f9f9fb; border-radius:10px; }
  .party-label { font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#999; margin-bottom:8px; }
  .party-name { font-size:15px; font-weight:700; color:#1a1a2e; margin-bottom:4px; }
  .party-detail { font-size:12px; color:#666; line-height:1.7; }
  .dates { display:flex; gap:16px; margin-bottom:32px; }
  .date-box { flex:1; padding:14px 16px; background:#f0fdf4; border-radius:8px; border-left:3px solid #10b981; }
  .date-label { font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#10b981; margin-bottom:4px; }
  .date-val { font-size:14px; font-weight:700; color:#1a1a2e; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr { background:#1a1a2e; color:white; }
  thead th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; }
  thead th:last-child { text-align:right; }
  tbody tr { border-bottom:1px solid #f0f0f0; }
  tbody tr:nth-child(even) { background:#fafafa; }
  tbody td { padding:12px 16px; font-size:13px; color:#333; }
  tbody td:last-child { text-align:right; font-weight:600; color:#1a1a2e; }
  .totals { display:flex; justify-content:flex-end; margin-bottom:32px; }
  .totals-box { width:280px; }
  .total-row { display:flex; justify-content:space-between; padding:8px 0; font-size:13px; border-bottom:1px solid #f0f0f0; }
  .total-row.final { border-bottom:none; font-size:16px; font-weight:700; color:#10b981; padding-top:12px; }
  .payment { padding:20px 24px; background:#f0fdf4; border-radius:10px; margin-bottom:32px; }
  .payment-title { font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#10b981; margin-bottom:12px; }
  .payment-detail { font-size:13px; color:#333; line-height:1.8; }
  .note { padding:16px 20px; background:#f0f9ff; border-radius:8px; border-left:3px solid #3b8ef0; font-size:13px; color:#444; line-height:1.7; font-style:italic; margin-bottom:32px; }
  .footer { padding-top:16px; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; font-size:11px; color:#999; }
  @media print { body { padding:32px; } }
</style></head><body>
  <div class="header">
    <div><div class="brand">${bizData?.name}</div><div class="brand-sub">${bizData?.industry}</div></div>
    <div><div class="invoice-label">INVOICE</div><div class="invoice-num">${invoice.invoiceNumber}</div></div>
  </div>
  <div class="parties">
    <div><div class="party-label">From</div><div class="party-name">${bizData?.name}</div><div class="party-detail">${bizData?.industry}<br>${invoice.fromDetails||''}</div></div>
    <div><div class="party-label">Bill To</div><div class="party-name">${invoice.clientName}</div><div class="party-detail">${invoice.clientDetails||''}</div></div>
  </div>
  <div class="dates">
    <div class="date-box"><div class="date-label">Issue Date</div><div class="date-val">${invoice.issueDate}</div></div>
    <div class="date-box"><div class="date-label">Due Date</div><div class="date-val">${invoice.dueDate}</div></div>
    <div class="date-box"><div class="date-label">Status</div><div class="date-val" style="color:#ef4444;">UNPAID</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${invoice.items?.map((item,i)=>`<tr><td>${i+1}</td><td><strong>${item.description}</strong>${item.note?`<br><span style="font-size:11px;color:#999;">${item.note}</span>`:''}</td><td>${item.qty}</td><td>${item.rate}</td><td>${item.amount}</td></tr>`).join('')}</tbody>
  </table>
  <div class="totals"><div class="totals-box">
    ${invoice.subtotal?`<div class="total-row"><span>Subtotal</span><span>${invoice.subtotal}</span></div>`:''}
    ${invoice.tax?`<div class="total-row"><span>Tax (${invoice.taxRate||''})</span><span>${invoice.tax}</span></div>`:''}
    ${invoice.discount?`<div class="total-row"><span>Discount</span><span style="color:#10b981;">-${invoice.discount}</span></div>`:''}
    <div class="total-row final"><span>Total Due</span><span>${invoice.total}</span></div>
  </div></div>
  <div class="payment"><div class="payment-title">Payment Details</div><div class="payment-detail">${(invoice.paymentDetails||'').replace(/\n/g,'<br>')}</div></div>
  ${invoice.note?`<div class="note">${invoice.note}</div>`:''}
  <div class="footer"><div>Thank you for your business — ${bizData?.name}</div><div>Generated by AURA · ${invoice.invoiceNumber}</div></div>
</body></html>`
  const blob = new Blob([content], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 500) }
}

// ─── Runner ───────────────────────────────────────────────────────────────────
export async function runProposalAgent({ text, bizData, orKey }) {
  const intentRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: `Does this request ask for an INVOICE or a PROPOSAL? Reply with only one word: INVOICE or PROPOSAL.\n\nRequest: "${text}"` }]
    })
  })
  const intentData = await intentRes.json()
  const intent = intentData.choices[0].message.content.trim().toUpperCase().includes('INVOICE') ? 'invoice' : 'proposal'

  if (intent === 'invoice') {
    const invoiceNumber = getNextInvoiceNumber()
    const today = new Date()
    const issueDate = today.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: `You are an invoice generator for "${bizData?.name}" in the ${bizData?.industry} industry.

User request: "${text}"
Invoice Number: ${invoiceNumber}
Issue Date: ${issueDate}
IMPORTANT: Use the currency mentioned or implied in the request. If the client is from USA/Canada/Australia use USD. If UK use GBP. If Europe use EUR. If no currency mentioned, default to USD.

Generate a professional invoice. Return ONLY valid JSON (no markdown, no backticks):
{
  "invoiceNumber": "${invoiceNumber}",
  "clientName": "Client name from request",
  "clientDetails": "Client details if mentioned, else empty string",
  "fromDetails": "Any sender contact details if mentioned, else empty string",
  "issueDate": "${issueDate}",
  "dueDate": "Calculate from request (e.g. due in 7 days), default 7 days from today",
  "items": [
    { "description": "Service name", "note": "brief detail or empty string", "qty": "1", "rate": "USD X,XXX", "amount": "USD X,XXX" }
  ],
  "subtotal": "USD X,XXX",
  "taxRate": "0%",
  "tax": null,
  "discount": null,
  "total": "USD X,XXX",
  "paymentDetails": "Bank Transfer / Wire Transfer / PayPal\nAccount: Share your payment details with client\nReference: ${invoiceNumber}",
  "note": "Short thank-you note or null"
}` }]
      })
    })
    const data = await res.json()
    const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
    const invoice = JSON.parse(raw)
    return { type: 'invoice', invoice }
  } else {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: `You are a professional proposal writer for "${bizData?.name || 'a business'}" in the ${bizData?.industry || 'general'} industry.

Business context:
- Name: ${bizData?.name}
- Industry: ${bizData?.industry}
- Team: ${bizData?.team}
- Stage: ${bizData?.stage}
- Notes: ${bizData?.notes || 'none'}

User request: "${text}"

Return ONLY valid JSON (no markdown, no backticks):
{
  "clientName": "Client or company name",
  "projectTitle": "Short project title",
  "projectType": "Type of service/project",
  "executiveSummary": "2-3 sentences. What we are doing, why it matters, what outcome they will get.",
  "scopeOfWork": [
    { "phase": "Phase name", "description": "What is included", "duration": "X days/weeks" }
  ],
  "deliverables": ["Deliverable 1", "Deliverable 2", "Deliverable 3"],
  "timeline": {
    "totalDuration": "X weeks",
    "startDate": "Upon agreement",
    "milestones": [
      { "name": "Milestone name", "date": "Week X", "description": "What gets delivered" }
    ]
  },
  "investment": {
    "total": "Amount with currency",
    "breakdown": [
      { "item": "Service name", "amount": "Amount", "note": "brief note" }
    ],
    "paymentTerms": "e.g. 50% upfront, 50% on delivery"
  },
  "whyUs": ["Point 1 specific to ${bizData?.name}", "Point 2", "Point 3"],
  "terms": [
    "Revision rounds included: X",
    "Additional revisions billed separately",
    "Client to provide all required materials within 3 business days of request",
    "Payment due within 7 days of invoice"
  ],
  "validUntil": "30 days from date of issue",
  "closingLine": "A confident, direct 1-sentence closing statement from ${bizData?.name}"
}` }]
      })
    })
    const data = await res.json()
    const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
    const proposal = JSON.parse(raw)
    return { type: 'proposal', proposal }
  }
}

// ─── Invoice UI ───────────────────────────────────────────────────────────────
export function InvoiceUI({ invoice, bizData }) {
  const [copied, setCopied] = useState(false)
  if (!invoice) return null

  const copyInvoice = () => {
    const txt = `INVOICE: ${invoice.invoiceNumber}
From: ${bizData?.name}
To: ${invoice.clientName}
────────────────────────────────
Issue Date: ${invoice.issueDate}
Due Date: ${invoice.dueDate}

ITEMS
${invoice.items?.map((item, i) => `${i+1}. ${item.description} — ${item.amount}`).join('\n')}

${invoice.subtotal ? `Subtotal: ${invoice.subtotal}` : ''}
${invoice.tax ? `Tax: ${invoice.tax}` : ''}
${invoice.discount ? `Discount: -${invoice.discount}` : ''}
TOTAL DUE: ${invoice.total}

PAYMENT DETAILS
${invoice.paymentDetails}

${invoice.note || ''}`.trim()
    navigator.clipboard.writeText(txt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,142,240,0.08))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', color:'var(--success)' }}>🧾 INVOICE</span>
              <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:99, fontSize:10, fontWeight:700, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444' }}>UNPAID</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{invoice.invoiceNumber}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Invoice for {invoice.clientName}</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>
              <span style={{ color: 'var(--text3)' }}>From</span>{' '}
              <strong style={{ color: 'var(--accent)' }}>{bizData?.name}</strong>
              <span style={{ color: 'var(--text3)', margin: '0 6px' }}>→</span>
              <strong style={{ color: 'var(--text)' }}>{invoice.clientName}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copyInvoice} style={{ padding: '7px 14px', borderRadius: 8, background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'var(--border2)'}`, color: copied ? 'var(--success)' : 'var(--text2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
            <button onClick={() => downloadInvoicePDF(invoice, bizData)} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--success)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              ⬇ Download PDF
            </button>
          </div>
        </div>
        {/* Dates row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ label: 'Issue Date', val: invoice.issueDate, color: 'var(--text2)' }, { label: 'Due Date', val: invoice.dueDate, color: '#ef4444' }, { label: 'Total Due', val: invoice.total, color: 'var(--success)' }].map((d, i) => (
            <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{d.label.toUpperCase()}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: d.color }}>{d.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Line Items */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>LINE ITEMS</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border2)', marginBottom: 4 }}>
          {['Description', 'Qty', 'Rate', 'Amount'].map(h => (
            <p key={h} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: 0.5, textAlign: h !== 'Description' ? 'right' : 'left' }}>{h}</p>
          ))}
        </div>
        {invoice.items?.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '10px 0', borderBottom: i < invoice.items.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.description}</p>
              {item.note && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.note}</p>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{item.qty}</p>
            <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.rate}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.amount}</p>
          </div>
        ))}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {invoice.subtotal && <div style={{ display: 'flex', gap: 32, fontSize: 12, color: 'var(--text2)' }}><span>Subtotal</span><span>{invoice.subtotal}</span></div>}
          {invoice.tax && <div style={{ display: 'flex', gap: 32, fontSize: 12, color: 'var(--text2)' }}><span>Tax {invoice.taxRate}</span><span>{invoice.tax}</span></div>}
          {invoice.discount && <div style={{ display: 'flex', gap: 32, fontSize: 12, color: 'var(--success)' }}><span>Discount</span><span>-{invoice.discount}</span></div>}
          <div style={{ display: 'flex', gap: 32, fontSize: 16, fontWeight: 700, color: 'var(--success)', paddingTop: 6, borderTop: '1px solid var(--border2)', marginTop: 2 }}><span>Total Due</span><span>{invoice.total}</span></div>
        </div>
      </div>

      {/* Payment Details */}
      <div style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
        <p style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>💳 PAYMENT DETAILS</p>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{invoice.paymentDetails}</p>
      </div>

      {invoice.note && (
        <div style={{ background: 'rgba(59,142,240,0.04)', border: '1px solid rgba(59,142,240,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.6 }}>
          {invoice.note}
        </div>
      )}
    </div>
  )
}

// ─── Proposal UI ──────────────────────────────────────────────────────────────
export function ProposalUI({ proposal, bizData }) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  if (!proposal) return null

  const tabs = [
    { id: 'overview',   label: '📋 Overview' },
    { id: 'scope',      label: '🔧 Scope' },
    { id: 'timeline',   label: '📅 Timeline' },
    { id: 'investment', label: '💰 Investment' },
    { id: 'terms',      label: '📄 Terms' },
  ]

  const copyProposal = () => {
    const txt = `PROPOSAL: ${proposal.projectTitle}
From: ${bizData?.name}
To: ${proposal.clientName}
────────────────────────────────

EXECUTIVE SUMMARY
${proposal.executiveSummary}

SCOPE OF WORK
${proposal.scopeOfWork?.map((s, i) => `${i + 1}. ${s.phase} (${s.duration})\n   ${s.description}`).join('\n')}

DELIVERABLES
${proposal.deliverables?.map(d => `• ${d}`).join('\n')}

TIMELINE
Total Duration: ${proposal.timeline?.totalDuration}
${proposal.timeline?.milestones?.map(m => `• ${m.name} — ${m.date}: ${m.description}`).join('\n')}

INVESTMENT
Total: ${proposal.investment?.total}
${proposal.investment?.breakdown?.map(b => `• ${b.item}: ${b.amount} (${b.note})`).join('\n')}
Payment Terms: ${proposal.investment?.paymentTerms}

WHY ${bizData?.name?.toUpperCase()}
${proposal.whyUs?.map(w => `• ${w}`).join('\n')}

TERMS & CONDITIONS
${proposal.terms?.map(t => `• ${t}`).join('\n')}
Valid Until: ${proposal.validUntil}

${proposal.closingLine}`.trim()
    navigator.clipboard.writeText(txt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pill = (label, color = 'var(--accent)') => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
    background: `${color}18`, border: `1px solid ${color}35`, color, letterSpacing: 0.4,
  })

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(124,58,237,0.08))', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={pill('PROPOSAL', '#ef4444')}>📝 PROPOSAL</span>
              <span style={pill(proposal.projectType, '#8b5cf6')}>#{proposal.projectType}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{proposal.projectTitle}</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>
              <span style={{ color: 'var(--text3)' }}>From</span>{' '}
              <strong style={{ color: 'var(--accent)' }}>{bizData?.name}</strong>
              <span style={{ color: 'var(--text3)', margin: '0 6px' }}>→</span>
              <strong style={{ color: 'var(--text)' }}>{proposal.clientName}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={copyProposal} style={{ padding: '7px 14px', borderRadius: 8, background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'var(--border2)'}`, color: copied ? 'var(--success)' : 'var(--text2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
            <button onClick={() => downloadProposalPDF(proposal, bizData)} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              ⬇ Download PDF
            </button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>{proposal.executiveSummary}</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${activeTab === tab.id ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, background: activeTab === tab.id ? 'rgba(239,68,68,0.1)' : 'transparent', color: activeTab === tab.id ? '#ef4444' : 'var(--text3)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ animation: 'fadeIn 0.2s ease' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DELIVERABLES</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proposal.deliverables?.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#ef4444', flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>WHY {bizData?.name?.toUpperCase()}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.whyUs?.map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#ef4444', flexShrink: 0, marginTop: 1 }}>✦</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{w}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>"{proposal.closingLine}"</p>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>— {bizData?.name} · Valid until {proposal.validUntil}</p>
            </div>
          </div>
        )}
        {activeTab === 'scope' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {proposal.scopeOfWork?.map((phase, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{phase.phase}</span>
                    <span style={{ fontSize: 10, color: 'var(--accent)', background: 'rgba(59,142,240,0.1)', padding: '2px 8px', borderRadius: 99, border: '1px solid rgba(59,142,240,0.2)' }}>⏱ {phase.duration}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'timeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>TOTAL DURATION</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{proposal.timeline?.totalDuration}</p>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>START DATE</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{proposal.timeline?.startDate}</p>
              </div>
            </div>
            {proposal.timeline?.milestones?.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#ef4444' }}>{i + 1}</div>
                  {i < (proposal.timeline?.milestones?.length - 1) && <div style={{ width: 2, height: 24, background: 'rgba(239,68,68,0.15)', margin: '4px 0' }} />}
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{m.date}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'investment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(124,58,237,0.1))', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>TOTAL INVESTMENT</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{proposal.investment?.total}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{proposal.investment?.paymentTerms}</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>BREAKDOWN</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.investment?.breakdown?.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: i < proposal.investment.breakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{b.item}</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)' }}>{b.note}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', marginLeft: 12 }}>{b.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'terms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>TERMS & CONDITIONS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.terms?.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 8, borderBottom: i < proposal.terms.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, color: '#ef4444', flexShrink: 0, marginTop: 2 }}>•</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(59,142,240,0.04)', border: '1px solid rgba(59,142,240,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>⏳</span>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>This proposal is valid for <strong style={{ color: 'var(--text)' }}>{proposal.validUntil}</strong></p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}