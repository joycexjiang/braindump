// Canvases, one JSON file each:
//   <DATA_DIR>/canvases/<id>.json  { id, name, kind, date, tags, createdAt, updatedAt, snapshot }
// `snapshot` is tldraw's document snapshot. Media inside it points at /media/... URLs, never base64.
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DATE_RE, dayName, localDate, timestampName } from '../shared/canvasName.ts'

export type CanvasKind = 'day' | 'named'

export interface CanvasMeta {
  id: string
  name: string
  kind: CanvasKind
  /** Local calendar date this canvas belongs to, YYYY-MM-DD. */
  date: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CanvasRecord extends CanvasMeta {
  snapshot: unknown | null
}

const ID_RE = /^[a-f0-9-]{36}$/

async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}

export function canvasesRoutes(dataDir: string) {
  const dir = path.join(dataDir, 'canvases')
  const fileFor = (id: string) => path.join(dir, `${id}.json`)
  const ready = mkdir(dir, { recursive: true })

  // Writes to the same canvas are queued so an older save can never land after a newer one.
  const writeQueue = new Map<string, Promise<unknown>>()
  function queued<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prev = writeQueue.get(id) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(task)
    writeQueue.set(id, next)
    next.finally(() => {
      if (writeQueue.get(id) === next) writeQueue.delete(id)
    })
    return next
  }

  async function read(id: string): Promise<CanvasRecord | null> {
    if (!ID_RE.test(id)) return null
    const text = await readFile(fileFor(id), 'utf8').catch(() => null)
    return text ? (JSON.parse(text) as CanvasRecord) : null
  }

  async function list(): Promise<CanvasMeta[]> {
    await ready
    const names = (await readdir(dir)).filter((n) => n.endsWith('.json'))
    const metas: CanvasMeta[] = []
    for (const name of names) {
      const record = await read(name.slice(0, -'.json'.length))
      if (!record) continue
      const { snapshot: _snapshot, ...meta } = record
      metas.push(meta)
    }
    metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    return metas
  }

  async function create(body: Partial<CanvasMeta>): Promise<CanvasRecord> {
    await ready
    const now = new Date()
    const kind: CanvasKind = body.kind === 'day' ? 'day' : 'named'
    const date = typeof body.date === 'string' && DATE_RE.test(body.date) ? body.date : localDate(now)
    const record: CanvasRecord = {
      id: randomUUID(),
      name:
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : kind === 'day'
            ? dayName(date)
            : timestampName(now),
      kind,
      date,
      tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      snapshot: null,
    }
    await writeAtomic(fileFor(record.id), JSON.stringify(record))
    return record
  }

  const app = new Hono()

  app.get('/', async (c) => c.json(await list()))

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<CanvasMeta>
    return c.json(await create(body), 201)
  })

  // The day page for a date (YYYY-MM-DD), created if it doesn't exist yet. The app calls this
  // the first time something is added that day. Queued per date, so two tabs (or a paste and
  // a rename landing together) still end up with one page for the day.
  app.post('/day/:date', async (c) => {
    const date = c.req.param('date')
    if (!DATE_RE.test(date)) return c.json({ error: 'Expected YYYY-MM-DD' }, 400)
    const meta = await queued(`day:${date}`, async () => {
      const existing = (await list()).find((m) => m.kind === 'day' && m.date === date)
      if (existing) return existing
      const { snapshot: _snapshot, ...created } = await create({ kind: 'day', date })
      return created
    })
    return c.json(meta)
  })

  app.get('/:id', async (c) => {
    await ready
    const record = await read(c.req.param('id'))
    return record ? c.json(record) : c.json({ error: 'Not found' }, 404)
  })

  // Rename and/or set project tags: { name?, tags? }.
  app.patch('/:id', async (c) => {
    await ready
    const id = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; tags?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))]
      : undefined
    if (name === '' || (name === undefined && tags === undefined)) {
      return c.json({ error: 'Expected { name } or { tags }' }, 400)
    }
    const result = await queued(id, async () => {
      const record = await read(id)
      if (!record) return null
      if (name) record.name = name
      if (tags) record.tags = tags
      record.updatedAt = new Date().toISOString()
      await writeAtomic(fileFor(id), JSON.stringify(record))
      const { snapshot: _snapshot, ...meta } = record
      return meta
    })
    return result ? c.json(result) : c.json({ error: 'Not found' }, 404)
  })

  // Delete = move to <DATA_DIR>/trash/canvases, so it can be restored by moving the file back.
  app.delete('/:id', async (c) => {
    await ready
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.json({ error: 'Not found' }, 404)
    const moved = await queued(id, async () => {
      const trash = path.join(dataDir, 'trash', 'canvases')
      await mkdir(trash, { recursive: true })
      return rename(fileFor(id), path.join(trash, `${id}.json`)).then(
        () => true,
        () => false
      )
    })
    return moved ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
  })

  app.put('/:id/snapshot', async (c) => {
    await ready
    const id = c.req.param('id')
    const body = (await c.req.json().catch(() => null)) as { snapshot?: unknown } | null
    if (!body || typeof body.snapshot !== 'object' || body.snapshot === null) {
      return c.json({ error: 'Expected { snapshot }' }, 400)
    }
    const result = await queued(id, async () => {
      const record = await read(id)
      if (!record) return null
      record.snapshot = body.snapshot
      record.updatedAt = new Date().toISOString()
      await writeAtomic(fileFor(id), JSON.stringify(record))
      return record.updatedAt
    })
    return result ? c.json({ updatedAt: result }) : c.json({ error: 'Not found' }, 404)
  })

  return app
}
