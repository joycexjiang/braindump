import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_EMBED_DEFINITIONS,
  EmbedShapeUtil,
  Tldraw,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
} from 'tldraw'
import { ViewColumnsIcon } from '@heroicons/react/24/outline'
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
import { DayScroll } from './days/DayScroll'
import { PrettyImageShapeUtil } from './shapes/PrettyImageShape'
import { ClusterShapeUtil } from './shapes/ClusterShape'
import { CanvasContextMenu } from './canvas/ContextMenu'
import { Grid } from './canvas/Grid'
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

const shapeUtils = [ClusterShapeUtil, PrettyImageShapeUtil, HoverVideoShapeUtil, LinkCardShapeUtil, EmbedShapeUtil.configure({ embedDefinitions })]

const components: TLComponents = {
  InFrontOfTheCanvas: Toolbar,
  ContextMenu: CanvasContextMenu,
  Grid, // faint lines instead of dots (canvas/Grid.tsx)
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

const LIST_HIDDEN_KEY = 'side-list-hidden'

/** Whether the left lists are hidden (⌘\ or the header button). Remembered in this browser. */
function useListHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LIST_HIDDEN_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(LIST_HIDDEN_KEY, hidden ? '1' : '0')
    } catch {
      // convenience only
    }
  }, [hidden])
  useEffect(() => {
    // ⌘\ like Figma's "hide UI". Capture phase, so the canvas and code editor don't swallow it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat) return
      e.preventDefault()
      e.stopPropagation()
      setHidden((h) => !h)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return [hidden, setHidden] as const
}

export function App() {
  const [view, setView] = useState<View>('canvas')
  const [listHidden, setListHidden] = useListHidden()
  return (
    <div className="app" data-list-hidden={listHidden || undefined}>
      <nav className="header" aria-label="Sections">
        <button
          type="button"
          className="header-item header-toggle"
          aria-pressed={!listHidden}
          aria-label={listHidden ? 'Show list' : 'Hide list'}
          title={`${listHidden ? 'Show' : 'Hide'} list (⌘\\)`}
          onClick={() => setListHidden((h) => !h)}
        >
          <ViewColumnsIcon />
        </button>
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
//
// "All days" swaps the canvas for the day-scroll view. Opening a page from there and pressing
// Esc (with nothing selected) comes back to the scroll at the same spot.
function CanvasView() {
  const [canvases, setCanvases] = useState<CanvasMeta[] | null>(null)
  // `key` stays the same when today's placeholder turns into the real page, so the editor
  // (and its undo history) isn't reloaded mid-edit.
  const [current, setCurrent] = useState<{ id: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  const [mode, setMode] = useState<'canvas' | 'days'>('canvas')
  const [fromDays, setFromDays] = useState(false)
  const [daysKey, setDaysKey] = useState(0)
  const daysScrollTop = useRef<number | null>(null)

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

  const open = (id: string, viaDays = false) => {
    setCurrent({ id, key: id })
    setLastOpened(id, localDate())
    setMode('canvas')
    setFromDays(viaDays)
  }

  /** Opens the day scroll: at today, or (`restore`) where I left it. */
  const showDays = (restore: boolean) => {
    if (!restore) daysScrollTop.current = null
    setDaysKey((k) => k + 1)
    setMode('days')
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
        currentId={mode === 'canvas' ? (current?.id ?? null) : null}
        topItem={{ label: 'All days', current: mode === 'days', title: 'Every canvas by date', onClick: () => showDays(false) }}
        onNew={create}
        onOpen={(id) => open(id)}
        onRename={(id, name) => update(id, { name })}
        onTags={(id, tags) => update(id, { tags })}
        onDelete={remove}
      />
      <div className="canvas-area">
        {mode === 'days' ? (
          <DayScroll
            key={daysKey}
            pages={items}
            initialScrollTop={daysScrollTop.current}
            onScrollTopChange={(top) => (daysScrollTop.current = top)}
            onOpen={(id) => open(id, true)}
          />
        ) : (
          current && (
            <CanvasEditor
              key={current.key}
              id={current.id}
              onDayCreated={onDayCreated}
              onEscape={fromDays ? () => showDays(true) : undefined}
            />
          )
        )}
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
function CanvasEditor({
  id,
  onDayCreated,
  onEscape,
}: {
  id: string
  onDayCreated: (meta: CanvasMeta) => void
  /** Called on Esc when there's nothing left for tldraw to cancel (no selection, no tool, no edit). */
  onEscape?: () => void
}) {
  const [record, setRecord] = useState<CanvasRecord | null>(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
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
    // Grid mode, always on (drawn as faint lines, see canvas/Grid.tsx). Items snap to it; 16px keeps it on style.md's 4px grid.
    editor.updateInstanceState({ isGridMode: true })
    if (editor.getDocumentSettings().gridSize !== 16) editor.updateDocumentSettings({ gridSize: 16 })
    // Figma-style: always snap to other items' edges, centres and equal gaps (hold ⌘ to skip).
    // Grid snapping only applies when nothing lines up.
    if (!editor.user.getIsSnapMode()) editor.user.updateUserPreferences({ isSnapMode: true })
    restoreCamera(editor, record.id)
    // Opening a canvas from the list leaves focus on the list, so shortcuts (P, ⌘V…) wouldn't
    // reach the canvas until it was clicked. Hand focus over, unless I'm typing a name or tags.
    // (tldraw already counts itself as focused on mount, so editor.focus() alone does nothing;
    // the container needs the browser's focus too.)
    if (!document.activeElement?.closest('input, textarea, [contenteditable="true"]')) {
      editor.focus()
      editor.getContainer().focus()
    }
    if (import.meta.env.DEV) Object.assign(window, { editor })
    // Runs before tldraw sees the key: the first Esc still deselects or cancels as usual.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !onEscapeRef.current || e.defaultPrevented) return
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
      if (editor.getSelectedShapeIds().length || editor.getEditingShapeId() || !editor.isIn('select.idle')) return
      onEscapeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    const stopAutosave = attachAutosave(editor, record.id, onDayCreated)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      stopAutosave()
    }
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
