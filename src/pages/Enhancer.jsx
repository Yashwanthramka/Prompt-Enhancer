import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSupabaseSession } from '../hooks/useSupabaseSession'
import { useTheme } from '../hooks/useTheme'
import ProviderBar from '../components/ProviderBar'
import { streamCompletion } from '../lib/stream'
import { supabase } from '../lib/supabase'

const Icon = {
  plus:   (p)=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  trash:  (p)=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 6h18M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 6l1 14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2L17 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
}

export default function Enhancer() {
  const { user, sessionChecked, signOut } = useSupabaseSession()
  const { theme, toggle } = useTheme()

  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(null)

  const [model, setModel] = useState('deepseek/deepseek-chat-v3.1:free')
  // Rulesets are fixed to the default on the server; no selector.

  // Verbose status panel
  const [verbose, setVerbose] = useState(() => {
    try { return localStorage.getItem('verbose') === '1' } catch { return false }
  })
  const [statusLines, setStatusLines] = useState([])
  const pushStatus = useCallback((msg) => {
    const ts = new Date()
    const hh = String(ts.getHours()).padStart(2,'0')
    const mm = String(ts.getMinutes()).padStart(2,'0')
    const ss = String(ts.getSeconds()).padStart(2,'0')
    const line = `[${hh}:${mm}:${ss}] ${msg}`
    setStatusLines((arr) => {
      const next = [...arr, line]
      if (next.length > 200) next.splice(0, next.length - 200)
      return next
    })
  }, [])
  useEffect(() => { try { localStorage.setItem('verbose', verbose ? '1' : '0') } catch {} }, [verbose])

  const listRef = useRef(null)
  const bottomRef = useRef(null)
  const copiedRef = useRef(null)

  // Redirect home if not signed in
  useEffect(() => {
    if (sessionChecked && !user) window.location.replace('/')
  }, [sessionChecked, user])

  // No ruleset loading; server uses the default ruleset.

  // Load conversations on login
  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setConversations(data || [])
      const id = data?.[0]?.id || null
      setActiveId(id)
      if (id) await loadMessages(id)
    })()
  }, [user])

  const loadMessages = useCallback(async (cid) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }, [])

  const newConversation = useCallback(async (title = 'New Prompt') => {
    if (!user) return null
    const { data, error } = await supabase
      .from('conversations')
      .insert({ title, user_id: user.id })
      .select('*')
      .single()
    if (error) return null
    setConversations(cs => [data, ...cs])
    setActiveId(data.id)
    setMessages([])
    return data.id
  }, [user])

  const deleteConversation = useCallback(async (id) => {
    await supabase.from('conversations').delete().eq('id', id)
    await supabase.from('messages').delete().eq('conversation_id', id)
    setConversations(cs => cs.filter(c => c.id !== id))
    if (activeId === id) { setActiveId(null); setMessages([]) }
  }, [activeId])

  const ensureConversation = useCallback(async (proposedTitle) => {
    if (activeId) return activeId
    const cid = await newConversation((proposedTitle || 'New Prompt').slice(0, 60))
    return cid
  }, [activeId, newConversation])

  const onSend = useCallback(async () => {
    const t = input.trim()
    if (!t || !user || isStreaming) return
    const cid = await ensureConversation(t)
    if (!cid) return

    // Persist user message immediately
    const userMsg = { conversation_id: cid, role: 'user', content: t }
    await supabase.from('messages').insert(userMsg)
    setMessages(m => [...m, { id: crypto.randomUUID(), ...userMsg, created_at: new Date().toISOString() }])

    if (verbose) {
      pushStatus(`Saved user message (chars=${t.length})`)
      pushStatus(`Starting stream with model=${model}`)
    }

    // Update conversation title once for new chats
    const conv = conversations.find(c => c.id === cid)
    if (conv && (!conv.title || ['New chat','New Prompt','New','Untitled'].includes(conv.title))) {
      await supabase.from('conversations').update({ title: t.slice(0,60) }).eq('id', cid)
      setConversations(cs => cs.map(c => c.id === cid ? { ...c, title: t.slice(0, 60) } : c))
    }

    // Start streaming
    const tempId = crypto.randomUUID()
    setIsStreaming(true)
    let accum = ''
    setMessages(m => [...m, { id: tempId, role: 'assistant', content: '', created_at: new Date().toISOString() }])

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamCompletion({
        providerModel: model,
        // no rulesetId; server defaults to enhancer-default
        messages: [{ role: 'user', content: t }],
        onToken: (tok) => {
          accum += tok
          setMessages(m => m.map(x => x.id === tempId ? { ...x, content: accum } : x))
          // autoscroll if close to bottom
          const el = listRef.current
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
            el.scrollTo({ top: el.scrollHeight })
          }
        },
        onStatus: verbose ? (msg) => pushStatus(msg) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      const msg = (err && (err.message || String(err))) || 'Error streaming'
      setMessages(m => m.map(x => x.id === tempId ? { ...x, content: `[${msg}]` } : x))
      if (verbose) pushStatus(`Stream error: ${msg}`)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }

    if (accum) {
      await supabase.from('messages').insert({ conversation_id: cid, role: 'assistant', content: accum })
      if (verbose) pushStatus(`Saved assistant message (chars=${accum.length})`)
    }
    setInput('')
  }, [input, user, isStreaming, ensureConversation, model, conversations, verbose, pushStatus])

  const onAbort = useCallback(() => {
    try { abortRef.current?.abort() } catch {}
    if (verbose) pushStatus('Abort requested')
  }, [])

  const copyText = useCallback(async (id, text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      copiedRef.current = id
      setTimeout(() => { if (copiedRef.current === id) copiedRef.current = null }, 1600)
    } catch {}
  }, [])

  return (
    <>
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Prompt Enhancer</div>
          <label className="theme-toggle" title="Toggle light/dark mode">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => toggle(e.target.checked ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
            />
            <span className="slider" aria-hidden="true"></span>
            <span className="mode-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </label>
        </div>
      </header>

      <div className="claude-app">
        {/* LEFT: History */}
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
                  <button className="sp-item-title" onClick={async () => { setActiveId(c.id); await loadMessages(c.id) }}>
                    {c.title || 'New chat'}
                  </button>
                  <button className="sp-item-icon" title="Delete" aria-label="Delete conversation" onClick={(e)=>{ e.stopPropagation(); deleteConversation(c.id) }}>
                    <Icon.trash className="sp-icon" />
                  </button>
                </li>
              ))}
              {!conversations.length && <li className="sp-empty">No history yet</li>}
            </ul>
          </div>
          <div className="sp-footer">
            <div className="sp-user">{user?.user_metadata?.name || user?.email || 'Guest'}</div>
            <div className="sp-actions">
              {user && (
                <>
                  <button className="sp-settings" onClick={() => (window.location.href = '/settings')}>Settings</button>
                  <button className="sp-logout" onClick={signOut}>Log out</button>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: Chat */}
        <main className="c-main">
          <div className="c-messages" ref={listRef}>
            <div className="c-center">
              <h2 className="c-center-title">Enhance and pick what fits you</h2>
            </div>
            {messages.map(m => (
              <div key={m.id} className={`c-msg ${m.role}`}>
                {m.role === 'assistant'
                  ? (
                    <div>
                      <div className="c-assistant-text">{m.content}</div>
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                        <button className="copy-btn" onClick={() => copyText(m.id, m.content)} aria-label="Copy assistant output">Copy</button>
                      </div>
                    </div>
                  )
                  : (<div className="c-user-box">{m.content}</div>)
                }
              </div>
            ))}
            <div ref={bottomRef} className="c-bottom-anchor" />
          </div>

          {/* Input dock */}
          <div className="c-input-dock" role="region" aria-label="Prompt input">
            <div className="c-status-controls" style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '4px 0' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={verbose} onChange={e => setVerbose(e.target.checked)} /> Verbose
              </label>
            </div>
            {verbose && (
              <div className="c-status" aria-live="polite" aria-label="Status log">
                {statusLines.map((ln, i) => (
                  <div key={i} className="c-status-line">{ln}</div>
                ))}
              </div>
            )}
            {/* Ruleset selector removed; default ruleset used server-side. */}

            <ProviderBar
              value={model}
              onChange={setModel}
              options={[
                { key: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek v3.1' },
                { key: 'groq/llama-3.1-8b-instant', label: 'Groq Llama3.1 8B' }
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
                disabled={isStreaming}
              />
              <button className="c-send" onClick={onSend} disabled={isStreaming} aria-label="Enhance">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 11.5l17-8.5-7.5 18-1.5-7-8-2.5z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
                </svg>
              </button>
              {isStreaming && (
                <button className="c-send" onClick={onAbort} title="Stop" aria-label="Stop streaming">⏹</button>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
