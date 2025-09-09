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

 // Remove unsupported models (Qwen, GPT-OSS, Gemini)
 try { providers.splice(1) } catch {}

 // Add Groq provider (free-tier requires API key)
 providers.push({ key: 'groq/llama-3.1-8b-instant', label: 'Groq Llama3.1 8B' })

// --- Streaming helpers ---
function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function streamFake(res, userText) {
  const out = `Objective: Improve the prompt\n\n- Rewrite concisely\n- Use active voice\n- Keep bullets scannable\n\nFinal Prompt:\n${userText}`
  for (const chunk of out.split(/(\\s+)/)) {
    sse(res, { token: chunk })
    await new Promise(r => setTimeout(r, 12))
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

async function streamOpenRouter(res, { key, referer, payload }) {
  const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': referer,
      'X-Title': 'Prompt Enhancer'
    },
    body: JSON.stringify(payload)
  })

  if (!orRes.ok || !orRes.body) {
    const txt = await orRes.text().catch(() => '')
    throw new Error(txt || orRes.statusText || 'Upstream error')
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
      const m = line.match(/^data:\s*(.*)$/)
      if (!m) continue
      const data = m[1]
      if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return }
      try {
        const obj = JSON.parse(data)
        const delta = obj?.choices?.[0]?.delta?.content
        const content = obj?.choices?.[0]?.message?.content
        const token = delta ?? content ?? ''
        if (token) sse(res, { token })
      } catch { /* ignore parse errors */ }
    }
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

// For accidental GETs in browser
app.get('/api/complete', (_req, res) => {
  res.status(405).json({ error: 'Use POST with JSON body: { providerModel, rulesetId, rulesContent, messages, stream }' })
})

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

// Create a new ruleset file
app.post('/api/admin/rulesets', adminGuard, (req, res) => {
  try {
    const { id, content } = req.body || {}
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid id. Use letters, numbers, _ or - (max 40).' })
    }
    const json = (typeof content === 'object' && content) || { system: 'You are a helpful assistant.' }
    if (!fs.existsSync(rulesetDir)) fs.mkdirSync(rulesetDir, { recursive: true })
    const p = path.join(rulesetDir, `${id}.json`)
    if (fs.existsSync(p)) return res.status(409).json({ error: 'Exists' })
    fs.writeFileSync(p, JSON.stringify(json, null, 2), 'utf8')
    res.status(201).json({ ok: true, id })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// Google Gemini streaming via REST SSE
// Gemini support removed\n}

// Groq OpenAI-compatible streaming
async function streamGroq(res, { key, model, systemText, userText }) {
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const payload = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: String(systemText || 'You are a helpful assistant.') },
      { role: 'user', content: String(userText || '') }
    ]
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  })
  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => '')
    throw new Error(txt || r.statusText || 'Groq upstream error')
  }
  const reader = r.body.getReader()
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
      const m = line.match(/^data:\s*(.*)$/)
      if (!m) continue
      const data = m[1]
      if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return }
      try {
        const obj = JSON.parse(data)
        const delta = obj?.choices?.[0]?.delta?.content
        const content = obj?.choices?.[0]?.message?.content
        const token = delta ?? content ?? ''
        if (token) sse(res, { token })
      } catch { /* ignore */ }
    }
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

app.post('/api/complete', async (req, res) => {
  const { providerModel, rulesetId = 'enhancer-default', rulesContent, messages = [], stream = true } = req.body || {}
  // Allow per-user override via header (not stored) or fallback to env
  const overrideKey = req.headers['x-openrouter-key']
  const key = (typeof overrideKey === 'string' && overrideKey.trim()) || process.env.OPENROUTER_API_KEY
  const referer = process.env.APP_URL || 'http://localhost:5173'

  // Prep system rules
  const rules = (rulesContent && typeof rulesContent === 'object')
    ? rulesContent
    : readRuleset(rulesetId) || { system: 'You are a helpful assistant.' }
  const sys = { role: 'system', content: rules.system || 'You are a helpful assistant.' }
  const payload = { model: providerModel || providers[0].key, messages: [sys, ...messages], stream: !!stream }

  // Minimal debug logging (no secrets)
  try {
    const firstUser = (messages || []).find(m => m?.role === 'user')?.content || ''
    console.log('[complete] model=%s ruleset=%s overrideKey=%s msgChars=%d sysChars=%d',
      payload.model,
      rulesetId,
      overrideKey ? 'yes' : 'no',
      firstUser.length,
      String(sys.content || '').length
    )
  } catch {}

  // Streaming headers to client
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  const userText = messages?.find(m => m.role === 'user')?.content || ''

  // Branch: Google Gemini (removed)
  if (String(payload.model).startsWith('google/')) {
    sse(res, { error: 'Model not supported' })
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  // Branch: Groq
  if (String(payload.model).startsWith('groq/')) {
    const groqModel = String(payload.model).slice('groq/'.length)
    const gk = process.env.GROQ_API_KEY
    if (!gk) {
      sse(res, { token: '[Local fallback: no Groq key found]\n' })
      return streamFake(res, userText)
    }
    try {
      await streamGroq(res, { key: gk, model: groqModel, systemText: sys.content, userText })
    } catch (err) {
      const msg = String(err?.message || err || 'Groq upstream error')
      console.warn('Groq error:', msg)
      sse(res, { token: `[Groq error: ${msg}]\n` })
      return streamFake(res, userText)
    }
    return
  }

  // Default: OpenRouter
  if (!key) {
    sse(res, { token: '[Local fallback: no OpenRouter key found]\n' })
    return streamFake(res, userText)
  }
  try {
    await streamOpenRouter(res, { key, referer, payload })
  } catch (err) {
    const msg = String(err?.message || err || 'Upstream error')
    console.warn('OpenRouter error:', msg)
    sse(res, { token: `[OpenRouter error: ${msg}]\n` })
    return streamFake(res, userText)
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// --- Admin: .env editor (limited keys) ---
const envPath = path.resolve(__dirname, '..', '.env')
const allowedEnvKeys = new Set([
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'APP_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  // Allow overriding API base on the client when the server port auto-increments
  'VITE_API_BASE'
])

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
    const maskKeys = new Set(['OPENROUTER_API_KEY', 'GROQ_API_KEY'])
    for (const k of allowedEnvKeys) {
      const v = map.get(k) || ''
      values[k] = maskKeys.has(k) ? { has: !!v, masked: mask(v) } : { value: v }
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

const DEFAULT_PORT = parseInt(process.env.PORT || '8787', 10)

// Start server with retry when port is in use. This prevents the whole dev
// runner from exiting if the default port is already taken.
function startServer(port = DEFAULT_PORT, attempts = 0) {
  const server = app.listen(port, () => console.log(`MCP bridge listening on http://localhost:${port}`))

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attempts < 10) {
      const next = port + 1
      console.warn(`Port ${port} in use, trying ${next} (attempt ${attempts + 1})`)
      // slight delay before retrying
      setTimeout(() => startServer(next, attempts + 1), 150)
      return
    }
    console.error('Server failed to start:', err)
    process.exit(1)
  })
}

startServer()
// simple origin guard for admin routes (dev-only)
function adminGuard(req, res, next) {
  const allowed = (process.env.APP_URL || 'http://localhost:5173')
  const origin = req.headers.origin || req.headers['x-forwarded-origin'] || ''
  if (origin && !origin.startsWith(allowed)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

