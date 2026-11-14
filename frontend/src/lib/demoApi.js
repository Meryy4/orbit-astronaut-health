// Online demo (GitHub Pages): same interface as api.js, but no backend.
// Answers come from JSON files exported from the real backend (backend/scripts/export_demo.py),
// the What-if model runs here in JavaScript, and the assistant replays answers recorded from the
// real local model (backend/scripts/record_assistant.py). Crew actions are kept in memory.

const cache = new Map()
function load(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`${import.meta.env.BASE_URL}demo/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`Demo data missing: ${name}`)
        return r.json()
      }),
    )
  }
  return cache.get(name)
}

const clone = (x) => structuredClone(x)
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, '+00:00')
const RANK = { green: 0, yellow: 1, red: 2 }
const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))

// --- What-if model (same formulas as backend/app/whatif.py and analysis.py) -------------------

function phaseOf(day, i) {
  return day <= i.transit_end_day ? 'transit' : day <= i.leave_mars_day ? 'surface' : 'return'
}

function radiationLimitDay(i, currentRate) {
  let cum = i.cumulative_msv
  if (cum >= i.career_limit_msv) return i.day
  const now = phaseOf(i.day, i)
  for (let d = i.day + 1; d < i.day + 5000; d++) {
    const ph = phaseOf(d, i)
    cum += ph === now ? currentRate : i.nominal_dose_msv[ph]
    if (cum >= i.career_limit_msv) return d
  }
  return null
}

function boneThresholdDay(i, rateMonth) {
  let loss = i.bone_loss_now
  if (loss >= i.bone_threshold_pct) return i.day
  const now = phaseOf(i.day, i)
  for (let d = i.day + 1; d < i.day + 5000; d++) {
    const ph = phaseOf(d, i)
    loss += (ph === now ? rateMonth : i.nominal_bone_pct_month[ph]) / 30
    if (loss >= i.bone_threshold_pct) return d
  }
  return null
}

// Python's round() rounds halves to even; match it so the demo gives the backend's exact numbers.
function pyRound(x, digits = 0) {
  const f = 10 ** digits
  const v = x * f
  const r = Math.round(v)
  return (Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r) / f
}

export function simulateWhatIf(i, plan, now) {
  const c = i.coef
  const extraEx = plan.resistance_min - now.resistance_min
  const rate = extraEx === 0 ? i.bone_rate_now : Math.max(c.min_bone_rate, i.bone_rate_now - c.bone_per_exercise_min * extraEx)
  const daily = i.base_daily_msv * (1 - (c.shield_reduction * plan.shield_h) / 24)
  const extraSleep = plan.sleep_h - now.sleep_h
  const lapses = Math.max(0, pyRound(i.lapses_now - c.lapses_per_sleep_h * extraSleep))
  const t = i.thresholds
  return {
    bone: {
      rate_pct_per_month: pyRound(rate, 2),
      threshold_day: boneThresholdDay(i, rate),
      status: rate > t.bone_red ? 'red' : rate >= t.bone_yellow ? 'yellow' : 'green',
    },
    radiation: { daily_dose_msv: pyRound(daily, 3), limit_day: radiationLimitDay(i, daily) },
    vigilance: {
      lapses,
      rt_vs_baseline_pct: Math.max(0, pyRound(i.rt_now_pct - c.rt_pct_per_sleep_h * extraSleep)),
      status: lapses >= t.lapses_red ? 'red' : lapses >= t.lapses_yellow ? 'yellow' : 'green',
    },
  }
}

// --- Crew state (in memory, like the backend) -------------------------------------------------

const state = new Map() // day -> { done: {id: time}, acked_at, plan, report_sent }
const stateOf = (day) => {
  if (!state.has(day)) state.set(day, { done: {}, acked_at: null, plan: null, report_sent: null })
  return state.get(day)
}

async function alertFor(day) {
  const alert = clone((await load('alerts'))[day - 1])
  const s = stateOf(day)
  alert.acknowledged_at = s.acked_at
  if (s.plan && alert.level !== 'green') {
    const p = s.plan
    const item = {
      id: 'whatif-plan',
      priority: 'today',
      text: `Your new plan: ${p.sleep_h.toFixed(1)} h of sleep, ${p.resistance_min} min/day of resistance exercise, +${p.shield_h} h/day in shielded quarters.`,
    }
    let today = alert.groups.find((g) => g.priority === 'today')
    if (!today) {
      today = { priority: 'today', label: 'Today', items: [] }
      alert.groups.splice(alert.groups.findIndex((g) => g.priority === 'escalate') >>> 0, 0, today)
    }
    today.items.push(item)
  }
  for (const g of alert.groups) for (const a of g.items) Object.assign(a, { done: a.id in s.done, done_at: s.done[a.id] ?? null })
  const items = alert.groups.flatMap((g) => g.items)
  alert.done_count = items.filter((a) => a.done).length
  alert.total_count = items.length
  return alert
}

async function reportFor(day) {
  const report = clone(await load('report'))
  const alert = await alertFor(day)
  report.generated_at = nowIso()
  report.actions_taken = alert.groups
    .flatMap((g) => g.items)
    .filter((a) => a.done)
    .map((a) => ({ text: a.text, at: a.done_at }))
    .sort((a, b) => a.at.localeCompare(b.at))
  report.sent = stateOf(day).report_sent
  return report
}

// --- Assistant: replay of recorded answers -----------------------------------------------------

const words = (s) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? [])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ask(body, onLine) {
  const data = await load('assistant')
  const q = words(body.question)
  let best = null
  let bestScore = 0
  for (const a of data.answers) {
    const aw = words(a.question)
    const score = [...q].filter((w) => w.length > 3 && aw.has(w)).length / Math.max(1, aw.size)
    if (score > bestScore) [best, bestScore] = [a, score]
  }
  if (!best || bestScore < 0.25) {
    onLine({ type: 'sources', sources: [], model: data.model })
    const msg =
      'This online demo cannot run the onboard model, so it replays answers recorded from it. Try one of the suggested questions, or run ORBIT locally (see the README) to ask anything.'
    for (const w of msg.split(' ')) {
      onLine({ type: 'token', text: `${w} ` })
      await sleep(18)
    }
    onLine({ type: 'done' })
    return
  }
  onLine({ type: 'sources', sources: best.sources, model: data.model })
  await sleep(400)
  for (const w of best.answer.split(/(\s+)/)) {
    onLine({ type: 'token', text: w })
    if (w.trim()) await sleep(22)
  }
  onLine({ type: 'done' })
}

// --- Check-in: live PVT result on top of today's precomputed analysis --------------------------

async function checkin(payload) {
  const all = await load('analysis')
  const days = await load('days')
  const day = payload.mission_day
  const result = clone(all[day - 1])
  const rec = days[day - 1]
  const c = payload.cognitive
  const baseRt = result.baseline.pvt_mean_rt_ms
  const rt = c.pvt_median_rt_ms ?? c.pvt_mean_rt_ms
  const pct = rt === null ? null : pyRound(((rt - baseRt) / baseRt) * 100)
  const pvt = c.pvt_lapses >= 4 ? 'red' : c.pvt_lapses >= 2 || (pct ?? 0) >= 20 ? 'yellow' : 'green'
  const hours = rec.sleep.duration_min / 60
  const sleepS = hours < 5 ? 'red' : hours < 7 ? 'yellow' : 'green'
  const reasons = []
  if (sleepS !== 'green') reasons.push(`Sleep ${hours.toFixed(1)} h`)
  if (pvt !== 'green') reasons.push(`${c.pvt_lapses} PVT lapses`)
  result.systems.behavioral = { ...result.systems.behavioral, status: worst(sleepS, pvt), reasons }
  const fatigue = payload.self_report.fatigue_1_5
  if (fatigue <= 2 && pvt !== 'green' && rt !== null) {
    const lapses = `${c.pvt_lapses} lapse${c.pvt_lapses > 1 ? 's' : ''}`
    result.self_report_gap = {
      detected: true,
      message:
        pct > 0
          ? `You rated your fatigue ${fatigue}/5, but your reaction time is ${pct}% slower than your baseline${c.pvt_lapses ? `, with ${lapses}` : ''}.`
          : `You rated your fatigue ${fatigue}/5, but the test shows ${lapses} (responses slower than 355 ms).`,
    }
  } else {
    result.self_report_gap = { detected: false, message: null }
  }
  result.checkin = { pvt_status: pvt, baseline_rt_ms: baseRt, vs_baseline_pct: pct }
  return result
}

export const demoApi = {
  demo: true,
  assistantStatus: async () => ({
    ollama: true,
    index: true,
    demo: true,
    model: (await load('assistant')).model,
  }),
  ask,
  mission: () => load('mission'),
  day: async (_id, n) => (await load('days'))[n - 1],
  days: () => load('days'),
  analysis: async (_id, n) => (await load('analysis'))[n - 1],
  timeline: () => load('timeline'),
  report: (_id, n) => reportFor(n),
  sendReport: async (_id, n, body) => {
    const sentAt = nowIso()
    const r = await load('report')
    const delay = r.earth_delay_min
    const review = r.review_min[body.priority]
    const t0 = new Date(sentAt)
    const at = (min) => new Date(t0.getTime() + min * 60000).toISOString().replace(/\.\d+Z$/, '+00:00')
    const steps = [
      ['Sent from Mars', 0],
      ['Arrives at Mission Control', delay],
      ['Flight surgeon review (estimate)', delay + review],
      ['Reply arrives on Mars', 2 * delay + review],
    ].map(([label, minutes]) => ({ label, at: at(minutes), minutes }))
    stateOf(n).report_sent = { ...body, sent_at: sentAt, steps }
    return reportFor(n)
  },
  checkin,
  whatif: async (body) => {
    const w = await load('whatif')
    const res = clone(w.response)
    if (!body.plan) return res
    res.plan = body.plan
    res.projected = simulateWhatIf(w.inputs, body.plan, res.today_plan)
    return res
  },
  plan: async (body) => {
    stateOf(body.mission_day).plan = body.plan
    return alertFor(body.mission_day)
  },
  alert: (_id, n) => alertFor(n),
  ack: async (_id, n) => {
    const s = stateOf(n)
    s.acked_at = s.acked_at ?? nowIso()
    return alertFor(n)
  },
  tick: async (_id, n, actionId, done) => {
    const s = stateOf(n)
    if (done) s.done[actionId] = s.done[actionId] ?? nowIso()
    else delete s.done[actionId]
    return alertFor(n)
  },
}
