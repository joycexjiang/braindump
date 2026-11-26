// Loads a canvas from ~/Diary/canvases and saves it back about a second after changes stop.
import { getSnapshot, type Editor, type TLStoreSnapshot } from 'tldraw'
import { notify } from '../notify'
import { dayName } from '../../shared/canvasName'

export interface CanvasRecord {
  id: string
  name: string
  kind: 'day' | 'named'
  date: string
  tags: string[]
  createdAt: string
  updatedAt: string
  snapshot: TLStoreSnapshot | null
}

const SAVE_DELAY_MS = 1000
// fetch(keepalive) is the only request that survives a tab closing, and it's capped at 64KB.
const KEEPALIVE_LIMIT = 60_000

/** Saves still in flight, per canvas. Loading waits on these so it never reads a stale file. */
const inFlight = new Map<string, Promise<void>>()

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed (${res.status})`)
  return res.json() as Promise<T>
}

export type CanvasMeta = Omit<CanvasRecord, 'snapshot'>

const JSON_HEADERS = { 'content-type': 'application/json' }

/** All canvases, newest first. */
export async function listCanvases(): Promise<CanvasMeta[]> {
  const list = await api<CanvasMeta[]>('/api/canvases')
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

// Today's page exists in the list before it exists on disk: it's a placeholder with the id
// "day:YYYY-MM-DD" until the first thing is added, then the server creates the real file.
const DRAFT_PREFIX = 'day:'
export const isDraftId = (id: string) => id.startsWith(DRAFT_PREFIX)

export function draftDay(date: string): CanvasMeta {
  return { id: DRAFT_PREFIX + date, name: dayName(date), kind: 'day', date, tags: [], createdAt: '', updatedAt: '' }
}

/** The real day page for a date, created on the server if it isn't there yet. Safe to call twice. */
export function ensureDay(date: string): Promise<CanvasMeta> {
  return api<CanvasMeta>(`/api/canvases/day/${date}`, { method: 'POST' })
}

/** Loads one canvas, after any save of it still on its way to disk. */
export async function openCanvas(id: string): Promise<CanvasRecord> {
  if (isDraftId(id)) return { ...draftDay(id.slice(DRAFT_PREFIX.length)), snapshot: null }
  await inFlight.get(id)
  return api<CanvasRecord>(`/api/canvases/${id}`)
}

/** New canvas, named by the server after when it was made (e.g. "nov 24, 26 12:48am"). */
export function createCanvas(): Promise<CanvasRecord> {
  return api<CanvasRecord>('/api/canvases', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind: 'named' }),
  })
}

/** Moves a canvas to ~/Diary/trash/canvases, once any save of it has landed. */
export async function deleteCanvas(id: string): Promise<void> {
  await inFlight.get(id)
  const res = await fetch(`/api/canvases/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`)
}

/** Rename and/or set project tags. */
export function updateCanvas(id: string, changes: { name?: string; tags?: string[] }): Promise<CanvasMeta> {
  return api<CanvasMeta>(`/api/canvases/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  })
}

const LAST_OPENED_KEY = 'canvas-last-opened'

/** The canvas I last picked and the date I picked it, so a new day can start on today's page. */
export function getLastOpened(): { id: string; on: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_OPENED_KEY) ?? 'null')
    return value && typeof value.id === 'string' && typeof value.on === 'string' ? value : null
  } catch {
    return null
  }
}

export function setLastOpened(id: string, on: string) {
  try {
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({ id, on }))
  } catch {
    // convenience only
  }
}

function save(id: string, snapshot: TLStoreSnapshot, opts: { keepalive?: boolean } = {}) {
  const body = JSON.stringify({ snapshot })
  const prev = inFlight.get(id) ?? Promise.resolve()
  const next = prev
    .then(async () => {
      const res = await fetch(`/api/canvases/${id}/snapshot`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: opts.keepalive && body.length < KEEPALIVE_LIMIT,
      })
      // 404: the canvas was deleted (moved to trash) while this save was on its way. Nothing to save.
      if (res.status === 404) return
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
    })
    .catch((err) => {
      console.error(err)
      notify("Couldn't save this canvas. Is the local server running?")
    })
  inFlight.set(id, next)
  next.finally(() => {
    if (inFlight.get(id) === next) inFlight.delete(id)
  })
  return next
}

const cameraKey = (id: string) => `canvas-camera:${id}`

/** Restores where I was looking, or fits everything in view the first time. */
export function restoreCamera(editor: Editor, id: string) {
  try {
    const saved = localStorage.getItem(cameraKey(id))
    if (saved) {
      editor.setCamera(JSON.parse(saved))
      return
    }
  } catch {
    // storage unavailable: fall through to zoom-to-fit
  }
  if (editor.getCurrentPageShapeIds().size > 0) editor.zoomToFit()
}

/**
 * Saves the document to disk about a second after edits stop, when the canvas unmounts,
 * and when the tab is closed. Returns a cleanup function.
 *
 * For today's placeholder page, the first edit creates the real page straight away
 * (not after the save delay) and reports it through `onCreated`. Saves go to it from then on.
 */
export function attachAutosave(editor: Editor, startId: string, onCreated?: (meta: CanvasMeta) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let id = startId
  let creating: Promise<string> | null = null

  const realId = (): Promise<string> => {
    if (!isDraftId(id)) return Promise.resolve(id)
    creating ??= ensureDay(id.slice(DRAFT_PREFIX.length)).then(
      (meta) => {
        id = meta.id
        onCreated?.(meta)
        return meta.id
      },
      (err) => {
        creating = null
        throw err
      }
    )
    return creating
  }

  const flush = (opts?: { keepalive?: boolean }) => {
    clearTimeout(timer)
    if (!dirty) return
    dirty = false
    const snapshot = getSnapshot(editor.store).document
    if (!isDraftId(id)) return void save(id, snapshot, opts)
    realId().then(
      (rid) => save(rid, snapshot, opts),
      (err) => {
        console.error(err)
        notify("Couldn't create today's page. Is the local server running?")
      }
    )
  }

  const stopDoc = editor.store.listen(
    () => {
      dirty = true
      if (isDraftId(id)) realId().catch(() => {}) // flush reports the error
      clearTimeout(timer)
      timer = setTimeout(() => flush(), SAVE_DELAY_MS)
    },
    { scope: 'document', source: 'user' }
  )

  let cameraTimer: ReturnType<typeof setTimeout> | undefined
  const saveCamera = () => {
    try {
      localStorage.setItem(cameraKey(id), JSON.stringify(editor.getCamera()))
    } catch {
      // ignore: camera position is a convenience
    }
  }
  const stopSession = editor.store.listen(
    () => {
      clearTimeout(cameraTimer)
      cameraTimer = setTimeout(saveCamera, 500)
    },
    { scope: 'session' }
  )

  const onPageHide = () => {
    saveCamera()
    flush({ keepalive: true })
  }
  window.addEventListener('pagehide', onPageHide)

  return () => {
    window.removeEventListener('pagehide', onPageHide)
    stopDoc()
    stopSession()
    clearTimeout(cameraTimer)
    saveCamera()
    flush()
  }
}
