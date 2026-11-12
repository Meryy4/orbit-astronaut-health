// Turns one day's record + analysis (from the API) into what the Twin screen shows.
// Pure functions, so they can be tested without React.

export const SYSTEMS = [
  { id: 'radiation', name: 'Radiation', source: 'NASA DONKI · Hassler 2014 · NASA-STD-3001' },
  { id: 'behavioral', name: 'Brain & sleep', source: 'Basner 2011 · Barger 2014' },
  { id: 'cardiovascular', name: 'Heart', source: 'NASA-STD-3001 · ORBIT assumption (HRV)' },
  { id: 'bone', name: 'Bone', source: 'NASA HRP Bone Fracture Evidence Report' },
  { id: 'immune', name: 'Immune', source: 'Stahn 2017 · Crucian (to confirm)' },
]

export const STATUS_LABEL = { green: 'Green', yellow: 'Amber', red: 'Red' }
export const CAREER_LIMIT_MSV = 600

const pct = (value, base) => Math.round(((value - base) / base) * 100)
const hours = (min) => (min / 60).toFixed(1)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function radiation(rec, a) {
  const r = rec.radiation
  const b = a.baseline
  const limitDay = a.forecast.radiation_limit_day
  const ratio = Math.round(r.daily_dose_msv / b.daily_dose_msv)
  const limit =
    limitDay === null
      ? ''
      : limitDay <= a.mission_day
        ? ` The ${CAREER_LIMIT_MSV} mSv career limit is reached.`
        : ` At your usual rate, the ${CAREER_LIMIT_MSV} mSv career limit is reached on day ${limitDay} (${limitDay - a.mission_day} days away).`
  const why = r.solar_event
    ? `NASA DONKI event ${r.solar_event} (replayed from ${rec.replay_date}). Today's dose is about ${ratio}× your daily average.${limit}`
    : `No solar event today. Your dose is in line with your ${rec.phase === 'transit' ? 'transit' : 'Mars-surface'} average.${limit}`
  const status = a.systems.radiation.status
  const action = r.solar_event && status !== 'green'
    ? 'Move to the radiation shelter now and postpone any EVA.'
    : status !== 'green'
      ? 'Limit time outside the habitat and keep tracking your cumulative dose.'
      : 'Nothing to do.'
  return {
    metric: `${r.daily_dose_msv} mSv today · ${r.cumulative_dose_msv} / ${CAREER_LIMIT_MSV} mSv`,
    baseline: `${b.daily_dose_msv.toFixed(2)} mSv/day`,
    why,
    action,
  }
}

function behavioral(rec, a) {
  const c = rec.cognitive
  const b = a.baseline
  const rt = c.pvt_median_rt_ms ?? c.pvt_mean_rt_ms
  const delta = pct(rt, b.pvt_mean_rt_ms)
  const parts = []
  if (delta > 0) parts.push(`Your reaction time is ${delta}% slower than your baseline`)
  else parts.push('Your reaction time is at your baseline')
  parts[0] += c.pvt_lapses ? `, with ${plural(c.pvt_lapses, 'lapse')}.` : '.'
  parts.push(`You slept ${hours(rec.sleep.duration_min)} h (usually ${hours(b.sleep_duration_min)} h).`)
  if (a.self_report_gap.detected) parts.push(`Yet you rated your fatigue ${rec.self_report.fatigue_1_5}/5.`)
  const status = a.systems.behavioral.status
  const action =
    status === 'red'
      ? 'No safety-critical task (EVA, suit check) before a new PVT. Aim for 7 h of sleep tonight.'
      : status === 'yellow'
        ? 'Aim for 7 h of sleep tonight and redo the check-in tomorrow.'
        : 'Nothing to do. Keep up the daily check-in.'
  return {
    metric: `PVT ${plural(c.pvt_lapses, 'lapse')} · ${hours(rec.sleep.duration_min)} h sleep`,
    baseline: `${b.pvt_mean_rt_ms} ms RT · ${hours(b.sleep_duration_min)} h sleep`,
    why: parts.join(' '),
    action,
  }
}

function cardiovascular(rec, a) {
  const v = rec.vitals
  const b = a.baseline
  const delta = pct(v.hrv_rmssd_ms, b.hrv_rmssd_ms)
  const status = a.systems.cardiovascular.status
  let why =
    delta <= -10
      ? `Your heart rate variability is ${-delta}% below your baseline.`
      : 'Your heart rate variability is close to your baseline.'
  if (status === 'green' && delta <= -20) why += ' The fixed threshold is fine, but this is unusual for you.'
  const ruleReasons = a.systems.cardiovascular.reasons.filter((r) => !r.endsWith('(ML)'))
  if (ruleReasons.length) why += ` ${ruleReasons.join(', ')} is outside the safe range.`
  return {
    metric: `HRV ${v.hrv_rmssd_ms} ms · resting HR ${v.resting_hr_bpm}`,
    baseline: `HRV ${b.hrv_rmssd_ms} ms · HR ${b.resting_hr_bpm}`,
    why,
    action:
      status !== 'green'
        ? 'Do a 10-minute guided breathing session, then measure again tonight.'
        : 'Nothing to do.',
  }
}

function bone(rec, a) {
  const rate = a.metrics.bone_loss_pct_per_month
  const day = a.forecast.bone_threshold_day
  const status = a.systems.bone.status
  return {
    metric: `−${rate.toFixed(2)}% / month · ${String(rec.bone.bmd_change_pct).replace('-', '−')}% total`,
    baseline: 'Target < 1.0% / month',
    why: `Modeled bone density change.${day ? ` Forecast: 10% loss threshold around day ${day}.` : ''}`,
    action:
      status !== 'green'
        ? 'Add 15 minutes of resistance exercise per day this week.'
        : `Keep your daily resistance exercise (${rec.exercise.resistance_min} min today).`,
  }
}

function immune(rec, a) {
  const t = rec.vitals.body_temp_c
  const symptoms = rec.self_report.symptoms
  const status = a.systems.immune.status
  const symptomText = symptoms.length ? `Reported: ${symptoms.join(', ')}.` : 'No symptoms reported.'
  return {
    metric: `${t} °C · ${symptoms.length ? symptoms.join(', ') : 'no symptoms'}`,
    baseline: `${a.baseline.body_temp_c} °C`,
    why:
      status === 'green'
        ? `Temperature is within your normal range. ${symptomText}`
        : `Temperature is above the safe range. ${symptomText}`,
    action: status === 'green' ? 'Nothing to do. Keep up the daily check-in.' : 'Rest, hydrate, and measure your temperature again in 4 h.',
  }
}

const DESCRIBE = { radiation, behavioral, cardiovascular, bone, immune }

const ML_NOTE = "The fixed safety thresholds are fine, but ORBIT's model finds this unusual for you."

export function describeSystems(rec, analysis) {
  return SYSTEMS.map((s) => {
    const d = DESCRIBE[s.id](rec, analysis)
    const ml = analysis.systems[s.id].flagged_by === 'ml'
    return { ...s, status: analysis.systems[s.id].status, ...d, why: ml ? `${d.why} ${ML_NOTE}` : d.why }
  })
}

// Text for the ML block: null while the model warms up.
export function describeAnomaly(anomaly) {
  if (!anomaly) return { state: 'warmup', title: 'Model warming up', text: 'The personal model needs 30 days of data.' }
  const signed = (v, unit) => `${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}`
  const factors = anomaly.top_factors.map((f) => ({
    label: f.label,
    delta: f.feature === 'vitals.body_temp_c' ? signed(f.vs_baseline, ' °C') : signed(f.vs_baseline_pct, '%'),
  }))
  return anomaly.is_anomaly
    ? { state: 'anomaly', title: 'Unusual day for you', text: 'What makes today different from your last 90 days:', factors }
    : { state: 'normal', title: 'A normal day for you', text: 'Your signals match your last 90 days.', factors: [] }
}

export function countByStatus(systems) {
  const out = { red: 0, yellow: 0, green: 0 }
  for (const s of systems) out[s.status] += 1
  return out
}
