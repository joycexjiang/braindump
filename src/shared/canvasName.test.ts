import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayName, localDate, timestampName } from './canvasName.ts'

test('matches the Figma page style', () => {
  assert.equal(timestampName(new Date(2026, 9, 29, 22, 0)), 'oct 29, 26 10pm')
})

test('shows minutes when not on the hour', () => {
  assert.equal(timestampName(new Date(2026, 10, 24, 0, 48)), 'nov 24, 26 12:48am')
  assert.equal(timestampName(new Date(2026, 0, 5, 12, 7)), 'jan 5, 26 12:07pm')
})

test('day pages match the timestamp style, with the weekday and no time', () => {
  assert.equal(dayName('2026-09-21'), 'mon sep 21, 26')
  assert.equal(dayName('2026-11-24'), 'tue nov 24, 26')
  assert.equal(dayName('2027-01-01'), 'fri jan 1, 27')
})

test('localDate uses local time, padded', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(localDate(new Date(2026, 10, 24, 0, 1)), '2026-11-24')
})
