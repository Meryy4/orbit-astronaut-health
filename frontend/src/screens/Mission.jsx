import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_LABEL } from '../lib/twin.js'
import './Mission.css'

// Chart geometry (SVG units): one unit per mission day, 0-1200 mSv on 240 units.
const X0 = 40
const W = 900
const Y0 = 250
const H = 240
const MAX_MSV = 1200
const x = (day, length) => X0 + (day / length) * W
const y = (msv) => Y0 - (Math.min(msv, MAX_MSV) / MAX_MSV) * H
const pct = (day, length) => `${((x(day, length) / (X0 + W)) * 100).toFixed(2)}%`

function doseStatus(msv, zones) {
  return msv > zones.red ? 'red' : msv >= zones.yellow ? 'yellow' : 'green'
}

export default function Mission({ mission, onOpenDay }) {
  const [t, setT] = useState(null)
  const [error, setError] = useState(null)
  const [day, setDay] = useState(mission.day)

  useEffect(() => {
    let alive = true
    api
      .timeline(mission.astronautId)
      .then((r) => alive && setT(r))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [mission.astronautId])

  if (!t) {
    return (
      <main className="main">
        <section className="panel" role={error ? 'alert' : 'status'}>
          <span className="eyebrow">{error ? 'Backend not reachable' : 'Loading'}</span>
          <h1>Mission timeline</h1>
          <p className="note">{error ?? 'Loading the mission (the first load computes the ML-flagged days)…'}</p>
        </section>
      </main>
    )
  }

  const L = t.length
  const isFuture = day > t.today
  const point = isFuture ? t.forecast[day - t.today - 1] : t.history[day - 1]
  const cum = point.cumulative_msv
  const status = doseStatus(cum, t.zones_msv)
  const phase = t.phases.find((p) => day >= p.start && day <= p.end)
  const event = !isFuture && t.history[day - 1].event
  const left = t.limit_day ? t.limit_day - day : null

  const historyPts = t.history.map((h) => `${x(h.day, L).toFixed(1)},${y(h.cumulative_msv).toFixed(1)}`).join(' ')
  const forecastPts = [t.history[t.history.length - 1], ...t.forecast.filter((f) => f.day % 5 === 0 || f.day === L)]
    .map((f) => `${x(f.day, L).toFixed(1)},${y(f.cumulative_msv).toFixed(1)}`)
    .join(' ')

  const jumps = [
    { day: 1, label: 'Day 1', tone: '' },
    { day: t.today, label: `Day ${t.today} · today`, tone: 'red' },
    ...(t.limit_day ? [{ day: t.limit_day, label: `Day ${t.limit_day} · dose limit`, tone: 'yellow' }] : []),
  ]

  return (
    <main className="main mission">
      <section aria-label="Mission day" className="panel mission-head">
        <div className="mission-top">
          <div className="title">
            <span className="eyebrow accent">Mars mission · {L} days</span>
            <h1 className="mission-day mono">Day {day}</h1>
            <span className="pill pill-accent">
              {phase.name}
              {isFuture ? ' · forecast' : ''}
            </span>
          </div>
          <div className="mission-jumps">
            {jumps.map((j) => (
              <button key={j.label} type="button" className={`chip jump jump-${j.tone || 'plain'}`} onClick={() => setDay(j.day)}>
                {j.label}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="mission-slider" className="eyebrow">
          Mission day
        </label>
        <input
          id="mission-slider"
          type="range"
          className="day-slider"
          min="1"
          max={L}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        />
        <div className="phases mono" aria-hidden="true">
          {t.phases.map((p) => (
            <span key={p.name} style={{ width: `${((p.end - p.start + 1) / L) * 100}%` }}>
              {p.name.toUpperCase()} · {p.start}–{p.end}
            </span>
          ))}
          <span className="phase-marker" style={{ left: `${((day - 1) / (L - 1)) * 100}%` }} />
        </div>
      </section>

      <section aria-label="Cumulative radiation dose" className="panel chart-panel">
        <div className="panel-head">
          <h2>Cumulative radiation dose</h2>
          <span className="mono note">Zeitlin 2013 · Hassler 2014 · NASA DONKI · solid = measured, dashed = forecast</span>
        </div>
        <svg
          role="img"
          aria-label={`Cumulative dose: ${t.history[t.history.length - 1].cumulative_msv} mSv today, 600 mSv career limit reached around day ${t.limit_day}`}
          viewBox="0 0 940 280"
          className="chart"
        >
          <rect x={X0} y={Y0 - H} width={W} height={H} className="chart-bg" />
          <path d={`M${X0},${y(t.zones_msv.yellow)} H${X0 + W}`} className="zone zone-yellow" />
          <path d={`M${X0},${y(t.zones_msv.red)} H${X0 + W}`} className="zone zone-red" />
          <path d={`M${X0},${y(t.limit_msv)} H${X0 + W}`} className="limit" />
          <text x={X0 + W - 4} y={y(t.limit_msv) - 6} textAnchor="end" className="chart-label tone-red">
            CAREER LIMIT {t.limit_msv} mSv
          </text>
          {t.phases.slice(1).map((p) => (
            <path key={p.name} d={`M${x(p.start - 1, L)},${Y0 - H} V${Y0}`} className="phase-line" />
          ))}
          <polyline points={forecastPts} className="curve curve-forecast" />
          <polyline points={historyPts} className="curve" />
          {t.limit_day && (
            <>
              <path d={`M${x(t.limit_day, L)},${Y0 - H} V${Y0}`} className="limit-day" />
              <text x={x(t.limit_day, L) + 4} y={Y0 - H + 16} className="chart-label tone-yellow">
                LIMIT · DAY {t.limit_day}
              </text>
            </>
          )}
          <path d={`M${x(t.today, L)},${Y0 - H} V${Y0}`} className="today-line" />
          <line x1={x(day, L)} y1={Y0 - H} x2={x(day, L)} y2={Y0} className="cursor" />
          <circle cx={x(day, L)} cy={y(cum)} r="6" className={isFuture ? 'cursor-dot is-future' : 'cursor-dot'} />
          {[0, 600, 1200].map((v) => (
            <text key={v} x={X0 - 6} y={y(v) + 4} textAnchor="end" className="chart-label">
              {v}
            </text>
          ))}
          {[1, ...t.phases.slice(1).map((p) => p.start - 1), L].map((d) => (
            <text key={d} x={x(d, L)} y={Y0 + 22} textAnchor={d === 1 ? 'start' : d === L ? 'end' : 'middle'} className="chart-label">
              {d === 1 ? 'Day 1' : d}
            </text>
          ))}
        </svg>

        <div className="lane-wrap">
          <span className="eyebrow">Events · click to open the twin</span>
          <div className="event-lane">
            {t.events.map((e) => (
              <button
                key={`e${e.day}`}
                type="button"
                className="mark mark-event"
                style={{ left: pct(e.day, L) }}
                title={`Day ${e.day}: ${e.event}`}
                aria-label={`Day ${e.day}: solar event ${e.event}`}
                onClick={() => onOpenDay(e.day)}
              />
            ))}
            {t.anomalies.map((a) => (
              <button
                key={`a${a.day}`}
                type="button"
                className="mark mark-ml"
                style={{ left: pct(a.day, L) }}
                title={`Day ${a.day}: unusual for Nova (${a.top_factor})`}
                aria-label={`Day ${a.day}: unusual for Nova, ${a.top_factor}`}
                onClick={() => onOpenDay(a.day)}
              />
            ))}
          </div>
          <span className="legend mono note">
            <span className="key key-event" /> Solar event ({t.events.length}) <span className="key key-ml" /> Unusual day for Nova, ML (
            {t.anomalies.length})
          </span>
        </div>
      </section>

      <section aria-label="Selected day" className="mission-side">
        <div className="panel stat-card">
          <span className="eyebrow">Cumulative dose{isFuture ? ' · forecast' : ''}</span>
          <span className="stat-row">
            <span className="mono stat-big">
              {Math.round(cum)} / {t.limit_msv} mSv
            </span>
            <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
          </span>
        </div>
        <div className="stat-pair">
          <div className="panel stat-card">
            <span className="eyebrow">Dose that day</span>
            <span className="mono stat-mid">{isFuture ? 'forecast' : `${t.history[day - 1].daily_msv} mSv`}</span>
          </div>
          <div className="panel stat-card">
            <span className="eyebrow">Limit reached in</span>
            <span className="mono stat-mid">
              {left === null ? '—' : left <= 0 ? 'Reached' : `${left} day${left === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <div className="panel stat-card">
          <span className="eyebrow">Space weather · NASA DONKI</span>
          {isFuture ? (
            <p className="note">Future days: no event forecast. Only the usual cosmic-ray dose is projected.</p>
          ) : event ? (
            <p className="event-text">{event}</p>
          ) : (
            <p className="note">No event that day. Background galactic cosmic rays only.</p>
          )}
          <span className="note">Replayed from real solar activity: day 409 = 2024-05-11.</span>
        </div>
        {!isFuture && (
          <button type="button" className="submit" onClick={() => onOpenDay(day)}>
            Open day {day} in the twin
          </button>
        )}
      </section>
    </main>
  )
}
