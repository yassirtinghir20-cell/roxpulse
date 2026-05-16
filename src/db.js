import { supabase } from './supabase'

/* ── Identifiant unique par navigateur (sans compte requis) ── */
export const getClientId = () => {
  let id = localStorage.getItem('rxp:cid')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('rxp:cid', id) }
  return id
}

export const db = {

  /* ── Profil ─────────────────────────────────────────── */
  async getProfile(clientId) {
    const { data } = await supabase.from('profiles').select('*').eq('client_id', clientId).maybeSingle()
    return data
  },
  async upsertProfile(clientId, profile) {
    const { data } = await supabase
      .from('profiles')
      .upsert({ client_id: clientId, ...profile, joined_at: Date.now() }, { onConflict: 'client_id' })
      .select().single()
    return data
  },
  async updateProfileStats(clientId, stats) {
    await supabase.from('profiles').update(stats).eq('client_id', clientId)
  },

  /* ── Entraînements personnels ────────────────────────── */
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

  /* ── Résultats de session (partagés en temps réel) ───── */
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

  /* ── Amis (stocké localement) ────────────────────────── */
  getFriends()      { return JSON.parse(localStorage.getItem('rxp:friends') || '[]') },
  saveFriends(list) { localStorage.setItem('rxp:friends', JSON.stringify(list)) },
}
