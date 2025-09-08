import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAuthEvent } from '../lib/audit'
import ProviderBar from '../components/ProviderBar'
import { streamCompletion } from '../lib/stream'

/* Mono icons */
const Icon = {
  plus:   (p)=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  trash:  (p)=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 6h18M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 6l1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2L17 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
}

const signInWithMicrosoft = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/app?new=1`,
      scopes: 'openid email profile'
    }
  })
  if (error) { console.error('OAuth error:', error); alert(error.message); return }
  if (data?.url) window.location.href = data.url
}

export default function Enhancer() {
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('deepseek/deepseek-chat-v3.1:free')
  const mainRef = useRef(null)
  const listRef = useRef(null)
  const bottomRef = useRef(null)

  const isNearBottom = (el, px = 140) =>
    el && (el.scrollHeight - el.scrollTop - el.clientHeight < px)

  const scrollToBottomNow = (el) =>
    el && el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  const createdOnMount = useRef(false)
  const [copiedId, setCopiedId] = useState(null)

  // detect /app?new=1 only once on first render
  const hasNewQuery = useMemo(() => {
    return new URLSearchParams(window.location.search).get('new') === '1'
  }, [])

  // detect post-OAuth landing (Supabase puts tokens in the hash)
  const hasFreshLogin = useMemo(() => {
    return /(^|#|&)access_token=/.test(window.location.hash)
  }, [])

  // single flag used everywhere
  const shouldStartNew = hasNewQuery || hasFreshLogin

  // THEME
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('manual-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [manual, setManual] = useState(() => !!localStorage.getItem('manual-theme'))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => { if (!manual) setTheme(e.matches ? 'dark' : 'light') }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [manual])

  const onToggleTheme = (e) => {
    const next = e.target.checked ? 'dark' : 'light'
    setTheme(next); setManual(true); localStorage.setItem('manual-theme', next)
  }

  // Auth + session gate
  const [sessionChecked, setSessionChecked] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null)
      setSessionChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setUser(s?.user ?? null)
      setSessionChecked(true)
      logAuthEvent(e, s)
    })
    return () => data?.subscription?.unsubscribe?.()
  }, [])

  // If we land on /app with no session, bounce to home
  useEffect(() => {
    // Don't redirect if we appear to be in a post-OAuth landing
    if (sessionChecked && !user && !shouldStartNew) {
      window.location.replace('/')
    }
  }, [sessionChecked, user])

  // Handle OAuth errors that might come via query (?error=) or hash (#error=)
  useEffect(() => {
    const parse = (s) => new URLSearchParams(s.replace(/^[?#]/, ''))
    const q = parse(window.location.search)
    const h = parse(window.location.hash)
    const err = q.get('error') || h.get('error')
    if (err) {
      const desc = q.get('error_description') || h.get('error_description')
      alert(decodeURIComponent(desc || 'Sign-in was cancelled'))
      window.location.replace('/')
    }
  }, [])

  // Load conversations (skip auto-select if arriving with ?new=1 or fresh login)
  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id,title,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (!error) {
        const list = data || []
        setConversations(list)

        // Only auto-select most recent if not starting a new one
        if (list.length && !activeId && !shouldStartNew) {
          setActiveId(list[0].id)
        } else if (!list.length && !shouldStartNew) {
          try { await newConversation('New Prompt') } catch (err) { console.error(err) }
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Load messages
  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    ;(async () => {
      const { data } = await supabase
        .from('messages')
        .select('id,role,content,created_at')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    })()
  }, [activeId])

  // Keep bottom padding in sync with dock height and auto-scroll when near bottom
  useEffect(() => {
    const list = listRef.current
    const dock = document.querySelector('.c-input-dock')
    if (!list || !dock) return
    const ro = new ResizeObserver(() => {
      const h = dock.offsetHeight || 0
      list.style.paddingBottom = `${h + 24}px`
      if (isNearBottom(list)) list.scrollTo({ top: list.scrollHeight })
    })
    ro.observe(dock)
    return () => ro.disconnect()
  }, [])

  // Auto-scroll when a new message appears, but only if user is near bottom
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (isNearBottom(list)) scrollToBottomNow(list)
  }, [messages.length])

  // On first arrival with ?new=1 OR fresh post-OAuth hash, start new once and clean URL
  useEffect(() => {
    if (!user) return
    if (!shouldStartNew) return
    if (createdOnMount.current) return

    createdOnMount.current = true
    ;(async () => {
      const id = await newConversation('New Prompt')
      setActiveId(id)

      // clean URL
      const q = new URLSearchParams(window.location.search)
      q.delete('new')
      const clean = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`
      window.history.replaceState({}, '', clean)
      if (window.location.hash) {
        window.history.replaceState({}, '', clean)
      }

      setTimeout(() => document.querySelector('.c-ask-input')?.focus?.(), 0)
    })()
  }, [user, shouldStartNew])

  // New conversation
  const newConversation = async (title = 'New Prompt') => {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title })
      .select('id')
      .single()
    if (!error && data) {
      setConversations(prev => [{ id: data.id, title, created_at: new Date().toISOString() }, ...prev])
      setActiveId(data.id)
    }
    return data?.id
  }

  const ensureConversation = async (firstTitle) => activeId || newConversation(firstTitle)

  // Delete conversation
  const deleteConversation = async (id) => {
    const { error: mErr } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', id)
    if (mErr) { console.error('Delete messages failed:', mErr); alert('Failed to delete messages.'); return }

    const { error: cErr } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (cErr) { console.error('Delete conversation failed:', cErr); alert('Failed to delete conversation.'); return }

    const { data: fresh } = await supabase
      .from('conversations')
      .select('id,title,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setConversations(fresh || [])
    if (activeId === id) {
      const nextId = (fresh && fresh[0]?.id) || null
      setActiveId(nextId)
      if (!nextId) setMessages([])
    }
  }

  // Placeholder enhancer
  const enhanceText = (text) =>
`**Context**: ${text}

**Task**: Rewrite as a clear, professional prompt with bullet steps and a short summary.

**Guidelines**: concise • active voice • scannable bullets.`

  const onSend = async () => {
    const t = input.trim()
    if (!t || !user) return
    const cid = await ensureConversation(t.slice(0, 60))

    const userMsg = { conversation_id: cid, role: 'user', content: t }
    await supabase.from('messages').insert(userMsg)
    setMessages(m => [...m, { id: crypto.randomUUID(), ...userMsg, created_at: new Date().toISOString() }])
    // nudge to bottom if the user was reading the latest
    requestAnimationFrame(() => {
      const list = listRef.current
      if (list && isNearBottom(list, 220)) scrollToBottomNow(list)
    })

    const conv = conversations.find(c => c.id === cid)
    const isDefaultTitle = (title) => {
      if (!title) return true
      const def = ['New chat', 'New Prompt', 'New', 'Untitled']
      return def.includes(title)
    }
    if (conv && isDefaultTitle(conv.title)) {
      await supabase.from('conversations').update({ title: t.slice(0, 60) }).eq('id', cid)
      setConversations(cs => cs.map(c => c.id === cid ? { ...c, title: t.slice(0, 60) } : c))
    }

    // Stream from backend; assemble minimal messages
    const userMessages = [{ role: 'user', content: t }]
    const tempId = crypto.randomUUID()
    let accum = ''
    setMessages(m => [...m, { id: tempId, role: 'assistant', content: '', created_at: new Date().toISOString() }])
    try {
      await streamCompletion({
        providerModel: model,
        rulesetId: 'enhancer-default',
        messages: userMessages,
        onToken: (tok) => {
          accum += tok
          setMessages(m => m.map(x => x.id === tempId ? { ...x, content: accum } : x))
        }
      })
    } catch (err) {
      setMessages(m => m.map(x => x.id === tempId ? { ...x, content: '[Error streaming output]' } : x))
    }

    // Persist final assistant message
    if (accum) await supabase.from('messages').insert({ conversation_id: cid, role: 'assistant', content: accum })

    setInput('')
  }

  const copyText = async (id, text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1800)
    } catch (err) {
      console.error('Copy failed', err)
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (e) { console.error(e) }
      document.body.removeChild(ta)
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1800)
    }
  }

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = '/' }

  return (
    <>
      {/* Top bar (edge-to-edge) */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Prompt Enhancer</div>
          <label className="theme-toggle" title="Toggle light/dark mode">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={onToggleTheme}
              aria-label="Toggle dark mode"
            />
            <span className="slider" aria-hidden="true"></span>
            <span className="mode-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </label>
        </div>
      </header>

      <div className="claude-app">
        {/* RECREATED LEFT SIDEPANEL */}
        <aside className="sp-side">
          <div className="sp-header">
            <button className="sp-new" onClick={() => newConversation('New Prompt')}>
              <Icon.plus style={{ marginRight: 6 }} /> New Prompt
            </button>
            <div className="sp-title">History</div>
          </div>

          <div className="sp-scroll">
            <ul className="sp-list">
              {conversations.map(c => (
                <li key={c.id} className={`sp-item ${activeId === c.id ? 'is-active' : ''}`}>
                  <button className="sp-item-title" onClick={() => setActiveId(c.id)}>
                    {c.title || 'New chat'}
                  </button>
                  <button
                    className="sp-item-icon"
                    title="Delete"
                    aria-label="Delete conversation"
                    onClick={(e)=>{ e.stopPropagation(); deleteConversation(c.id) }}
                  >
                    <Icon.trash className="sp-icon" />
                  </button>
                </li>
              ))}
              {!conversations.length && <li className="sp-empty">No history yet</li>}
            </ul>
          </div>

          <div className="sp-footer">
            <div className="sp-user">{user?.user_metadata?.name || user?.email || 'Guest'}</div>
            {user && <button className="sp-logout" onClick={signOut}>Log out</button>}
          </div>
        </aside>

        {/* MAIN */}
        <main className="c-main" ref={mainRef}>
          <div className="c-messages" ref={listRef}>
            <div className="c-center">
              <h2 className="c-center-title">Enhance and pick what fits you</h2>
            </div>
            {messages.map(m => (
              <div key={m.id} className={`c-msg ${m.role}`}>
                {m.role === 'assistant' ? (
                  <div>
                    <div className="c-assistant-text">{m.content}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                      <button
                        className="copy-btn"
                        onClick={() => copyText(m.id, m.content)}
                        aria-label="Copy assistant output"
                      >
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="c-user-box">{m.content}</div>
                )}
              </div>
            ))}
            {/* anchor for auto-scroll */}
            <div ref={bottomRef} className="c-bottom-anchor" />
          </div>

          {/* Bottom input dock (ChatGPT-style) */}
          <div className="c-input-dock" role="region" aria-label="Prompt input">
            <ProviderBar
              value={model}
              onChange={setModel}
              options={[
                { key: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek v3.1' },
                { key: 'openai/gpt-oss-120b:free', label: 'GPT‑OSS 120B' },
                { key: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder' }
              ]}
            />
            <div className="c-ask-wrap">
              <input
                className="c-ask-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSend() }}
                placeholder="Type a prompt and press Enter…"
                aria-label="Enter prompt"
              />
              <button className="c-send" onClick={onSend} aria-label="Enhance">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 11.5l17-8.5-7.5 18-1.5-7-8-2.5z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
