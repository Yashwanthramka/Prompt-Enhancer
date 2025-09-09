// Streaming client util for /api/complete

// Allow overriding the API base to bypass the dev proxy when the
// server auto-increments its port. Default stays relative (Vite proxy).
const API_BASE = (import.meta?.env?.VITE_API_BASE || '').replace(/\/$/, '')

export async function streamCompletion({ providerModel, rulesetId, rulesContent, messages, onToken, onStatus, signal }) {
  // Optional per-user BYO OpenRouter key stored in localStorage
  let headers = { 'Content-Type': 'application/json' }
  try {
    const useMine = localStorage.getItem('or_use_mine') === '1'
    const myKey = localStorage.getItem('or_key')
    if (useMine && myKey) {
      headers['X-OpenRouter-Key'] = myKey
      onStatus && onStatus('Auth: using personal OpenRouter key (browser)')
    } else {
      onStatus && onStatus('Auth: using organization/server OpenRouter key')
    }
  } catch {}

  const candidates = []
  const base = (API_BASE || '').trim()
  if (base) {
    candidates.push(base)
  } else {
    // Try relative (Vite proxy), then common localhost fallbacks
    candidates.push('')
    candidates.push('http://localhost:8787')
    candidates.push('http://localhost:8788')
    candidates.push('http://localhost:8789')
  }

  let lastErr = null
  const upstream = String(providerModel || '').startsWith('google/')
    ? 'Google Gemini'
    : String(providerModel || '').startsWith('groq/')
      ? 'Groq (OpenAI-compatible)'
      : 'OpenRouter'
  onStatus && onStatus(`Upstream: ${upstream}, model=${providerModel}`)

  async function connectAndStream(baseUrl) {
    const url = `${baseUrl}/api/complete`
    onStatus && onStatus(`Connecting: ${url || '/api/complete'}`)
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ providerModel, rulesetId, rulesContent, messages, stream: true }),
      signal,
    })
    onStatus && onStatus(`Connected (status ${res.status})`)
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sawFirst = false
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const line = chunk.trim()
        if (!line) continue
        const m = line.match(/^data:\s*(.*)$/)
        if (!m) continue
        const data = m[1]
        if (data === '[DONE]') {
          if (sawFirst) {
            onStatus && onStatus('Stream complete')
            return
          } else {
            // No content received; treat as failure so we can try next base
            throw new Error('Empty stream (no tokens)')
          }
        }
        try {
          const obj = JSON.parse(data)
          // Surface server-side errors so callers can show a message
          if (obj && obj.error) {
            try { await reader.cancel() } catch {}
            throw new Error(obj.error)
          }
          const token = obj?.token || ''
          if (token && onToken) {
            if (!sawFirst) { onStatus && onStatus('First token received'); sawFirst = true }
            onToken(token)
          }
        } catch { /* ignore */ }
      }
    }
    // Stream ended without explicit [DONE]; if we didn't see tokens, mark as empty
    if (!sawFirst) throw new Error('Empty stream (no tokens)')
  }

  for (const baseUrl of candidates) {
    try {
      await connectAndStream(baseUrl)
      return
    } catch (e) {
      // If aborted, stop immediately
      if (signal?.aborted || (e && e.name === 'AbortError')) { onStatus && onStatus('Aborted'); throw e }
      lastErr = e
      onStatus && onStatus(`Failed: ${String(e && (e.message || e))}. Trying next base...`)
    }
  }

  // If all attempts failed, throw the last error
  if (lastErr) throw lastErr
}
