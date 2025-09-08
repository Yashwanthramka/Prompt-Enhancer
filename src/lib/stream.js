// Streaming client util for /api/complete

export async function streamCompletion({ providerModel, rulesetId, rulesContent, messages, onToken, signal }) {
  // Optional per-user BYO OpenRouter key stored in localStorage
  let headers = { 'Content-Type': 'application/json' }
  try {
    const useMine = localStorage.getItem('or_use_mine') === '1'
    const myKey = localStorage.getItem('or_key')
    if (useMine && myKey) headers['X-OpenRouter-Key'] = myKey
  } catch {}

  const res = await fetch('/api/complete', {
    method: 'POST',
    headers,
    body: JSON.stringify({ providerModel, rulesetId, rulesContent, messages, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
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
      if (data === '[DONE]') return
      try {
        const obj = JSON.parse(data)
        const token = obj?.token || ''
        if (token && onToken) onToken(token)
      } catch { /* ignore */ }
    }
  }
}
