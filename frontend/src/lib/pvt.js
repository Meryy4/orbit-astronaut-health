// PVT (Psychomotor Vigilance Test) logic, kept separate from the UI so it can be tested.
// Reference: Basner, Mollicone & Dinges (2011), PVT-B: 3 min, random wait 2-10 s,
// lapse = reaction time > 355 ms, false start = response before the stimulus or < 100 ms.

export const LAPSE_MS = 355
export const FALSE_START_MS = 100
export const TIMEOUT_MS = 30000

export const MODES = {
  demo: { label: 'Demo', trials: 8, durationMs: null, minWaitMs: 2000, maxWaitMs: 5000 },
  full: { label: 'Full PVT-B', trials: null, durationMs: 180000, minWaitMs: 2000, maxWaitMs: 10000 },
}

// Cmdr Nova's personal baseline. Will come from the backend (14-day baseline) later.
export const BASELINE_RT_MS = 248

export function randomWait(mode, rand = Math.random) {
  const { minWaitMs, maxWaitMs } = MODES[mode]
  return minWaitMs + rand() * (maxWaitMs - minWaitMs)
}

// A trial is { rt: number | null, falseStart: boolean }.
export function makeTrial(rt) {
  if (rt === null || rt < FALSE_START_MS) return { rt: null, falseStart: true }
  return { rt: Math.round(rt), falseStart: false }
}

export function isFinished(mode, trials, elapsedMs) {
  const m = MODES[mode]
  if (m.trials !== null) return validRts(trials).length >= m.trials
  return elapsedMs >= m.durationMs
}

export function validRts(trials) {
  return trials.filter((t) => !t.falseStart).map((t) => t.rt)
}

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mean(values) {
  if (!values.length) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

// Status follows data/thresholds.json: lapses <= 1 green, 2-3 yellow, >= 4 red.
// A median 20% slower than baseline also gives at least yellow.
export function summarize(trials, baseline = BASELINE_RT_MS) {
  const rts = validRts(trials)
  const lapses = rts.filter((r) => r > LAPSE_MS).length
  const falseStarts = trials.length - rts.length
  const med = median(rts)
  const deltaPct = med === null ? null : Math.round(((med - baseline) / baseline) * 100)

  let status = null
  if (rts.length) {
    if (lapses >= 4) status = 'red'
    else if (lapses >= 2 || deltaPct >= 20) status = 'yellow'
    else status = 'green'
  }

  return { count: rts.length, medianMs: med, meanMs: mean(rts), lapses, falseStarts, deltaPct, status }
}

// Self-report gap: the astronaut says they feel fine (fatigue 1-2 / 5),
// but the measured vigilance is not green.
export function selfReportGap(summary, fatigue) {
  if (fatigue === null || fatigue > 2) return null
  if (summary.status === null || summary.status === 'green') return null
  const lapses = `${summary.lapses} lapse${summary.lapses > 1 ? 's' : ''}`
  if (summary.deltaPct > 0) {
    const msg = `You rated your fatigue ${fatigue}/5, but your reaction time is ${summary.deltaPct}% slower than your baseline`
    return summary.lapses ? `${msg}, with ${lapses}.` : `${msg}.`
  }
  return `You rated your fatigue ${fatigue}/5, but the test shows ${lapses} (responses slower than ${LAPSE_MS} ms).`
}

// Payload for POST /checkin, following docs/DATA_FORMAT.md field names.
export function checkinPayload({ astronautId, missionDay, mode, trials, answers }) {
  const s = summarize(trials)
  return {
    astronaut_id: astronautId,
    mission_day: missionDay,
    cognitive: {
      pvt_mode: mode,
      pvt_mean_rt_ms: s.meanMs,
      pvt_median_rt_ms: s.medianMs,
      pvt_lapses: s.lapses,
      pvt_false_starts: s.falseStarts,
      pvt_trials: s.count,
    },
    sleep: { quality_1_5: answers.sleep },
    self_report: { mood_1_5: answers.mood, fatigue_1_5: answers.fatigue },
  }
}
