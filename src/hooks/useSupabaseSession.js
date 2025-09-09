import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSupabaseSession() {
  const [user, setUser] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data?.session?.user ?? null)
      setSessionChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return
      setUser(s?.user ?? null)
      setSessionChecked(true)
    })
    return () => { active = false; data?.subscription?.unsubscribe?.() }
  }, [])

  const signInWithMicrosoft = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: `${window.location.origin}/app?new=1`, scopes: 'openid email profile' }
    })
    if (error) throw error
    if (data?.url) window.location.href = data.url
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return { user, sessionChecked, signInWithMicrosoft, signOut }
}

