import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FREE_SPOT, findFreeSpot } from './freeSpot.ts'

const size = { w: 200, h: 100 }

test('empty canvas: lands exactly where asked', () => {
  assert.deepEqual(findFreeSpot(size, { x: 0, y: 0 }, []), { x: 0, y: 0 })
})

test('far-away items do not move it', () => {
  const far = [{ x: 5000, y: 5000, w: 100, h: 100 }]
  assert.deepEqual(findFreeSpot(size, { x: 0, y: 0 }, far), { x: 0, y: 0 })
})

test('moves off an item in the way, to a nearby spot that is clear', () => {
  const blocker = { x: -150, y: -100, w: 300, h: 200 }
  const spot = findFreeSpot(size, { x: 0, y: 0 }, [blocker])
  const p = FREE_SPOT.padding
  const rect = { x: spot.x - size.w / 2 - p, y: spot.y - size.h / 2 - p, w: size.w + 2 * p, h: size.h + 2 * p }
  const overlap =
    rect.x < blocker.x + blocker.w && blocker.x < rect.x + rect.w && rect.y < blocker.y + blocker.h && blocker.y < rect.y + rect.h
  assert.ok(!overlap)
  assert.ok(Math.hypot(spot.x, spot.y) < 600, 'stays close')
})

test('fully surrounded: falls back to below everything', () => {
  const wall = [{ x: -100_000, y: -100_000, w: 200_000, h: 200_000 }]
  const spot = findFreeSpot(size, { x: 0, y: 0 }, wall)
  assert.ok(spot.y - size.h / 2 > 100_000)
})
