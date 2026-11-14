import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { simulateWhatIf } from './demoApi.js'

// The online demo recomputes the What-if in the browser. It must match the Python backend exactly.
const demo = JSON.parse(readFileSync(new URL('../../public/demo/whatif.json', import.meta.url)))
const cases = JSON.parse(readFileSync(new URL('./fixtures/whatif_cases.json', import.meta.url)))

test('demo What-if matches the backend on today\'s plan', () => {
  const r = demo.response
  assert.deepEqual(simulateWhatIf(demo.inputs, r.today_plan, r.today_plan), r.current)
})

test('demo What-if matches the backend on 80 random plans', () => {
  for (const c of cases) {
    assert.deepEqual(simulateWhatIf(demo.inputs, c.plan, demo.response.today_plan), c.projected, JSON.stringify(c.plan))
  }
})
