import { useState } from 'react'
import CheckIn from './screens/CheckIn.jsx'
import Twin from './screens/Twin.jsx'
import WhatIf from './screens/WhatIf.jsx'
import Alerts from './screens/Alerts.jsx'
import Assistant from './screens/Assistant.jsx'
import Mission from './screens/Mission.jsx'
import { MISSION } from './lib/mission.js'
import './App.css'

const SCREENS = [
  { id: 'twin', label: 'Twin' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'mission', label: 'Mission' },
  { id: 'whatif', label: 'What if' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'report', label: 'Earth report' },
]

function Logo() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="5" fill="var(--accent)" />
      <ellipse cx="14" cy="14" rx="12" ry="5" fill="none" stroke="var(--accent)" strokeWidth="1.5" transform="rotate(-25 14 14)" />
    </svg>
  )
}

function ComingSoon({ label }) {
  return (
    <main className="main">
      <section className="panel coming">
        <span className="eyebrow">Not built yet</span>
        <h1>{label}</h1>
        <p>This screen is designed in the mockups and comes next.</p>
      </section>
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState('twin')
  // Day shown by the Alerts screen: today, or the day the Twin was showing.
  const [alertDay, setAlertDay] = useState(MISSION.day)
  // Question pre-filled in the Assistant (e.g. from an alert).
  const [prompt, setPrompt] = useState({ text: '', key: 0 })
  const navigate = (id, day) => {
    if (id === 'alerts') setAlertDay(day ?? MISSION.day)
    setScreen(id)
  }
  // Day the Twin opens on (e.g. from a click on the Mission timeline).
  const [twinStart, setTwinStart] = useState({ day: MISSION.day, key: 0 })
  const openTwinDay = (day) => {
    setTwinStart((t) => ({ day, key: t.key + 1 }))
    setScreen('twin')
  }
  const askAssistant = (text) => {
    setPrompt((p) => ({ text, key: p.key + 1 }))
    setScreen('assistant')
  }
  const current = SCREENS.find((s) => s.id === screen)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand-name">ORBIT</span>
          <span className="brand-ctx mono">
            {MISSION.name} · Day {MISSION.day} · {MISSION.phase}
          </span>
        </div>
        <nav aria-label="Screens" className="nav">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === screen ? 'nav-item is-active' : 'nav-item'}
              aria-current={s.id === screen ? 'page' : undefined}
              onClick={() => navigate(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="delay mono">
          <span className="delay-dot" />
          Earth delay · {MISSION.earthDelayMin} min
        </div>
      </header>

      {screen === 'twin' ? (
        <Twin key={twinStart.key} mission={MISSION} onNavigate={navigate} startDay={twinStart.day} />
      ) : screen === 'mission' ? (
        <Mission mission={MISSION} onOpenDay={openTwinDay} />
      ) : screen === 'checkin' ? (
        <CheckIn mission={MISSION} />
      ) : screen === 'whatif' ? (
        <WhatIf mission={MISSION} onNavigate={navigate} />
      ) : screen === 'alerts' ? (
        <Alerts mission={MISSION} day={alertDay} onNavigate={navigate} onAsk={askAssistant} />
      ) : screen === 'assistant' ? (
        <Assistant key={prompt.key} mission={MISSION} prompt={prompt.text} />
      ) : (
        <ComingSoon label={current.label} />
      )}
    </div>
  )
}
