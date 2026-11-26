import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAYOUT, centerOn, layoutBatch, parseUrlList } from './layout.ts'

test('single item keeps its size when small', () => {
  assert.deepEqual(layoutBatch([{ w: 200, h: 100 }]), [{ x: 0, y: 0, w: 200, h: 100 }])
})

test('single item shrinks to fit, never grows', () => {
  const [p] = layoutBatch([{ w: 2000, h: 1000 }])
  assert.equal(p.w, LAYOUT.singleMax)
  assert.equal(p.h, LAYOUT.singleMax / 2)
})

test('several items share a row height and wrap', () => {
  const sizes = Array.from({ length: 6 }, () => ({ w: 400, h: 400 }))
  const placed = layoutBatch(sizes)
  for (const p of placed) assert.equal(p.h, LAYOUT.rowHeight)
  // 240 + 24 per item: 4 fit in 1200 (4*240 + 3*24 = 1032), the 5th wraps
  assert.equal(placed[3].y, 0)
  assert.equal(placed[4].x, 0)
  assert.equal(placed[4].y, LAYOUT.rowHeight + LAYOUT.gap)
})

test('nothing overlaps', () => {
  const sizes = [
    { w: 1920, h: 1080 },
    { w: 300, h: 900 },
    { w: 5000, h: 200 },
    { w: 500, h: 500 },
    { w: 0, h: 0 },
  ]
  const placed = layoutBatch(sizes)
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `items ${i} and ${j} overlap`)
    }
  }
})

test('fixed items keep their size and still never overlap', () => {
  const placed = layoutBatch([
    { w: 1600, h: 900 },
    { w: 300, h: 320, fixed: true },
    { w: 1600, h: 900 },
    { w: 1600, h: 900 },
    { w: 1600, h: 900 },
  ])
  assert.deepEqual({ w: placed[1].w, h: placed[1].h }, { w: 300, h: 320 })
  const secondRow = placed.find((p) => p.y > 0)!
  assert.ok(secondRow.y >= 320 + LAYOUT.gap, 'next row starts below the tall card')
})

test('centerOn centers the block', () => {
  const placed = centerOn(layoutBatch([{ w: 100, h: 100 }]), { x: 500, y: 500 })
  assert.deepEqual(placed[0], { x: 450, y: 450, w: 100, h: 100 })
})

test('parseUrlList', () => {
  assert.deepEqual(parseUrlList('https://a.com\nhttps://b.com/x  http://c.com'), [
    'https://a.com',
    'https://b.com/x',
    'http://c.com',
  ])
  assert.equal(parseUrlList('hello https://a.com'), null)
  assert.equal(parseUrlList('javascript:alert(1)'), null)
  assert.equal(parseUrlList('   '), null)
})
