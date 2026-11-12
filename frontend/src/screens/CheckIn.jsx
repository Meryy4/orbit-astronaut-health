import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import {
  MODES, BASELINE_RT_MS, LAPSE_MS, TIMEOUT_MS,
  randomWait, makeTrial, isFinished, summarize, selfReportGap, checkinPayload,
} from '../lib/pvt.js'
import './CheckIn.css'

const QUESTIONS = [
  { key: 'sleep', label: 'Sleep quality', hint: '1 = very bad · 5 = great' },
  { key: 'mood', label: 'Mood', hint: '1 = very low · 5 = great' },
  { key: 'fatigue', label: 'Fatigue', hint: '1 = none · 5 = exhausted' },
]

const STATUS_LABEL = { green: 'Green', yellow: 'Amber', red: 'Red' }

// The PVT runs on refs + timers, and React state only mirrors what is shown.
// Responses use pointerdown (not click) because click fires on release and adds ~100 ms.
function usePvt(mode) {
  const [phase, setPhase] = useState('intro') // intro | wait | go | result
  const [trials, setTrials] = useState([])
  const [counter, setCounter] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [testMs, setTestMs] = useState(0)
  const r = useRef({ phase: 'intro', trials: [], timer: null, raf: null, clock: null, t0: 0, start: 0 })

  const clearAll = () => {
    clearTimeout(r.current.timer)
    cancelAnimationFrame(r.current.raf)
    clearInterval(r.current.clock)
  }
  useEffect(() => clearAll, [])

  const go = (p) => {
    r.current.phase = p
    setPhase(p)
  }

  const record = (trial) => {
    r.current.trials = [...r.current.trials, trial]
    setTrials(r.current.trials)
  }

  const finishOrNext = () => {
    const elapsed = performance.now() - r.current.start
    if (isFinished(mode, r.current.trials, elapsed)) {
      clearAll()
      setTestMs(elapsed)
      go('result')
    } else {
      schedule()
    }
  }

  const loop = () => {
    const ms = performance.now() - r.current.t0
    if (ms >= TIMEOUT_MS) {
      // No response for 30 s: counted as a lapse.
      record(makeTrial(TIMEOUT_MS))
      setFeedback({ kind: 'lapse', text: 'No response' })
      finishOrNext()
      return
    }
    setCounter(Math.round(ms))
    r.current.raf = requestAnimationFrame(loop)
  }

  const showStimulus = () => {
    setCounter(0)
    go('go')
    // t0 is taken on the next frame, when the counter is actually painted.
    r.current.raf = requestAnimationFrame(() => {
      r.current.t0 = performance.now()
      loop()
    })
  }

  const schedule = () => {
    go('wait')
    clearTimeout(r.current.timer)
    r.current.timer = setTimeout(showStimulus, randomWait(mode))
  }

  const start = () => {
    clearAll()
    r.current.trials = []
    r.current.start = performance.now()
    setTrials([])
    setFeedback(null)
    setTestMs(0)
    r.current.clock = setInterval(() => setTestMs(performance.now() - r.current.start), 250)
    schedule()
  }

  const respond = () => {
    const p = r.current.phase
    if (p === 'intro' || p === 'result') return start()
    if (p === 'wait') {
      record(makeTrial(null))
      setFeedback({ kind: 'false', text: 'Too early: false start' })
      return schedule()
    }
    if (p === 'go') {
      cancelAnimationFrame(r.current.raf)
      const t = makeTrial(performance.now() - r.current.t0)
      record(t)
      setFeedback(
        t.falseStart
          ? { kind: 'false', text: 'Too fast: false start' }
          : { kind: t.rt > LAPSE_MS ? 'lapse' : 'ok', text: `${t.rt} ms` },
      )
      finishOrNext()
    }
  }

  const reset = () => {
    clearAll()
    r.current.trials = []
    setTrials([])
    setFeedback(null)
    setTestMs(0)
    go('intro')
  }

  return { phase, trials, counter, feedback, testMs, respond, reset }
}

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span className={tone ? `stat-value tone-${tone}` : 'stat-value'}>{value}</span>
    </div>
  )
}

const PRIORITY_LABEL = { now: 'Now', today: 'Today', escalate: 'Escalate' }

function CheckInResult({ result }) {
  const { checkin, systems, self_report_gap: gap, actions } = result
  const behavioral = systems.behavioral
  return (
    <div className="result" role="status">
      <span className="eyebrow">Check-in received · day {result.mission_day}</span>
      <div className="stats">
        <Stat label="Vigilance (PVT)" value={STATUS_LABEL[checkin.pvt_status]} tone={checkin.pvt_status} />
        <Stat label="Behavioral today" value={STATUS_LABEL[behavioral.status]} tone={behavioral.status} />
      </div>
      {behavioral.reasons.length > 0 && <p className="note">Why: {behavioral.reasons.join(' · ')}</p>}
      {gap.detected && <p className="note tone-yellow">{gap.message}</p>}
      {actions.length > 0 && (
        <ul className="actions">
          {actions.map((a) => (
            <li key={a.text} className={`action action-${a.priority}`}>
              <span className="mono action-tag">{PRIORITY_LABEL[a.priority]}</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CheckIn({ mission }) {
  const [mode, setMode] = useState('demo')
  const [answers, setAnswers] = useState({ sleep: null, mood: null, fatigue: null })
  // { state: 'sending' | 'ok' | 'offline', payload, result?, error? }
  const [sent, setSent] = useState(null)
  const pvt = usePvt(mode)
  const padRef = useRef(null)

  const summary = summarize(pvt.trials)
  const running = pvt.phase === 'wait' || pvt.phase === 'go'
  const done = pvt.phase === 'result'
  const gap = done ? selfReportGap(summary, answers.fatigue) : null
  const allAnswered = QUESTIONS.every((q) => answers[q.key] !== null)
  const m = MODES[mode]

  const { respond } = pvt
  // Space bar responds while the test runs, or when the pad has focus.
  const onKey = useCallback(
    (e) => {
      if (e.code !== 'Space' || e.repeat) return
      const onPad = document.activeElement === padRef.current
      if (!running && !onPad) return
      e.preventDefault()
      respond()
    },
    [running, respond],
  )
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const progress = m.trials
    ? `Trial ${Math.min(summary.count + (done ? 0 : 1), m.trials)} / ${m.trials}`
    : `${Math.min(Math.floor(pvt.testMs / 1000), 180)} / 180 s`

  const submit = async () => {
    const payload = checkinPayload({
      astronautId: mission.astronautId,
      missionDay: mission.day,
      mode,
      trials: pvt.trials,
      answers,
    })
    setSent({ state: 'sending', payload })
    try {
      const result = await api.checkin(payload)
      setSent({ state: 'ok', payload, result })
    } catch (err) {
      setSent({ state: 'offline', payload, error: err.message })
    }
  }

  return (
    <main className="main">
      <section aria-label="Vigilance test" className="panel pvt">
        <div className="panel-head">
          <div className="title">
            <span className="eyebrow accent">Step 1 of 2</span>
            <h1>Vigilance test (PVT)</h1>
          </div>
          <div className="mode" role="group" aria-label="Test length">
            {Object.entries(MODES).map(([id, def]) => (
              <button
                key={id}
                type="button"
                className={id === mode ? 'chip is-on' : 'chip'}
                aria-pressed={id === mode}
                disabled={running}
                onClick={() => {
                  setMode(id)
                  pvt.reset()
                }}
              >
                {def.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pvt-meta mono">
          <span>{pvt.phase === 'intro' ? (m.trials ? `${m.trials} trials` : '3 minutes') : progress}</span>
          <span>{summary.falseStarts} false start{summary.falseStarts === 1 ? '' : 's'}</span>
        </div>

        <button
          ref={padRef}
          type="button"
          className={`pad pad-${pvt.phase}`}
          aria-label={pvt.phase === 'go' ? 'Respond now' : 'Reaction pad'}
          onPointerDown={(e) => {
            e.preventDefault()
            pvt.respond()
          }}
        >
          {pvt.phase === 'intro' && (
            <span className="pad-msg">
              <span className="pad-big">Tap to start</span>
              <span>A counter will appear at a random moment. Tap, click or press Space as fast as you can when you see it.</span>
            </span>
          )}
          {pvt.phase === 'wait' && (
            <span className="pad-msg">
              <span className="mono pad-wait-text">Wait for the counter…</span>
              {pvt.feedback && <span className={`mono fb fb-${pvt.feedback.kind}`}>{pvt.feedback.text}</span>}
            </span>
          )}
          {pvt.phase === 'go' && <span className="mono pad-counter">{pvt.counter}</span>}
          {done && (
            <span className="pad-msg">
              <span className="pad-big">Test complete</span>
              <span>Tap to run it again</span>
            </span>
          )}
        </button>

        {pvt.trials.length > 0 && (
          <ol className="strip" aria-label="Reaction times">
            {pvt.trials.map((t, i) => (
              <li
                key={i}
                className={t.falseStart ? 'tick tick-false' : t.rt > LAPSE_MS ? 'tick tick-lapse' : 'tick'}
                title={t.falseStart ? 'False start' : `${t.rt} ms`}
              >
                {t.falseStart ? 'FS' : t.rt}
              </li>
            ))}
          </ol>
        )}

        <div className="stats">
          <Stat label="Median RT" value={summary.medianMs === null ? '—' : `${summary.medianMs} ms`} />
          <Stat label={`Lapses > ${LAPSE_MS} ms`} value={summary.count ? summary.lapses : '—'} />
          <Stat
            label={`vs baseline ${BASELINE_RT_MS} ms`}
            value={summary.deltaPct === null ? '—' : `${summary.deltaPct > 0 ? '+' : ''}${summary.deltaPct}%`}
          />
          <Stat label="Status" value={summary.status ? STATUS_LABEL[summary.status] : '—'} tone={summary.status} />
        </div>
        <p className="note">
          Demo mode: 8 trials, 2–5 s wait. Full PVT-B: 3 minutes, 2–10 s random wait, lapse above 355 ms (Basner et al., 2011).
          The baseline is Cmdr Nova's 14-day baseline.
        </p>
      </section>

      <section aria-label="Self-report" className="panel report">
        <div className="title">
          <span className="eyebrow accent">Step 2 of 2</span>
          <h2>How do you feel?</h2>
        </div>

        {QUESTIONS.map((q) => (
          <div key={q.key} role="group" aria-label={q.label} className="question">
            <span className="q-head">
              <span className="q-label">{q.label}</span>
              <span className="mono q-hint">{q.hint}</span>
            </span>
            <span className="scale">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={answers[q.key] === v ? 'opt is-on' : 'opt'}
                  aria-pressed={answers[q.key] === v}
                  onClick={() => setAnswers({ ...answers, [q.key]: v })}
                >
                  {v}
                </button>
              ))}
            </span>
          </div>
        ))}

        {gap && (
          <div className="gap" role="status">
            <span className="eyebrow tone-yellow">Self-report gap</span>
            <p>{gap}</p>
          </div>
        )}

        <button
          type="button"
          className="submit"
          disabled={!done || !allAnswered || sent?.state === 'sending'}
          onClick={submit}
        >
          {sent?.state === 'sending' ? 'Sending…' : 'Submit check-in'}
        </button>
        {!done && <p className="note">Finish the vigilance test first.</p>}
        {done && !allAnswered && <p className="note">Answer the 3 questions to submit.</p>}

        {sent?.state === 'ok' && <CheckInResult result={sent.result} />}
        {sent?.state === 'offline' && (
          <div className="sent" role="alert">
            <span className="eyebrow tone-yellow">Backend not reachable · {sent.error}</span>
            <p className="note">Start it with: cd backend && .venv/bin/uvicorn app.main:app --port 8010</p>
            <pre>{JSON.stringify(sent.payload, null, 2)}</pre>
          </div>
        )}
      </section>
    </main>
  )
}
