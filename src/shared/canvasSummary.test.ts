import assert from 'node:assert/strict'
import { test } from 'node:test'
import { richTextToPlain, summarizeSnapshot } from './canvasSummary.ts'

const rt = (...lines: string[]) => ({
  type: 'doc',
  content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
})

function snap(...records: object[]) {
  const store: Record<string, object> = {}
  for (const r of records) store[(r as { id: string }).id] = r
  return { store, schema: {} }
}
const shape = (id: string, type: string, x: number, y: number, props: object, parentId = 'page:page') => ({
  id,
  typeName: 'shape',
  type,
  x,
  y,
  parentId,
  props,
})

test('richTextToPlain joins paragraphs with newlines', () => {
  assert.equal(richTextToPlain(rt('one', 'two')), 'one\ntwo')
  assert.equal(richTextToPlain(undefined), '')
})

test('clusters become titled rows in reading order, loose items go last as Unsorted', () => {
  const s = snap(
    { id: 'asset:i', typeName: 'asset', type: 'image', props: { src: '/media/a.png', w: 400, h: 200 } },
    { id: 'asset:v', typeName: 'asset', type: 'video', props: { src: '/media/v.mp4', w: 100, h: 200 } },
    { id: 'asset:b', typeName: 'asset', type: 'bookmark', props: { src: 'https://x.com/a', title: 'A post', image: '/media/og.png' } },
    shape('shape:f2', 'frame', 0, 1000, { name: 'Second' }),
    shape('shape:f1', 'frame', 0, 0, { name: 'First' }),
    // Inside "First": the right-hand item is listed after the left one on the same line.
    shape('shape:right', 'image', 300, 10, { assetId: 'asset:i', w: 100, h: 50 }, 'shape:f1'),
    shape('shape:left', 'hover-video', 0, 0, { assetId: 'asset:v' }, 'shape:f1'),
    shape('shape:link', 'bookmark', 0, 50, { url: 'https://x.com/a', assetId: 'asset:b' }, 'shape:f2'),
    shape('shape:t', 'text', 0, 5000, { richText: rt('why I like it') }),
    shape('shape:pen', 'draw', 0, 0, {}),
    shape('shape:empty', 'geo', 0, 0, { richText: rt('') })
  )
  const out = summarizeSnapshot(s)
  assert.deepEqual(
    out.rows.map((r) => r.title),
    ['First', 'Second', null]
  )
  assert.deepEqual(out.rows[0].items, [
    { kind: 'video', src: '/media/v.mp4', w: 100, h: 200 },
    { kind: 'image', src: '/media/a.png', w: 400, h: 200 },
  ])
  assert.deepEqual(out.rows[1].items, [{ kind: 'link', url: 'https://x.com/a', title: 'A post', image: '/media/og.png' }])
  assert.deepEqual(out.rows[2].items, [{ kind: 'text', text: 'why I like it' }])
  assert.equal(out.count, 4)
})

test('items in a group inside a cluster belong to that cluster; empty clusters are skipped', () => {
  const s = snap(
    shape('shape:f', 'frame', 0, 0, { name: '' }),
    shape('shape:empty', 'frame', 0, 500, { name: 'Nothing' }),
    shape('shape:g', 'group', 10, 10, {}, 'shape:f'),
    shape('shape:t', 'text', 0, 0, { richText: rt('hi') }, 'shape:g')
  )
  const out = summarizeSnapshot(s)
  assert.deepEqual(out.rows, [{ title: 'Untitled cluster', items: [{ kind: 'text', text: 'hi' }] }])
})

test('an empty or missing snapshot has no rows', () => {
  assert.deepEqual(summarizeSnapshot(null), { rows: [], count: 0 })
})
