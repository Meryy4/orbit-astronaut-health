// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTrial, summarize, selfReportGap, isFinished, randomWait, checkinPayload } from './pvt.js'

const trials = (rts) => rts.map(makeTrial)

test('responses under 100 ms are false starts', () => {
  assert.deepEqual(makeTrial(80), { rt: null, falseStart: true })
  assert.deepEqual(makeTrial(null), { rt: null, falseStart: true })
  assert.deepEqual(makeTrial(250.4), { rt: 250, falseStart: false })
})

test('lapses count reaction times above 355 ms', () => {
  const s = summarize(trials([250, 260, 356, 400, 355]))
  assert.equal(s.lapses, 2)
  assert.equal(s.medianMs, 355)
})

test('status follows the thresholds', () => {
  assert.equal(summarize(trials([240, 250, 260, 400])).status, 'green')
  assert.equal(summarize(trials([240, 250, 400, 400])).status, 'yellow')
  assert.equal(summarize(trials([400, 400, 400, 400])).status, 'red')
  assert.equal(summarize(trials([300, 300, 300, 300])).status, 'yellow') // +21% vs 248 ms
  assert.equal(summarize([]).status, null)
})

test('false starts are counted but not used in the median', () => {
  const s = summarize(trials([50, 250, 260, null]))
  assert.equal(s.falseStarts, 2)
  assert.equal(s.count, 2)
  assert.equal(s.medianMs, 255)
})

test('self-report gap only when feeling fine but data is not green', () => {
  const bad = summarize(trials([300, 380, 390, 310]))
  assert.match(selfReportGap(bad, 2), /fatigue 2\/5.*2 lapses/)
  assert.equal(selfReportGap(bad, 4), null)
  assert.equal(selfReportGap(summarize(trials([240, 250])), 1), null)
  assert.equal(selfReportGap(bad, null), null)
})

test('demo ends after 8 valid trials, full mode after 3 minutes', () => {
  assert.equal(isFinished('demo', trials([250, 250, 250, 250, 250, 250, 250]), 0), false)
  assert.equal(isFinished('demo', trials([250, 250, 250, 250, 250, 250, 250, 250]), 0), true)
  assert.equal(isFinished('full', trials([250]), 179999), false)
  assert.equal(isFinished('full', trials([250]), 180000), true)
})

test('random wait stays inside the mode range', () => {
  assert.equal(randomWait('full', () => 0), 2000)
  assert.equal(randomWait('full', () => 1), 10000)
  assert.equal(randomWait('demo', () => 1), 5000)
})

test('payload uses DATA_FORMAT.md field names', () => {
  const p = checkinPayload({
    astronautId: 'nova-01', missionDay: 412, mode: 'demo',
    trials: trials([250, 270]), answers: { sleep: 3, mood: 4, fatigue: 2 },
  })
  assert.equal(p.cognitive.pvt_mean_rt_ms, 260)
  assert.equal(p.self_report.fatigue_1_5, 2)
  assert.equal(p.sleep.quality_1_5, 3)
})

test('self-report gap never says "-X% slower" when the median is fast', () => {
  const trials = [200, 210, 220, 400, 420, 450, 230, 240].map(makeTrial)
  const msg = selfReportGap(summarize(trials), 2)
  assert.match(msg, /3 lapses/)
  assert.doesNotMatch(msg, /slower than your baseline/)
})
