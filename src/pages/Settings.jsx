import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { useSupabaseSession } from '../hooks/useSupabaseSession'
import { getAdminEnv, updateAdminEnv } from '../lib/api'
import RulesetEditor from '../components/RulesetEditor'

export default function Settings() {
  const { theme, toggle } = useTheme()
  const { user, sessionChecked } = useSupabaseSession()

  useEffect(() => { if (sessionChecked && !user) window.location.replace('/') }, [sessionChecked, user])

  // Admin env editor
  const [envLoading, setEnvLoading] = useState(true)
  const [orKey, setOrKey] = useState('')
  const [orMasked, setOrMasked] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnon, setSupabaseAnon] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [envMessage, setEnvMessage] = useState('')
  const [envError, setEnvError] = useState('')
  const [useMine, setUseMine] = useState(() => localStorage.getItem('or_use_mine') === '1')
  const [myOrKey, setMyOrKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [groqMasked, setGroqMasked] = useState('')
  const mineMasked = useMemo(() => {
    try {
      const v = localStorage.getItem('or_key') || ''
      return v ? `${'*'.repeat(Math.max(0, v.length - 6))}${v.slice(-6)}` : ''
    } catch { return '' }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        setEnvLoading(true)
        const data = await getAdminEnv()
        setOrMasked(data?.values?.OPENROUTER_API_KEY?.masked || '')
        setAppUrl(data?.values?.APP_URL?.value || '')
        setSupabaseUrl(data?.values?.VITE_SUPABASE_URL?.value || '')
        setSupabaseAnon(data?.values?.VITE_SUPABASE_ANON_KEY?.value || '')
        setApiBase(data?.values?.VITE_API_BASE?.value || '')
        setGroqMasked(data?.values?.GROQ_API_KEY?.masked || '')
        setEnvError('')
      } catch (e) { setEnvError(String(e)) }
      finally { setEnvLoading(false) }
    })()
  }, [])

  const saveEnv = async () => {
    try {
      setEnvMessage('')
      const updates = {}
      if (orKey) updates.OPENROUTER_API_KEY = orKey.trim()
      if (groqKey) updates.GROQ_API_KEY = groqKey.trim()
      updates.APP_URL = appUrl.trim()
      updates.VITE_SUPABASE_URL = supabaseUrl.trim()
      updates.VITE_SUPABASE_ANON_KEY = supabaseAnon.trim()
      updates.VITE_API_BASE = apiBase.trim()
      const data = await updateAdminEnv(updates)
      setOrKey('')
      setEnvMessage(data.requiresRebuild ? 'Saved. Rebuild required for VITE_* changes.' : 'Saved.')
      const fresh = await getAdminEnv(); setOrMasked(fresh?.values?.OPENROUTER_API_KEY?.masked || ''); setGroqMasked(fresh?.values?.GROQ_API_KEY?.masked || '')
    } catch (e) { setEnvMessage(`Failed: ${e}`) }
  }

  const backToApp = () => { window.location.href = '/app' }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Settings</div>
          <label className="theme-toggle" title="Toggle light/dark mode">
            <input type="checkbox" checked={theme === 'dark'} onChange={() => toggle()} aria-label="Toggle dark mode" />
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
                  <button className="sp-logout" onClick={()=>{ try { if(myOrKey){ localStorage.setItem('or_key', myOrKey); setMyOrKey(''); setEnvMessage('Saved my key locally.') } } catch(e){ setEnvMessage(String(e)) } }}>Save My Key</button>
                  {mineMasked && <button className="sp-settings" onClick={()=>{ try{ localStorage.removeItem('or_key'); setEnvMessage('Removed my key from this browser.') } catch(e){ setEnvMessage(String(e)) } }}>Remove</button>}
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
              {/* Google GenAI removed */}
              <div className="form-row">
                <label>Groq API Key</label>
                <input
                  className="c-ask-input"
                  type="password"
                  placeholder={groqMasked ? `Current: ${groqMasked}` : 'gsk_...'}
                  value={groqKey}
                  onChange={e => setGroqKey(e.target.value)}
                />
              </div>
          <div className="form-row">
            <label>App URL (HTTP-Referer)</label>
            <input className="c-ask-input" value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="http://localhost:5173" />
          </div>
          <div className="form-row">
            <label>API Base (VITE_API_BASE, optional)</label>
            <input className="c-ask-input" value={apiBase} onChange={e => setApiBase(e.target.value)} placeholder="http://localhost:8787 (leave blank to use dev proxy)" />
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
            <p>Allow/deny tools and set per-tool limits for your account. (Coming soon)</p>
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
