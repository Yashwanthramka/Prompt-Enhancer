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
            <p>Configure provider keys (BYO or organization) and model access. (Coming soon)</p>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-title">MCP Controls</h2>
          <div className="settings-body">
            <p>Allow/deny tools and set per‑tool limits for your account. (Coming soon)</p>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-title">Rulesets</h2>
          <div className="settings-body">
            <p>Manage personal rulesets and set defaults. (Coming soon)</p>
          </div>
        </section>

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

