// Local server: stores media as plain files and fetches link previews.
// Runs on localhost only. Vite proxies /api and /media here.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { parseLinkPreview, type LinkPreview } from './unfurl.ts'
import { pagesRoutes } from './pages.ts'
import { canvasesRoutes } from './canvases.ts'
import { notesRoutes } from './notes.ts'

const DATA_DIR = process.env.DATA_DIR ?? path.join(homedir(), 'Diary')
const MEDIA_DIR = path.join(DATA_DIR, 'media')
const LINKS_DIR = path.join(DATA_DIR, 'links')
const PORT = Number(process.env.SERVER_PORT ?? 4601)
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))

await mkdir(MEDIA_DIR, { recursive: true })
await mkdir(LINKS_DIR, { recursive: true })

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** Write via a temp file + rename so a crash never leaves half a file. */
async function writeAtomic(file: string, data: Buffer | string) {
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}

const app = new Hono()

app.route('/api/pages', pagesRoutes(DATA_DIR))
app.route('/api/canvases', canvasesRoutes(DATA_DIR))
app.route('/api/notes', notesRoutes(DATA_DIR))

// Upload: raw body, content-type header = file's MIME type. Deduped by content hash.
app.post('/api/media', async (c) => {
  const mime = (c.req.header('content-type') ?? '').split(';')[0].trim()
  const ext = EXT_BY_MIME[mime]
  if (!ext) return c.json({ error: `Unsupported file type: ${mime || 'unknown'}` }, 415)

  const body = Buffer.from(await c.req.arrayBuffer())
  if (body.length === 0) return c.json({ error: 'Empty file' }, 400)
  if (body.length > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large' }, 413)

  const name = `${sha256(body)}.${ext}`
  const file = path.join(MEDIA_DIR, name)
  const exists = await stat(file).then(() => true, () => false)
  if (!exists) await writeAtomic(file, body)
  return c.json({ src: `/media/${name}` })
})

// Serve media with Range support (browsers need it to seek and loop videos).
app.get('/media/:name', async (c) => {
  const name = c.req.param('name')
  if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)) return c.notFound()
  const file = path.join(MEDIA_DIR, name)
  const info = await stat(file).catch(() => null)
  if (!info) return c.notFound()

  const type = MIME_BY_EXT[name.split('.').pop()!] ?? 'application/octet-stream'
  const headers: Record<string, string> = {
    'content-type': type,
    'accept-ranges': 'bytes',
    // Content-addressed: the file at this name never changes.
    'cache-control': 'public, max-age=31536000, immutable',
  }

  const range = c.req.header('range')
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (match) {
    let start = match[1] ? Number(match[1]) : NaN
    let end = match[2] ? Number(match[2]) : info.size - 1
    if (Number.isNaN(start)) {
      // suffix range: last N bytes
      start = Math.max(0, info.size - end)
      end = info.size - 1
    }
    end = Math.min(end, info.size - 1)
    if (start > end || start >= info.size) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${info.size}` } })
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${info.size}`,
      },
    })
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, { headers: { ...headers, 'content-length': String(info.size) } })
})

// Link preview: fetch the page server-side (browsers can't read other sites' HTML) and cache it.
app.get('/api/unfurl', async (c) => {
  const url = c.req.query('url') ?? ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'Only http(s) links' }, 400)
  }

  const cacheFile = path.join(LINKS_DIR, `${sha256(parsed.href)}.json`)
  const cached = await readFile(cacheFile, 'utf8').catch(() => null)
  if (cached) {
    const preview = JSON.parse(cached) as LinkPreview
    // Previews cached before images were saved locally: save them now.
    if (await localizePreviewImages(preview)) await writeAtomic(cacheFile, JSON.stringify(preview, null, 2))
    return c.json(preview)
  }

  let preview: LinkPreview
  try {
    const res = await fetch(parsed.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; canvas-local/0.1; +link-preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    const html = res.headers.get('content-type')?.includes('html') ? await res.text() : ''
    preview = parseLinkPreview(html, res.url || parsed.href, parsed.href)
  } catch (err) {
    // Don't cache failures, so a retry can succeed later.
    return c.json({ ...parseLinkPreview('', parsed.href, parsed.href), error: String(err) })
  }
  await localizePreviewImages(preview)
  await writeAtomic(cacheFile, JSON.stringify(preview, null, 2))
  return c.json(preview)
})

const MAX_PREVIEW_IMAGE_BYTES = 20 * 1024 * 1024

/** Download a remote image into the media folder. Returns its /media URL, or null if it can't be saved. */
async function saveRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; canvas-local/0.1; +link-preview)', accept: 'image/*' },
    })
    if (!res.ok) return null
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    const ext = EXT_BY_MIME[mime]
    if (!ext || !mime.startsWith('image/')) return null
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length === 0 || body.length > MAX_PREVIEW_IMAGE_BYTES) return null
    const name = `${sha256(body)}.${ext}`
    const file = path.join(MEDIA_DIR, name)
    if (!(await stat(file).then(() => true, () => false))) await writeAtomic(file, body)
    return `/media/${name}`
  } catch {
    return null
  }
}

/**
 * Swap a preview's remote image and favicon for local copies, keeping the originals.
 * If a download fails the remote URL stays, so the card still shows something. Returns true if anything changed.
 */
async function localizePreviewImages(preview: LinkPreview): Promise<boolean> {
  let changed = false
  for (const key of ['image', 'favicon'] as const) {
    const remote = preview[key]
    if (!/^https?:/.test(remote)) continue
    const local = await saveRemoteImage(remote)
    if (!local) continue
    preview[key === 'image' ? 'remoteImage' : 'remoteFavicon'] = remote
    preview[key] = local
    changed = true
  }
  return changed
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`server on http://127.0.0.1:${PORT}, data in ${DATA_DIR}`)
})
