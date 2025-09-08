import { supabase } from './lib/supabase'
import { logAuthEvent } from './lib/audit'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import logo from './assets/react.svg'


function App() {
  // at the top of App()


  // Auth/session state (persisted by Supabase in localStorage)
  const [user, setUser] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)

const [theme, setTheme] = useState(() => {
  const saved = localStorage.getItem('manual-theme')
  if (saved) return saved                     // user override
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})
const [manual, setManual] = useState(() => !!localStorage.getItem('manual-theme'))

// reflect state to DOM
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme)
}, [theme])

// follow system changes ONLY if not manually overridden
useEffect(() => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e) => {
    if (!manual) setTheme(e.matches ? 'dark' : 'light')
  }
  handler(mq) // set once in case
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}, [manual])

// toggle handler (user click)
const onToggleTheme = (e) => {
  const next = e.target.checked ? 'dark' : 'light'
  setTheme(next)
  setManual(true)
  localStorage.setItem('manual-theme', next)
}
// optional: button/link to go back to system preference
const resetToSystem = () => {
  setManual(false)
  localStorage.removeItem('manual-theme')
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  setTheme(system)
}

  




  const promptSectionRef = useRef(null)
  const enhancedRef = useRef(null)
  const [input, setInput] = useState('')
  const [enhanced, setEnhanced] = useState('Your enhanced prompt will appear here...')

  const handleScroll = () => {
    promptSectionRef.current.scrollIntoView({ behavior: 'smooth' })
  }
  const handleEnhance = () => {
    setEnhanced(input.trim() ? input + '\n\n— enhanced' : 'Your enhanced prompt will appear here...')
  }
  const handleClear = () => {
    setInput(''); setEnhanced('Your enhanced prompt will appear here...')
  }
  const handleCopy = async () => {
    if (!enhancedRef.current) return
    enhancedRef.current.select()
    try { await navigator.clipboard.writeText(enhancedRef.current.value) } catch { document.execCommand('copy') }
    window.getSelection()?.removeAllRanges()
  }



    // AUTH

    useEffect(() => {
      if (!supabase) return

      // set initial (fast check from persisted session)
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session?.user ?? null)
        setSessionChecked(true)
        if (data.session) logAuthEvent('SESSION_RESTORED', data.session)
      })

      // listen for changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null)
        setSessionChecked(true)
        logAuthEvent(event, session)
      })

      return () => subscription.unsubscribe()
    }, [])

    // If a saved session exists, jump straight into the app
    useEffect(() => {
      if (sessionChecked && user) {
        window.location.replace('/app')
      }
    }, [sessionChecked, user])


    const signInWithMicrosoft = async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/app`, // ← land on the prompt UI
          scopes: 'openid email profile'
        }
      })
      if (error) { console.error(error); alert(error.message); return }
      if (data?.url) window.location.href = data.url
    }

    const signOut = async () => {
      if (!supabase) return
      await supabase.auth.signOut()
    }  



  return (
    <div>
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">Prompt Enhancer</div>
          <label className="theme-toggle" title="Toggle light/dark mode">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
            />
            <span className="slider" aria-hidden="true"></span>
            <span className="mode-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </label>
        </div>
      </header>

      <div style={{ height: '250px' }} />

      {/* Hero */}
      <div className="hero">
        <img src={logo} alt="App Logo" className="logo" />
        <h1 className="hero-text">Prompt Enhancer</h1>
        <button className="hero-button" onClick={signInWithMicrosoft}>
          Get Started
        </button>

      </div>

      {/* Spacer to make the scroll meaningful */}
      <div style={{ height: '400px' }} />
    </div>
  )
}

export default App
