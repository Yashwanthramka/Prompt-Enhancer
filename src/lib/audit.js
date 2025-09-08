// Lightweight client-side auth event logging to Supabase
// Requires DB table `auth_events` (see SQL in assistant message)
import { supabase } from './supabase'

const THROTTLES = {
  TOKEN_REFRESHED: 1000 * 60 * 60, // 1 hour
}

function shouldThrottle(key, ms) {
  if (!ms) return false
  try {
    const prev = sessionStorage.getItem(key)
    const now = Date.now()
    if (prev && now - Number(prev) < ms) return true
    sessionStorage.setItem(key, String(now))
  } catch {}
  return false
}

export async function logAuthEvent(event, session) {
  try {
    // Basic de-dupe per access token for non-refresh events
    const access = session?.access_token
    const dedupeKey = `authlog:${event}:${access?.slice(0, 18) || 'none'}`
    if (event !== 'TOKEN_REFRESHED') {
      if (sessionStorage.getItem(dedupeKey)) return
      try { sessionStorage.setItem(dedupeKey, '1') } catch {}
    } else {
      // Throttle frequent refresh events
      if (shouldThrottle('authlog:refresh:ts', THROTTLES.TOKEN_REFRESHED)) return
    }

    // Resolve user
    const user = session?.user || (await supabase.auth.getUser()).data?.user
    const user_id = user?.id
    if (!user_id) return

    const provider = user?.app_metadata?.provider || null
    const user_agent = typeof navigator !== 'undefined' ? navigator.userAgent : null
    const origin = typeof window !== 'undefined' ? window.location.origin : null

    await supabase.from('auth_events').insert({
      user_id,
      event,
      provider,
      user_agent,
      metadata: { origin },
    })
  } catch (err) {
    // Swallow errors to avoid UX impact
    // console.debug('logAuthEvent error', err)
  }
}

