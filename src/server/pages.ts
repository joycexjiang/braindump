// Pages: hand- or agent-written web pages, stored as plain files.
//   <DATA_DIR>/pages/<id>/meta.json   { id, name, createdAt, updatedAt }
//   <DATA_DIR>/pages/<id>/index.html, style.css, script.js
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type PageMeta = { id: string; name: string; createdAt: string; updatedAt: string }
export type PageFiles = { html: string; css: string; js: string }

const FILES = { html: 'index.html', css: 'style.css', js: 'script.js' } as const
const ID_RE = /^[a-f0-9-]{36}$/

const STARTER: PageFiles = {
  html: '<main>\n  <h1>New page</h1>\n  <p>Edit me on the left.</p>\n</main>\n',
  css: 'body {\n  margin: 0;\n  padding: 48px;\n  font-family: system-ui, sans-serif;\n  background: #fff;\n  color: #121212;\n}\n',
  js: '',
}

async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}

export function pagesRoutes(dataDir: string) {
  const dir = path.join(dataDir, 'pages')
  const pageDir = (id: string) => path.join(dir, id)
  const readMeta = async (id: string) =>
    JSON.parse(await readFile(path.join(pageDir(id), 'meta.json'), 'utf8')) as PageMeta

  async function list() {
    await mkdir(dir, { recursive: true })
    const ids = (await readdir(dir)).filter((id) => ID_RE.test(id))
    const metas = (await Promise.all(ids.map((id) => readMeta(id).catch(() => null)))).filter(
      (m): m is PageMeta => m !== null
    )
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return metas
  }

  async function create(name?: string) {
    const now = new Date().toISOString()
    const meta: PageMeta = { id: randomUUID(), name: name?.trim() || 'Untitled page', createdAt: now, updatedAt: now }
    await mkdir(pageDir(meta.id), { recursive: true })
    for (const [key, file] of Object.entries(FILES)) {
      await writeAtomic(path.join(pageDir(meta.id), file), STARTER[key as keyof PageFiles])
    }
    await writeAtomic(path.join(pageDir(meta.id), 'meta.json'), JSON.stringify(meta, null, 2))
    return meta
  }

  // One at a time, so two requests arriving together can't both create a first page.
  let ensuring: Promise<PageMeta[]> = Promise.resolve([])

  const app = new Hono()

  app.get('/', async (c) => c.json(await list()))

  // Lists pages, creating a starter page first if there are none, so Pages never opens empty.
  app.post('/ensure', async (c) => {
    ensuring = ensuring
      .catch(() => [])
      .then(async () => {
        const metas = await list()
        if (metas.length > 0) return metas
        await create()
        return list()
      })
    return c.json(await ensuring)
  })

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string }
    const meta = await create(body.name)
    return c.json({ meta, files: STARTER })
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const meta = await readMeta(id).catch(() => null)
    if (!meta) return c.notFound()
    const files = {} as PageFiles
    for (const [key, file] of Object.entries(FILES)) {
      files[key as keyof PageFiles] = await readFile(path.join(pageDir(id), file), 'utf8').catch(() => '')
    }
    return c.json({ meta, files })
  })

  // Delete = move to <DATA_DIR>/trash/pages, so it can be restored by moving the folder back.
  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const trash = path.join(dataDir, 'trash', 'pages')
    await mkdir(trash, { recursive: true })
    const moved = await rename(pageDir(id), path.join(trash, id)).then(
      () => true,
      () => false
    )
    return moved ? c.json({ ok: true }) : c.notFound()
  })

  // Partial update: any of name/html/css/js.
  app.put('/:id', async (c) => {
    const id = c.req.param('id')
    if (!ID_RE.test(id)) return c.notFound()
    const meta = await readMeta(id).catch(() => null)
    if (!meta) return c.notFound()
    const body = (await c.req.json()) as Partial<PageFiles> & { name?: string }
    for (const [key, file] of Object.entries(FILES)) {
      const value = body[key as keyof PageFiles]
      if (typeof value === 'string') await writeAtomic(path.join(pageDir(id), file), value)
    }
    if (typeof body.name === 'string' && body.name.trim()) meta.name = body.name.trim()
    meta.updatedAt = new Date().toISOString()
    await writeAtomic(path.join(pageDir(id), 'meta.json'), JSON.stringify(meta, null, 2))
    return c.json(meta)
  })

  return app
}
