// ─── Google Workspace Agent ───────────────────────────────────────────────────

const CLIENT_ID = '1009559100068-c2o9ncaie8vnl6huom9fbd7hqi9jfrab.apps.googleusercontent.com'
const REDIRECT_URI = 'http://localhost:5173'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/forms.body',
].join(' ')

// ─── OAuth ────────────────────────────────────────────────────────────────────
export function connectGoogle() {
  return new Promise((resolve, reject) => {
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&prompt=consent`

    const popup = window.open(authUrl, 'google_auth', 'width=500,height=620,scrollbars=yes,resizable=yes')
    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site and try again.'))
      return
    }

    let settled = false

    const timer = setInterval(() => {
      try {
        const url = popup.location.href
        if (url && url.includes('access_token')) {
          clearInterval(timer)
          clearTimeout(timeoutId)
          if (settled) return
          settled = true
          const hash = popup.location.hash.substring(1)
          const params = new URLSearchParams(hash)
          const token = params.get('access_token')
          try { popup.close() } catch(e) {}
          if (token) resolve(token)
          else reject(new Error('No access token found.'))
        }
        if (popup.closed) {
          clearInterval(timer)
          clearTimeout(timeoutId)
          if (!settled) { settled = true; reject(new Error('Auth window closed before completing.')) }
        }
      } catch (e) {
        if (popup.closed) {
          clearInterval(timer)
          clearTimeout(timeoutId)
          if (!settled) { settled = true; reject(new Error('Auth window closed before completing.')) }
        }
      }
    }, 300)

    const timeoutId = setTimeout(() => {
      clearInterval(timer)
      if (!settled) {
        settled = true
        try { popup.close() } catch(e) {}
        reject(new Error('Auth timed out after 2 minutes.'))
      }
    }, 120000)
  })
}

// ─── Authenticated fetch ──────────────────────────────────────────────────────
async function gFetch(url, options = {}) {
  const token = localStorage.getItem('aura_gtoken')
  if (!token) throw new Error('SESSION_EXPIRED')

  let res
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch (netErr) {
    throw new Error(`Network error: ${netErr.message}`)
  }

  const text = await res.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch(e) { data = {} }

  if (res.status === 401 || data?.error?.code === 401 || data?.error?.status === 'UNAUTHENTICATED') {
    localStorage.removeItem('aura_gtoken')
    throw new Error('SESSION_EXPIRED')
  }
  if (res.status === 403) throw new Error(`Permission denied: ${data?.error?.message || 'Try reconnecting your Google account.'}`)
  if (data?.error) throw new Error(`Google API error (${res.status}): ${data.error.message}`)

  return data
}

// ─── Drive search ─────────────────────────────────────────────────────────────
async function driveSearch(query, mimeType = null, count = 20) {
  let q = `trashed=false`
  if (mimeType) q += ` and mimeType='${mimeType}'`
  if (query) q += ` and (name contains '${query.replace(/'/g,"\\'")}' or fullText contains '${query.replace(/'/g,"\\'")}')`
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc` +
    `&pageSize=${Math.min(count,1000)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`
  const data = await gFetch(url)
  return data.files || []
}

// ─── Read full Google Doc — returns ALL text, no truncation ──────────────────
async function readDocContent(fileId) {
  const data = await gFetch(`https://docs.googleapis.com/v1/documents/${fileId}`)

  // Extract all text from the document body
  const body = data.body?.content || []
  let fullText = ''

  for (const element of body) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun?.content) {
          fullText += el.textRun.content
        }
      }
    }
    // Also handle tables
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellEl of cell.content || []) {
            if (cellEl.paragraph) {
              for (const el of cellEl.paragraph.elements || []) {
                if (el.textRun?.content) {
                  fullText += el.textRun.content
                }
              }
            }
          }
        }
      }
    }
  }

  return fullText.trim() || '(empty document)'
}

// ─── Safe title helper ────────────────────────────────────────────────────────
const safeTitle = (raw, fallback) =>
  (raw && typeof raw === 'string' && raw.trim() && raw.trim().toLowerCase() !== 'null')
    ? raw.trim() : fallback

// ─── Convert leads → sheet rows ───────────────────────────────────────────────
function leadsToSheetRows(leads) {
  if (!leads?.length) return []
  const headers = ['#','Name','Description','Location','Contact','Website','Facebook','Instagram','Score','Score Reason','AI Opener']
  const rows = leads.map(l => [
    l['#']||'', l.name||'', l.description||'', l.location||'',
    l.contact||'', l.website||'', l.facebook||'', l.instagram||'',
    l.outreach_score||'', l.score_reason||'', l.ai_opener||'',
  ])
  return [headers, ...rows]
}

// ─── AI: parse intent ─────────────────────────────────────────────────────────
async function parseIntent(text, orKey, hasLeads) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `You are an intelligent Google Workspace command parser.

User said: "${text}"
${hasLeads ? 'Note: There are leads/results from a previous search available.' : ''}

Return ONLY valid JSON — no markdown:
{
  "service": "gmail|sheets|docs|calendar|forms|drive",
  "action": "...",
  "params": {...},
  "question": "the user's full specific question in plain english",
  "use_leads": false
}

"use_leads": true ONLY if user wants to save/export leads into a sheet

SERVICES & ACTIONS:
gmail → send_email, read_emails
sheets → create_sheet, list_sheets
docs → create_doc, read_doc, read_and_analyze, list_docs, search_docs
calendar → create_event, list_events
forms → create_form
drive → list_drive, search_drive

CRITICAL RULES:

For read_doc / read_and_analyze:
  "query": the document name or topic to search for — extract EXACTLY from user input
  "question": the FULL specific question the user is asking about the document
    Examples:
    - "read Operation Sharpen and tell me day 3 workout" → query: "Operation Sharpen", question: "What is the workout plan for day 3?"
    - "open my budget doc and find total expenses" → query: "budget", question: "What are the total expenses?"
    - "read the sales report" → query: "sales report", question: "Summarize the entire document"
  IMPORTANT: always preserve the user's specific question fully in the "question" field

For create_sheet / create_doc / create_form:
  "title": REQUIRED — extract exact name. Never null, never empty, never "null".
    Examples: "create a sheet called Sales Q3" → "Sales Q3"
    "make a revenue tracker" → "Revenue Tracker"

For create_event:
  "title": event name — REQUIRED
  "date": YYYY-MM-DD (today is ${new Date().toISOString().split('T')[0]})
  "time": HH:MM 24hr, default "09:00"
  "duration": minutes, default 60

For send_email:
  "to": email address — REQUIRED
  "subject": subject line — REQUIRED
  "body": full email body

For read_emails:
  "query": Gmail search (e.g. "from:ahmed", "is:unread", "subject:invoice")
  "count": number, default 10

For list_events: "days": integer, default 7
For list_sheets / list_docs: "count": integer, default 20
For search_drive: "query": string, "count": integer default 20

Return ONLY the JSON. No explanation.`
      }]
    })
  })
  const data = await res.json()
  const raw = data.choices[0].message.content.trim().replace(/```json|```/g, '').trim()
  return JSON.parse(raw)
}

// ─── AI: analyze data and answer specific question ────────────────────────────
async function analyzeAndAnswer(userQuestion, docName, docContent, orKey, bizData) {
  // Split very long docs into chunks if needed — use up to 12000 chars
  const content = docContent.slice(0, 12000)
  const wasTruncated = docContent.length > 12000

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are AURA, AI assistant for ${bizData?.name || 'this business'}. 
You have retrieved a Google Doc and must answer the user's specific question using its content.
Be thorough and specific — if the user asks about a specific day, section, or item, find it and give the full details.
Do not summarize unless asked. Give the exact information requested.${wasTruncated ? ' Note: document was very long, showing first 12000 characters.' : ''}`,
        },
        {
          role: 'user',
          content: `Document name: "${docName}"

Document content:
---
${content}
---

User's question: "${userQuestion}"

Answer the question directly and completely based on the document content above. If the answer is a list or plan, format it clearly.`,
        },
      ],
    })
  })
  const data = await res.json()
  return data.choices[0].message.content
}

// ─── AI: write email body ─────────────────────────────────────────────────────
async function writeEmailBody(instruction, orKey, bizData) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Write a professional email body for: "${instruction}"\nSender: ${bizData?.name || 'the sender'}\nJust the body text — no Subject line, no To line.`
      }]
    })
  })
  const data = await res.json()
  return data.choices[0].message.content.trim()
}

// ─── AI: simple answer from data ─────────────────────────────────────────────
async function simpleAnalyze(userQuestion, dataContext, orKey, bizData) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role:'system', content:`You are AURA, AI assistant for ${bizData?.name||'this business'}. Answer based on the data provided. Be specific and concise.` },
        { role:'user', content:`Question: "${userQuestion}"\n\nData:\n${dataContext}\n\nAnswer directly.` },
      ],
    })
  })
  const data = await res.json()
  return data.choices[0].message.content
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function handleGoogleWorkspace({ text, orKey, bizData, recentLeads = null }) {
  const token = localStorage.getItem('aura_gtoken')
  if (!token) {
    return '🔗 Go to the ⚡ Agents page and click "Connect Google Account" first.'
  }

  let intent
  try {
    intent = await parseIntent(text, orKey, !!recentLeads?.length)
  } catch (e) {
    throw new Error('Could not understand your request. Please try rephrasing.')
  }

  let resultText = ''

  try {

    // ── GMAIL ────────────────────────────────────────────────────────────────
    if (intent.service === 'gmail') {

      if (intent.action === 'send_email') {
        let { to, subject, body } = intent.params || {}
        if (!to) throw new Error('No recipient email address found. Please specify who to send to.')
        if (!subject) subject = 'Message from ' + (bizData?.name || 'AURA')
        if (!body || body.length < 20) body = await writeEmailBody(text, orKey, bizData)
        const emailLines = [`To: ${to}`,`Subject: ${subject}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','',body]
        const raw = btoa(unescape(encodeURIComponent(emailLines.join('\r\n')))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
        await gFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',body:JSON.stringify({raw})})
        resultText = `✅ Email sent!\n\n📧 To: ${to}\n📌 Subject: ${subject}\n\n${body}`

      } else if (intent.action === 'read_emails') {
        const { query='', count=10 } = intent.params||{}
        const listData = await gFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(count,20)}&q=${encodeURIComponent(query)}`)
        const msgs = listData.messages||[]
        if (!msgs.length) {
          resultText = `📭 No emails found${query?` matching "${query}"`:''}.`
        } else {
          const details = await Promise.all(msgs.map(m=>gFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)))
          const lines = details.map((e,i)=>{
            const h = e.payload?.headers||[]
            const from = h.find(x=>x.name==='From')?.value||'Unknown'
            const subj = h.find(x=>x.name==='Subject')?.value||'(no subject)'
            const date = h.find(x=>x.name==='Date')?.value||''
            const snippet = e.snippet?`\n   "${e.snippet.slice(0,120)}..."`:''
            return `${i+1}. 📧 ${subj}\n   From: ${from}\n   ${date}${snippet}`
          })
          const context = lines.join('\n\n')
          const isListIntent = intent.question?.toLowerCase().match(/list|show|display|get/)
          resultText = isListIntent
            ? `📬 ${details.length} email${details.length>1?'s':''}:\n\n${context}`
            : await simpleAnalyze(text, `Emails:\n${context}`, orKey, bizData)
        }
      }

    // ── SHEETS ───────────────────────────────────────────────────────────────
    } else if (intent.service === 'sheets') {

      if (intent.action === 'create_sheet') {
        const title = safeTitle(intent.params?.title, 'My Sheet')
        const wantsLeads = intent.use_leads || /leads|results|contacts|export|save.*leads|leads.*sheet/i.test(text)
        let sheetData = intent.params?.data || []
        if (wantsLeads && recentLeads?.length) sheetData = leadsToSheetRows(recentLeads)

        const sheet = await gFetch('https://sheets.googleapis.com/v4/spreadsheets',{
          method:'POST', body:JSON.stringify({properties:{title}})
        })
        if (sheetData.length) {
          const cols = Math.max(...sheetData.map(r=>r.length))
          const colLetter = cols <= 26
            ? String.fromCharCode(64+cols)
            : String.fromCharCode(64+Math.floor((cols-1)/26)) + String.fromCharCode(64+((cols-1)%26)+1)
          const range = `Sheet1!A1:${colLetter}${sheetData.length}`
          await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${range}?valueInputOption=RAW`,
            {method:'PUT', body:JSON.stringify({values:sheetData})})
          const leadCount = sheetData.length - 1
          resultText = `✅ Google Sheet created with ${leadCount} lead${leadCount!==1?'s':''}!\n\n📊 "${title}"\n🔗 https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`
        } else {
          resultText = `✅ Google Sheet created!\n\n📊 "${title}"\n🔗 https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`
        }

      } else if (intent.action === 'list_sheets') {
        const files = await driveSearch('','application/vnd.google-apps.spreadsheet',intent.params?.count||20)
        if (!files.length) { resultText = `📊 No Google Sheets found.` }
        else {
          const lines = files.map((f,i)=>`${i+1}. 📊 ${f.name}\n   Modified: ${new Date(f.modifiedTime).toLocaleDateString()}\n   🔗 ${f.webViewLink}`)
          resultText = `📊 Your Sheets (${files.length}):\n\n${lines.join('\n\n')}`
        }
      }

    // ── DOCS ─────────────────────────────────────────────────────────────────
    } else if (intent.service === 'docs') {

      if (intent.action === 'create_doc') {
        const title = safeTitle(intent.params?.title,'My Document')
        const docContent = intent.params?.content||''
        const doc = await gFetch('https://docs.googleapis.com/v1/documents',{method:'POST',body:JSON.stringify({title})})
        if (docContent) {
          await gFetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,{
            method:'POST',body:JSON.stringify({requests:[{insertText:{location:{index:1},text:docContent}}]})
          })
        }
        resultText = `✅ Google Doc created!\n\n📄 "${title}"\n🔗 https://docs.google.com/document/d/${doc.documentId}`

      } else if (intent.action === 'list_docs') {
        const files = await driveSearch('','application/vnd.google-apps.document',intent.params?.count||20)
        if (!files.length) { resultText = `📄 No Google Docs found.` }
        else {
          const lines = files.map((f,i)=>`${i+1}. 📄 ${f.name}\n   Modified: ${new Date(f.modifiedTime).toLocaleDateString()}\n   🔗 ${f.webViewLink}`)
          resultText = `📄 Your Docs (${files.length}):\n\n${lines.join('\n\n')}`
        }

      } else if (intent.action === 'search_docs') {
        const query = intent.params?.query||''
        const files = await driveSearch(query,'application/vnd.google-apps.document',10)
        if (!files.length) { resultText = `📄 No doc found matching "${query}".` }
        else {
          const lines = files.map((f,i)=>`${i+1}. 📄 ${f.name}\n   Modified: ${new Date(f.modifiedTime).toLocaleDateString()}\n   🔗 ${f.webViewLink}`)
          resultText = `📄 Found ${files.length} doc(s) matching "${query}":\n\n${lines.join('\n\n')}`
        }

      } else if (intent.action === 'read_doc' || intent.action === 'read_and_analyze') {
        const query = intent.params?.query || ''
        const userQuestion = intent.question || text

        // Search for the doc
        const files = await driveSearch(query, 'application/vnd.google-apps.document', 5)

        if (!files.length) {
          // Try a broader search without mimeType filter
          const broader = await driveSearch(query, null, 5)
          const docFile = broader.find(f => f.mimeType === 'application/vnd.google-apps.document')
          if (!docFile) {
            resultText = `📄 No doc found matching "${query}". Try checking the exact name in your Drive.`
          } else {
            const content = await readDocContent(docFile.id)
            const answer = await analyzeAndAnswer(userQuestion, docFile.name, content, orKey, bizData)
            resultText = `${answer}\n\n🔗 Open "${docFile.name}": ${docFile.webViewLink}`
          }
        } else {
          const file = files[0]
          const content = await readDocContent(file.id)
          const answer = await analyzeAndAnswer(userQuestion, file.name, content, orKey, bizData)
          resultText = `${answer}\n\n🔗 Open "${file.name}": ${file.webViewLink}`
        }
      }

    // ── CALENDAR ─────────────────────────────────────────────────────────────
    } else if (intent.service === 'calendar') {

      if (intent.action === 'create_event') {
        const {title:evTitle,date,time='09:00',duration=60,description=''} = intent.params||{}
        if (!evTitle) throw new Error('No event title found. Please specify the event name.')
        if (!date) throw new Error('No date found. Please specify when (e.g. "tomorrow" or "2025-06-15").')
        const start = new Date(`${date}T${time}:00`)
        const end = new Date(start.getTime()+duration*60000)
        const event = await gFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
          method:'POST',body:JSON.stringify({summary:evTitle,description,start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}})
        })
        resultText = `✅ Event created!\n\n📅 ${evTitle}\n🕐 ${date} at ${time} (${duration} min)\n🔗 ${event.htmlLink}`

      } else if (intent.action === 'list_events') {
        const {days=7} = intent.params||{}
        const now = new Date()
        const endDate = new Date(now.getTime()+days*86400000)
        const cal = await gFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`)
        const events = cal.items||[]
        if (!events.length) { resultText = `📅 No events in the next ${days} day${days>1?'s':''}.` }
        else {
          const lines = events.map((e,i)=>{
            const when = e.start?.dateTime
              ? new Date(e.start.dateTime).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
              : e.start?.date||'All day'
            return `${i+1}. 📅 ${e.summary||'(no title)'}\n   ${when}`
          })
          const context = lines.join('\n\n')
          const isListIntent = intent.question?.toLowerCase().match(/list|show|display|get|what/)
          resultText = isListIntent
            ? `📅 ${events.length} event${events.length>1?'s':''} in next ${days} day${days>1?'s':''}:\n\n${context}`
            : await simpleAnalyze(text,`Calendar events:\n${context}`,orKey,bizData)
        }
      }

    // ── FORMS ─────────────────────────────────────────────────────────────────
    } else if (intent.service === 'forms') {

      if (intent.action === 'create_form') {
        const title = safeTitle(intent.params?.title,'My Form')
        const form = await gFetch('https://forms.googleapis.com/v1/forms',{
          method:'POST',body:JSON.stringify({info:{title}})
        })
        resultText = `✅ Google Form created!\n\n📋 "${title}"\n✏️ Edit: https://docs.google.com/forms/d/${form.formId}/edit\n🔗 Share: https://docs.google.com/forms/d/${form.formId}/viewform`
      }

    // ── DRIVE ─────────────────────────────────────────────────────────────────
    } else if (intent.service === 'drive') {

      const query = intent.params?.query||''
      const files = await driveSearch(query,null,intent.params?.count||20)
      if (!files.length) { resultText = query?`📁 No files found matching "${query}".`:`📁 No files found in your Drive.` }
      else {
        const icon = m=>m.includes('spreadsheet')?'📊':m.includes('document')?'📄':m.includes('presentation')?'📽️':m.includes('folder')?'📁':'📎'
        const lines = files.map((f,i)=>`${i+1}. ${icon(f.mimeType)} ${f.name}\n   Modified: ${new Date(f.modifiedTime).toLocaleDateString()}\n   🔗 ${f.webViewLink}`)
        resultText = `📁 ${query?`Files matching "${query}"`:'Your Drive files'} (${files.length}):\n\n${lines.join('\n\n')}`
      }
    }

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      return `🔑 Your Google session expired.\n\nGo to ⚡ Agents page → Disconnect → Connect Google Account again. Takes 10 seconds.`
    }
    throw err
  }

  return resultText || `I understood your request but couldn't complete it. Try rephrasing.`
}
