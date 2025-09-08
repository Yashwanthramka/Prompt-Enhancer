// Minimal streaming bridge for OpenRouter
// Run with: node server/index.js (port 8787)
// Env: OPENROUTER_API_KEY, APP_URL(optional)

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Load rulesets from local JSON files
const rulesetDir = path.join(__dirname, 'rulesets')
const readRuleset = (id) => {
  try {
    const p = path.join(rulesetDir, `${id}.json`)
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) { return null }
}

// Simple provider registry (OpenRouter models)
// Keep a minimal, reliable set to avoid confusion. Add more later if you need them.
const providers = [
  { key: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek v3.1 (free)' },
  { key: 'openai/gpt-oss-120b:free', label: 'GPT‑OSS 120B (free)' },
  { key: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (free)' }
]

app.get('/api/providers', (_req, res) => {
  res.json({ providers })
})

app.get('/api/rulesets', (_req, res) => {
  const files = fs.existsSync(rulesetDir) ? fs.readdirSync(rulesetDir) : []
  const list = files.filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json'))
  res.json({ rulesets: list })
})

// --- Admin: rulesets read/write (dev convenience) ---
app.get('/api/admin/rulesets/:id', adminGuard, (req, res) => {
  const { id } = req.params || {}
  const data = readRuleset(id)
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json({ id, content: data })
})

app.put('/api/admin/rulesets/:id', adminGuard, (req, res) => {
  const { id } = req.params || {}
  const { content } = req.body || {}
  if (!id || typeof content !== 'object') return res.status(400).json({ error: 'Invalid payload' })
  try {
    const p = path.join(rulesetDir, `${id}.json`)
    if (!fs.existsSync(rulesetDir)) fs.mkdirSync(rulesetDir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.post('/api/complete', async (req, res) => {
  const { providerModel, rulesetId = 'enhancer-default', messages = [], stream = true } = req.body || {}
  const key = process.env.OPENROUTER_API_KEY
  const referer = process.env.APP_URL || 'http://localhost:5173'

  // Prep system rules
  const rules = readRuleset(rulesetId) || { system: 'You are a helpful assistant.' }
  const sys = { role: 'system', content: rules.system || 'You are a helpful assistant.' }
  const payload = { model: providerModel || providers[0].key, messages: [sys, ...messages], stream: !!stream }

  // Streaming headers to client
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  // Fallback: no key => simulate streaming
  if (!key) {
    const fake = (txt) => `Objective: Improve the prompt\n\n- Rewrite concisely\n- Use active voice\n- Keep bullets scannable\n\nFinal Prompt:\n${txt}`
    const user = messages?.find(m => m.role === 'user')?.content || ''
    const out = fake(user)
    for (const chunk of out.split(/(\s+)/)) {
      res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`)
      await new Promise(r => setTimeout(r, 12))
    }
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': referer,
        'X-Title': 'Prompt Enhancer'
      },
      body: JSON.stringify(payload)
    })

    if (!orRes.ok || !orRes.body) {
      const txt = await orRes.text().catch(() => '')
      res.write(`data: ${JSON.stringify({ error: txt || orRes.statusText })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    const reader = orRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const part = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const line = part.trim()
        if (!line) continue
        // Expect lines like: data: {...}
        const m = line.match(/^data:\s*(.*)$/)
        if (!m) continue
        const data = m[1]
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return }
        try {
          const obj = JSON.parse(data)
          const delta = obj?.choices?.[0]?.delta?.content
          const content = obj?.choices?.[0]?.message?.content
          const token = delta ?? content ?? ''
          if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`)
        } catch { /* ignore parse errors */ }
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// --- Admin: .env editor (limited keys) ---
const envPath = path.resolve(__dirname, '..', '.env')
const allowedEnvKeys = new Set(['OPENROUTER_API_KEY', 'APP_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])

const parseEnv = (txt) => {
  const map = new Map()
  for (const line of (txt || '').split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    map.set(key, val)
  }
  return map
}

const serializeEnv = (entries, originalTxt) => {
  // preserve unknown lines; replace or append known keys
  const lines = (originalTxt || '').split(/\r?\n/)
  const known = new Set([...entries.keys()])
  const out = lines.map((line) => {
    if (!line || /^\s*#/.test(line) || line.indexOf('=') === -1) return line
    const key = line.slice(0, line.indexOf('=')).trim()
    if (!known.has(key)) return line
    const val = entries.get(key) ?? ''
    known.delete(key)
    return `${key}=${val}`
  })
  for (const key of known) out.push(`${key}=${entries.get(key) ?? ''}`)
  return out.filter(l => l !== undefined).join('\n')
}

app.get('/api/admin/env', adminGuard, (_req, res) => {
  try {
    const txt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const map = parseEnv(txt)
    const mask = (v) => (v ? `${'*'.repeat(Math.max(0, v.length - 6))}${v.slice(-6)}` : '')
    const values = {}
    for (const k of allowedEnvKeys) {
      const v = map.get(k) || ''
      values[k] = k === 'OPENROUTER_API_KEY' ? { has: !!v, masked: mask(v) } : { value: v }
    }
    res.json({ values, path: envPath, note: 'Editing VITE_* requires rebuild to take effect in the client.' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.put('/api/admin/env', adminGuard, (req, res) => {
  try {
    const updates = req.body?.updates || {}
    const txt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const map = parseEnv(txt)
    for (const [k, v] of Object.entries(updates)) {
      if (!allowedEnvKeys.has(k)) continue
      if (typeof v !== 'string') continue
      map.set(k, v)
      process.env[k] = v // apply for server runtime keys
    }
    const newTxt = serializeEnv(map, txt)
    fs.writeFileSync(envPath, newTxt, 'utf8')
    const requiresRebuild = Object.keys(updates).some(k => k.startsWith('VITE_'))
    res.json({ ok: true, requiresRebuild })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => console.log(`MCP bridge listening on http://localhost:${PORT}`))
// simple origin guard for admin routes (dev-only)
const adminGuard = (req, res, next) => {
  const allowed = (process.env.APP_URL || 'http://localhost:5173')
  const origin = req.headers.origin || req.headers['x-forwarded-origin'] || ''
  if (origin && !origin.startsWith(allowed)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}
