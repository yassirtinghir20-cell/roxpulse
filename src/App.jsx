import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { getStoredClientId, clearStoredSession, db } from "./db"
import { supabase } from "./supabase"

/* ══════════════════════════════════════════════════════════
   TOKENS
══════════════════════════════════════════════════════════ */
const C = {
  orange:"#FF4700", amber:"#FFB300", green:"#00C853", red:"#FF1744",
  blue:"#448AFF", purple:"#9C27B0",
  bg:"#080808", c1:"#111111", c2:"#191919", c3:"#222222",
  bd:"#2A2A2A", t1:"#F0F0F0", t2:"#888888", t3:"#3A3A3A",
}

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const SPORT_EMOJIS = [
  "🏃","🚴","🏋️","💪","🎯","⚡","🔥","🦁","🐯","🦅",
  "🏊","⛷️","🚣","🤸","🥊","🎽","🏅","⚔️","🌊","🌪️",
  "💎","👑","🦊","🐺","🦈","🐉","⚡","🌟","🔱","🏆"
]

const BLOCK_TYPES = [
  {id:"run",   icon:"🏃", label:"Course"},
  {id:"row",   icon:"🚣", label:"Rameur"},
  {id:"ski",   icon:"⛷️", label:"SkiErg"},
  {id:"sled",  icon:"🛷", label:"Sled"},
  {id:"carry", icon:"💪", label:"Carry"},
  {id:"jump",  icon:"🦘", label:"Sauts"},
  {id:"wall",  icon:"🧱", label:"Wall Balls"},
  {id:"bike",  icon:"🚴", label:"Vélo"},
  {id:"custom",icon:"⚡", label:"Autre"},
]

const INTENSITIES = [
  {id:"low",  label:"Léger",   color:C.green,  mult:1.0},
  {id:"med",  label:"Modéré",  color:C.amber,  mult:1.3},
  {id:"high", label:"Intense", color:C.orange, mult:1.6},
]

const LEVELS_DEF = [
  {name:"Rookie",     icon:"🌱", min:0,  max:20,  color:C.t2},
  {name:"Challenger", icon:"⚡", min:21, max:40,  color:C.green},
  {name:"Athlete",    icon:"🔥", min:41, max:60,  color:C.amber},
  {name:"Elite",      icon:"💎", min:61, max:80,  color:C.blue},
  {name:"HYROX Pro",  icon:"👑", min:81, max:100, color:C.orange},
]

const BIO_OBJECTIVES = [
  "Finir ma première HYROX","Passer sous 1h30","Passer sous 1h",
  "Perdre du poids","Améliorer mon cardio","Me dépasser chaque session",
  "Progresser régulièrement","Participer en équipe",
]

const SESSION_TYPES = ["Simulation complète","Force & Cardio","Running focus","Circuit libre"]
const LEVELS_SESSION = ["Tous niveaux","Rookie","Athlete","Elite","HYROX Pro"]
const VILLES = ["Casablanca","Rabat","Fès","Marrakech","Tanger","Agadir","Meknès","Oujda","Kénitra","Tétouan","Salé","Safi","El Jadida","Nador","Béni Mellal","Mohammadia","Settat","Khouribga","Laâyoune","Dakhla"]

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
const fmt = (s) => {
  if (!s && s !== 0) return "--:--"
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60
  return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
}
const fmtDate  = (ts) => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})
const fmtShort = (ts) => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})
const timeAgo  = (ts) => {
  const d = (Date.now()-ts)/1000
  if (d<60) return "à l'instant"
  if (d<3600) return `${Math.floor(d/60)}min`
  if (d<86400) return `${Math.floor(d/3600)}h`
  return fmtShort(ts)
}

const getLevel = (rox) => LEVELS_DEF.findLast(l => rox >= l.min) || LEVELS_DEF[0]

const calcEffortScore = (blocks=[]) => {
  if (!blocks.length) return 0
  const multMap = {low:1.0, med:1.3, high:1.6}
  const total = blocks.reduce((s,b) => {
    const secs = (b.minutes||0)*60 + (b.seconds||0)
    return s + secs * (multMap[b.intensity]||1.0)
  }, 0)
  return Math.round(total / 60)
}

const computeROX = (workouts) => {
  if (!workouts.length) return 0
  const sorted = [...workouts].sort((a,b) => a.date - b.date)
  const vol  = Math.min(25, workouts.length * 2.5)
  const recent = sorted.slice(-5)
  let imp = 0
  if (recent.length >= 2) {
    const scores = recent.map(w => w.effort_score || 0).filter(Boolean)
    if (scores.length >= 2) {
      const best = Math.max(...scores), worst = Math.min(...scores)
      imp = Math.min(35, Math.round(((best-worst)/Math.max(best,1))*220))
    }
  }
  let cons = 0
  if (sorted.length >= 2) {
    const spanW = (sorted[sorted.length-1].date - sorted[0].date)/(7*24*3600*1000)
    cons = Math.min(25, Math.round((workouts.length/Math.max(1,spanW))*12))
  }
  return Math.min(100, Math.round(vol+imp+cons+8))
}

/* ══════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════ */
const S = {
  card:    {background:C.c1, border:`1px solid ${C.bd}`, borderRadius:12},
  btn:     {background:C.orange, color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit", letterSpacing:"0.5px"},
  btnGhost:{background:"transparent", color:C.t1, border:`1px solid ${C.bd}`, borderRadius:8, padding:"9px 18px", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit"},
  input:   {background:C.c3, border:`1px solid ${C.bd}`, borderRadius:8, padding:"10px 14px", color:C.t1, fontSize:13, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box"},
  label:   {fontSize:11, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", color:C.t2, display:"block", marginBottom:6},
  tag:     (col) => ({background:col+"22", color:col, border:`1px solid ${col}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700, whiteSpace:"nowrap"}),
}

/* ══════════════════════════════════════════════════════════
   BASE COMPONENTS
══════════════════════════════════════════════════════════ */
function Avatar({emoji, color, name, size=40}) {
  const display = emoji || (name ? name.slice(0,2).toUpperCase() : "?")
  return (
    <div style={{width:size, height:size, borderRadius:"50%", background:color||C.c3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:emoji?size*0.5:size*0.32, color:"#fff", fontWeight:700, flexShrink:0, border:`2px solid ${C.bd}`}}>
      {display}
    </div>
  )
}

function StatCard({label, value, sub, accent}) {
  return (
    <div style={{...S.card, padding:"18px 20px"}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:8}}>{label}</div>
      <div style={{fontSize:28,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:accent||C.t1,letterSpacing:"-0.5px",lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:11,color:C.t2,marginTop:4}}>{sub}</div>}
    </div>
  )
}

function Loading({msg="Chargement…"}) {
  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,fontFamily:"sans-serif"}}>
      <div style={{fontSize:52,fontWeight:900,letterSpacing:"-2px",color:C.orange,fontFamily:"'Barlow Condensed',sans-serif"}}>ROXPULSE</div>
      <div style={{color:C.t2,fontSize:13}}>{msg}</div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   ⏱️ TIME PICKER (drum-roll style)
══════════════════════════════════════════════════════════ */
function DrumPicker({value, onChange, max, label}) {
  const interval = useRef(null)
  const start = (dir) => {
    onChange(v => Math.min(max, Math.max(0, v + dir)))
    interval.current = setInterval(() => onChange(v => Math.min(max, Math.max(0, v + dir))), 120)
  }
  const stop = () => clearInterval(interval.current)
  useEffect(() => () => clearInterval(interval.current), [])

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:64}}>
      <span style={{fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.t2}}>{label}</span>
      <button onMouseDown={()=>start(1)} onMouseUp={stop} onMouseLeave={stop} onTouchStart={()=>start(1)} onTouchEnd={stop}
        style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,width:52,height:34,cursor:"pointer",color:C.t1,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
        ▲
      </button>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:32,fontWeight:700,color:C.orange,width:64,textAlign:"center",background:C.c2,borderRadius:10,padding:"8px 0",border:`1px solid ${C.bd}`}}>
        {String(value).padStart(2,"0")}
      </div>
      <button onMouseDown={()=>start(-1)} onMouseUp={stop} onMouseLeave={stop} onTouchStart={()=>start(-1)} onTouchEnd={stop}
        style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,width:52,height:34,cursor:"pointer",color:C.t1,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
        ▼
      </button>
    </div>
  )
}

function TimePicker({minutes, seconds, onMinutes, onSeconds}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center",padding:"8px 0"}}>
      <DrumPicker value={minutes} onChange={onMinutes} max={99} label="min" />
      <div style={{fontSize:32,fontWeight:700,color:C.t2,marginTop:16}}>:</div>
      <DrumPicker value={seconds} onChange={onSeconds} max={59} label="sec" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🎨 EMOJI PICKER
══════════════════════════════════════════════════════════ */
function EmojiPicker({selected, onSelect, color, onColor}) {
  const COLORS = ["#FF4700","#FF6B9D","#00BFA5","#448AFF","#9C27B0","#FFB300","#00E676","#E91E63","#FF8C00","#00BCD4"]
  return (
    <div>
      <label style={S.label}>Avatar</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {SPORT_EMOJIS.map(e => (
          <div key={e} onClick={()=>onSelect(e)} style={{width:40,height:40,borderRadius:10,background:selected===e?C.orange+"22":C.c2,border:`2px solid ${selected===e?C.orange:C.bd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",transition:"all 0.1s"}}>
            {e}
          </div>
        ))}
      </div>
      <label style={{...S.label, marginTop:8}}>Couleur de fond</label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {COLORS.map(c => (
          <div key={c} onClick={()=>onColor(c)} style={{width:30,height:30,borderRadius:"50%",background:c,cursor:"pointer",border:color===c?"3px solid white":"3px solid transparent",transition:"border 0.1s"}} />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🔐 AUTH
══════════════════════════════════════════════════════════ */
function Auth({onAuth}) {
  const [mode,     setMode]     = useState("login")
  const [name,     setName]     = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [city,     setCity]     = useState("")
  const [emoji,    setEmoji]    = useState("🏃")
  const [color,    setColor]    = useState("#FF4700")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)

  const submit = async () => {
    setError(""); setLoading(true)
    if (!name.trim()||!password) { setError("Remplis tous les champs."); setLoading(false); return }
    if (mode==="signup") {
      if (password!==confirm) { setError("Mots de passe différents."); setLoading(false); return }
      if (password.length<6)  { setError("Min 6 caractères."); setLoading(false); return }
      const res = await db.signup({name:name.trim(), city, color, avatar_emoji:emoji}, password)
      if (res.error) { setError(res.error); setLoading(false); return }
      onAuth(res.data, res.clientId)
    } else {
      const res = await db.login(name.trim(), password)
      if (res.error) { setError(res.error); setLoading(false); return }
      onAuth(res.data, res.clientId)
    }
    setLoading(false)
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"sans-serif",color:C.t1}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;900&family=Barlow+Condensed:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{...S.card, maxWidth:480, width:"100%", padding:"40px 32px"}}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif", fontSize:42, fontWeight:900, letterSpacing:"-2px", color:C.orange}}>ROXPULSE</div>
          <div style={{color:C.t2, marginTop:4, fontSize:13}}>{mode==="login"?"Connecte-toi":"Rejoins la communauté"}</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:C.c3,borderRadius:10,padding:4,marginBottom:24}}>
          {[["login","Se connecter"],["signup","Créer un compte"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setMode(m);setError("")}} style={{background:mode===m?C.c1:"transparent",color:mode===m?C.t1:C.t2,border:`1px solid ${mode===m?C.bd:"transparent"}`,borderRadius:8,padding:"8px 0",cursor:"pointer",fontWeight:mode===m?700:400,fontSize:13,fontFamily:"inherit"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <label style={S.label}>Pseudo</label>
            <input style={S.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Omar" onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>

          {mode==="signup" && (
            <>
              <div>
                <label style={S.label}>Ville</label>
                <select style={{...S.input,cursor:"pointer",appearance:"none"}} value={city} onChange={e=>setCity(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {VILLES.map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <EmojiPicker selected={emoji} onSelect={setEmoji} color={color} onColor={setColor}/>
            </>
          )}

          <div>
            <label style={S.label}>Mot de passe</label>
            <input type="password" style={S.input} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>
          {mode==="signup" && (
            <div>
              <label style={S.label}>Confirmer</label>
              <input type="password" style={S.input} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </div>
          )}

          {error && <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red}}>⚠️ {error}</div>}

          <button disabled={loading} style={{...S.btn,width:"100%",padding:"14px",fontSize:14,marginTop:4,opacity:loading?0.5:1}} onClick={submit}>
            {loading?"…":mode==="login"?"Se connecter →":"Créer mon compte →"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🏋️ WORKOUT BLOCK
══════════════════════════════════════════════════════════ */
function BlockCard({block, onChange, onRemove, idx}) {
  const [open, setOpen] = useState(idx===0)
  const type = BLOCK_TYPES.find(t=>t.id===block.type)||BLOCK_TYPES[0]
  const intensity = INTENSITIES.find(i=>i.id===block.intensity)||INTENSITIES[1]
  const totalSecs = (block.minutes||0)*60+(block.seconds||0)

  return (
    <div style={{...S.card, overflow:"hidden"}}>
      <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer",background:open?C.c2:"transparent"}}>
        <span style={{fontSize:24}}>{type.icon}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:14,color:C.t1}}>{type.label}</div>
          <div style={{fontSize:12,color:C.t2,marginTop:2}}>
            {totalSecs>0 ? fmt(totalSecs) : "--:--"} · <span style={{color:intensity.color}}>{intensity.label}</span>
          </div>
        </div>
        <button onClick={(e)=>{e.stopPropagation();onRemove()}} style={{background:"transparent",border:"none",color:C.t3,cursor:"pointer",fontSize:18,padding:"0 4px"}}>✕</button>
        <span style={{color:C.t2,fontSize:12}}>{open?"▲":"▼"}</span>
      </div>

      {open && (
        <div style={{padding:"16px",borderTop:`1px solid ${C.bd}`}}>
          {/* Type selector */}
          <label style={S.label}>Type d'exercice</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            {BLOCK_TYPES.map(t=>(
              <button key={t.id} onClick={()=>onChange({...block,type:t.id})}
                style={{background:block.type===t.id?C.orange+"22":"transparent",border:`2px solid ${block.type===t.id?C.orange:C.bd}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",fontFamily:"inherit",color:block.type===t.id?C.orange:C.t2,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18}}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Duration */}
          <label style={S.label}>Durée</label>
          <div style={{background:C.c2,borderRadius:12,padding:"16px",marginBottom:16}}>
            <TimePicker
              minutes={block.minutes||0} seconds={block.seconds||0}
              onMinutes={fn=>onChange({...block,minutes:typeof fn==="function"?fn(block.minutes||0):fn})}
              onSeconds={fn=>onChange({...block,seconds:typeof fn==="function"?fn(block.seconds||0):fn})}
            />
          </div>

          {/* Intensity */}
          <label style={S.label}>Intensité</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {INTENSITIES.map(i=>(
              <button key={i.id} onClick={()=>onChange({...block,intensity:i.id})}
                style={{background:block.intensity===i.id?i.color+"22":"transparent",border:`2px solid ${block.intensity===i.id?i.color:C.bd}`,borderRadius:8,padding:"10px",cursor:"pointer",fontFamily:"inherit",color:block.intensity===i.id?i.color:C.t2,fontWeight:700,fontSize:13}}>
                {i.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🔥 LOG WORKOUT
══════════════════════════════════════════════════════════ */
function LogWorkout({onAdd}) {
  const newBlock = () => ({id:`b${Date.now()}`,type:"run",minutes:0,seconds:0,intensity:"med"})
  const [blocks, setBlocks] = useState([newBlock()])
  const [notes,  setNotes]  = useState("")
  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)

  const totalSecs = blocks.reduce((s,b)=>(s+(b.minutes||0)*60+(b.seconds||0)),0)
  const effortScore = calcEffortScore(blocks)

  const addBlock = () => setBlocks(p=>[...p,newBlock()])
  const updateBlock = (id,data) => setBlocks(p=>p.map(b=>b.id===id?data:b))
  const removeBlock = (id) => setBlocks(p=>p.filter(b=>b.id!==id))

  const save = async () => {
    if (!totalSecs||saving) return
    setSaving(true)
    await onAdd({blocks, total_time:totalSecs, effort_score:effortScore, notes})
    setBlocks([newBlock()]); setNotes(""); setSaving(false)
    setSaved(true); setTimeout(()=>setSaved(false),3000)
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:16}}>Ma séance</div>
          <div style={{fontSize:12,color:C.t2,marginTop:2}}>{blocks.length} bloc(s) d'exercice</div>
        </div>
        <button onClick={()=>setBlocks([newBlock()])} style={{...S.btnGhost,fontSize:12,padding:"7px 14px"}}>↺ Reset</button>
      </div>

      {blocks.map((b,i)=>(
        <BlockCard key={b.id} block={b} idx={i} onChange={(d)=>updateBlock(b.id,d)} onRemove={()=>removeBlock(b.id)}/>
      ))}

      <button onClick={addBlock} style={{...S.btnGhost,display:"flex",alignItems:"center",gap:8,justifyContent:"center",width:"100%",padding:"14px",border:`2px dashed ${C.bd}`}}>
        <span style={{fontSize:20}}>+</span> Ajouter un bloc
      </button>

      <div style={{...S.card,padding:"16px 18px"}}>
        <label style={S.label}>Notes</label>
        <textarea style={{...S.input,minHeight:48,resize:"vertical",fontSize:13}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Sensations, contexte…"/>
      </div>

      <div style={{...S.card,padding:"18px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:C.t2,letterSpacing:"1px"}}>Durée totale</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:32,fontWeight:700,color:totalSecs?C.orange:C.t3,letterSpacing:"-1px"}}>{fmt(totalSecs)}</div>
          {effortScore>0&&<div style={{fontSize:12,color:C.amber,marginTop:2}}>Score d'effort : {effortScore} pts</div>}
        </div>
        {saved ? <div style={{color:C.green,fontWeight:700}}>✓ Enregistrée !</div>
          : <button style={{...S.btn,opacity:totalSecs&&!saving?1:0.4}} onClick={save}>{saving?"…":"Enregistrer →"}</button>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   📊 DASHBOARD
══════════════════════════════════════════════════════════ */
function Dashboard({workouts, profile}) {
  const sorted = [...workouts].sort((a,b)=>a.date-b.date)
  const rox = computeROX(workouts)
  const level = getLevel(rox)
  const nextLevel = LEVELS_DEF[LEVELS_DEF.indexOf(level)+1]
  const best = workouts.length ? Math.max(...workouts.map(w=>w.effort_score||0)) : 0
  const last = sorted[sorted.length-1]
  const prev = sorted[sorted.length-2]
  const diff = last&&prev ? (last.effort_score||0)-(prev.effort_score||0) : 0

  const chartData = sorted.slice(-8).map(w=>({name:fmtShort(w.date), score:w.effort_score||0}))

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Level card */}
      <div style={{...S.card,padding:"24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:`linear-gradient(90deg,${level.color},${level.color}44)`}}/>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:52}}>{level.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>Ton niveau</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:36,fontWeight:900,color:level.color,letterSpacing:"-1px"}}>{level.name}</div>
            <div style={{fontSize:12,color:C.t2,marginTop:2}}>ROX Score : <span style={{color:level.color,fontWeight:700}}>{rox}/100</span></div>
          </div>
          {nextLevel && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:C.t2}}>Prochain niveau</div>
              <div style={{fontSize:16}}>{nextLevel.icon} {nextLevel.name}</div>
              <div style={{fontSize:11,color:C.t2,marginTop:4}}>dans {nextLevel.min-rox} pts</div>
            </div>
          )}
        </div>
        <div style={{background:C.c3,borderRadius:20,height:6,marginTop:14,overflow:"hidden"}}>
          <div style={{width:`${rox}%`,height:"100%",background:`linear-gradient(90deg,${level.color}88,${level.color})`,borderRadius:20,transition:"width 0.8s"}}/>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <StatCard label="Sessions" value={workouts.length} sub="total"/>
        <StatCard label="Score max" value={best} sub="effort" accent={C.orange}/>
        <StatCard label="Progression" value={diff>=0?`+${diff}`:diff} sub="vs dernière" accent={diff>=0?C.green:C.red}/>
        <StatCard label="Points" value={(workouts.length*180).toLocaleString()} sub="communauté" accent={C.amber}/>
      </div>

      {/* Chart */}
      {chartData.length>1&&(
        <div style={{...S.card,padding:"20px 22px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>Score d'effort (8 dernières sessions)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid stroke={C.bd} strokeDasharray="3 3"/>
              <XAxis dataKey="name" tick={{fill:C.t2,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.t2,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8}}/>
              <Line type="monotone" dataKey="score" name="Effort" stroke={C.orange} strokeWidth={2.5} dot={{fill:C.orange,r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent */}
      <div style={{...S.card,padding:"20px 22px"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>Sessions récentes</div>
        {[...sorted].reverse().slice(0,5).map((w,i)=>(
          <div key={w.id} style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:i<4?`1px solid ${C.bd}`:"none"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:13}}>{fmtDate(w.date)}</div>
              <div style={{fontSize:11,color:C.t2,marginTop:2}}>
                {(w.blocks||[]).map(b=>BLOCK_TYPES.find(t=>t.id===b.type)?.icon||"⚡").join(" ")} · {fmt(w.total_time||0)}
              </div>
              {w.notes&&<div style={{fontSize:11,color:C.t3,marginTop:2,fontStyle:"italic"}}>{w.notes}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:18,color:i===0?C.green:C.t1}}>{w.effort_score||0}</div>
              <div style={{fontSize:10,color:C.t2}}>pts effort</div>
            </div>
          </div>
        ))}
        {!workouts.length&&<div style={{color:C.t2,fontSize:13,textAlign:"center",padding:"20px 0"}}>Lance ta première session ! 💪</div>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🌐 ACTIVITY FEED + COMMUNITY
══════════════════════════════════════════════════════════ */
function Community({clientId, myProfile, myWorkouts, community, friends, onFriendToggle, onViewProfile, recentActivity}) {
  const [tab, setTab] = useState("feed")

  const rox = computeROX(myWorkouts)
  const myLevel = getLevel(rox)
  const myBest = myWorkouts.length ? Math.max(...myWorkouts.map(w=>w.effort_score||0)) : 0
  const myPts = myWorkouts.length*180
  const me = {client_id:"me", name:myProfile.name, avatar_emoji:myProfile.avatar_emoji, color:myProfile.color, best_score:myBest, workout_count:myWorkouts.length, points:myPts, rox}

  const allProfiles = [...community.filter(p=>p.client_id!==clientId), me].sort((a,b)=>(b.points||0)-(a.points||0))

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8}}>
        {[["feed","🌐 Fil"],["ranking","🏆 Classement"],["friends","👥 Amis"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{background:tab===v?C.orange:"transparent",color:tab===v?"#fff":C.t2,border:`1px solid ${tab===v?C.orange:C.bd}`,borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>

      {tab==="feed" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {recentActivity.length===0&&(
            <div style={{...S.card,padding:"40px",textAlign:"center",color:C.t2}}>
              <div style={{fontSize:32,marginBottom:10}}>🌐</div>
              <div>Aucune activité récente — commence par une session !</div>
            </div>
          )}
          {recentActivity.map((a,i)=>{
            const lvl = getLevel(a.rox||0)
            return (
              <div key={i} style={{...S.card,padding:"16px 18px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <Avatar emoji={a.avatar_emoji} color={a.color} size={42}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:14}}>{a.name}</span>
                    <span style={S.tag(lvl.color)}>{lvl.icon} {lvl.name}</span>
                    <span style={{fontSize:11,color:C.t2,marginLeft:"auto"}}>{timeAgo(a.date)}</span>
                  </div>
                  <div style={{fontSize:13,color:C.t2}}>
                    A complété une séance de <span style={{color:C.t1,fontWeight:600}}>{fmt(a.total_time||0)}</span>
                    {" · "}Score d'effort : <span style={{color:C.amber,fontWeight:700}}>{a.effort_score||0} pts</span>
                  </div>
                  {a.blocks&&a.blocks.length>0&&(
                    <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                      {a.blocks.map((b,j)=>{
                        const t=BLOCK_TYPES.find(x=>x.id===b.type)||BLOCK_TYPES[0]
                        const inten=INTENSITIES.find(x=>x.id===b.intensity)||INTENSITIES[1]
                        return (
                          <span key={j} style={{background:inten.color+"18",border:`1px solid ${inten.color}44`,borderRadius:6,padding:"3px 10px",fontSize:11,color:inten.color}}>
                            {t.icon} {(b.minutes||0)}:{String(b.seconds||0).padStart(2,"0")}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {a.notes&&<div style={{fontSize:11,color:C.t3,marginTop:6,fontStyle:"italic"}}>"{a.notes}"</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab==="ranking" && (
        <div style={{...S.card,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.bd}`,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>
            {allProfiles.length} athlète(s)
          </div>
          {allProfiles.map((u,i)=>{
            const lvl=getLevel(u.rox||computeROX([]))
            const isMe=u.client_id==="me"
            const isFriend=friends.includes(u.client_id)
            const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`
            return (
              <div key={u.client_id} onClick={()=>onViewProfile(u)} style={{display:"flex",alignItems:"center",padding:"12px 20px",background:isMe?C.orange+"10":"transparent",borderLeft:`3px solid ${isMe?C.orange:"transparent"}`,gap:12,borderBottom:i<allProfiles.length-1?`1px solid ${C.bd}`:"none",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=isMe?C.orange+"18":C.c2+"80"}
                onMouseLeave={e=>e.currentTarget.style.background=isMe?C.orange+"10":"transparent"}>
                <div style={{width:28,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:i<3?C.amber:C.t3,fontSize:i<3?17:12}}>{medal}</div>
                <Avatar emoji={u.avatar_emoji} color={u.color} name={u.name} size={38}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                    {u.name}
                    {isMe&&<span style={{...S.tag(C.orange),fontSize:9}}>TOI</span>}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:3}}>
                    <span style={S.tag(lvl.color)}>{lvl.icon} {lvl.name}</span>
                    {u.city&&<span style={{fontSize:11,color:C.t2}}>📍{u.city}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",marginRight:8}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:16,color:C.t1}}>{(u.points||0).toLocaleString()}</div>
                  <div style={{fontSize:10,color:C.t2}}>pts</div>
                </div>
                {!isMe&&(
                  <button onClick={(e)=>{e.stopPropagation();onFriendToggle(u.client_id)}} style={{background:isFriend?C.green+"22":"transparent",color:isFriend?C.green:C.t3,border:`1px solid ${isFriend?C.green:C.bd}`,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    {isFriend?"✓ Ami":"+ Ajouter"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab==="friends" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {allProfiles.filter(u=>u.client_id==="me"||friends.includes(u.client_id)).map((u,i)=>{
            const lvl=getLevel(u.rox||0)
            const isMe=u.client_id==="me"
            return (
              <div key={u.client_id} onClick={()=>onViewProfile(u)} style={{...S.card,padding:"14px 18px",display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
                <Avatar emoji={u.avatar_emoji} color={u.color} name={u.name} size={46}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{u.name} {isMe&&"(Toi)"}</div>
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    <span style={S.tag(lvl.color)}>{lvl.icon} {lvl.name}</span>
                    <span style={{fontSize:11,color:C.t2}}>{u.workout_count||0} sessions</span>
                  </div>
                </div>
                <span style={{color:C.t2,fontSize:12}}>Voir →</span>
              </div>
            )
          })}
          {friends.length===0&&(
            <div style={{...S.card,padding:"40px",textAlign:"center",color:C.t2}}>
              <div style={{fontSize:32,marginBottom:10}}>👥</div>
              <div>Ajoute des amis depuis le classement !</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   📅 PLANNING
══════════════════════════════════════════════════════════ */
function SessionDetail({session, clientId, myProfile, onBack, onUpdateWorkout, onLogResult}) {
  const isAdmin = session.organizer_client_id === clientId
  const isJoined = session.participants.includes(clientId) || isAdmin
  const [results, setResults] = useState([])
  const [logMode, setLogMode] = useState(false)
  const [myBlocks, setMyBlocks] = useState([{id:"lb0",type:"run",minutes:0,seconds:0,intensity:"med"}])
  const [saved, setSaved] = useState(false)
  const myResult = results.find(r=>r.client_id===clientId)

  const newBlock = () => ({id:`lb${Date.now()}`,type:"run",minutes:0,seconds:0,intensity:"med"})

  const loadResults = async () => {
    const data = await db.getSessionResults(session.id)
    setResults(data)
  }

  useEffect(() => {
    loadResults()
    const ch = supabase.channel(`res:${session.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"session_results",filter:`session_id=eq.${session.id}`},loadResults)
      .subscribe()
    return () => supabase.removeChannel(ch)
  },[session.id])

  const saveResult = async () => {
    const totalSecs = myBlocks.reduce((s,b)=>(s+(b.minutes||0)*60+(b.seconds||0)),0)
    if (!totalSecs) return
    const score = calcEffortScore(myBlocks)
    await onLogResult(session.id, clientId, {user_name:myProfile.name, color:myProfile.color, avatar_emoji:myProfile.avatar_emoji, total_time:totalSecs, effort_score:score, blocks:myBlocks, logged_at:Date.now()})
    setLogMode(false); setSaved(true); setTimeout(()=>setSaved(false),4000)
  }

  const sorted = [...results].sort((a,b)=>(b.effort_score||0)-(a.effort_score||0))
  const d = new Date(session.date)

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <button onClick={onBack} style={{...S.btnGhost,alignSelf:"flex-start",fontSize:12,padding:"7px 14px"}}>← Retour</button>

      <div style={{...S.card,padding:"22px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900}}>{session.title}</div>
            <div style={{fontSize:13,color:C.t2,marginTop:4}}>📍 {session.location}</div>
            <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
              <span style={S.tag(C.orange)}>{session.type}</span>
              <span style={S.tag(C.t2)}>{session.level}</span>
              <span style={{fontSize:11,color:C.t2}}>👥 {session.participants.length}/{session.max_p}</span>
              {isAdmin&&<span style={S.tag(C.amber)}>👑 Admin</span>}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:30,fontWeight:900,color:C.orange}}>{d.getDate()} {d.toLocaleString("fr-FR",{month:"short"})}</div>
            <div style={{fontSize:12,color:C.t2}}>{d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>Résultats · {sorted.length} soumis</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {saved&&<span style={{color:C.green,fontWeight:700,fontSize:12}}>✓ Soumis !</span>}
            {myResult&&<span style={S.tag(C.green)}>✓ Soumis</span>}
            {isJoined&&!myResult&&!logMode&&<button onClick={()=>setLogMode(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>+ Mon résultat</button>}
          </div>
        </div>

        {sorted.map((r,i)=>{
          const isMe=r.client_id===clientId
          const lvl=getLevel(r.rox||0)
          const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`
          return (
            <div key={r.client_id||i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",background:isMe?C.orange+"11":"transparent",borderLeft:`3px solid ${isMe?C.orange:"transparent"}`,borderBottom:i<sorted.length-1?`1px solid ${C.bd}`:"none"}}>
              <div style={{fontSize:i<3?18:12,width:24,textAlign:"center",color:i<3?C.amber:C.t3,fontWeight:700}}>{medal}</div>
              <Avatar emoji={r.avatar_emoji} color={r.color} name={r.user_name} size={36}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13}}>{r.user_name} {isMe&&<span style={{...S.tag(C.orange),fontSize:9}}>TOI</span>}</div>
                <div style={{fontSize:11,color:C.t2,marginTop:2}}>
                  {(r.blocks||[]).map(b=>BLOCK_TYPES.find(t=>t.id===b.type)?.icon||"⚡").join(" ")} · {fmt(r.total_time||0)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:20,color:i===0?C.amber:isMe?C.orange:C.t1}}>{r.effort_score||0}</div>
                <div style={{fontSize:10,color:C.t2}}>pts effort</div>
              </div>
            </div>
          )
        })}

        {sorted.length===0&&!logMode&&(
          <div style={{padding:"32px",textAlign:"center",color:C.t2,fontSize:13}}>
            {isJoined?"Sois le premier ! 🚀":"Inscris-toi pour participer."}
          </div>
        )}

        {logMode&&(
          <div style={{padding:"20px",borderTop:`1px solid ${C.bd}`,background:C.c2+"50"}}>
            <div style={{fontWeight:700,marginBottom:14}}>Saisir ma séance</div>
            {myBlocks.map((b,i)=>(
              <BlockCard key={b.id} block={b} idx={i} onChange={(d)=>setMyBlocks(p=>p.map(x=>x.id===b.id?d:x))} onRemove={()=>setMyBlocks(p=>p.filter(x=>x.id!==b.id))}/>
            ))}
            <button onClick={()=>setMyBlocks(p=>[...p,newBlock()])} style={{...S.btnGhost,width:"100%",margin:"10px 0",padding:"10px"}}>+ Bloc</button>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setLogMode(false)} style={{...S.btnGhost,fontSize:12,padding:"8px 14px"}}>Annuler</button>
              <button onClick={saveResult} style={S.btn}>Valider →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Schedule({clientId, myProfile, sessions, onAdd, onJoin, onUpdateWorkout, onLogResult}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({title:"",date:"",location:"",type:SESSION_TYPES[0],level:LEVELS_SESSION[0],maxP:"12"})
  const [selected, setSelected] = useState(null)
  const [ok, setOk] = useState(false)

  const create = async () => {
    if (!form.title||!form.date||!form.location) return
    await onAdd({...form,max_p:parseInt(form.maxP)||12,date:new Date(form.date).getTime(),organizer_name:myProfile.name,organizer_client_id:clientId})
    setForm({title:"",date:"",location:"",type:SESSION_TYPES[0],level:LEVELS_SESSION[0],maxP:"12"})
    setOpen(false); setOk(true); setTimeout(()=>setOk(false),3000)
  }

  const upcoming = sessions.filter(s=>s.date>Date.now()).sort((a,b)=>a.date-b.date)
  const past     = sessions.filter(s=>s.date<=Date.now()).sort((a,b)=>b.date-a.date).slice(0,3)

  if (selected) {
    const session = sessions.find(s=>s.id===selected)
    if (!session) { setSelected(null); return null }
    return <SessionDetail session={session} clientId={clientId} myProfile={myProfile} onBack={()=>setSelected(null)} onUpdateWorkout={(wk)=>onUpdateWorkout(selected,wk)} onLogResult={onLogResult}/>
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,color:C.t2}}>{upcoming.length} session(s) à venir</div>
        <div style={{display:"flex",gap:8}}>
          {ok&&<span style={{color:C.green,fontWeight:700}}>✓ Créée !</span>}
          <button style={{...S.btn,...(open?{background:C.c3,color:C.t1,border:`1px solid ${C.bd}`}:{})}} onClick={()=>setOpen(!open)}>
            {open?"✕ Annuler":"+ Organiser"}
          </button>
        </div>
      </div>

      {open&&(
        <div style={{...S.card,padding:"24px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:20}}>Nouvelle session</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={S.label}>Nom</label>
              <input style={S.input} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex: HYROX Fès – Samedi matin"/>
            </div>
            <div>
              <label style={S.label}>Date & heure</label>
              <input type="datetime-local" style={S.input} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            </div>
            <div>
              <label style={S.label}>Lieu</label>
              <input style={S.input} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Salle Atlas, Fès"/>
            </div>
            <div>
              <label style={S.label}>Type</label>
              <select style={{...S.input,cursor:"pointer"}} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                {SESSION_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Niveau requis</label>
              <select style={{...S.input,cursor:"pointer"}} value={form.level} onChange={e=>setForm({...form,level:e.target.value})}>
                {LEVELS_SESSION.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Places max</label>
              <input type="number" style={S.input} value={form.maxP} onChange={e=>setForm({...form,maxP:e.target.value})} min={2} max={50}/>
            </div>
          </div>
          <button style={{...S.btn,marginTop:20}} onClick={create}>Créer la session</button>
        </div>
      )}

      {upcoming.length===0&&!open&&(
        <div style={{...S.card,padding:"48px",textAlign:"center",color:C.t2}}>
          <div style={{fontSize:36,marginBottom:12}}>📅</div>
          <div style={{fontWeight:600,fontSize:15}}>Aucune session à venir</div>
          <div style={{fontSize:13,marginTop:6}}>Sois le premier à organiser une session !</div>
        </div>
      )}

      {upcoming.map(s=>{
        const joined=s.participants.includes(clientId)||s.organizer_client_id===clientId
        const full=s.participants.length>=s.max_p
        const d=new Date(s.date)
        return (
          <div key={s.id} onClick={()=>setSelected(s.id)} style={{...S.card,padding:"18px 20px",display:"flex",gap:14,cursor:"pointer",alignItems:"flex-start"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
            <div style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:52,flexShrink:0}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:C.orange,lineHeight:1}}>{d.getDate()}</div>
              <div style={{fontSize:10,color:C.t2,fontWeight:700,textTransform:"uppercase"}}>{d.toLocaleString("fr-FR",{month:"short"})}</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:15}}>{s.title}</div>
              <div style={{fontSize:12,color:C.t2,marginTop:3}}>📍 {s.location}</div>
              <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <span style={S.tag(C.orange)}>{s.type}</span>
                <span style={S.tag(C.t2)}>{s.level}</span>
                <span style={{fontSize:11,color:C.t2}}>👥 {s.participants.length}/{s.max_p}</span>
                {s.organizer_client_id===clientId&&<span style={S.tag(C.amber)}>👑</span>}
              </div>
              <div style={{fontSize:11,color:C.t3,marginTop:6}}>par {s.organizer_name} · {d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{flexShrink:0}}>
              {joined ? <span style={{color:C.green,fontWeight:700,fontSize:12}}>✓ Inscrit</span>
                : <button style={{...S.btn,padding:"8px 14px",fontSize:11,opacity:full?0.4:1}} onClick={e=>{e.stopPropagation();!full&&onJoin(s.id)}} disabled={full}>{full?"Complet":"S'inscrire"}</button>}
            </div>
          </div>
        )
      })}

      {past.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,margin:"8px 0"}}>Sessions passées</div>
          {past.map(s=>{
            const d=new Date(s.date)
            return (
              <div key={s.id} onClick={()=>setSelected(s.id)} style={{...S.card,padding:"14px 18px",display:"flex",gap:12,cursor:"pointer",opacity:0.7,marginBottom:8}}
                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.borderColor=C.orange}}
                onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.borderColor=C.bd}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{s.title}</div>
                  <div style={{fontSize:11,color:C.t2}}>{d.toLocaleDateString("fr-FR")} · {s.location}</div>
                </div>
                <span style={{fontSize:11,color:C.t2}}>Voir résultats →</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   👤 PROFILE PAGE
══════════════════════════════════════════════════════════ */
function ProfilePage({user, workouts, isMe, onBack, onFriendToggle, isFriend, onSaveBio, onSaveAvatar}) {
  const rox = computeROX(workouts)
  const level = getLevel(rox)
  const sorted = [...workouts].sort((a,b)=>a.date-b.date)
  const bestScore = workouts.length ? Math.max(...workouts.map(w=>w.effort_score||0)) : 0

  const [editingBio, setEditingBio] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [bio, setBio] = useState({objective:user.bio_objective||"",motto:user.bio_motto||"",race_date:user.bio_race_date||"",race_city:user.bio_race_city||""})
  const [emoji, setEmoji] = useState(user.avatar_emoji||"🏃")
  const [color, setColor] = useState(user.color||C.orange)

  const saveBio = async () => { await onSaveBio(bio); setEditingBio(false) }
  const saveAvatar = async () => { await onSaveAvatar({avatar_emoji:emoji,color}); setEditingAvatar(false) }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {onBack&&<button onClick={onBack} style={{...S.btnGhost,alignSelf:"flex-start",fontSize:12,padding:"7px 14px"}}>← Retour</button>}

      {/* Header */}
      <div style={{...S.card,padding:"28px 24px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:`linear-gradient(90deg,${level.color},${level.color}44)`}}/>
        <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          <div style={{position:"relative"}}>
            <Avatar emoji={user.avatar_emoji||emoji} color={user.color||color} size={80}/>
            {isMe&&(
              <button onClick={()=>setEditingAvatar(!editingAvatar)} style={{position:"absolute",bottom:-4,right:-4,background:C.c2,border:`1px solid ${C.bd}`,borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",color:C.t1}}>✏️</button>
            )}
          </div>
          <div style={{flex:1,minWidth:160}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:30,fontWeight:900}}>{user.name}</div>
              {isMe&&<span style={S.tag(C.orange)}>Mon profil</span>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <span style={S.tag(level.color)}>{level.icon} {level.name}</span>
              {user.city&&<span style={{fontSize:12,color:C.t2}}>📍 {user.city}</span>}
            </div>
            <div style={{fontSize:11,color:C.t3,marginTop:6}}>Membre depuis {user.joined_at?new Date(user.joined_at).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}):"--"}</div>
          </div>
          {!isMe&&(
            <button onClick={onFriendToggle} style={{...S.btn,background:isFriend?"transparent":C.orange,color:isFriend?C.green:C.t1,border:`1px solid ${isFriend?C.green:C.orange}`}}>
              {isFriend?"✓ Ami":"+ Ajouter"}
            </button>
          )}
        </div>

        {/* Avatar editor */}
        {editingAvatar&&isMe&&(
          <div style={{marginTop:20,borderTop:`1px solid ${C.bd}`,paddingTop:16}}>
            <EmojiPicker selected={emoji} onSelect={setEmoji} color={color} onColor={setColor}/>
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={()=>setEditingAvatar(false)} style={{...S.btnGhost,fontSize:12,padding:"7px 14px"}}>Annuler</button>
              <button onClick={saveAvatar} style={{...S.btn,fontSize:12,padding:"7px 18px"}}>Sauvegarder</button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <StatCard label="Sessions" value={workouts.length}/>
        <StatCard label="ROX Score" value={rox} sub={level.name} accent={level.color}/>
        <StatCard label="Meilleur effort" value={bestScore} accent={C.orange}/>
        <StatCard label="Points" value={(workouts.length*180).toLocaleString()} accent={C.amber}/>
      </div>

      {/* Bio */}
      <div style={{...S.card,padding:"20px 22px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>📝 Ma bio</div>
          {isMe&&!editingBio&&<button onClick={()=>setEditingBio(true)} style={{...S.btnGhost,fontSize:11,padding:"5px 12px"}}>Modifier</button>}
        </div>

        {editingBio ? (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={S.label}>Mon objectif</label>
              <select style={{...S.input,cursor:"pointer"}} value={bio.objective} onChange={e=>setBio({...bio,objective:e.target.value})}>
                <option value="">— Choisir —</option>
                {BIO_OBJECTIVES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Ma devise (60 car. max)</label>
              <input style={S.input} value={bio.motto} onChange={e=>setBio({...bio,motto:e.target.value.slice(0,60)})} placeholder="Ex: No excuses, just results"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={S.label}>Prochaine race</label>
                <input type="date" style={S.input} value={bio.race_date} onChange={e=>setBio({...bio,race_date:e.target.value})}/>
              </div>
              <div>
                <label style={S.label}>Ville de la race</label>
                <input style={S.input} value={bio.race_city} onChange={e=>setBio({...bio,race_city:e.target.value})} placeholder="Ex: Casablanca"/>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditingBio(false)} style={{...S.btnGhost,fontSize:12,padding:"8px 16px"}}>Annuler</button>
              <button onClick={saveBio} style={{...S.btn,fontSize:12}}>Sauvegarder</button>
            </div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {user.bio_objective&&<div style={{display:"flex",gap:10}}><span style={{fontSize:16}}>🎯</span><div><div style={{fontSize:11,color:C.t2}}>Objectif</div><div style={{fontSize:14,color:C.t1,fontWeight:500}}>{user.bio_objective}</div></div></div>}
            {user.bio_motto&&<div style={{display:"flex",gap:10}}><span style={{fontSize:16}}>💬</span><div><div style={{fontSize:11,color:C.t2}}>Devise</div><div style={{fontSize:14,color:C.t1,fontStyle:"italic"}}>"{user.bio_motto}"</div></div></div>}
            {user.bio_race_date&&<div style={{display:"flex",gap:10}}><span style={{fontSize:16}}>🏆</span><div><div style={{fontSize:11,color:C.t2}}>Prochaine race</div><div style={{fontSize:14,color:C.orange,fontWeight:600}}>{new Date(user.bio_race_date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})} — {user.bio_race_city}</div></div></div>}
            {!user.bio_objective&&!user.bio_motto&&!user.bio_race_date&&(
              <div style={{color:C.t3,fontSize:13,textAlign:"center",padding:"12px 0"}}>
                {isMe?"Clique sur Modifier pour compléter ta bio 👆":"Aucune bio renseignée"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      {workouts.length>0&&(
        <div style={{...S.card,padding:"20px 22px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>📋 Historique</div>
          {[...sorted].reverse().slice(0,6).map((w,i)=>(
            <div key={w.id} style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:i<5&&i<workouts.length-1?`1px solid ${C.bd}`:"none"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13}}>{fmtDate(w.date)}</div>
                <div style={{fontSize:11,color:C.t2,marginTop:2}}>
                  {(w.blocks||[]).map(b=>BLOCK_TYPES.find(t=>t.id===b.type)?.icon||"⚡").join(" ")} · {fmt(w.total_time||0)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:18,color:i===0?C.green:C.t1}}>{w.effort_score||0}</div>
                <div style={{fontSize:10,color:C.t2}}>pts effort</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   🚀 APP
══════════════════════════════════════════════════════════ */
export default function App() {
  const [clientId,       setClientId]       = useState(null)
  const [profile,        setProfile]        = useState(null)
  const [workouts,       setWorkouts]       = useState([])
  const [sessions,       setSessions]       = useState([])
  const [community,      setCommunity]      = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [friends,        setFriends]        = useState(db.getFriends())
  const [tab,            setTab]            = useState("community")
  const [viewingUser,    setViewingUser]    = useState(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    (async () => {
      const id = getStoredClientId()
      if (id) {
        const [prof, wkts, sess, comm, activity] = await Promise.all([
          db.getProfile(id),
          db.getWorkouts(id),
          db.getSessions(),
          db.getAllProfiles(),
          db.getRecentActivity(),
        ])
        if (prof) {
          setClientId(id); setProfile(prof)
          setWorkouts(wkts); setSessions(sess)
          setCommunity(comm); setRecentActivity(activity)
        }
      }
      setLoading(false)
    })()
  },[])

  const handleAuth = async (profileData, cid) => {
    setClientId(cid); setProfile(profileData)
    const [wkts, sess, comm, activity] = await Promise.all([
      db.getWorkouts(cid), db.getSessions(), db.getAllProfiles(), db.getRecentActivity()
    ])
    setWorkouts(wkts); setSessions(sess); setCommunity(comm); setRecentActivity(activity)
  }

  const handleLogout = () => {
    clearStoredSession()
    setClientId(null); setProfile(null); setWorkouts([])
  }

  const handleAddWorkout = async (workout) => {
    const saved = await db.addWorkout(clientId, workout)
    if (saved) {
      const updated = [...workouts, saved]
      setWorkouts(updated)
      const rox = computeROX(updated)
      const pts = updated.length * 180
      await db.updateProfileStats(clientId, {workout_count:updated.length, points:pts, rox_score:rox})
      setProfile(p=>({...p, workout_count:updated.length, points:pts, rox_score:rox}))
      const activity = await db.getRecentActivity()
      setRecentActivity(activity)
    }
  }

  const handleAddSession = async (s) => {
    const saved = await db.addSession(s)
    if (saved) setSessions(p=>[...p,saved])
  }

  const handleJoinSession = async (id) => {
    const updated = await db.joinSession(id, clientId)
    if (updated) setSessions(p=>p.map(s=>s.id===id?updated:s))
  }

  const handleUpdateWorkout = async (sessionId, workout) => {
    const updated = await db.updateSessionWorkout(sessionId, workout)
    if (updated) setSessions(p=>p.map(s=>s.id===sessionId?updated:s))
  }

  const handleLogResult = async (sessionId, cid, result) => {
    await db.upsertSessionResult(sessionId, cid, result)
  }

  const handleFriendToggle = (cid) => {
    const updated = friends.includes(cid)?friends.filter(f=>f!==cid):[...friends,cid]
    setFriends(updated); db.saveFriends(updated)
  }

  const handleSaveBio = async (bio) => {
    await db.updateProfileStats(clientId, {bio_objective:bio.objective, bio_motto:bio.motto, bio_race_date:bio.race_date, bio_race_city:bio.race_city})
    setProfile(p=>({...p, ...bio}))
  }

  const handleSaveAvatar = async (data) => {
    await db.updateProfileStats(clientId, data)
    setProfile(p=>({...p,...data}))
  }

  if (loading)  return <Loading/>
  if (!profile) return <Auth onAuth={handleAuth}/>

  const NAV = [
    {id:"community", label:"Communauté", icon:"🌐"},
    {id:"schedule",  label:"Planning",   icon:"📅"},
    {id:"log",       label:"Session",    icon:"🔥"},
    {id:"dashboard", label:"Stats",      icon:"📊"},
  ]

  const rox = computeROX(workouts)
  const level = getLevel(rox)

  return (
    <div style={{background:C.bg, minHeight:"100vh", fontFamily:"sans-serif", color:C.t1}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;900&family=Barlow+Condensed:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:4px}`}</style>

      <div style={{background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"0 20px",display:"flex",alignItems:"center",position:"sticky",top:0,zIndex:100}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:24,color:C.orange,letterSpacing:"-0.5px",paddingRight:24,marginRight:4,borderRight:`1px solid ${C.bd}`,paddingTop:14,paddingBottom:14}}>ROXPULSE</div>
        <nav style={{display:"flex",gap:0,flex:1,paddingLeft:8}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>{setViewingUser(null);setTab(n.id)}} style={{background:"transparent",border:"none",borderBottom:tab===n.id&&!viewingUser?`2px solid ${C.orange}`:"2px solid transparent",color:tab===n.id&&!viewingUser?C.t1:C.t2,padding:"14px 12px",cursor:"pointer",fontWeight:tab===n.id?700:400,fontSize:13,fontFamily:"inherit",whiteSpace:"nowrap"}}>
              <span style={{marginRight:4}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:12}}>
          <div onClick={()=>{setViewingUser(null);setTab("profile")}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"8px",borderRadius:8}} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <Avatar emoji={profile.avatar_emoji} color={profile.color} name={profile.name} size={30}/>
            <div style={{display:"flex",flexDirection:"column"}}>
              <span style={{fontSize:12,fontWeight:600,lineHeight:1.2}}>{profile.name}</span>
              <span style={{fontSize:10,color:level.color}}>{level.icon} {level.name}</span>
            </div>
          </div>
          <button onClick={handleLogout} title="Déconnexion" style={{background:"transparent",border:`1px solid ${C.bd}`,borderRadius:8,color:C.t3,cursor:"pointer",fontSize:16,padding:"6px 10px"}} onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.t3}>⏻</button>
        </div>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
        {viewingUser ? (
          <ProfilePage
            user={viewingUser}
            workouts={[]}
            isMe={viewingUser.client_id===clientId}
            onBack={()=>setViewingUser(null)}
            isFriend={friends.includes(viewingUser.client_id)}
            onFriendToggle={()=>handleFriendToggle(viewingUser.client_id)}
            onSaveBio={handleSaveBio}
            onSaveAvatar={handleSaveAvatar}
          />
        ) : tab==="profile" ? (
          <ProfilePage
            user={{...profile,client_id:clientId}}
            workouts={workouts}
            isMe={true}
            onBack={()=>setTab("dashboard")}
            onSaveBio={handleSaveBio}
            onSaveAvatar={handleSaveAvatar}
          />
        ) : tab==="dashboard" ? <Dashboard workouts={workouts} profile={profile}/>
          : tab==="log"       ? <LogWorkout onAdd={handleAddWorkout}/>
          : tab==="community" ? <Community clientId={clientId} myProfile={profile} myWorkouts={workouts} community={community} friends={friends} onFriendToggle={handleFriendToggle} onViewProfile={setViewingUser} recentActivity={recentActivity}/>
          : tab==="schedule"  ? <Schedule clientId={clientId} myProfile={profile} sessions={sessions} onAdd={handleAddSession} onJoin={handleJoinSession} onUpdateWorkout={handleUpdateWorkout} onLogResult={handleLogResult}/>
          : null}
      </div>
    </div>
  )
}
