import { supabase } from './supabase'

/* ── Hash mot de passe (SHA-256 + salt) ───────────────────── */
const hashPassword = async (password) => {
  const encoder = new TextEncoder()
  const data = encoder.encode('roxpulse_v1_' + password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/* ── Session locale ───────────────────────────────────────── */
export const getStoredClientId = () => localStorage.getItem('rxp:cid')
export const setStoredClientId = (id) => localStorage.setItem('rxp:cid', id)
export const clearStoredSession = () => { localStorage.removeItem('rxp:cid'); localStorage.removeItem('rxp:friends') }

export const db = {

  /* ── Auth ────────────────────────────────────────────── */
  async checkUsernameAvailable(username) {
    const { data } = await supabase.from('profiles').select('client_id').ilike('name', username).maybeSingle()
    return !data
  },

  async signup(profile, password) {
    const available = await db.checkUsernameAvailable(profile.name)
    if (!available) return { error: 'Ce nom est déjà pris. Choisis-en un autre.' }
    const clientId = crypto.randomUUID()
    const hash = await hashPassword(password)
    const { data, error } = await supabase
      .from('profiles')
      .insert({ client_id: clientId, ...profile, username: profile.name, password_hash: hash, joined_at: Date.now() })
      .select().single()
    if (error) return { error: 'Erreur lors de la création du profil.' }
    setStoredClientId(clientId)
    return { data, clientId }
  },

  async login(username, password) {
    const hash = await hashPassword(password)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', username)
      .eq('password_hash', hash)
      .maybeSingle()
    if (!data) return { error: 'Nom ou mot de passe incorrect.' }
    setStoredClientId(data.client_id)
    return { data, clientId: data.client_id }
  },

  async getProfile(clientId) {
    const { data } = await supabase.from('profiles').select('*').eq('client_id', clientId).maybeSingle()
    return data
  },

  async updateProfileStats(clientId, stats) {
    await supabase.from('profiles').update(stats).eq('client_id', clientId)
  },

  /* ── Entraînements ───────────────────────────────────── */
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

  /* ── Sessions de groupe ──────────────────────────────── */
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

  /* ── Résultats de session ────────────────────────────── */
  async getSessionResults(sessionId) {
    const { data } = await supabase
      .from('session_results').select('*').eq('session_id', sessionId).order('total_time')
    return data || []
  },
  async upsertSessionResult(sessionId, clientId, result) {
    const { data } = await supabase
      .from('session_results')
      .upsert({ session_id: sessionId, client_id: clientId, ...result }, { onConflict: 'session_id,client_id' })
      .select().single()
    return data
  },

  /* ── Communauté ──────────────────────────────────────── */
  async getAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('client_id,name,city,category,color,best_time,workout_count,points,joined_at')
      .order('points', { ascending: false })
    return data || []
  },

  /* ── Amis ────────────────────────────────────────────── */
  getFriends()      { return JSON.parse(localStorage.getItem('rxp:friends') || '[]') },
  saveFriends(list) { localStorage.setItem('rxp:friends', JSON.stringify(list)) },
}
