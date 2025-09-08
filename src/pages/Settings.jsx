import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [user, setUser] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  // THEME (mirror Enhancer behavior)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('manual-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [manual, setManual] = useState(() => !!localStorage.getItem('manual-theme'))
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => { if (!manual) setTheme(e.matches ? 'dark' : 'light') }
    handler(mq); mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [manual])
  const onToggleTheme = (e) => { const next = e.target.checked ? 'dark' : 'light'; setTheme(next); setManual(true); localStorage.setItem('manual-theme', next) }

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data?.session?.user ?? null); setSessionChecked(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setUser(s?.user ?? null); setSessionChecked(true) })
    return () => data?.subscription?.unsubscribe?.()
  }, [])
  useEffect(() => { if (sessionChecked && !user) window.location.replace('/') }, [sessionChecked, user])

  const backToApp = () => { window.location.href = '/app' }

  // --- API Access: .env editor ---
  const [envLoading, setEnvLoading] = useState(true)
  const [envError, setEnvError] = useState('')
  const [orKey, setOrKey] = useState('') // organization .env key editor (optional)
  const [orMasked, setOrMasked] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnon, setSupabaseAnon] = useState('')
  const [envMessage, setEnvMessage] = useState('')
  const [useMine, setUseMine] = useState(() => localStorage.getItem('or_use_mine') === '1')
  const [myOrKey, setMyOrKey] = useState('')
  const [mineMasked, setMineMasked] = useState(() => {
    try { const v = localStorage.getItem('or_key') || ''; return v ? `${'*'.repeat(Math.max(0, v.length-6))}${v.slice(-6)}` : '' } catch { return '' }
  })

  useEffect(() => {
    (async () => {
      try {
        setEnvLoading(true)
        const res = await fetch('/api/admin/env')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setOrMasked(data?.values?.OPENROUTER_API_KEY?.masked || '')
        setAppUrl(data?.values?.APP_URL?.value || '')
        setSupabaseUrl(data?.values?.VITE_SUPABASE_URL?.value || '')
        setSupabaseAnon(data?.values?.VITE_SUPABASE_ANON_KEY?.value || '')
        setEnvError('')
      } catch (e) {
        setEnvError(String(e))
      } finally { setEnvLoading(false) }
    })()
  }, [])

  const saveEnv = async () => {
    try {
      setEnvMessage('')
      const updates = {}
      if (orKey) updates.OPENROUTER_API_KEY = orKey.trim()
      updates.APP_URL = appUrl.trim()
      updates.VITE_SUPABASE_URL = supabaseUrl.trim()
      updates.VITE_SUPABASE_ANON_KEY = supabaseAnon.trim()
      const res = await fetch('/api/admin/env', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setOrKey('')
      setEnvMessage(data.requiresRebuild ? 'Saved. Rebuild required for VITE_* changes.' : 'Saved.')
      // refresh masked
      const re = await fetch('/api/admin/env')
      const d2 = await re.json()
      setOrMasked(d2?.values?.OPENROUTER_API_KEY?.masked || '')
    } catch (e) {
      setEnvMessage(`Failed: ${e}`)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Settings</div>
          <label className="theme-toggle" title="Toggle light/dark mode">
            <input type="checkbox" checked={theme === 'dark'} onChange={onToggleTheme} aria-label="Toggle dark mode" />
            <span className="slider" aria-hidden="true"></span>
            <span className="mode-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </label>
        </div>
      </header>

      <div className="settings-page">
        <div className="settings-header">
          <button className="sp-logout" onClick={backToApp}>&larr; Back to app</button>
        </div>

        <section className="settings-card">
          <h2 className="settings-title">Profile</h2>
          <div className="settings-body">
            <div><b>Name:</b> {user?.user_metadata?.name || user?.email || '-'}</div>
            <div><b>Email:</b> {user?.email || '-'}</div>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-title">API Access</h2>
          <div className="settings-body">
            <div className="settings-form">
                {envLoading && <div className="hint">Loading current values…</div>}
                {envError && <div className="error-text">{envError}</div>}
                <div className="form-row">
                  <label>Use my OpenRouter key (per browser)</label>
                  <div>
                    <input type="checkbox" id="use-mine" checked={useMine} onChange={(e)=>{ setUseMine(e.target.checked); try { localStorage.setItem('or_use_mine', e.target.checked ? '1' : '0') } catch {} }} />
                    <label htmlFor="use-mine" style={{ marginLeft: 8 }}>Prefer my key over the organization key</label>
                  </div>
                </div>
                <div className="form-row">
                  <label>My OpenRouter Key (stored in this browser)</label>
                  <input
                    className="c-ask-input"
                    type="password"
                    placeholder={mineMasked ? `Current: ${mineMasked}` : 'sk-or-...'}
                    value={myOrKey}
                    onChange={e => setMyOrKey(e.target.value)}
                  />
                  <div className="form-actions">
                    <button className="sp-logout" onClick={()=>{ try { if(myOrKey){ localStorage.setItem('or_key', myOrKey); setMineMasked(`${'*'.repeat(Math.max(0, myOrKey.length-6))}${myOrKey.slice(-6)}`); setMyOrKey(''); setEnvMessage('Saved my key locally.'); } } catch(e){ setEnvMessage(String(e)) } }}>Save My Key</button>
                    {mineMasked && <button className="sp-settings" onClick={()=>{ try{ localStorage.removeItem('or_key'); setMineMasked(''); setEnvMessage('Removed my key from this browser.')} catch(e){ setEnvMessage(String(e)) } }}>Remove</button>}
                  </div>
                </div>
                <div className="form-row">
                  <label>OpenRouter API Key</label>
                  <input
                    className="c-ask-input"
                    type="password"
                    placeholder={orMasked ? `Current: ${orMasked}` : 'sk-or-...' }
                    value={orKey}
                    onChange={e => setOrKey(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>App URL (HTTP-Referer)</label>
                  <input className="c-ask-input" value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="http://localhost:5173" />
                </div>
                <div className="form-row">
                  <label>Supabase URL (VITE_*)</label>
                  <input className="c-ask-input" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} />
                </div>
                <div className="form-row">
                  <label>Supabase Anon Key (VITE_*)</label>
                  <input className="c-ask-input" type="password" value={supabaseAnon} onChange={e => setSupabaseAnon(e.target.value)} />
                </div>
                <div className="hint">Note: Changing VITE_* requires rebuilding the client to take effect.</div>
                <div className="form-actions">
                  <button className="sp-logout" onClick={saveEnv}>Save</button>
                  {envMessage && <span className="hint" style={{ marginLeft: 10 }}>{envMessage}</span>}
                </div>
              </div>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-title">MCP Controls</h2>
          <div className="settings-body">
            <p>Allow/deny tools and set per‑tool limits for your account. (Coming soon)</p>
          </div>
        </section>

        <RulesetEditor />

        <section className="settings-card">
          <h2 className="settings-title">Usage & Audit</h2>
          <div className="settings-body">
            <p>View recent usage and settings changes. (Coming soon)</p>
          </div>
        </section>
      </div>
    </>
  )
}

function RulesetEditor() {
  const [list, setList] = useState([])
  const [id, setId] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/rulesets').then(r => r.json()).then(d => setList(d.rulesets || []))
  }, [])

  useEffect(() => {
    if (!id) return setText('')
    fetch(`/api/admin/rulesets/${encodeURIComponent(id)}`).then(r => r.json()).then(d => setText(JSON.stringify(d.content || {}, null, 2)))
  }, [id])

  const save = async () => {
    try {
      setMsg('')
      const json = JSON.parse(text)
      const res = await fetch(`/api/admin/rulesets/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: json }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMsg('Saved')
    } catch (e) { setMsg(`Failed: ${e}`) }
  }

  return (
    <section className="settings-card">
      <h2 className="settings-title">Rulesets</h2>
      <div className="settings-body">
        <div className="form-row">
          <label>Pick ruleset</label>
          <select className="c-ask-input" value={id} onChange={e => setId(e.target.value)}>
            <option value="">Select…</option>
            {list.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {id && (
          <>
            <textarea className="c-ask-input" style={{ minHeight: 220, width: '100%' }} value={text} onChange={e => setText(e.target.value)} />
            <div className="form-actions">
              <button className="sp-logout" onClick={save}>Save ruleset</button>
              {msg && <span className="hint" style={{ marginLeft: 10 }}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
