import { useState, useEffect, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, CartesianGrid } from "recharts"
import { getClientId, db } from "./db"
import { supabase } from "./supabase"

/* ── TOKENS ─────────────────────────────────────────────── */
const C = {
  orange:"#FF4700", amber:"#FFB300", green:"#00C853", red:"#FF1744",
  bg:"#080808", c1:"#111111", c2:"#191919", c3:"#222222",
  bd:"#2A2A2A", t1:"#F0F0F0", t2:"#888888", t3:"#3A3A3A",
}

/* ── DONNÉES ─────────────────────────────────────────────── */
const STATIONS = [
  {id:"skierg",    name:"SkiErg",        sub:"1000m"},
  {id:"sled_push", name:"Sled Push",     sub:"50m"},
  {id:"sled_pull", name:"Sled Pull",     sub:"50m"},
  {id:"burpee",    name:"Burpee B.J.",   sub:"80m"},
  {id:"rowing",    name:"Rowing",        sub:"1000m"},
  {id:"farmers",   name:"Farmers Carry", sub:"200m"},
  {id:"lunges",    name:"S. Lunges",     sub:"100m"},
  {id:"wallballs", name:"Wall Balls",    sub:"75 reps"},
]
const AVATAR_COLORS = ["#FF4700","#FF6B9D","#00BFA5","#448AFF","#9C27B0","#FFB300","#00E676","#E91E63"]
const CATEGORIES    = ["Débutant","Niveau moyen","Avancé"]
const SESSION_TYPES = ["Simulation complète","Stations uniquement","Running + Stations","Force & Endurance"]
const LEVELS        = ["Tous niveaux","Débutant","Niveau moyen","Avancé"]
const CAT_COLOR     = {"Débutant":C.green,"Niveau moyen":C.amber,"Avancé":C.orange}
const VILLES        = ["Casablanca","Rabat","Fès","Marrakech","Tanger","Agadir","Meknès","Oujda","Kénitra","Tétouan","Salé","Safi","El Jadida","Nador","Béni Mellal","Mohammadia","Settat","Khouribga","Laâyoune","Dakhla"]

/* ── HELPERS ─────────────────────────────────────────────── */
const fmt = (s) => {
  if (!s) return "--:--"
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60
  return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
}
const parseT = (str) => {
  if (!str) return 0
  const p=str.split(":").map(Number)
  return p.length===3 ? p[0]*3600+p[1]*60+p[2] : (p[0]||0)*60+(p[1]||0)
}
const fmtDate  = (ts) => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})
const fmtShort = (ts) => new Date(ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})

/* ── 🏆 ROX SCORE ────────────────────────────────────────── */
const computeROX = (workouts) => {
  if (!workouts.length) return 0
  const sorted = [...workouts].sort((a,b) => a.date - b.date)
  const vol  = Math.min(25, workouts.length * 2.5)
  const recent = sorted.slice(-5)
  let imp = 0
  if (recent.length >= 2) {
    const worst = Math.max(...recent.map(w=>w.total_time))
    const best  = Math.min(...recent.map(w=>w.total_time))
    imp = Math.min(35, Math.round(((worst-best)/worst)*220))
  }
  let cons = 0
  if (sorted.length >= 2) {
    const spanW = (sorted[sorted.length-1].date - sorted[0].date)/(7*24*3600*1000)
    cons = Math.min(25, Math.round((workouts.length/Math.max(1,spanW))*12))
  }
  let bal = 8
  const last = sorted[sorted.length-1]
  if (last?.stations) {
    const vals = Object.values(last.stations).filter(v=>v>0)
    if (vals.length >= 4) {
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length
      bal = Math.round(Math.max(0, 15*(1-Math.max(...vals.map(v=>Math.abs(v-avg)/avg)))))
    }
  }
  return Math.min(100, Math.round(vol+imp+cons+bal))
}

/* ── STYLES ──────────────────────────────────────────────── */
const S = {
  card:    {background:C.c1, border:`1px solid ${C.bd}`, borderRadius:12},
  btn:     {background:C.orange, color:"#fff", border:"none", borderRadius:8, padding:"10px 20px", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:"inherit", letterSpacing:"0.5px", textTransform:"uppercase"},
  btnGhost:{background:"transparent", color:C.t1, border:`1px solid ${C.bd}`, borderRadius:8, padding:"9px 18px", fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit"},
  input:   {background:C.c3, border:`1px solid ${C.bd}`, borderRadius:8, padding:"10px 14px", color:C.t1, fontSize:13, fontFamily:"'JetBrains Mono',monospace", outline:"none", width:"100%", boxSizing:"border-box"},
  label:   {fontSize:11, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", color:C.t2, display:"block", marginBottom:6},
  tag:     (col) => ({background:col+"22", color:col, border:`1px solid ${col}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700, letterSpacing:"0.5px", whiteSpace:"nowrap"}),
}

/* ── COMPOSANTS UTILITAIRES ──────────────────────────────── */
function Avatar({name, color, size=36}) {
  const ini = name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:size*0.35,color:"#fff",flexShrink:0}}>{ini}</div>
}

function StatCard({label, value, sub, accent}) {
  return (
    <div style={{...S.card, padding:"20px 22px"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:8}}>{label}</div>
      <div style={{fontSize:30,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:accent||C.t1,letterSpacing:"-0.5px",lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:12,color:C.t2,marginTop:4}}>{sub}</div>}
    </div>
  )
}

const Toggle = ({on, onClick}) => (
  <div onClick={onClick} style={{width:36,height:20,borderRadius:10,background:on?C.orange:C.c3,border:`1px solid ${on?C.orange:C.bd}`,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
    <div style={{position:"absolute",top:2,left:on?18:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}} />
  </div>
)

const ChartTip = ({active, payload, label}) => {
  if (!active||!payload?.length) return null
  return (
    <div style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,padding:"8px 14px"}}>
      <div style={{fontSize:12,color:C.t2,marginBottom:4}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{fontSize:14,fontWeight:600,color:p.color}}>{p.name}: {p.value} min</div>)}
    </div>
  )
}

/* ── LOADING ─────────────────────────────────────────────── */
function Loading({msg="Chargement…"}) {
  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,fontFamily:"'Barlow Condensed',sans-serif"}}>
      <div style={{fontSize:52,fontWeight:900,letterSpacing:"-2px",color:C.orange}}>ROXPULSE</div>
      <div style={{color:C.t2,fontSize:13,fontFamily:"'Barlow',sans-serif"}}>{msg}</div>
    </div>
  )
}

/* ── ONBOARDING ──────────────────────────────────────────── */
function Onboarding({onSave}) {
  const [name, setName]         = useState("")
  const [city, setCity]         = useState("")
  const [category, setCategory] = useState("Débutant")
  const [color, setColor]       = useState(AVATAR_COLORS[0])
  const [saving, setSaving]     = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({name:name.trim(), city, category, color})
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Barlow',sans-serif",color:C.t1}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;900&family=Barlow+Condensed:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{...S.card, maxWidth:460, width:"100%", padding:"44px 36px"}}>
        <div style={{textAlign:"center", marginBottom:36}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif", fontSize:44, fontWeight:900, letterSpacing:"-2px", color:C.orange}}>ROXPULSE</div>
          <div style={{color:C.t2, marginTop:6, fontSize:14}}>Crée ton profil et rejoins la communauté</div>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:20}}>
          <div>
            <label style={S.label}>Prénom / Pseudo</label>
            <input style={S.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Omar Idrissi" />
          </div>
          <div>
            <label style={S.label}>Ville</label>
            <select style={{...S.input, cursor:"pointer", appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center"}} value={city} onChange={e=>setCity(e.target.value)}>
              <option value="">— Choisir une ville —</option>
              {VILLES.map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Niveau</label>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
              {CATEGORIES.map(cat=>(
                <button key={cat} onClick={()=>setCategory(cat)} style={{background:category===cat?C.orange+"22":"transparent", border:`2px solid ${category===cat?C.orange:C.bd}`, borderRadius:8, padding:10, cursor:"pointer", color:category===cat?C.orange:C.t2, fontWeight:700, fontSize:12, fontFamily:"inherit", transition:"all 0.15s"}}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={S.label}>Couleur avatar</label>
            <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
              {AVATAR_COLORS.map(col=>(
                <div key={col} onClick={()=>setColor(col)} style={{width:34,height:34,borderRadius:"50%",background:col,cursor:"pointer",border:color===col?"3px solid white":"3px solid transparent",transition:"border 0.1s"}} />
              ))}
            </div>
          </div>
          <button disabled={!name.trim()||saving} style={{...S.btn, width:"100%", padding:"14px", fontSize:14, marginTop:8, opacity:name.trim()&&!saving?1:0.4}} onClick={submit}>
            {saving ? "Création…" : "Créer mon profil →"}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 🏆 ROX METER ────────────────────────────────────────── */
function RoxMeter({score}) {
  const tier  = score>=80?"Légende":score>=60?"Elite":score>=40?"Pro":score>=20?"Confirmé":"Rookie"
  const color = score>=80?C.orange:score>=60?"#FF1744":score>=40?C.amber:score>=20?C.green:"#888"
  return (
    <div style={{...S.card, padding:"20px 22px", position:"relative", overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${color},${color}44)`}}/>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:12}}>🏆 ROX Score™</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:14}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:58,fontWeight:900,color,letterSpacing:"-2px",lineHeight:1}}>{score}</div>
        <div style={{marginBottom:10}}>
          <div style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:4,padding:"2px 8px",fontSize:12,fontWeight:700,display:"inline-block"}}>{tier}</div>
          <div style={{fontSize:11,color:C.t2,marginTop:4}}>/ 100 pts</div>
        </div>
      </div>
      <div style={{background:C.c3,borderRadius:20,height:6,overflow:"hidden"}}>
        <div style={{width:`${score}%`,height:"100%",background:`linear-gradient(90deg,${color}88,${color})`,borderRadius:20,transition:"width 0.8s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,color:C.t3}}>
        <span>Volume</span><span>Progression</span><span>Régularité</span><span>Équilibre</span>
      </div>
    </div>
  )
}

/* ── 👻 GHOST RUNNER ─────────────────────────────────────── */
function GhostRunner({workouts, vals, runningVal, activeStationIds}) {
  const ghost = useMemo(()=>{
    if (!workouts.length) return null
    return [...workouts].sort((a,b)=>a.total_time-b.total_time)[0]
  }, [workouts])
  if (!ghost?.stations) return null

  const rows = STATIONS.filter(s=>activeStationIds.includes(s.id)).map(s => {
    const g = ghost.stations[s.id]||0
    const me = parseT(vals[s.id])
    const diff = me&&g ? me-g : null
    return {...s, g, me, diff}
  })
  const ghostRun = ghost.running||0
  const myRun    = parseT(runningVal)
  const runDiff  = myRun&&ghostRun ? myRun-ghostRun : null

  const totalMe    = rows.reduce((a,r)=>a+(r.me||0),0)+(myRun||0)
  const totalGhost = rows.reduce((a,r)=>a+(r.g||0),0)+(ghostRun||0)
  const totalDiff  = totalMe&&totalGhost ? totalMe-totalGhost : null

  const DiffBadge = ({d}) => d===null ? null : (
    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:d<0?C.green:C.red,minWidth:60}}>
      {d<0?`-${fmt(-d)}`:`+${fmt(d)}`}
    </span>
  )

  return (
    <div style={{...S.card,padding:"18px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>👻 Ghost Runner</div>
        <div style={{fontSize:12,color:C.t2}}>
          vs PR du {fmtDate(ghost.date)} —&nbsp;
          <span style={{color:C.orange,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(ghost.total_time)}</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 70px",gap:4,marginBottom:8}}>
        <div style={{fontSize:10,color:C.t3,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>Station</div>
        <div style={{fontSize:10,color:C.t3,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",textAlign:"center"}}>👻 Ghost</div>
        <div style={{fontSize:10,color:C.t3,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",textAlign:"center"}}>Moi</div>
        <div style={{fontSize:10,color:C.t3,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",textAlign:"center"}}>Écart</div>
      </div>

      {ghostRun>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 70px",gap:4,padding:"6px 0",borderBottom:`1px solid ${C.bd}`,alignItems:"center"}}>
          <span style={{fontSize:12,color:C.t2}}>🏃 Running</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:C.t3,textAlign:"center"}}>{fmt(ghostRun)}</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:C.t1,textAlign:"center"}}>{myRun?fmt(myRun):"--"}</span>
          <div style={{textAlign:"center"}}><DiffBadge d={runDiff}/></div>
        </div>
      )}

      {rows.map((r,i)=>(
        <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 70px 70px",gap:4,padding:"6px 0",borderBottom:i<rows.length-1?`1px solid ${C.bd}`:"none",alignItems:"center"}}>
          <span style={{fontSize:12,color:C.t2}}>{r.name}</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:C.t3,textAlign:"center"}}>{r.g?fmt(r.g):"--"}</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:C.t1,textAlign:"center"}}>{r.me?fmt(r.me):"--"}</span>
          <div style={{textAlign:"center"}}><DiffBadge d={r.diff}/></div>
        </div>
      ))}

      {totalDiff!==null&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12,padding:"10px 14px",background:totalDiff<0?C.green+"11":C.red+"11",borderRadius:8,border:`1px solid ${totalDiff<0?C.green:C.red}22`}}>
          <span style={{fontSize:12,fontWeight:700,color:C.t2}}>Total vs ghost</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,fontWeight:700,color:totalDiff<0?C.green:C.red}}>
            {totalDiff<0?`-${fmt(-totalDiff)}`:`+${fmt(totalDiff)}`}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function Dashboard({workouts}) {
  const sorted = [...workouts].sort((a,b)=>a.date-b.date)
  const best   = workouts.length ? Math.min(...workouts.map(w=>w.total_time)) : null
  const last   = sorted[sorted.length-1]
  const prev   = sorted[sorted.length-2]
  const improve = prev&&last ? prev.total_time - last.total_time : 0
  const roxScore = computeROX(workouts)

  const chartData = sorted.map(w=>({name:fmtShort(w.date), min:Math.round(w.total_time/60)}))
  const lastS = last?.stations || {}
  const radar = STATIONS.map(s=>({
    s: s.name.replace(" B.J.","").replace("S. ","").replace(" Carry","").replace(" Balls",""),
    score: lastS[s.id] ? Math.max(20, Math.min(100, 100 - Math.round((lastS[s.id]-130)/2.2))) : 50,
  }))

  return (
    <div style={{display:"flex", flexDirection:"column", gap:14}}>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12}}>
        <StatCard label="Entraînements"  value={workouts.length}      sub="sessions totales" />
        <StatCard label="Meilleur temps" value={best?fmt(best):"--"}  sub="temps total"           accent={C.orange} />
        <StatCard label="Progression"    value={improve>0?`-${fmt(improve)}`:"+0:00"} sub="vs session préc."  accent={C.green} />
        <StatCard label="Points"         value={(workouts.length*180+(best?Math.round(7200/best*1000):0)).toLocaleString()} sub="classement communauté" accent={C.amber} />
      </div>

      {/* ROX Score — nouvelle ligne */}
      <RoxMeter score={roxScore} />

      <div style={{display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:12}}>
        <div style={{...S.card, padding:"20px 22px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>Évolution temps total (min)</div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={C.bd} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{fill:C.t2,fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:C.t2,fontSize:11}} axisLine={false} tickLine={false} domain={["dataMin-4","dataMax+4"]} />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="min" name="Temps" stroke={C.orange} strokeWidth={2.5} dot={{fill:C.orange,r:4}} activeDot={{r:6}} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center",color:C.t3,fontSize:13}}>Enregistre ta première session pour voir le graphique</div>}
        </div>
        <div style={{...S.card, padding:"20px 22px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>Profil stations (dernière session)</div>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radar}>
              <PolarGrid stroke={C.bd} />
              <PolarAngleAxis dataKey="s" tick={{fill:C.t2,fontSize:9}} />
              <Radar dataKey="score" stroke={C.orange} fill={C.orange} fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{...S.card, padding:"20px 22px"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:16}}>Sessions récentes</div>
        {[...sorted].reverse().slice(0,5).map((w,i)=>(
          <div key={w.id} style={{display:"flex",alignItems:"center",padding:"12px 0",borderBottom:i<4?`1px solid ${C.bd}`:"none"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14}}>{fmtDate(w.date)}</div>
              {w.notes && <div style={{fontSize:12,color:C.t2,marginTop:2}}>{w.notes}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:20,color:i===0?C.green:C.t1}}>{fmt(w.total_time)}</div>
              {i===0 && <div style={{fontSize:11,color:C.green}}>Dernière session</div>}
            </div>
          </div>
        ))}
        {!workouts.length && <div style={{textAlign:"center",color:C.t2,padding:"24px 0",fontSize:13}}>Aucune session enregistrée — vas dans l'onglet Entraînement !</div>}
      </div>
    </div>
  )
}

/* ── LOG WORKOUT ─────────────────────────────────────────── */
function LogWorkout({onAdd, workouts}) {
  const initActive = STATIONS.reduce((a,s)=>({...a,[s.id]:true}),{})
  const initVals   = STATIONS.reduce((a,s)=>({...a,[s.id]:""}),{})
  const initNames  = STATIONS.reduce((a,s)=>({...a,[s.id]:s.name}),{})
  const initSubs   = STATIONS.reduce((a,s)=>({...a,[s.id]:s.sub}),{})

  const [active,  setActive]  = useState(initActive)
  const [vals,    setVals]    = useState(initVals)
  const [names,   setNames]   = useState(initNames)
  const [subs,    setSubs]    = useState(initSubs)
  const [running, setRun]     = useState("")
  const [runAct,  setRunAct]  = useState(true)
  const [notes,   setNotes]   = useState("")
  const [saved,   setSaved]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [customs, setCustoms] = useState([])
  const [editing, setEditing] = useState(null)
  const [showGhost, setShowGhost] = useState(true)

 const activeStationIds = STATIONS.filter(s=>active[s.id]).map(s=>s.id)
  const addCustom = () => setCustoms(p=>[...p,{id:`cx${Date.now()}`,name:"Exercice",sub:"reps",val:"",active:true}]) 
  const updCx    = (id,f,v) => setCustoms(p=>p.map(c=>c.id===id?{...c,[f]:v}:c))
  const rmCx     = (id)     => setCustoms(p=>p.filter(c=>c.id!==id))

  const stdTotal  = STATIONS.filter(s=>active[s.id]).reduce((a,s)=>a+parseT(vals[s.id]),0)
  const cxTotal   = customs.filter(c=>c.active).reduce((a,c)=>a+parseT(c.val),0)
  const runTotal  = runAct ? parseT(running) : 0
  const total     = stdTotal + cxTotal + runTotal
  const actCount  = STATIONS.filter(s=>active[s.id]).length + customs.filter(c=>c.active).length + (runAct?1:0)

  const reset = () => { setActive(initActive); setVals(initVals); setNames(initNames); setSubs(initSubs); setRun(""); setRunAct(true); setNotes(""); setCustoms([]); setEditing(null) }

  const save = async () => {
    if (!total || saving) return
    setSaving(true)
    const st={}, meta=[]
    STATIONS.forEach(s=>{ if(active[s.id]){ st[s.id]=parseT(vals[s.id]); meta.push({id:s.id,name:names[s.id],sub:subs[s.id]}) } })
    customs.filter(c=>c.active).forEach(c=>{ st[c.id]=parseT(c.val); meta.push({id:c.id,name:c.name,sub:c.sub}) })
    await onAdd({total_time:total, stations:st, station_meta:meta, running:runTotal, notes})
    reset(); setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),3000)
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:16}}>Configurer l'entraînement</div>
          <div style={{fontSize:12,color:C.t2,marginTop:2}}>{actCount} exercice(s) actif(s)</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {workouts.length>0&&(
            <button onClick={()=>setShowGhost(!showGhost)} style={{...S.btnGhost,fontSize:12,padding:"7px 14px",color:showGhost?C.orange:C.t2,borderColor:showGhost?C.orange:C.bd}}>
              👻 Ghost {showGhost?"ON":"OFF"}
            </button>
          )}
          <button onClick={reset} style={{...S.btnGhost,fontSize:12,padding:"7px 14px"}}>↺ Réinitialiser</button>
        </div>
      </div>

      {workouts.length>0&&showGhost&&(
        <GhostRunner workouts={workouts} vals={vals} runningVal={running} activeStationIds={activeStationIds}/>
      )}

      {/* Running */}
      <div style={{...S.card,padding:"16px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:runAct?14:0}}>
          <Toggle on={runAct} onClick={()=>setRunAct(!runAct)} />
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:13,color:runAct?C.t1:C.t2}}>🏃 Running</div>
            <div style={{fontSize:11,color:C.t2}}>Segments de course entre les stations</div>
          </div>
        </div>
        {runAct && (
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <input style={{...S.input,width:140}} value={running} onChange={e=>setRun(e.target.value)} placeholder="MM:SS" />
            <span style={{fontSize:12,color:C.t2}}>temps total running</span>
          </div>
        )}
      </div>

      {/* Standard stations */}
      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bd}`,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>Stations HYROX standard</div>
        {STATIONS.map((s,i)=>(
          <div key={s.id} style={{borderBottom:i<STATIONS.length-1?`1px solid ${C.bd}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",background:active[s.id]?"transparent":C.bg+"80"}}>
              <Toggle on={active[s.id]} onClick={()=>setActive({...active,[s.id]:!active[s.id]})} />
              <div style={{flex:1,minWidth:0}}>
                {editing===s.id ? (
                  <div style={{display:"flex",gap:8}}>
                    <input style={{...S.input,padding:"5px 10px",fontSize:12,flex:1}} value={names[s.id]} onChange={e=>setNames({...names,[s.id]:e.target.value})} />
                    <input style={{...S.input,padding:"5px 10px",fontSize:12,width:80}} value={subs[s.id]} onChange={e=>setSubs({...subs,[s.id]:e.target.value})} />
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontWeight:600,fontSize:13,color:active[s.id]?C.t1:C.t2}}>{names[s.id]}</span>
                    <span style={{fontSize:11,color:C.orange,fontWeight:600}}>{subs[s.id]}</span>
                  </div>
                )}
              </div>
              {active[s.id] && (
                <>
                  <input style={{...S.input,width:100,padding:"7px 10px",fontSize:13}} value={vals[s.id]} onChange={e=>setVals({...vals,[s.id]:e.target.value})} placeholder="MM:SS" />
                  <button onClick={()=>setEditing(editing===s.id?null:s.id)} style={{background:"transparent",border:"none",color:editing===s.id?C.orange:C.t3,cursor:"pointer",fontSize:16,padding:"0 4px"}} title="Renommer">✏️</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Custom exercises */}
      {customs.length > 0 && (
        <div style={{...S.card,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.bd}`,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>Exercices personnalisés</div>
          {customs.map((c,i)=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:i<customs.length-1?`1px solid ${C.bd}`:"none"}}>
              <Toggle on={c.active} onClick={()=>updCx(c.id,"active",!c.active)} />
              <input style={{...S.input,flex:1,padding:"7px 10px",fontSize:13}} value={c.name} onChange={e=>updCx(c.id,"name",e.target.value)} placeholder="Nom" />
              <input style={{...S.input,width:80,padding:"7px 10px",fontSize:12}} value={c.sub} onChange={e=>updCx(c.id,"sub",e.target.value)} placeholder="Unité" />
              <input style={{...S.input,width:100,padding:"7px 10px",fontSize:13}} value={c.val} onChange={e=>updCx(c.id,"val",e.target.value)} placeholder="MM:SS" />
              <button onClick={()=>rmCx(c.id)} style={{background:"transparent",border:"none",color:C.t3,cursor:"pointer",fontSize:18,padding:"0 4px"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={addCustom} style={{...S.btnGhost,display:"flex",alignItems:"center",gap:8,justifyContent:"center",width:"100%",padding:"12px"}}>
        <span style={{fontSize:18}}>+</span> Ajouter un exercice personnalisé
      </button>

      <div style={{...S.card,padding:"18px"}}>
        <label style={S.label}>Notes</label>
        <textarea style={{...S.input,minHeight:56,resize:"vertical",fontFamily:"'Barlow',sans-serif",fontSize:13}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Sensations, PR, conditions météo…" />
      </div>

      <div style={{...S.card,padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.t2}}>Temps total</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:34,fontWeight:700,color:total?C.orange:C.t3,marginTop:4,letterSpacing:"-1px"}}>{fmt(total)}</div>
        </div>
        {saved
          ? <div style={{color:C.green,fontWeight:700,fontSize:14}}>✓ Session enregistrée !</div>
          : <button style={{...S.btn,fontSize:14,padding:"12px 28px",opacity:total&&!saving?1:0.4}} onClick={save}>{saving?"Sauvegarde…":"Enregistrer →"}</button>}
      </div>
    </div>
  )
}

/* ── COMMUNITY ───────────────────────────────────────────── */
function Community({clientId, myProfile, myWorkouts, community, friends, onFriendToggle}) {
  const [filter, setFilter] = useState("all")

  const best = myWorkouts.length ? Math.min(...myWorkouts.map(w=>w.total_time)) : 9999
  const pts  = myWorkouts.length*180 + (best<9999?Math.round(7200/best*1000):0)
  const me   = {client_id:"me", name:myProfile.name, city:myProfile.city, category:myProfile.category, color:myProfile.color, best_time:best<9999?best:null, workout_count:myWorkouts.length, points:pts}

  const all  = [...community.filter(p=>p.client_id!==clientId), me].sort((a,b)=>(b.points||0)-(a.points||0))
  const list = filter==="friends" ? all.filter(u=>u.client_id==="me"||friends.includes(u.client_id)) : all
  const rankOf = (u) => all.indexOf(u)+1

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8}}>
        {[["all","Classement global"],["friends","Mes amis"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{background:filter===v?C.orange:"transparent",color:filter===v?"#fff":C.t2,border:`1px solid ${filter===v?C.orange:C.bd}`,borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit",transition:"all 0.15s"}}>{l}</button>
        ))}
      </div>

      {list.length === 0 && (
        <div style={{...S.card,padding:"40px",textAlign:"center",color:C.t2}}>
          <div style={{fontSize:13}}>Invite tes amis à créer leur profil sur ROXPULSE pour les voir ici !</div>
        </div>
      )}

      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{padding:"14px 22px 4px",fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>{list.length} athlète(s)</div>
        {list.map((u,i)=>{
          const rank    = rankOf(u)
          const isMe    = u.client_id==="me"
          const isFriend= friends.includes(u.client_id)
          const medal   = rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":`#${rank}`
          return (
            <div key={u.client_id} style={{display:"flex",alignItems:"center",padding:"12px 22px",background:isMe?C.orange+"10":"transparent",borderLeft:`3px solid ${isMe?C.orange:"transparent"}`,gap:14,borderBottom:i<list.length-1?`1px solid ${C.bd}`:"none"}}>
              <div style={{width:32,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:rank<=3?C.amber:C.t3,fontSize:rank<=3?17:13}}>{medal}</div>
              <Avatar name={u.name} color={u.color} size={38} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
                  {u.name}
                  {isMe && <span style={{background:C.orange+"33",color:C.orange,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>TOI</span>}
                </div>
                <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={S.tag(CAT_COLOR[u.category]||C.t2)}>{u.category}</span>
                  {u.city && <span style={{fontSize:11,color:C.t2}}>📍 {u.city}</span>}
                  <span style={{fontSize:11,color:C.t2}}>{u.workout_count||0} sessions</span>
                </div>
              </div>
              <div style={{textAlign:"right",marginRight:8}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:17,color:C.t1}}>{u.best_time?fmt(u.best_time):"--"}</div>
                <div style={{fontSize:11,color:C.amber,fontWeight:700,marginTop:2}}>{(u.points||0).toLocaleString()} pts</div>
              </div>
              {!isMe && (
                <button onClick={()=>onFriendToggle(u.client_id)} style={{background:isFriend?C.green+"22":"transparent",color:isFriend?C.green:C.t3,border:`1px solid ${isFriend?C.green:C.bd}`,borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {isFriend?"✓ Ami":"+ Ajouter"}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── SESSION DETAIL ──────────────────────────────────────── */
function SessionDetail({session, clientId, myProfile, onBack, onUpdateWorkout, onLogResult}) {
  const isAdmin = session.organizer_client_id === clientId
  const isJoined= session.participants.includes(clientId) || isAdmin

  const defaultWorkout = {stations:STATIONS.map(s=>({...s,active:true})), hasRunning:true}
  const [workout,        setWorkout]        = useState(session.workout || defaultWorkout)
  const [editingWorkout, setEditingWorkout] = useState(false)
  const [results,        setResults]        = useState([])
  const [logMode,        setLogMode]        = useState(false)
  const [vals,           setVals]           = useState({})
  const [running,        setRunning]        = useState("")
  const [saved,          setSaved]          = useState(false)
  const [saving,         setSaving]         = useState(false)

  const myResult     = results.find(r=>r.client_id===clientId)
  const activeStations = workout.stations.filter(s=>s.active)
  const total = activeStations.reduce((a,s)=>a+parseT(vals[s.id]||""),0) + (workout.hasRunning?parseT(running):0)

  const loadResults = async () => {
    const data = await db.getSessionResults(session.id)
    setResults(data)
  }

  useEffect(() => {
    loadResults()
    // Real-time: see others' results appear live
    const channel = supabase
      .channel(`results:${session.id}`)
      .on("postgres_changes", {event:"*", schema:"public", table:"session_results", filter:`session_id=eq.${session.id}`}, loadResults)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session.id])

  const saveWorkout = async () => { await onUpdateWorkout(workout); setEditingWorkout(false) }

  const saveResult = async () => {
    if (!total||saving) return
    setSaving(true)
    const st={}; activeStations.forEach(s=>st[s.id]=parseT(vals[s.id]||""))
    await onLogResult(session.id, clientId, {user_name:myProfile.name, color:myProfile.color, total_time:total, stations:st, running:parseT(running), logged_at:Date.now()})
    setLogMode(false); setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),4000)
  }

  const sorted = [...results].sort((a,b)=>a.total_time-b.total_time)

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <button onClick={onBack} style={{...S.btnGhost,alignSelf:"flex-start",fontSize:12,padding:"7px 14px"}}>← Retour au planning</button>

      {/* Header */}
      <div style={{...S.card,padding:"22px 24px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
          <div>
            <div style={{fontWeight:900,fontSize:22,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"-0.5px"}}>{session.title}</div>
            <div style={{fontSize:13,color:C.t2,marginTop:4}}>📍 {session.location}</div>
            <div style={{display:"flex",gap:7,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
              <span style={S.tag(C.orange)}>{session.type}</span>
              <span style={S.tag(C.t2)}>{session.level}</span>
              <span style={{fontSize:12,color:C.t2}}>👥 {session.participants.length}/{session.max_p} inscrits</span>
              {isAdmin && <span style={S.tag(C.amber)}>👑 Admin</span>}
            </div>
            <div style={{fontSize:11,color:C.t3,marginTop:8}}>Organisé par {session.organizer_name}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:32,fontWeight:900,color:C.orange,lineHeight:1}}>
              {new Date(session.date).getDate()} {new Date(session.date).toLocaleString("fr-FR",{month:"short"})}
            </div>
            <div style={{fontSize:12,color:C.t2,marginTop:4}}>{new Date(session.date).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
          </div>
        </div>
      </div>

      {/* Workout config */}
      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>Programme</div>
            <div style={{fontSize:13,color:C.t1,marginTop:3,fontWeight:500}}>{activeStations.length} station(s){workout.hasRunning?" + running":""}</div>
          </div>
          {isAdmin && !editingWorkout && <button onClick={()=>setEditingWorkout(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>✏️ Modifier</button>}
          {isAdmin && editingWorkout && (
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditingWorkout(false)} style={{...S.btnGhost,fontSize:12,padding:"7px 12px"}}>Annuler</button>
              <button onClick={saveWorkout} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>✓ Valider</button>
            </div>
          )}
          {!isAdmin && <span style={{background:C.green+"22",color:C.green,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700}}>Défini par l'admin</span>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 20px",borderBottom:`1px solid ${C.bd}`,background:C.c2+"40"}}>
          {editingWorkout ? <Toggle on={workout.hasRunning} onClick={()=>setWorkout({...workout,hasRunning:!workout.hasRunning})} /> : <div style={{width:8,height:8,borderRadius:"50%",background:workout.hasRunning?C.green:C.t3,flexShrink:0}} />}
          <span style={{fontSize:13,fontWeight:600,color:workout.hasRunning?C.t1:C.t2}}>🏃 Running entre les stations</span>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {workout.stations.map((s,i)=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 20px",borderBottom:i<workout.stations.length-2?`1px solid ${C.bd}`:"none",borderRight:i%2===0?`1px solid ${C.bd}`:"none",background:s.active?"transparent":C.bg+"60",opacity:s.active?1:0.45}}>
              {editingWorkout ? <Toggle on={s.active} onClick={()=>setWorkout({...workout,stations:workout.stations.map(st=>st.id===s.id?{...st,active:!st.active}:st)})} /> : <div style={{width:8,height:8,borderRadius:"50%",background:s.active?C.orange:C.t3,flexShrink:0}} />}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:s.active?C.t1:C.t2}}>{s.name}</div>
                <div style={{fontSize:11,color:C.orange}}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      <div style={{...S.card,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2}}>
            Résultats en temps réel — {sorted.length} soumis
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {saved && <span style={{color:C.green,fontWeight:700,fontSize:12}}>✓ Résultat enregistré !</span>}
            {myResult && <span style={{background:C.green+"22",color:C.green,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700}}>✓ Ton résultat soumis</span>}
            {isJoined && !myResult && !logMode && (
              <button onClick={()=>setLogMode(true)} style={{...S.btn,fontSize:12,padding:"7px 16px"}}>+ Mon résultat</button>
            )}
          </div>
        </div>

        {sorted.length===0 && !logMode && (
          <div style={{padding:"32px",textAlign:"center",color:C.t2,fontSize:13}}>
            {isJoined ? "Sois le premier à soumettre ton résultat !" : "Inscris-toi pour soumettre ton résultat."}
          </div>
        )}

        {sorted.map((r,i)=>{
          const isMe  = r.client_id===clientId
          const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`
          return (
            <div key={r.id||r.client_id} style={{borderBottom:i<sorted.length-1?`1px solid ${C.bd}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",background:isMe?C.orange+"11":"transparent",borderLeft:`3px solid ${isMe?C.orange:"transparent"}`}}>
                <div style={{fontSize:i<3?18:13,width:28,textAlign:"center",fontWeight:700,color:i<3?C.amber:C.t3,fontFamily:"'JetBrains Mono',monospace"}}>{medal}</div>
                <Avatar name={r.user_name} color={r.color} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                    {r.user_name}
                    {isMe && <span style={{background:C.orange+"33",color:C.orange,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>TOI</span>}
                  </div>
                  <div style={{fontSize:11,color:C.t2,marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                    {workout.hasRunning && <span>🏃 {fmt(r.running)}</span>}
                    {activeStations.slice(0,4).map(s=>(
                      <span key={s.id}>{s.name.split(" ")[0]}: <span style={{color:C.t1,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(r.stations?.[s.id])}</span></span>
                    ))}
                  </div>
                </div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:22,fontWeight:700,color:i===0?C.amber:isMe?C.orange:C.t1}}>{fmt(r.total_time)}</div>
              </div>
            </div>
          )
        })}

        {logMode && (
          <div style={{padding:"20px",borderTop:`1px solid ${C.bd}`,background:C.c2+"50"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.t2,marginBottom:14}}>Saisir mon résultat</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {workout.hasRunning && (
                <div style={{gridColumn:"1/-1",background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 14px"}}>
                  <label style={S.label}>🏃 Running total</label>
                  <input style={{...S.input,width:140,background:C.c3}} value={running} onChange={e=>setRunning(e.target.value)} placeholder="MM:SS" />
                </div>
              )}
              {activeStations.map(s=>(
                <div key={s.id} style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 14px"}}>
                  <label style={S.label}>{s.name} <span style={{color:C.orange}}>{s.sub}</span></label>
                  <input style={{...S.input,background:C.c3}} value={vals[s.id]||""} onChange={e=>setVals({...vals,[s.id]:e.target.value})} placeholder="MM:SS" />
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:26,fontWeight:700,color:total?C.orange:C.t3}}>{fmt(total)}</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setLogMode(false)} style={{...S.btnGhost,fontSize:12,padding:"8px 14px"}}>Annuler</button>
                <button onClick={saveResult} style={{...S.btn,opacity:total&&!saving?1:0.4}}>{saving?"Envoi…":"Valider mon temps →"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── SCHEDULE ────────────────────────────────────────────── */
function Schedule({clientId, myProfile, sessions, onAdd, onJoin, onUpdateWorkout, onLogResult}) {
  const [open,     setOpen]     = useState(false)
  const [form,     setForm]     = useState({title:"",date:"",location:"",type:SESSION_TYPES[0],level:LEVELS[0],maxP:"10"})
  const [ok,       setOk]       = useState(false)
  const [selected, setSelected] = useState(null)

  const create = async () => {
    if (!form.title||!form.date||!form.location) return
    await onAdd({...form, max_p:parseInt(form.maxP)||10, date:new Date(form.date).getTime(), organizer_name:myProfile.name, organizer_client_id:clientId})
    setForm({title:"",date:"",location:"",type:SESSION_TYPES[0],level:LEVELS[0],maxP:"10"})
    setOpen(false); setOk(true); setTimeout(()=>setOk(false),3000)
  }

  const upcoming = sessions.filter(s=>s.date>Date.now()).sort((a,b)=>a.date-b.date)
  const TYPE_COL = {"Simulation complète":C.orange,"Stations uniquement":C.amber,"Running + Stations":C.green,"Force & Endurance":"#448AFF"}

  if (selected) {
    const session = sessions.find(s=>s.id===selected)
    if (!session) { setSelected(null); return null }
    return (
      <SessionDetail
        session={session} clientId={clientId} myProfile={myProfile}
        onBack={()=>setSelected(null)}
        onUpdateWorkout={(wk)=>onUpdateWorkout(selected,wk)}
        onLogResult={onLogResult}
      />
    )
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,color:C.t2}}>{upcoming.length} session(s) à venir · Clique pour voir le détail</div>
        <div style={{display:"flex",gap:8}}>
          {ok && <span style={{color:C.green,fontWeight:700,fontSize:13}}>✓ Créée !</span>}
          <button style={{...S.btn,...(open?{background:C.c3,color:C.t1,border:`1px solid ${C.bd}`}:{})}} onClick={()=>setOpen(!open)}>
            {open?"✕ Annuler":"+ Organiser"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{...S.card,padding:"24px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:C.t2,marginBottom:20}}>Nouvelle session de groupe</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={S.label}>Nom de la session</label>
              <input style={S.input} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex: HYROX Training Fès" />
            </div>
            <div>
              <label style={S.label}>Date & heure</label>
              <input type="datetime-local" style={S.input} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
            </div>
            <div>
              <label style={S.label}>Lieu</label>
              <input style={S.input} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Salle, adresse…" />
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
                {LEVELS.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Places max</label>
              <input type="number" style={S.input} value={form.maxP} onChange={e=>setForm({...form,maxP:e.target.value})} min={2} max={50} />
            </div>
          </div>
          <button style={{...S.btn,marginTop:20}} onClick={create}>Créer la session</button>
        </div>
      )}

      {upcoming.map(s=>{
        const joined = s.participants.includes(clientId)||s.organizer_client_id===clientId
        const full   = s.participants.length >= s.max_p
        const d      = new Date(s.date)
        return (
          <div key={s.id} onClick={()=>setSelected(s.id)} style={{...S.card,padding:"20px 22px",display:"flex",alignItems:"flex-start",gap:16,cursor:"pointer",transition:"border-color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.orange}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
            <div style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:54,flexShrink:0}}>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",color:C.orange,lineHeight:1}}>{d.getDate()}</div>
              <div style={{fontSize:10,color:C.t2,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>{d.toLocaleString("fr-FR",{month:"short"})}</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:15}}>{s.title}</div>
              <div style={{fontSize:12,color:C.t2,marginTop:3}}>📍 {s.location}</div>
              <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                <span style={S.tag(TYPE_COL[s.type]||C.amber)}>{s.type}</span>
                <span style={S.tag(C.t2)}>{s.level}</span>
                <span style={{fontSize:11,color:C.t2}}>👥 {s.participants.length}/{s.max_p}</span>
                {s.organizer_client_id===clientId && <span style={S.tag(C.amber)}>👑 Admin</span>}
              </div>
              <div style={{fontSize:11,color:C.t3,marginTop:6}}>Organisé par {s.organizer_name}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,flexShrink:0}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:C.t2}}>{d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
              {joined ? <span style={{color:C.green,fontWeight:700,fontSize:12}}>✓ Inscrit</span>
                : <button style={{...S.btn,padding:"7px 14px",fontSize:11,opacity:full?0.4:1}} onClick={e=>{e.stopPropagation();!full&&onJoin(s.id)}} disabled={full}>{full?"Complet":"S'inscrire"}</button>}
              <span style={{fontSize:11,color:C.t2}}>Voir détail →</span>
            </div>
          </div>
        )
      })}

      {!upcoming.length && !open && (
        <div style={{...S.card,padding:"48px",textAlign:"center",color:C.t2}}>
          <div style={{fontSize:36,marginBottom:12}}>📅</div>
          <div style={{fontWeight:600,fontSize:15}}>Aucune session programmée</div>
          <div style={{fontSize:13,marginTop:6}}>Organise la première session ROXPULSE de ta région !</div>
        </div>
      )}
    </div>
  )
}

/* ── APP PRINCIPAL ───────────────────────────────────────── */
export default function App() {
  const clientId = useMemo(() => getClientId(), [])

  const [profile,  setProfile]  = useState(null)
  const [workouts, setWorkouts] = useState([])
  const [sessions, setSessions] = useState([])
  const [community,setCommunity]= useState([])
  const [friends,  setFriends]  = useState(db.getFriends())
  const [tab,      setTab]      = useState("dashboard")
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    (async () => {
      const [prof, wkts, sess, comm] = await Promise.all([
        db.getProfile(clientId),
        db.getWorkouts(clientId),
        db.getSessions(),
        db.getAllProfiles(),
      ])
      setProfile(prof)
      setWorkouts(wkts)
      setSessions(sess)
      setCommunity(comm)
      setLoading(false)
    })()
  }, [clientId])

  const handleSaveProfile = async (data) => {
    const saved = await db.upsertProfile(clientId, data)
    setProfile(saved)
  }

  const handleAddWorkout = async (workout) => {
    const saved = await db.addWorkout(clientId, workout)
    if (saved) {
      const newWorkouts = [...workouts, saved]
      setWorkouts(newWorkouts)
      // Mise à jour des stats publiques du profil
      const best  = Math.min(profile?.best_time || Infinity, workout.total_time)
      const count = (profile?.workout_count || 0) + 1
      const pts   = count * 180 + Math.round(7200 / best * 1000)
      await db.updateProfileStats(clientId, {best_time:best, workout_count:count, points:pts})
      setProfile(p => ({...p, best_time:best, workout_count:count, points:pts}))
    }
  }

  const handleAddSession = async (session) => {
    const saved = await db.addSession(session)
    if (saved) setSessions(p => [...p, saved])
  }

  const handleJoinSession = async (sessionId) => {
    const updated = await db.joinSession(sessionId, clientId)
    if (updated) setSessions(p => p.map(s => s.id===sessionId ? updated : s))
  }

  const handleUpdateWorkout = async (sessionId, workout) => {
    const updated = await db.updateSessionWorkout(sessionId, workout)
    if (updated) setSessions(p => p.map(s => s.id===sessionId ? updated : s))
  }

  const handleLogResult = async (sessionId, cid, result) => {
    await db.upsertSessionResult(sessionId, cid, result)
    // La mise à jour se fait via le canal real-time dans SessionDetail
  }

  const handleFriendToggle = (cid) => {
    const updated = friends.includes(cid) ? friends.filter(f=>f!==cid) : [...friends,cid]
    setFriends(updated); db.saveFriends(updated)
  }

  if (loading)  return <Loading />
  if (!profile) return <Onboarding onSave={handleSaveProfile} />

  const NAV = [
    {id:"dashboard", label:"Dashboard",    icon:"⚡"},
    {id:"log",       label:"Entraînement", icon:"🔥"},
    {id:"community", label:"Communauté",   icon:"👥"},
    {id:"schedule",  label:"Planning",     icon:"📅"},
  ]

  return (
    <div style={{background:C.bg, minHeight:"100vh", fontFamily:"'Barlow',sans-serif", color:C.t1}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;900&family=Barlow+Condensed:wght@700;900&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.c1}}::-webkit-scrollbar-thumb{background:#333;border-radius:4px}`}</style>

      <div style={{background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"0 24px",display:"flex",alignItems:"center",gap:0,position:"sticky",top:0,zIndex:100}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:26,color:C.orange,letterSpacing:"-0.5px",paddingRight:28,marginRight:4,borderRight:`1px solid ${C.bd}`,paddingTop:14,paddingBottom:14}}>ROXPULSE</div>
        <nav style={{display:"flex",gap:0,flex:1,paddingLeft:8}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{background:"transparent",border:"none",borderBottom:tab===n.id?`2px solid ${C.orange}`:"2px solid transparent",color:tab===n.id?C.t1:C.t2,padding:"16px 14px",cursor:"pointer",fontWeight:tab===n.id?700:500,fontSize:13,fontFamily:"inherit",transition:"all 0.15s",letterSpacing:"0.2px",whiteSpace:"nowrap"}}>
              <span style={{marginRight:5,fontSize:14}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{display:"flex",alignItems:"center",gap:10,paddingLeft:20}}>
          <Avatar name={profile.name} color={profile.color} size={32} />
          <div>
            <div style={{fontWeight:600,fontSize:13,lineHeight:1.2}}>{profile.name}</div>
            <div style={{fontSize:11,color:C.t2}}>{profile.category}{profile.city?` · ${profile.city}`:""}</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:"24px 20px"}}>
        {tab==="dashboard" && <Dashboard workouts={workouts} />}
        {tab==="log"       && <LogWorkout onAdd={handleAddWorkout} workouts={workouts} />}
        {tab==="community" && <Community clientId={clientId} myProfile={profile} myWorkouts={workouts} community={community} friends={friends} onFriendToggle={handleFriendToggle} />}
        {tab==="schedule"  && <Schedule  clientId={clientId} myProfile={profile} sessions={sessions} onAdd={handleAddSession} onJoin={handleJoinSession} onUpdateWorkout={handleUpdateWorkout} onLogResult={handleLogResult} />}
      </div>
    </div>
  )
}
