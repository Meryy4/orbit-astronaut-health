import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { splitCitations } from '../lib/assistant.js'
import './Assistant.css'

const SUGGESTIONS = [
  'What should I do during a solar particle event?',
  'How does sleep loss affect my performance?',
  'What is the career radiation exposure limit?',
  'How does exercise protect bone during long missions?',
]

function Answer({ turn, onCite }) {
  return (
    <p className="answer">
      {splitCitations(turn.answer).map((part, i) =>
        typeof part === 'number' ? (
          <button key={i} type="button" className="cite mono" onClick={() => onCite(part)} aria-label={`Source ${part}`}>
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      {turn.state === 'streaming' && <span className="caret" aria-hidden="true" />}
    </p>
  )
}

function Turn({ turn }) {
  const [open, setOpen] = useState(null)
  return (
    <article className="turn">
      <p className="question">{turn.question}</p>
      <div className="panel reply">
        {turn.state === 'searching' && <p className="note">Searching 7 NASA documents…</p>}
        {turn.answer && <Answer turn={turn} onCite={(n) => setOpen(open === n ? null : n)} />}
        {turn.error && (
          <p className="note tone-red" role="alert">
            {turn.error}
          </p>
        )}
        {turn.sources?.length > 0 && (
          <ol className="sources">
            {turn.sources.map((s) => (
              <li key={s.n} className={open === s.n ? 'is-open' : ''}>
                <button type="button" className="source-head" aria-expanded={open === s.n} onClick={() => setOpen(open === s.n ? null : s.n)}>
                  <span className="mono cite-num">{s.n}</span>
                  <span className="source-title">
                    {s.title}
                    {s.reference && <span className="ref-tag mono">Reference</span>}
                  </span>
                  <span className="mono note">p. {s.page}</span>
                </button>
                {open === s.n && <p className="excerpt">“{s.excerpt}…”</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  )
}

export default function Assistant({ mission, prompt }) {
  const [status, setStatus] = useState(null)
  const [turns, setTurns] = useState([])
  const [question, setQuestion] = useState(prompt ?? '')
  const busy = turns.some((t) => t.state === 'searching' || t.state === 'streaming')
  const endRef = useRef(null)

  useEffect(() => {
    api.assistantStatus().then(setStatus).catch(() => setStatus({ ollama: false, index: false }))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const update = (id, patch) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)))

  const ask = async (q) => {
    const text = q.trim()
    if (text.length < 3 || busy) return
    const id = Date.now()
    setTurns((ts) => [...ts, { id, question: text, answer: '', sources: [], state: 'searching' }])
    setQuestion('')
    try {
      await api.ask({ astronaut_id: mission.astronautId, mission_day: mission.day, question: text }, (line) => {
        if (line.type === 'sources') update(id, () => ({ sources: line.sources, state: 'streaming' }))
        if (line.type === 'token') update(id, (t) => ({ answer: t.answer + line.text }))
        if (line.type === 'done') update(id, () => ({ state: 'done' }))
        if (line.type === 'error') update(id, () => ({ state: 'error', error: line.message }))
      })
      update(id, (t) => ({ state: t.state === 'streaming' ? 'done' : t.state }))
    } catch (err) {
      update(id, () => ({ state: 'error', error: err.message }))
    }
  }

  const ready = status?.ollama && status?.index

  return (
    <main className="main assistant">
      <div className="assistant-head">
        <div className="title">
          <span className="eyebrow accent">Onboard assistant</span>
          <h1>Ask ORBIT</h1>
          <p>
            Answers come from 7 public NASA documents and your data for day {mission.day}. Each sentence cites its source. ORBIT
            supports your decisions; it does not replace the crew medical officer.
          </p>
        </div>
        <span className={ready ? 'offline mono' : 'offline is-off mono'}>
          <span className="dot" />
          {status === null ? 'Checking…' : ready ? `Offline · runs on board · ${status.model}` : 'Local model not ready'}
        </span>
      </div>

      {status && !ready && (
        <p className="panel note setup" role="alert">
          {!status.ollama
            ? 'Start the local model: ollama serve'
            : 'Build the document index once: cd backend && .venv/bin/python -m app.rag build'}
        </p>
      )}

      <section aria-label="Conversation" className="conversation" aria-live="polite">
        {turns.length === 0 && (
          <div className="suggest">
            <span className="eyebrow">Try</span>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" disabled={!ready} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t) => (
          <Turn key={t.id} turn={t} />
        ))}
        <div ref={endRef} />
      </section>

      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
      >
        <label htmlFor="ask-input" className="visually-hidden">
          Your question
        </label>
        <input
          id="ask-input"
          value={question}
          maxLength={500}
          placeholder="Ask about your health, radiation, sleep, exercise…"
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!ready}
        />
        <button type="submit" className="submit" disabled={!ready || busy || question.trim().length < 3}>
          {busy ? 'Answering…' : 'Ask'}
        </button>
      </form>
    </main>
  )
}
