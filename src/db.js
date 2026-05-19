import { supabase } from './supabase'

const hashPassword = async (password) => {
  const encoder = new TextEncoder()
  const data = encoder.encode('roxpulse_v1_' + password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const getStoredClientId = () => localStorage.getItem('rxp:cid')
export const setStoredClientId = (id) => localStorage.setItem('rxp:cid', id)
export const clearStoredSession = () => { localStorage.removeItem('rxp:cid'); localStorage.removeItem('rxp:friends') }

export const db = {

  /* ── AUTH ──────────────────────────────────────────────── */
  async checkUsernameAvailable(username) {
    const { data } = await supabase.from('profiles').select('client_id').ilike('name', username).maybeSingle()
    return !data
  },

  async signup(profile, password) {
    const available = await db.checkUsernameAvailable(profile.name)
    if (!available) return { error: 'Ce pseudo est déjà pris.' }
    const clientId = crypto.randomUUID()
    const hash = await hashPassword(password)
    const { data, error } = await supabase
      .from('profiles')
      .insert({ client_id: clientId, ...profile, username: profile.name, password_hash: hash, joined_at: Date.now() })
      .select().single()
    if (error) return { error: 'Erreur lors de la création.' }
    setStoredClientId(clientId)
    return { data, clientId }
  },

  async login(username, password) {
    const hash = await hashPassword(password)
    const { data } = await supabase
      .from('profiles').select('*').ilike('name', username).eq('password_hash', hash).maybeSingle()
    if (!data) return { error: 'Pseudo ou mot de passe incorrect.' }
    setStoredClientId(data.client_id)
    return { data, clientId: data.client_id }
  },

  /* ── PROFILE ───────────────────────────────────────────── */
  async getProfile(clientId) {
    const { data } = await supabase.from('profiles').select('*').eq('client_id', clientId).maybeSingle()
    return data
  },

  async updateProfileStats(clientId, stats) {
    await supabase.from('profiles').update(stats).eq('client_id', clientId)
  },

  async getAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('client_id,name,city,color,avatar_emoji,bio_objective,bio_motto,bio_race_date,bio_race_city,workout_count,points,rox_score,joined_at')
      .order('points', { ascending: false })
    return data || []
  },

  /* ── WORKOUTS ──────────────────────────────────────────── */
  async getWorkouts(clientId) {
    const { data } = await supabase.from('workouts').select('*').eq('client_id', clientId).order('date')
    return data || []
  },

  async addWorkout(clientId, workout) {
    const { data } = await supabase
      .from('workouts')
      .insert({ id: `w${Date.now()}`, client_id: clientId, date: Date.now(), ...workout })
      .select().single()
    return data
  },

  /* ── ACTIVITY FEED ─────────────────────────────────────── */
  async getRecentActivity() {
    const since = Date.now() - 48 * 3600 * 1000
    const { data: workouts } = await supabase
      .from('workouts')
      .select('*, profiles(name, color, avatar_emoji, rox_score)')
      .gte('date', since)
      .order('date', { ascending: false })
      .limit(30)
    if (!workouts) return []
    return workouts.map(w => ({
      ...w,
      name: w.profiles?.name || '?',
      color: w.profiles?.color,
      avatar_emoji: w.profiles?.avatar_emoji,
      rox: w.profiles?.rox_score || 0,
    }))
  },

  /* ── SESSIONS ──────────────────────────────────────────── */
  async getSessions() {
    const { data } = await supabase.from('sessions').select('*').order('date')
    return data || []
  },

  async addSession(session) {
    const { data } = await supabase
      .from('sessions')
      .insert({ id: `s${Date.now()}`, participants: [], ...session })
      .select().single()
    return data
  },

  async joinSession(sessionId, clientId) {
    const { data: s } = await supabase.from('sessions').select('participants').eq('id', sessionId).single()
    if (!s || s.participants.includes(clientId)) return null
    const { data } = await supabase
      .from('sessions')
      .update({ participants: [...s.participants, clientId] })
      .eq('id', sessionId).select().single()
    return data
  },

  async updateSessionWorkout(sessionId, workout) {
    const { data } = await supabase.from('sessions').update({ workout }).eq('id', sessionId).select().single()
    return data
  },

  /* ── SESSION RESULTS ───────────────────────────────────── */
  async getSessionResults(sessionId) {
    const { data } = await supabase
      .from('session_results').select('*').eq('session_id', sessionId).order('effort_score', { ascending: false })
    return data || []
  },

  async upsertSessionResult(sessionId, clientId, result) {
    const { data } = await supabase
      .from('session_results')
      .upsert({ session_id: sessionId, client_id: clientId, ...result }, { onConflict: 'session_id,client_id' })
      .select().single()
    return data
  },

  /* ── FRIENDS ───────────────────────────────────────────── */
  getFriends()      { return JSON.parse(localStorage.getItem('rxp:friends') || '[]') },
  saveFriends(list) { localStorage.setItem('rxp:friends', JSON.stringify(list)) },
}
