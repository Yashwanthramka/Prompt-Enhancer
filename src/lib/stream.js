// Streaming client util for /api/complete

export async function streamCompletion({ providerModel, rulesetId, messages, onToken, signal }) {
  const res = await fetch('/api/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerModel, rulesetId, messages, stream: true }),
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

