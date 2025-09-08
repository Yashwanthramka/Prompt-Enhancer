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

const PORT = process.env.PORT || 8787
app.listen(PORT, () => console.log(`MCP bridge listening on http://localhost:${PORT}`))
