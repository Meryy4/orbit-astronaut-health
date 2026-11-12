import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countByStatus, describeAnomaly, describeSystems } from './twin.js'

// Shapes follow GET /mission/{id}/day/{n} and GET /analysis/{id}/day/{n}.
const rec = {
  mission_day: 412,
  replay_date: '2024-05-14',
  phase: 'surface',
  vitals: { resting_hr_bpm: 76, hrv_rmssd_ms: 23, body_temp_c: 36.9 },
  sleep: { duration_min: 290 },
  cognitive: { pvt_mean_rt_ms: 327, pvt_lapses: 5 },
  self_report: { fatigue_1_5: 2, symptoms: ['headache'] },
  exercise: { resistance_min: 45 },
  radiation: { daily_dose_msv: 5.1, cumulative_dose_msv: 523.3, solar_event: 'FLR-2024-05-14' },
  bone: { bmd_change_pct: -7.58 },
}
const sys = (status, reasons = []) => ({ status, score: 0, reasons })
const analysis = {
  mission_day: 412,
  systems: {
    radiation: sys('red'),
    behavioral: sys('red'),
    cardiovascular: sys('yellow', ['HRV 23 ms']),
    bone: sys('green'),
    immune: sys('green'),
  },
  self_report_gap: { detected: true, message: '...' },
  forecast: { bone_threshold_day: 542, radiation_limit_day: 532 },
  baseline: { pvt_mean_rt_ms: 248, hrv_rmssd_ms: 45.1, sleep_duration_min: 430, daily_dose_msv: 0.64, resting_hr_bpm: 62, body_temp_c: 36.9 },
  metrics: { bone_loss_pct_per_month: 0.55 },
}

test('one entry per system, radiation first, statuses from the analysis', () => {
  const s = describeSystems(rec, analysis)
  assert.deepEqual(s.map((x) => x.id), ['radiation', 'behavioral', 'cardiovascular', 'bone', 'immune'])
  assert.deepEqual(countByStatus(s), { red: 2, yellow: 1, green: 2 })
})

test('radiation cites DONKI, the dose ratio and the career limit day', () => {
  const r = describeSystems(rec, analysis)[0]
  assert.match(r.why, /NASA DONKI event FLR-2024-05-14/)
  assert.match(r.why, /8× your daily average/)
  assert.match(r.why, /day 532 \(120 days away\)/)
  assert.match(r.action, /shelter/)
})

test('brain & sleep shows the slowdown, the sleep and the self-report gap', () => {
  const b = describeSystems(rec, analysis)[1]
  assert.match(b.why, /32% slower than your baseline, with 5 lapses/)
  assert.match(b.why, /4\.8 h \(usually 7\.2 h\)/)
  assert.match(b.why, /fatigue 2\/5/)
})

test('a calm day gives "nothing to do" and no solar event', () => {
  const calmRec = { ...rec, radiation: { ...rec.radiation, daily_dose_msv: 0.64, solar_event: null } }
  const calm = { ...analysis, systems: { ...analysis.systems, radiation: sys('green') } }
  const r = describeSystems(calmRec, calm)[0]
  assert.match(r.why, /No solar event today/)
  assert.equal(r.action, 'Nothing to do.')
})

test('ML flag adds the personal-baseline note, without calling ML reasons "outside the safe range"', () => {
  const flagged = {
    ...analysis,
    systems: {
      ...analysis.systems,
      cardiovascular: { status: 'yellow', score: 0, flagged_by: 'ml', reasons: ['Resting heart rate +25% vs your baseline (ML)'] },
    },
  }
  const heart = describeSystems(rec, flagged)[2]
  assert.match(heart.why, /unusual for you/)
  assert.doesNotMatch(heart.why, /outside the safe range/)
})

test('anomaly block: warm-up, normal and unusual day', () => {
  assert.equal(describeAnomaly(null).state, 'warmup')
  assert.equal(describeAnomaly({ is_anomaly: false, top_factors: [] }).state, 'normal')
  const a = describeAnomaly({
    is_anomaly: true,
    top_factors: [
      { feature: 'sleep.duration_min', label: 'Sleep duration', vs_baseline_pct: -34, vs_baseline: -149.1 },
      { feature: 'vitals.body_temp_c', label: 'Body temperature', vs_baseline_pct: 3, vs_baseline: 1.2 },
    ],
  })
  assert.deepEqual(a.factors, [
    { label: 'Sleep duration', delta: '−34%' },
    { label: 'Body temperature', delta: '+1.2 °C' },
  ])
})
