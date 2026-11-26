// The day-scroll view (plan.md §4.0): every canvas in one long vertical scroll, oldest at the
// top and today at the bottom. Each canvas shows as a page: a header strip (name or date on the
// left, project tags on the right), then one titled row per cluster and an "Unsorted" row.
//
// - Headers of pages I've scrolled past stack at the top like a deck (at most STACK_MAX), and
//   follow the scroll position directly: no timed animation. Click a strip to jump back to it.
// - Scrubber on the right edge: a tick per day (longer = more saved), month labels, a date pill
//   on hover, drag to scrub.
// - Bottom pill: the current page's date. Click it for a date picker.
// - Click a page to open it as the full canvas.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { dayName } from '../../shared/canvasName'
import type { CanvasSummary, SummaryItem } from '../../shared/canvasSummary'
import { getSummaries, type CanvasMeta } from '../canvas/persistence'

const STRIP_H = 32 // header strip height, px (matches .day-header)
const STACK_MAX = 4
const TILE_H = 120

interface Props {
  pages: CanvasMeta[]
  /** Where to start: a saved scroll position, or null for the bottom (today). */
  initialScrollTop: number | null
  onScrollTopChange: (top: number) => void
  onOpen: (id: string) => void
}

/** Oldest first. Within a day: the day page, then named canvases by creation time. */
function byDate(a: CanvasMeta, b: CanvasMeta) {
  return (
    a.date.localeCompare(b.date) ||
    Number(a.kind !== 'day') - Number(b.kind !== 'day') ||
    a.createdAt.localeCompare(b.createdAt)
  )
}

const DAY_MS = 86_400_000
const toDay = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS
const fromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10)
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Index of the page closest to `date` (the earlier one on a tie). */
function nearestPage(pages: CanvasMeta[], date: string) {
  const target = toDay(date)
  let best = 0
  for (let i = 0; i < pages.length; i++) {
    const d = Math.abs(toDay(pages[i].date) - target)
    const bestD = Math.abs(toDay(pages[best].date) - target)
    if (d < bestD) best = i
  }
  return best
}

export function DayScroll({ pages: unsorted, initialScrollTop, onScrollTopChange, onOpen }: Props) {
  const pages = useMemo(() => [...unsorted].sort(byDate), [unsorted])
  const [summaries, setSummaries] = useState<Record<string, CanvasSummary> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const sections = useRef<(HTMLElement | null)[]>([])
  const [stack, setStack] = useState({ shown: [] as number[], offset: 0, current: 0 })

  useEffect(() => {
    let cancelled = false
    getSummaries().then(
      (s) => !cancelled && setSummaries(s),
      (err) => !cancelled && setError(String(err))
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Which headers are stacked, worked out from where each page starts and the scroll position.
  // A header joins the stack when it reaches the bottom of it. Once the stack is full, the next
  // header pushes it up (the oldest strip slides off the top) until it takes the last slot.
  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const st = el.scrollTop
    const tops = pages.map((_, i) => sections.current[i]?.offsetTop ?? 0)
    let n = 0
    while (n < tops.length && tops[n] - st <= Math.min(n, STACK_MAX - 1) * STRIP_H) n++
    let offset = 0
    if (n >= STACK_MAX && n < tops.length) {
      offset = Math.max(0, Math.min(STRIP_H, STACK_MAX * STRIP_H - (tops[n] - st)))
    }
    const from = Math.max(0, n - STACK_MAX)
    const shown = Array.from({ length: n - from }, (_, k) => from + k)
    const atBottom = st + el.clientHeight >= el.scrollHeight - 1
    const current = atBottom ? pages.length - 1 : Math.max(0, n - 1)
    setStack((s) =>
      s.offset === offset && s.current === current && s.shown.join() === shown.join() ? s : { shown, offset, current }
    )
  }, [pages])

  /** Scrolls so page `i` sits at the bottom of the stack (or as far as the scroll goes). */
  const jumpTo = useCallback((i: number) => {
    const el = scroller.current
    const section = sections.current[i]
    if (!el || !section) return
    el.scrollTop = section.offsetTop - Math.min(i, STACK_MAX - 1) * STRIP_H
  }, [])

  // Start at today (the bottom) or where I was, once the pages are laid out.
  const started = useRef(false)
  useLayoutEffect(() => {
    if (!summaries || started.current || !scroller.current) return
    started.current = true
    if (initialScrollTop !== null) scroller.current.scrollTop = initialScrollTop
    else jumpTo(pages.length - 1)
    measure()
  }, [summaries, initialScrollTop, jumpTo, measure, pages.length])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, summaries])

  if (error) {
    return (
      <div className="canvas-message" role="alert">
        <p>Couldn't load the day scroll.</p>
        <p className="canvas-message-detail">{error}</p>
      </div>
    )
  }
  if (!summaries) return <div className="canvas-message">Loading…</div>

  const current = pages[stack.current]
  return (
    <div className="days">
      <div
        ref={scroller}
        className="days-scroll"
        onScroll={(e) => {
          measure()
          onScrollTopChange(e.currentTarget.scrollTop)
        }}
      >
        {/* The stacked strips. Zero height and sticky, so it never shifts the pages below it. */}
        <div className="days-stack-anchor">
          <div className="days-stack" style={{ height: stack.shown.length * STRIP_H - stack.offset }}>
            <div style={{ transform: `translateY(${-stack.offset}px)` }}>
              {stack.shown.map((i) => (
                <PageHeader key={pages[i].id} page={pages[i]} onClick={() => jumpTo(i)} />
              ))}
            </div>
          </div>
        </div>

        {pages.map((page, i) => (
          <section key={page.id} ref={(el) => void (sections.current[i] = el)} className="day-page">
            <PageHeader page={page} onClick={() => onOpen(page.id)} />
            <PageBody summary={summaries[page.id]} onOpen={() => onOpen(page.id)} />
          </section>
        ))}
      </div>

      <Scrubber
        pages={pages}
        summaries={summaries}
        currentDate={current?.date}
        onScrub={(date) => jumpTo(nearestPage(pages, date))}
      />
      {current && <DatePill date={current.date} pages={pages} onPick={(date) => jumpTo(nearestPage(pages, date))} />}
    </div>
  )
}

function PageHeader({ page, onClick }: { page: CanvasMeta; onClick: () => void }) {
  const date = dayName(page.date)
  return (
    <button type="button" className="day-header" onClick={onClick}>
      <span className="day-header-name">{page.name}</span>
      {page.name !== date && <span className="day-header-date">{date}</span>}
      {page.tags.length > 0 && <span className="day-header-tags">{page.tags.join(', ')}</span>}
    </button>
  )
}

function PageBody({ summary, onOpen }: { summary: CanvasSummary | undefined; onOpen: () => void }) {
  const rows = summary?.rows ?? []
  return (
    // Clicking anywhere on a page opens it; the header is the keyboard-reachable way in.
    <div className="day-body" onClick={onOpen}>
      {rows.length === 0 && <p className="day-empty">Nothing here yet.</p>}
      {rows.map((row, r) => (
        <div key={r} className="day-row">
          <h3 className="day-row-title">{row.title ?? 'Unsorted'}</h3>
          <div className="day-grid">
            {row.items.map((item, k) => (
              <Tile key={k} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Tile({ item }: { item: SummaryItem }) {
  switch (item.kind) {
    case 'image':
    case 'video': {
      // Sized from the media's own aspect ratio, so nothing moves when it finishes loading.
      const width = Math.round(Math.min(360, Math.max(48, (TILE_H * item.w) / item.h)))
      return item.kind === 'image' ? (
        <img className="day-tile" src={item.src} alt="" loading="lazy" decoding="async" style={{ width }} />
      ) : (
        <video
          className="day-tile"
          src={`${item.src}#t=0.1`}
          muted
          loop
          playsInline
          preload="metadata"
          style={{ width }}
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => e.currentTarget.pause()}
        />
      )
    }
    case 'link':
      return (
        <div className="day-tile day-tile-link">
          {item.image && <img src={item.image} alt="" loading="lazy" decoding="async" />}
          <div className="day-tile-link-text">
            <span className="day-tile-link-title">{item.title}</span>
            <span className="day-tile-link-host">{hostOf(item.url)}</span>
          </div>
        </div>
      )
    case 'text':
      return <div className="day-tile day-tile-text">{item.text}</div>
  }
}

function Scrubber({
  pages,
  summaries,
  currentDate,
  onScrub,
}: {
  pages: CanvasMeta[]
  summaries: Record<string, CanvasSummary>
  currentDate: string | undefined
  onScrub: (date: string) => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [hover, setHover] = useState<{ date: string; y: number } | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const el = track.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (pages.length === 0) return null
  const first = toDay(pages[0].date)
  const last = Math.max(toDay(pages[pages.length - 1].date), first)
  const span = last - first
  const frac = (day: number) => (span === 0 ? 0.5 : (day - first) / span)

  const counts = new Map<number, number>()
  for (const p of pages) counts.set(toDay(p.date), (counts.get(toDay(p.date)) ?? 0) + (summaries[p.id]?.count ?? 0))

  // Days with nothing saved get a short pale tick, unless they'd be packed too tightly to read.
  const showEmpty = span === 0 || height / span >= 4
  const ticks: { day: number; len: number; tone: 'empty' | 'page' | 'current' }[] = []
  const labels: { day: number; text: string }[] = []
  let lastLabelY = -Infinity
  for (let day = first; day <= last; day++) {
    const date = fromDay(day)
    const count = counts.get(day)
    if (count !== undefined) {
      // 12px for an empty page, up to 24px for a busy day, in 4px steps.
      const len = 12 + 4 * Math.min(3, Math.ceil(count / 5))
      ticks.push({ day, len, tone: date === currentDate ? 'current' : 'page' })
    } else if (showEmpty) {
      ticks.push({ day, len: 4, tone: 'empty' })
    }
    const y = frac(day) * height
    if ((day === first || date.endsWith('-01')) && y - lastLabelY >= 20) {
      labels.push({ day, text: MONTHS[+date.slice(5, 7) - 1] })
      lastLabelY = y
    }
  }

  const dateAt = (clientY: number) => {
    const rect = track.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)))
    return { date: fromDay(Math.round(first + f * span)), y: Math.round(f * rect.height) }
  }
  const onMove = (e: PointerEvent) => {
    const at = dateAt(e.clientY)
    setHover(at)
    if (dragging.current) onScrub(at.date)
  }

  return (
    <div
      className="days-scrubber"
      onPointerDown={(e) => {
        dragging.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // capture is a nicety: dragging still works while the pointer stays over the scrubber
        }
        onScrub(dateAt(e.clientY).date)
      }}
      onPointerMove={onMove}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onPointerLeave={() => !dragging.current && setHover(null)}
    >
      <div ref={track} className="days-scrubber-track">
        {labels.map((l) => (
          <span key={l.day} className="days-scrubber-month" style={{ top: `${frac(l.day) * 100}%` }}>
            {l.text}
          </span>
        ))}
        {ticks.map((t) => (
          <span
            key={t.day}
            className="days-scrubber-tick"
            data-tone={t.tone}
            style={{ top: `${frac(t.day) * 100}%`, width: t.len }}
          />
        ))}
        {hover && (
          <span className="days-scrubber-pill" style={{ top: hover.y }}>
            {dayName(hover.date)}
          </span>
        )}
      </div>
    </div>
  )
}

function DatePill({ date, pages, onPick }: { date: string; pages: CanvasMeta[]; onPick: (date: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="days-pill">
      <button
        type="button"
        className="days-pill-button"
        title="Go to a date"
        onClick={() => {
          try {
            input.current?.showPicker()
          } catch {
            input.current?.focus()
          }
        }}
      >
        {dayName(date)}
      </button>
      <input
        ref={input}
        type="date"
        className="days-pill-input"
        tabIndex={-1}
        aria-label="Go to a date"
        value={date}
        min={pages[0]?.date}
        max={pages[pages.length - 1]?.date}
        onChange={(e) => e.currentTarget.value && onPick(e.currentTarget.value)}
      />
    </div>
  )
}
