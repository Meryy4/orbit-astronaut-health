import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { STATUS_LABEL, describeSystems } from '../lib/twin.js'
import './Report.css'

const PRIORITIES = [
  { id: 'routine', label: 'Routine' },
  { id: 'priority', label: 'Priority' },
  { id: 'urgent', label: 'Urgent' },
]
const hhmm = (iso) => new Date(iso).toISOString().slice(11, 16)

// Real size of what would be sent: the JSON packet, gzip-compressed in the browser.
async function gzipBytes(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'))
  return (await new Response(stream).arrayBuffer()).byteLength
}
const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

function Spark({ values, tone }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 90).toFixed(1)},${(22 - ((v - min) / (max - min || 1)) * 20).toFixed(1)}`)
    .join(' ')
  return (
    <svg aria-hidden="true" width="90" height="24" viewBox="0 0 90 24">
      <polyline points={pts} fill="none" className={`spark spark-${tone}`} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export default function Report({ mission }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [priority, setPriority] = useState(null)
  const [asked, setAsked] = useState(null)
  const [attach, setAttach] = useState({ trends: true, checkin: false })
  const [note, setNote] = useState('')
  const [sizes, setSizes] = useState(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.day(mission.astronautId, mission.day),
      api.analysis(mission.astronautId, mission.day),
      api.report(mission.astronautId, mission.day),
    ])
      .then(([rec, analysis, report]) => {
        if (!alive) return
        setData({ rec, analysis, report })
        setPriority(report.sent?.priority ?? (report.level === 'red' ? 'priority' : 'routine'))
        setAsked(new Set(report.sent?.questions ?? report.suggested_questions.slice(0, 2).map((q) => q.id)))
      })
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [mission.astronautId, mission.day])

  // What would leave the habitat, and its compressed size.
  const packet = useMemo(() => {
    if (!data) return null
    const { rec, analysis, report } = data
    const rows = describeSystems(rec, analysis).map((s) => ({ system: s.id, status: s.status, today: s.metric, baseline: s.baseline }))
    return {
      base: {
        astronaut: mission.astronautId,
        day: report.mission_day,
        priority,
        summary: report.summary,
        systems: rows,
        actions_taken: report.actions_taken,
        questions: report.suggested_questions.filter((q) => asked?.has(q.id)).map((q) => q.text),
        note,
      },
      trends: report.trends,
      checkin: { cognitive: rec.cognitive, sleep: rec.sleep, self_report: rec.self_report },
    }
  }, [data, priority, asked, note, mission.astronautId])

  useEffect(() => {
    if (!packet) return
    let alive = true
    Promise.all([
      gzipBytes(packet.base),
      gzipBytes(packet.trends),
      gzipBytes(packet.checkin),
      gzipBytes({ ...packet.base, ...(attach.trends && { trends: packet.trends }), ...(attach.checkin && { checkin: packet.checkin }) }),
    ]).then(([base, trends, checkin, total]) => alive && setSizes({ base, trends, checkin, total }))
    return () => {
      alive = false
    }
  }, [packet, attach])

  if (!data || !asked) {
    return (
      <main className="main">
        <section className="panel" role={error ? 'alert' : 'status'}>
          <span className="eyebrow">{error ? 'Backend not reachable' : 'Loading'}</span>
          <h1>Earth report</h1>
          <p className="note">{error ?? 'Preparing the report…'}</p>
        </section>
      </main>
    )
  }

  const { rec, analysis, report } = data
  const systems = describeSystems(rec, analysis)
  const sent = report.sent
  const questions = report.suggested_questions.filter((q) => asked.has(q.id))
  const reviewMin = report.review_min[priority]
  const edit = (fn) => (...args) => {
    if (!sent) fn(...args)
  }

  const send = () => {
    setSending(true)
    api
      .sendReport(mission.astronautId, mission.day, {
        priority,
        questions: [...asked],
        note,
        attachments: Object.keys(attach).filter((k) => attach[k]),
        packet_bytes: sizes?.total ?? 0,
      })
      .then((r) => setData((d) => ({ ...d, report: r })))
      .catch((err) => setError(err.message))
      .finally(() => setSending(false))
  }

  const steps = sent
    ? sent.steps
    : [
        { label: 'Sent from Mars', minutes: 0 },
        { label: 'Arrives at Mission Control', minutes: report.earth_delay_min },
        { label: 'Flight surgeon review (estimate)', minutes: report.earth_delay_min + reviewMin },
        { label: 'Reply arrives on Mars', minutes: 2 * report.earth_delay_min + reviewMin },
      ]

  return (
    <main className="main report-screen">
      <section aria-label="Report preview" className="paper">
        <div className="paper-head">
          <div className="title">
            <span className="paper-eyebrow mono">To: Flight surgeon · Mission Control</span>
            <h1>Health report · {mission.name}</h1>
            <span className="mono paper-muted">
              Mission day {report.mission_day} · {report.phase === 'transit' ? 'Transit' : 'Mars surface'} · generated{' '}
              {hhmm(report.generated_at)} UTC
            </span>
          </div>
          <span className={`prio-badge prio-${priority}`}>{priority.toUpperCase()}</span>
        </div>

        <p className="paper-summary">
          <strong>Summary.</strong> {report.summary}
        </p>

        <div className="table-wrap">
          <table className="paper-table">
            <thead>
              <tr>
                <th>System</th>
                <th>Status</th>
                <th>Today</th>
                <th>Baseline</th>
                <th>14 days</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.id}>
                  <td className="sys-name">{s.name}</td>
                  <td>
                    <span className={`paper-badge badge-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="mono">{s.metric}</td>
                  <td className="mono paper-muted">{s.baseline}</td>
                  <td>
                    <Spark values={report.trends[s.id].values} tone={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="paper-cols">
          <div className="paper-col">
            <span className="paper-eyebrow mono">Actions already taken</span>
            {report.actions_taken.length ? (
              report.actions_taken.map((a) => (
                <span key={a.text}>
                  <span className="mono">{hhmm(a.at)}</span> · {a.text}
                </span>
              ))
            ) : (
              <span className="paper-muted">None ticked yet (Alerts screen).</span>
            )}
          </div>
          <div className="paper-col">
            <span className="paper-eyebrow mono">Questions for you</span>
            {questions.length ? questions.map((q) => <span key={q.id}>• {q.text}</span>) : <span className="paper-muted">No questions selected.</span>}
          </div>
        </div>
        {note.trim() && <p className="paper-note">Note from crew member: {note}</p>}
      </section>

      <section aria-label="Send to Earth" className="send-col">
        <div className="panel send-panel">
          <h2>Prepare and send</h2>

          <div role="group" aria-label="Priority" className="field">
            <span className="eyebrow">Priority</span>
            <span className="prio-grid">
              {PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`prio-btn prio-btn-${p.id}${priority === p.id ? ' is-on' : ''}`}
                  aria-pressed={priority === p.id}
                  disabled={Boolean(sent)}
                  onClick={edit(() => setPriority(p.id))}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>

          <div className="field">
            <span className="eyebrow">Ask the flight surgeon</span>
            {report.suggested_questions.map((q) => (
              <label key={q.id} className="todo">
                <input
                  type="checkbox"
                  checked={asked.has(q.id)}
                  disabled={Boolean(sent)}
                  onChange={edit(() => {
                    const next = new Set(asked)
                    if (next.has(q.id)) next.delete(q.id)
                    else next.add(q.id)
                    setAsked(next)
                  })}
                />
                <span>{q.text}</span>
              </label>
            ))}
          </div>

          <div className="field">
            <span className="eyebrow">Attach</span>
            {[
              { id: 'trends', text: '14-day trends, all systems', bytes: sizes?.trends },
              { id: 'checkin', text: "Today's check-in results", bytes: sizes?.checkin },
            ].map((a) => (
              <label key={a.id} className="todo attach">
                <input
                  type="checkbox"
                  checked={attach[a.id]}
                  disabled={Boolean(sent)}
                  onChange={edit(() => setAttach({ ...attach, [a.id]: !attach[a.id] }))}
                />
                <span>{a.text}</span>
                <span className="mono note">{a.bytes ? kb(a.bytes) : '…'}</span>
              </label>
            ))}
          </div>

          <div className="field">
            <label htmlFor="report-note" className="eyebrow">
              Note (optional)
            </label>
            <input
              id="report-note"
              className="text-input"
              value={note}
              maxLength={500}
              disabled={Boolean(sent)}
              placeholder="Anything the data does not show"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <p className="note">
            Only this summary is sent. Your check-in answers stay onboard unless you attach them. Packet:{' '}
            <span className="mono packet">{sizes ? `${kb(sizes.total)} gzip` : '…'}</span>
          </p>

          <button type="button" className={sent ? 'apply is-applied' : 'apply'} disabled={Boolean(sent) || sending} onClick={send}>
            {sent
              ? `✓ Sent ${hhmm(sent.sent_at)} UTC · reply expected ${hhmm(sent.steps[3].at)} UTC`
              : sending
                ? 'Sending…'
                : 'Send to Earth'}
          </button>
        </div>

        <div className="panel trip">
          <span className="eyebrow accent">Round trip · {report.earth_delay_min} min each way</span>
          {steps.map((st, i) => (
            <div key={st.label} className="trip-step">
              <span className={`trip-dot${sent && i === 0 ? ' is-done' : sent ? ' is-next' : ''}`} />
              <span className="trip-label">{st.label}</span>
              <span className="mono note">{st.at ? `${hhmm(st.at)} UTC` : `+${st.minutes} min`}</span>
            </div>
          ))}
          <span className="note">Until the reply arrives, follow the action plan on the Alerts screen.</span>
        </div>
      </section>
    </main>
  )
}
