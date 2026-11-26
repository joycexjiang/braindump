// Notepad notes, one JSON file each:
//   <DATA_DIR>/notes/<id>.json   { meta: { id, name, createdAt, updatedAt }, doc }
// `doc` is the editor's document (TipTap JSON). Each paragraph carries its own `ts`.
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { timestampName } from '../shared/canvasName.ts'

export type NoteMeta = { id: string; name: string; createdAt: string; updatedAt: string }
type Note = { meta: NoteMeta; doc: unknown }

const ID_RE = /^[a-f0-9-]{36}$/
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}

export function notesRoutes(dataDir: string) {
  const dir = path.join(dataDir, 'notes')
  const file = (id: string) => path.join(dir, `${id}.json`)
  const read = async (id: string) => JSON.parse(await readFile(file(id), 'utf8')) as Note
  const write = (note: Note) => writeAtomic(file(note.meta.id), JSON.stringify(note, null, 2))

  async function list() {
    await mkdir(dir, { recursive: true })
    const ids = (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    const metas = (await Promise.all(ids.filter((id) => ID_RE.test(id)).map((id) => read(id).then((n) => n.meta, () => null))))
      .filter((m): m is NoteMeta => m !== null)
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async function create(name?: string) {
    await mkdir(dir, { recursive: true })
    const now = new Date()
    const note: Note = {
      meta: { id: randomUUID(), name: name?.trim() || timestampName(now), createdAt: now.toISOString(), updatedAt: now.toISOString() },
      doc: EMPTY_DOC,
    }
    await write(note)
    return note
  }

  let ensuring: Promise<NoteMeta[]> = Promise.resolve([])
  const app = new Hono()

  app.get('/', async (c) => c.json(await list()))

  // Lists notes, making a first one if there are none, so Notepad never opens empty.
  app.post('/ensure', async (c) => {
    ensuring = ensuring
      .catch(() => [])
      .then(async () => {
        const metas = await list()
        if (metas.length) return metas
        await create()
        return list()
      })
    return c.json(await ensuring)
  })

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string }
    return c.json(await create(body.name))
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const note = await read(id).catch(() => null)
    return note ? c.json(note) : c.notFound()
  })

  // Partial update: name and/or doc.
  app.put('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const note = await read(id).catch(() => null)
    if (!note) return c.notFound()
    const body = (await c.req.json()) as { name?: string; doc?: unknown }
    if (body.doc && typeof body.doc === 'object') note.doc = body.doc
    if (typeof body.name === 'string' && body.name.trim()) note.meta.name = body.name.trim()
    note.meta.updatedAt = new Date().toISOString()
    await write(note)
    return c.json(note.meta)
  })

  // Delete = move to <DATA_DIR>/trash/notes.
  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const trash = path.join(dataDir, 'trash', 'notes')
    await mkdir(trash, { recursive: true })
    const moved = await rename(file(id), path.join(trash, `${id}.json`)).then(() => true, () => false)
    return moved ? c.json({ ok: true }) : c.notFound()
  })

  return app
}
