// Shared theme management hook: system-follow + manual override
import { useEffect, useMemo, useState } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('manual-theme')
      if (saved) return saved
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [manual, setManual] = useState(() => {
    try { return !!localStorage.getItem('manual-theme') } catch { return false }
  })

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

  const toggle = (next) => {
    const value = next ?? (theme === 'dark' ? 'light' : 'dark')
    setTheme(value)
    setManual(true)
    try { localStorage.setItem('manual-theme', value) } catch {}
  }

  return { theme, manual, setManual, toggle }
}

