import { useEffect, useState } from 'react'
import {
  DEFAULT_EMBED_DEFINITIONS,
  EmbedShapeUtil,
  Tldraw,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
} from 'tldraw'
import { PagesView } from './pages/PagesView'
import { NotepadView } from './notepad/NotepadView'
import { assetStore } from './assetStore'
import { unwrapSelectedClusters, wrapSelectionInCluster } from './canvas/clusters'
import {
  attachAutosave,
  createCanvas,
  deleteCanvas,
  draftDay,
  ensureDay,
  isDraftId,
  getLastOpened,
  listCanvases,
  openCanvas,
  updateCanvas,
  restoreCamera,
  setLastOpened,
  type CanvasMeta,
  type CanvasRecord,
} from './canvas/persistence'
import { notify } from './notify'
import { dayName, localDate } from '../shared/canvasName'
import { SideList } from './SideList'
import { registerPasteHandlers } from './paste/handlers'
import { HoverVideoShapeUtil } from './shapes/HoverVideoShape'
import { LinkCardShapeUtil } from './shapes/LinkCardShape'
import { Toolbar } from './Toolbar'
import { themes } from './canvas/theme'
import { SmartGuidesOverlayUtil } from './canvas/SmartGuides'

// Live embeds only for these; every other link becomes a preview card.
const EMBEDS = new Set(['youtube', 'vimeo', 'spotify'])

// tldraw's Spotify embed only covers artists and albums. Also allow tracks, playlists, podcasts.
const SPOTIFY_PATH = /^\/(track|album|artist|playlist|episode|show)\//
const embedDefinitions = DEFAULT_EMBED_DEFINITIONS.filter((d) => EMBEDS.has(d.type)).map((d) =>
  d.type !== 'spotify'
    ? d
    : {
        ...d,
        height: 352,
        minHeight: 152,
        toEmbedUrl: (url: string) => {
          const u = URL.parse(url)
          return u && SPOTIFY_PATH.test(u.pathname) ? `${u.origin}/embed${u.pathname}` : undefined
        },
        fromEmbedUrl: (url: string) => {
          const u = URL.parse(url)
          return u && /^\/embed\//.test(u.pathname) ? u.origin + u.pathname.replace(/^\/embed/, '') : undefined
        },
      }
)

const shapeUtils = [HoverVideoShapeUtil, LinkCardShapeUtil, EmbedShapeUtil.configure({ embedDefinitions })]

const components: TLComponents = {
  InFrontOfTheCanvas: Toolbar,
}

const overrides: TLUiOverrides = {
  tools(_editor, tools) {
    tools.draw = { ...tools.draw, kbd: 'p,d' } // P for pen, as well as tldraw's D
    return tools
  },
  actions(editor, actions) {
    // ⌘G makes a titled cluster instead of tldraw's invisible group.
    actions.group = { ...actions.group, onSelect: () => void wrapSelectionInCluster(editor) }
    const ungroup = actions.ungroup
    actions.ungroup = {
      ...ungroup,
      onSelect: (source) => {
        if (!unwrapSelectedClusters(editor)) return ungroup.onSelect(source)
      },
    }
    return actions
  },
}

const overlayUtils = [SmartGuidesOverlayUtil]

type View = 'canvas' | 'notepad' | 'pages'
const VIEW_LABELS: Record<View, string> = { canvas: 'Canvas', notepad: 'Notepad', pages: 'Code' }

export function App() {
  const [view, setView] = useState<View>('canvas')
  return (
    <div className="app">
      <nav className="header" aria-label="Sections">
        {(['canvas', 'notepad', 'pages'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="header-item"
            aria-current={view === v}
            onClick={() => setView(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </nav>
      <main className="main">
        {view === 'canvas' ? <CanvasView /> : view === 'notepad' ? <NotepadView /> : <PagesView />}
      </main>
    </div>
  )
}

// Left: the list of canvases. Right: the open canvas.
// Unmounted while on Pages so its keyboard shortcuts don't fire in the code editor.
//
// Day pages: today's page is always at the top of the list. Until something is added to it,
// it's only a placeholder (nothing on disk); the first paste or drawing creates the real page.
// Opening the app on a new day starts on today's page; the same day reopens what I last picked.
function CanvasView() {
  const [canvases, setCanvases] = useState<CanvasMeta[] | null>(null)
  // `key` stays the same when today's placeholder turns into the real page, so the editor
  // (and its undo history) isn't reloaded mid-edit.
  const [current, setCurrent] = useState<{ id: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()

  const todayPage = canvases?.find((c) => c.kind === 'day' && c.date === today)
  const items = canvases ? (todayPage ? canvases : [draftDay(today), ...canvases]) : []
  const todayId = todayPage?.id ?? draftDay(today).id

  useEffect(() => {
    let cancelled = false
    listCanvases().then(
      (list) => {
        if (cancelled) return
        setCanvases(list)
        const date = localDate()
        const last = getLastOpened()
        const dayPage = list.find((c) => c.kind === 'day' && c.date === date)
        const id =
          last && last.on === date && list.some((c) => c.id === last.id)
            ? last.id
            : (dayPage?.id ?? draftDay(date).id)
        setCurrent({ id, key: id })
      },
      (err) => !cancelled && setError(String(err))
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Past midnight, an untouched placeholder for yesterday is replaced by today's.
  useEffect(() => {
    setCurrent((c) => (c && isDraftId(c.id) && c.id !== draftDay(today).id ? { id: todayId, key: todayId } : c))
  }, [today, todayId])

  const open = (id: string) => {
    setCurrent({ id, key: id })
    setLastOpened(id, localDate())
  }

  /** Today's placeholder became a real page (first edit, or a rename). */
  const onDayCreated = (meta: CanvasMeta) => {
    setCanvases((list) => (list && !list.some((c) => c.id === meta.id) ? [meta, ...list] : list))
    setCurrent((c) => (c && c.id === draftDay(meta.date).id ? { ...c, id: meta.id } : c))
    if (getLastOpened()?.id === draftDay(meta.date).id) setLastOpened(meta.id, localDate())
  }

  const create = async () => {
    try {
      const record = await createCanvas()
      const { snapshot: _snapshot, ...meta } = record
      setCanvases((list) => [meta, ...(list ?? [])])
      open(record.id)
    } catch {
      notify("Couldn't create a canvas. Is the local server running?")
    }
  }

  // Renaming or tagging today's placeholder makes the real page first.
  const update = async (id: string, changes: { name?: string; tags?: string[] }) => {
    try {
      let realId = id
      if (isDraftId(id)) {
        const meta = await ensureDay(id.slice('day:'.length))
        onDayCreated(meta)
        realId = meta.id
      }
      const meta = await updateCanvas(realId, changes)
      setCanvases((list) => list?.map((c) => (c.id === realId ? meta : c)) ?? null)
    } catch {
      notify("Couldn't save that change to the canvas.")
    }
  }

  const remove = async (ids: string[]) => {
    // Today's placeholder has nothing on disk to delete.
    const gone = new Set(ids.filter((id) => !isDraftId(id)))
    if (gone.size === 0) return
    // If the open canvas is going, switch away first so it saves and unmounts before it moves.
    // Deleting today's page leaves a fresh placeholder for today in its place.
    if (current && gone.has(current.id)) {
      const next = items.find((c) => !gone.has(c.id))?.id ?? draftDay(today).id
      const fallback = todayPage && gone.has(todayPage.id) ? draftDay(today).id : next
      setCurrent({ id: fallback, key: fallback })
      setLastOpened(fallback, localDate())
      await new Promise((r) => setTimeout(r, 100))
    }
    setCanvases((list) => list?.filter((c) => !gone.has(c.id)) ?? null)
    const results = await Promise.allSettled([...gone].map(deleteCanvas))
    if (results.some((r) => r.status === 'rejected')) notify("Some canvases couldn't be deleted.")
    setCanvases(await listCanvases())
  }

  if (error) {
    return (
      <div className="canvas-message" role="alert">
        <p>Couldn't load your canvases. Is the local server running (npm run dev)?</p>
        <p className="canvas-message-detail">{error}</p>
      </div>
    )
  }

  return (
    <div className="canvas-layout">
      <SideList
        label="Canvases"
        noun={['canvas', 'canvases']}
        newLabel="+ New canvas"
        items={items.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt || undefined,
          autoName: c.kind === 'day' ? dayName(c.date) : undefined,
          placeholder: isDraftId(c.id),
          tags: c.tags,
        }))}
        currentId={current?.id ?? null}
        onNew={create}
        onOpen={open}
        onRename={(id, name) => update(id, { name })}
        onTags={(id, tags) => update(id, { tags })}
        onDelete={remove}
      />
      <div className="canvas-area">
        {current && <CanvasEditor key={current.key} id={current.id} onDayCreated={onDayCreated} />}
      </div>
    </div>
  )
}

/** Today's local date (YYYY-MM-DD), kept current across midnight. */
function useToday() {
  const [today, setToday] = useState(localDate)
  useEffect(() => {
    const check = () => setToday(localDate())
    const timer = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [])
  return today
}

// One canvas. Switching canvases remounts this: the old one saves on the way out,
// and the new one loads from ~/Diary/canvases once that save has landed.
function CanvasEditor({ id, onDayCreated }: { id: string; onDayCreated: (meta: CanvasMeta) => void }) {
  const [record, setRecord] = useState<CanvasRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Loads once per mount. `id` only changes without a remount when today's placeholder
  // becomes the real page, and then the editor already holds the content.
  const [startId] = useState(id)
  useEffect(() => {
    let cancelled = false
    openCanvas(startId).then(
      (r) => !cancelled && setRecord(r),
      (err) => !cancelled && setError(String(err))
    )
    return () => {
      cancelled = true
    }
  }, [startId])

  if (error) {
    return (
      <div className="canvas-message" role="alert">
        <p>Couldn't load this canvas.</p>
        <p className="canvas-message-detail">{error}</p>
      </div>
    )
  }
  if (!record) return <div className="canvas-message">Loading…</div>

  const handleMount = (editor: Editor) => {
    registerPasteHandlers(editor)
    // Dot grid, always on. Items snap to it; 16px keeps it on style.md's 4px grid.
    editor.updateInstanceState({ isGridMode: true })
    if (editor.getDocumentSettings().gridSize !== 16) editor.updateDocumentSettings({ gridSize: 16 })
    // Figma-style: always snap to other items' edges, centres and equal gaps (hold ⌘ to skip).
    // Grid snapping only applies when nothing lines up.
    if (!editor.user.getIsSnapMode()) editor.user.updateUserPreferences({ isSnapMode: true })
    restoreCamera(editor, record.id)
    // Opening a canvas from the list leaves focus on the list, so shortcuts (P, ⌘V…) wouldn't
    // reach the canvas until it was clicked. Hand focus over, unless I'm typing a name or tags.
    if (!document.activeElement?.closest('input, textarea, [contenteditable="true"]')) editor.focus()
    if (import.meta.env.DEV) Object.assign(window, { editor })
    return attachAutosave(editor, record.id, onDayCreated)
  }

  return (
    <Tldraw
      snapshot={record.snapshot ?? undefined}
      assets={assetStore}
      shapeUtils={shapeUtils}
      overlayUtils={overlayUtils}
      hideUi
      components={components}
      overrides={overrides}
      colorScheme="light"
      themes={themes}
      maxAssetSize={500 * 1024 * 1024}
      maxImageDimension={10_000}
      onMount={handleMount}
    />
  )
}
