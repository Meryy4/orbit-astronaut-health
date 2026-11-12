import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_LABEL } from '../lib/twin.js'
import './Alerts.css'

const signed = (v, unit) => `${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}`
const factorDelta = (f) =>
  f.feature === 'vitals.body_temp_c' ? signed(f.vs_baseline, ' °C') : signed(f.vs_baseline_pct, '%')
const timeOf = (iso) => new Date(iso).toISOString().slice(11, 16)

function Why({ anomaly, ruleReasons }) {
  const factors = anomaly?.is_anomaly ? anomaly.top_factors : []
  const max = Math.max(...factors.map((f) => Math.abs(f.shap)), 0.001)
  return (
    <section aria-label="Why" className="panel">
      <div className="panel-head">
        <h2>Why ORBIT raised this</h2>
        {anomaly && (
          <span className="mono note">
            Isolation Forest · score {anomaly.score.toFixed(2).replace('-', '−')} · SHAP
          </span>
        )}
      </div>

      {factors.length > 0 ? (
        <>
          <span className="eyebrow">Unusual for you (last 90 days)</span>
          {factors.map((f) => (
            <div key={f.feature} className="factor">
              <span className="factor-head">
                <span className="factor-name">{f.label}</span>
                <span className="mono note">{factorDelta(f)} vs your baseline</span>
              </span>
              <span className="bar" aria-hidden="true">
                <span className={`bar-fill bar-${f.system}`} style={{ width: `${Math.round((Math.abs(f.shap) / max) * 100)}%` }} />
              </span>
            </div>
          ))}
          <p className="note">Bar length = how much each signal pushed today away from your personal baseline (SHAP).</p>
        </>
      ) : (
        <p className="note">{anomaly ? 'Your signals are normal compared with your last 90 days.' : 'The personal model is still warming up.'}</p>
      )}

      {ruleReasons.length > 0 && (
        <>
          <span className="eyebrow">Fixed safety limits crossed</span>
          <ul className="rules">
            {ruleReasons.map((r) => (
              <li key={r.text}>
                <span className="mono rules-sys">{r.system}</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default function Alerts({ mission, day, onNavigate, onAsk }) {
  const [alert, setAlert] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .alert(mission.astronautId, day)
      .then((a) => {
        if (!alive) return
        setAlert(a)
        setError(null)
      })
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [mission.astronautId, day])

  const run = (promise) => promise.then(setAlert).catch((err) => setError(err.message))

  if (!alert) {
    return (
      <main className="main">
        <section className="panel" role={error ? 'alert' : 'status'}>
          <span className="eyebrow">{error ? 'Backend not reachable' : 'Loading'}</span>
          <h1>Alerts</h1>
          <p className="note">
            {error ? `${error}. Start the API: cd backend && .venv/bin/uvicorn app.main:app --port 8010` : `Loading day ${day}…`}
          </p>
        </section>
      </main>
    )
  }

  const isToday = day === mission.day
  const dayNav = (
    <span className="mono note">
      Day {alert.mission_day}
      {isToday ? ' · today' : ''}
      {!isToday && (
        <button type="button" className="link" onClick={() => onNavigate('alerts', mission.day)}>
          Back to today
        </button>
      )}
    </span>
  )

  if (alert.level === 'green') {
    return (
      <main className="main alerts">
        <section aria-label="Alert summary" className="banner banner-green">
          <div className="banner-text">
            {dayNav}
            <h1>All clear</h1>
            <p>{alert.summary}</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="main alerts">
      <section aria-label="Alert summary" className={`banner banner-${alert.level}`}>
        <div className="banner-text">
          <span className="banner-chips">
            {alert.raised.map((r) => (
              <span key={r.system} className={`pill pill-${r.status}`}>
                {STATUS_LABEL[r.status].toUpperCase()} · {r.label}
              </span>
            ))}
            {dayNav}
          </span>
          <h1>{alert.title}</h1>
          <p>{alert.summary}</p>
        </div>
        <button
          type="button"
          className={alert.acknowledged_at ? 'ack is-acked' : `ack ack-${alert.level}`}
          disabled={Boolean(alert.acknowledged_at)}
          onClick={() => run(api.ack(mission.astronautId, day))}
        >
          {alert.acknowledged_at ? `✓ Acknowledged · ${timeOf(alert.acknowledged_at)} UTC` : 'Acknowledge alert'}
        </button>
      </section>

      <div className="alerts-left">
        <Why anomaly={alert.anomaly} ruleReasons={alert.rule_reasons} />
        {alert.self_report_gap.detected && (
          <section aria-label="Self-report gap" className="gap">
            <span className="eyebrow tone-yellow">Self-report gap</span>
            <p>{alert.self_report_gap.message} Your data suggests you are more tired than you feel.</p>
          </section>
        )}
      </div>

      <section aria-label="Action plan" className="panel alerts-plan">
        <div className="panel-head">
          <h2>Action plan</h2>
          <span className="mono note">
            {alert.done_count} / {alert.total_count} done
          </span>
        </div>
        {alert.groups.map((g) => (
          <div key={g.priority} className="group">
            <span className={`eyebrow group-${g.priority}`}>{g.label}</span>
            {g.items.map((a) => (
              <label key={a.id} className={a.done ? 'todo is-done' : 'todo'}>
                <input
                  type="checkbox"
                  checked={a.done}
                  onChange={(e) => run(api.tick(mission.astronautId, day, a.id, e.target.checked))}
                />
                <span>{a.text}</span>
              </label>
            ))}
          </div>
        ))}
        <div className="earth">
          <span className="eyebrow accent">Earth link</span>
          <p>
            A message to the flight surgeon would get a reply in about <strong>{alert.earth_round_trip_min} min</strong> (round
            trip). ORBIT guides you until then.
          </p>
          <span className="earth-buttons">
            <button type="button" className="btn-outline" onClick={() => onAsk(`${alert.title}. What should I do now?`)}>
              Ask onboard assistant
            </button>
            <button type="button" className="btn-ghost" onClick={() => onNavigate('report')}>
              Prepare Earth report
            </button>
          </span>
        </div>
      </section>
    </main>
  )
}
