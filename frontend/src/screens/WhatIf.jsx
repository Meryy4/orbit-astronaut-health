import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_LABEL } from '../lib/twin.js'
import './WhatIf.css'

const SLIDERS = [
  { key: 'resistance_min', label: 'Resistance exercise', min: 0, max: 90, step: 5, unit: 'min/day', now: (v) => `Usual: ${v} min/day` },
  { key: 'sleep_h', label: 'Sleep', min: 4, max: 9, step: 0.1, unit: 'h/night', fmt: (v) => v.toFixed(1), now: (v) => `Last 3 nights: ${v.toFixed(1)} h/night` },
  { key: 'shield_h', label: 'Time in shielded quarters', min: 0, max: 12, step: 1, unit: 'h/day', fmt: (v) => `+${v}`, now: (v) => (v ? `Today: +${v} h/day` : 'Today: no extra time') },
]

const sign = (n) => (n > 0 ? `+${n}` : `${n}`.replace('-', '−'))

function Delta({ value, goodWhen, children }) {
  const tone = value === 0 ? 'same' : (goodWhen === 'up' ? value > 0 : value < 0) ? 'good' : 'bad'
  return <span className={`mono delta delta-${tone}`}>{value === 0 ? 'Same as today' : children}</span>
}

function Card({ title, status, value, delta, note }) {
  return (
    <div className="panel wi-card">
      <span className="wi-card-head">
        <span className="sys-name">{title}</span>
        <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
      </span>
      <span className="mono wi-value">{value}</span>
      {delta}
      <span className="note">{note}</span>
    </div>
  )
}

function Lane({ label, from, to, color, start, end, leave }) {
  const pos = (d) => `${Math.max(0, Math.min(100, ((d - start) / (end - start)) * 100)).toFixed(1)}%`
  const toText = to > end ? `after day ${end}` : `day ${to}`
  return (
    <div className="lane">
      <span className="lane-head">
        <span className="lane-label">{label}</span>
        <span className="mono lane-text">
          day {from} → {toText}
        </span>
      </span>
      <span className="lane-track" aria-hidden="true">
        <span className="lane-leave" style={{ left: pos(leave) }} />
        <span className="lane-dot lane-ghost" style={{ left: pos(from), borderColor: color }} />
        <span className="lane-dot" style={{ left: pos(to), background: color }} />
      </span>
    </div>
  )
}

export default function WhatIf({ mission, onNavigate }) {
  const [base, setBase] = useState(null) // response with today's plan
  const [plan, setPlan] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [applied, setApplied] = useState(false)

  // Today's plan and forecasts.
  useEffect(() => {
    let alive = true
    api
      .whatif({ astronaut_id: mission.astronautId, mission_day: mission.day, plan: null })
      .then((r) => {
        if (!alive) return
        setBase(r)
        setPlan(r.today_plan)
        setResult(r)
      })
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [mission.astronautId, mission.day])

  // Re-run the model when a slider moves (short delay to stay smooth while dragging).
  useEffect(() => {
    if (!plan || !base) return
    let alive = true
    const t = setTimeout(() => {
      api
        .whatif({ astronaut_id: mission.astronautId, mission_day: mission.day, plan })
        .then((r) => alive && setResult(r))
        .catch((err) => alive && setError(err.message))
    }, 80)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [plan, base, mission.astronautId, mission.day])

  if (!result || !plan) {
    return (
      <main className="main">
        <section className="panel" role={error ? 'alert' : 'status'}>
          <span className="eyebrow">{error ? 'Backend not reachable' : 'Loading'}</span>
          <h1>What if I change my plan?</h1>
          <p className="note">
            {error ? `${error}. Start the API: cd backend && .venv/bin/uvicorn app.main:app --port 8010` : 'Loading forecasts…'}
          </p>
        </section>
      </main>
    )
  }

  const update = (next) => {
    setApplied(false)
    setPlan(next)
  }
  const { current: now, projected: next, horizon } = result
  const dBone = next.bone.threshold_day - now.bone.threshold_day
  const dRad = next.radiation.limit_day - now.radiation.limit_day
  const dLap = next.vigilance.lapses - now.vigilance.lapses
  const radStatus =
    next.radiation.limit_day >= horizon.leave_mars_day ? 'green' : next.radiation.limit_day > now.radiation.limit_day ? 'yellow' : 'red'

  return (
    <main className="main wi">
      <div className="title wi-intro">
        <span className="eyebrow accent">Decision support</span>
        <h1>What if I change my plan?</h1>
        <p>Move a slider and see how your forecasts change before you decide. Nothing is applied until you add it to your plan.</p>
      </div>

      <section aria-label="Your decisions" className="panel wi-decisions">
        <div className="panel-head">
          <h2>Your decisions</h2>
          <span className="wi-buttons">
            <button type="button" className="btn-primary" onClick={() => update(base.suggested_plan)}>
              ORBIT suggestion
            </button>
            <button type="button" className="btn-ghost" onClick={() => update(base.today_plan)}>
              Reset
            </button>
          </span>
        </div>

        {SLIDERS.map((s) => {
          const v = plan[s.key]
          return (
            <div key={s.key} className="slider">
              <span className="slider-head">
                <label htmlFor={`wi-${s.key}`} className="sys-name">
                  {s.label}
                </label>
                <span className="mono">
                  {s.fmt ? s.fmt(v) : v} {s.unit}
                </span>
              </span>
              <input
                id={`wi-${s.key}`}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={v}
                onChange={(e) => update({ ...plan, [s.key]: Number(e.target.value) })}
              />
              <span className="mono note">{s.now(base.today_plan[s.key])}</span>
            </div>
          )
        })}

        <button
          type="button"
          className={applied ? 'apply is-applied' : 'apply'}
          onClick={() =>
            api
              .plan({ astronaut_id: mission.astronautId, mission_day: mission.day, plan })
              .then(() => setApplied(true))
              .catch((err) => setError(err.message))
          }
        >
          {applied ? '✓ Added to your action plan' : 'Add this plan to my actions'}
        </button>
        {applied && (
          <button type="button" className="link" onClick={() => onNavigate('alerts', mission.day)}>
            See it in Alerts
          </button>
        )}
      </section>

      <section aria-label="Forecasts" aria-live="polite" className="wi-forecasts">
        <div className="wi-cards">
          <Card
            title="Vigilance"
            status={next.vigilance.status}
            value={`${next.vigilance.lapses} lapse${next.vigilance.lapses === 1 ? '' : 's'}`}
            delta={<Delta value={dLap} goodWhen="down">{sign(dLap)} lapses vs today</Delta>}
            note={`Reaction time +${next.vigilance.rt_vs_baseline_pct}% vs your baseline.`}
          />
          <Card
            title="Radiation"
            status={radStatus}
            value={`${next.radiation.daily_dose_msv.toFixed(2)} mSv/d`}
            delta={<Delta value={dRad} goodWhen="up">Limit day {next.radiation.limit_day} ({sign(dRad)} days)</Delta>}
            note={`600 mSv career limit reached on day ${next.radiation.limit_day}.`}
          />
          <Card
            title="Bone"
            status={next.bone.status}
            value={`−${next.bone.rate_pct_per_month.toFixed(2)}%/mo`}
            delta={<Delta value={dBone} goodWhen="up">Threshold day {next.bone.threshold_day} ({sign(dBone)} days)</Delta>}
            note={`Cumulative loss reaches 10% on day ${next.bone.threshold_day}.`}
          />
        </div>

        <div className="panel horizon">
          <div className="panel-head">
            <h2>Mission horizon</h2>
            <span className="mono note">
              Day {result.mission_day} → {horizon.end_day} · hollow = today's plan · filled = new plan
            </span>
          </div>
          <Lane label="Radiation limit" from={now.radiation.limit_day} to={next.radiation.limit_day} color="var(--red)" start={result.mission_day} end={horizon.end_day} leave={horizon.leave_mars_day} />
          <Lane label="Bone threshold" from={now.bone.threshold_day} to={next.bone.threshold_day} color="var(--yellow)" start={result.mission_day} end={horizon.end_day} leave={horizon.leave_mars_day} />
          <span className="mono note horizon-axis">
            <span>Day {result.mission_day} · today</span>
            <span>Day {horizon.leave_mars_day} · leave Mars</span>
            <span>Day {horizon.end_day}</span>
          </span>
        </div>

        <p className="note">
          Illustrative model: coefficients will be fitted from the NASA HRP evidence reports. NASA notes that the exercise each
          astronaut needs to protect bone is still unclear (Digital Astronaut Project), which is why ORBIT lets you explore it.
        </p>
      </section>
    </main>
  )
}
