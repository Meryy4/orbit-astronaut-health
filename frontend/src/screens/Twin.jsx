import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_LABEL, countByStatus, describeAnomaly, describeSystems } from '../lib/twin.js'
import './Twin.css'

const COLOR = { green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)' }
const STORM_DAYS = [405, 406, 407, 408, 409, 410, 411, 412]
const JUMPS = [
  { day: 300, label: 'Day 300' },
  { day: 408, label: 'Before storm' },
  { day: 410, label: 'SEP peak' },
  { day: 412, label: 'Today' },
]

// Half of the body outline (right side). The left side is the same path mirrored.
const HALF_BODY =
  'M139,64 L140,80 C150,86 172,86 180,94 C188,100 192,112 192,126 C194,146 198,160 200,176 C202,196 202,214 200,232 C202,244 200,258 194,262 C188,264 186,254 186,244 C186,226 184,206 182,188 C180,168 178,146 174,130 C174,150 168,176 164,192 C164,206 170,220 172,234 C174,262 168,296 164,322 C162,346 160,372 156,392 C160,400 166,406 164,410 L142,410 C140,404 140,398 140,392 C140,370 140,346 140,322 C140,296 138,268 134,244 Q132,240 130,240'

function Half() {
  return (
    <>
      <path d={`${HALF_BODY} L130,64 Z`} fill="url(#skin)" />
      <path d={HALF_BODY} fill="none" stroke="#5B6E96" strokeWidth="1.2" strokeLinejoin="round" />
    </>
  )
}

function Label({ x, y, lineFrom, color, anchor = 'start', children, onPick }) {
  return (
    <g className="body-label" onClick={onPick}>
      <path d={`M${lineFrom[0]},${lineFrom[1]} L${anchor === 'end' ? x + 4 : x - 4},${lineFrom[1]}`} stroke={color} strokeWidth="1" />
      <text x={x} y={y} textAnchor={anchor} fill={color} className="body-text">
        {children}
      </text>
    </g>
  )
}

function BodyView({ systems, solarEvent, onPick }) {
  const st = Object.fromEntries(systems.map((s) => [s.id, s.status]))
  const c = (id) => COLOR[st[id]]
  const summary = systems.map((s) => `${s.name} ${STATUS_LABEL[s.status]}`).join(', ')

  return (
    <svg role="img" aria-label={`Body view: ${summary}`} className="body" viewBox="-60 0 380 420">
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1A2540" />
          <stop offset="0.5" stopColor="#25335A" />
          <stop offset="1" stopColor="#1A2540" />
        </linearGradient>
      </defs>

      {/* Radiation: an aura around the whole body */}
      <ellipse
        cx="130"
        cy="212"
        rx="112"
        ry="205"
        fill="none"
        stroke={c('radiation')}
        strokeWidth="1.2"
        strokeDasharray="5 6"
        className={st.radiation === 'red' ? 'aura aura-alert' : 'aura'}
      />

      <Half />
      <g transform="translate(260 0) scale(-1 1)">
        <Half />
      </g>
      <ellipse cx="130" cy="40" rx="21" ry="27" fill="url(#skin)" stroke="#5B6E96" strokeWidth="1.2" />

      {/* Brain */}
      <path d="M116,34 C116,21 144,21 144,34 C146,42 140,48 130,48 C120,48 114,42 116,34 Z" fill={c('behavioral')} fillOpacity="0.2" stroke={c('behavioral')} strokeWidth="1.3" />
      <path d="M130,24 L130,47 M121,30 C124,33 124,37 121,40 M139,30 C136,33 136,37 139,40" fill="none" stroke={c('behavioral')} strokeWidth="0.9" opacity="0.8" />

      {/* Spine, ribs, pelvis (neutral) */}
      <path d="M130,92 L130,236" fill="none" stroke="#5B6E96" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
      <path d="M108,112 Q130,120 152,112 M104,124 Q130,133 156,124 M104,136 Q130,145 156,136 M106,148 Q130,157 154,148" fill="none" stroke="#5B6E96" strokeWidth="0.9" opacity="0.5" />
      <path d="M108,226 Q130,248 152,226" fill="none" stroke="#5B6E96" strokeWidth="1.2" opacity="0.8" />

      {/* Bone: femurs and tibias */}
      <path d="M154,244 L151,318 M106,244 L109,318 M151,326 L149,388 M109,326 L111,388" fill="none" stroke={c('bone')} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <circle cx="151" cy="322" r="4" fill={c('bone')} opacity="0.8" />
      <circle cx="109" cy="322" r="4" fill={c('bone')} opacity="0.8" />

      {/* Heart */}
      <path d="M141,142 C131,134 128,124 135,121 C138,120 140,123 141,125 C142,123 144,120 147,121 C154,124 151,134 141,142 Z" fill={c('cardiovascular')} fillOpacity="0.9" />

      {/* Immune: lymph nodes */}
      {[[122, 74], [138, 74], [92, 132], [168, 132], [114, 236], [146, 236]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill={c('immune')} />
      ))}

      <Label x={36} y={38} lineFrom={[114, 34]} anchor="end" color={c('behavioral')} onPick={() => onPick('behavioral')}>BRAIN</Label>
      <Label x={36} y={136} lineFrom={[89, 132]} anchor="end" color={c('immune')} onPick={() => onPick('immune')}>IMMUNE</Label>
      <Label x={230} y={132} lineFrom={[150, 128]} color={c('cardiovascular')} onPick={() => onPick('cardiovascular')}>HEART</Label>
      <Label x={230} y={294} lineFrom={[154, 290]} color={c('bone')} onPick={() => onPick('bone')}>BONE</Label>

      <g className="body-label" onClick={() => onPick('radiation')}>
        <circle cx="232" cy="28" r="5" fill={c('radiation')} />
        <text x="242" y="32" fill={c('radiation')} className="body-text">RADIATION</text>
        {solarEvent && (
          <text x="242" y="46" fill={c('radiation')} className="body-text">
            {solarEvent.startsWith('SEP') ? 'SEP ACTIVE' : 'FLARE'}
          </text>
        )}
      </g>
    </svg>
  )
}

function Pill({ status }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
}

export default function Twin({ mission, onNavigate, startDay }) {
  const [day, setDay] = useState(startDay ?? mission.day)
  const [data, setData] = useState(null) // { rec, analysis }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('radiation')
  const [playing, setPlaying] = useState(false)
  const playTimer = useRef(null)

  // Load the record and its analysis for the chosen day. Short delay so dragging the slider stays smooth.
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const [rec, analysis] = await Promise.all([
          api.day(mission.astronautId, day),
          api.analysis(mission.astronautId, day),
        ])
        if (alive) {
          setData({ rec, analysis })
          setError(null)
        }
      } catch (err) {
        if (alive) setError(err.message)
      } finally {
        if (alive) setLoading(false)
      }
    }, 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [day, mission.astronautId])

  const stopReplay = () => {
    clearInterval(playTimer.current)
    setPlaying(false)
  }

  const replayStorm = () => {
    stopReplay()
    let i = 0
    setDay(STORM_DAYS[0])
    setSelected('radiation')
    setPlaying(true)
    playTimer.current = setInterval(() => {
      i += 1
      if (i >= STORM_DAYS.length) {
        stopReplay()
        return
      }
      setDay(STORM_DAYS[i])
    }, 900)
  }

  useEffect(() => () => clearInterval(playTimer.current), [])

  if (!data) {
    return (
      <main className="main">
        <section className="panel" role={error ? 'alert' : 'status'}>
          <span className="eyebrow">{error ? 'Backend not reachable' : 'Loading'}</span>
          <h1>Digital twin</h1>
          {error ? (
            <p className="note">
              {error}. Start the API: cd backend && .venv/bin/uvicorn app.main:app --port 8010
            </p>
          ) : (
            <p className="note">Loading day {day}…</p>
          )}
        </section>
      </main>
    )
  }

  const { rec, analysis } = data
  const systems = describeSystems(rec, analysis)
  const counts = countByStatus(systems)
  const sel = systems.find((s) => s.id === selected) ?? systems[0]
  const ml = describeAnomaly(analysis.anomaly)

  return (
    <main className="main twin">
      <section aria-label="Mission day" className="panel day-bar">
        <div className="day-head">
          <div className="title">
            <span className="eyebrow accent">Mission day</span>
            <span className="day-num mono">
              Day {rec.mission_day}
              {rec.mission_day === mission.day && <span className="today">today</span>}
            </span>
          </div>
          <span className="mono day-meta">
            {rec.phase === 'transit' ? 'Transit' : 'Mars surface'} · replays {rec.replay_date}
            {rec.radiation.solar_event && <span className="event"> · {rec.radiation.solar_event}</span>}
          </span>
        </div>
        <input
          type="range"
          className="day-slider"
          min="1"
          max={mission.day}
          value={day}
          aria-label="Mission day"
          onChange={(e) => {
            stopReplay()
            setDay(Number(e.target.value))
          }}
        />
        <div className="day-actions">
          {JUMPS.map((j) => (
            <button
              key={j.day}
              type="button"
              className={day === j.day ? 'chip is-on' : 'chip'}
              onClick={() => {
                stopReplay()
                setDay(j.day)
              }}
            >
              {j.label}
            </button>
          ))}
          <button type="button" className="chip chip-play" onClick={playing ? stopReplay : replayStorm}>
            {playing ? '■ Stop' : '▶ Replay storm 405–412'}
          </button>
        </div>
      </section>

      <section aria-label="Body view" className={loading ? 'panel body-panel is-loading' : 'panel body-panel'}>
        <div className="panel-head">
          <h1>Digital twin</h1>
          <span className="mono note">Safety rules + personal ML model</span>
        </div>
        <BodyView systems={systems} solarEvent={rec.radiation.solar_event} onPick={setSelected} />
        <div className="counts mono">
          {counts.red > 0 && <span className="pill pill-red">{counts.red} red</span>}
          {counts.yellow > 0 && <span className="pill pill-yellow">{counts.yellow} amber</span>}
          {counts.green > 0 && <span className="pill pill-green">{counts.green} green</span>}
        </div>
        <div className={`ml ml-${ml.state}`} role="status">
          <span className="eyebrow">Personal model · Isolation Forest + SHAP</span>
          <span className="ml-title">{ml.title}</span>
          <span className="note">{ml.text}</span>
          {ml.factors?.length > 0 && (
            <ul className="ml-factors">
              {ml.factors.map((f) => (
                <li key={f.label}>
                  <span>{f.label}</span>
                  <span className="mono">{f.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="twin-side">
        <section aria-label="Systems" className="sys-grid">
          {systems.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sys sys-${s.status}${s.id === sel.id ? ' is-on' : ''}${s.id === 'radiation' ? ' sys-wide' : ''}`}
              aria-pressed={s.id === sel.id}
              onClick={() => setSelected(s.id)}
            >
              <span className="sys-head">
                <span className="sys-name">{s.name}</span>
                <Pill status={s.status} />
              </span>
              <span className="mono sys-metric">{s.metric}</span>
            </button>
          ))}
        </section>

        <section aria-label="System detail" aria-live="polite" className="panel detail">
          <div className="detail-head">
            <h2>{sel.name}</h2>
            <Pill status={sel.status} />
          </div>
          <div className="detail-grid">
            <div className="kv">
              <span className="eyebrow">Today</span>
              <span className="mono">{sel.metric}</span>
            </div>
            <div className="kv">
              <span className="eyebrow">Your baseline (14 d)</span>
              <span className="mono">{sel.baseline}</span>
            </div>
          </div>
          <div className="kv">
            <span className="eyebrow">Why</span>
            <p>{sel.why}</p>
          </div>
          <div className="action-box">
            <span className="eyebrow accent">Action</span>
            <p>{sel.action}</p>
          </div>
          <div className="detail-foot">
            <span className="mono note">Source: {sel.source}</span>
            <button type="button" className="submit" onClick={() => onNavigate('alerts', rec.mission_day)}>
              See full alert
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
