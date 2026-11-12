import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitCitations } from './assistant.js'

test('citations become numbers, text stays text', () => {
  assert.deepEqual(splitCitations('Go to the shelter [1]. Sleep 7 h [2][3].'), ['Go to the shelter ', 1, '. Sleep 7 h ', 2, 3, '.'])
  assert.deepEqual(splitCitations('No sources here.'), ['No sources here.'])
})
