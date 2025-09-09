// Thin API client for server endpoints
const API_BASE = (import.meta?.env?.VITE_API_BASE || '').replace(/\/$/, '')

function api(path) {
  return `${API_BASE}${path}`
}

export async function getProviders() {
  const res = await fetch(api('/api/providers'))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Admin env
export async function getAdminEnv() {
  const res = await fetch(api('/api/admin/env'))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateAdminEnv(updates) {
  const res = await fetch(api('/api/admin/env'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// Rulesets
export async function listRulesets() {
  const res = await fetch(api('/api/rulesets'))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  return d?.rulesets || []
}

export async function readRuleset(id) {
  const res = await fetch(api(`/api/admin/rulesets/${encodeURIComponent(id)}`))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data?.content || {}
}

export async function writeRuleset(id, content) {
  const res = await fetch(api(`/api/admin/rulesets/${encodeURIComponent(id)}`), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return true
}

export async function createRuleset(id, content) {
  const res = await fetch(api('/api/admin/rulesets'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, content })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}
