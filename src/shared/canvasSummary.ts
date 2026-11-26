// A canvas boiled down for the day-scroll view: its clusters as titled rows of items, plus an
// "Unsorted" row for everything outside a cluster. Works on the saved tldraw snapshot, so the
// server can do it without loading tldraw.

export type SummaryItem =
  | { kind: 'image'; src: string; w: number; h: number }
  | { kind: 'video'; src: string; w: number; h: number }
  | { kind: 'link'; url: string; title?: string; image?: string }
  | { kind: 'text'; text: string }

export interface SummaryRow {
  /** The cluster's title, or null for the "Unsorted" row. */
  title: string | null
  items: SummaryItem[]
}

export interface CanvasSummary {
  rows: SummaryRow[]
  /** How many items the canvas holds (sets tick heights on the scrubber). */
  count: number
}

type Rec = { id: string; typeName: string; type?: string; parentId?: string; x?: number; y?: number; props?: any }

const UNSORTED = '__unsorted__'

/** Plain text from tldraw rich text (a ProseMirror doc), lines joined with newlines. */
export function richTextToPlain(node: any): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return String(node.text ?? '')
  const parts = Array.isArray(node.content) ? node.content.map(richTextToPlain) : []
  return node.type === 'doc' ? parts.join('\n') : parts.join('')
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function toItem(shape: Rec, assets: Map<string, Rec>): SummaryItem | null {
  const p = shape.props ?? {}
  const asset = p.assetId ? assets.get(p.assetId) : undefined
  const ap = asset?.props ?? {}
  switch (shape.type) {
    case 'image':
    case 'hover-video':
    case 'video': {
      if (!ap.src) return null
      const kind = asset?.type === 'video' ? 'video' : 'image'
      // The asset's own size gives the real aspect ratio; the shape's size is a fallback.
      return { kind, src: ap.src, w: ap.w || p.w || 1, h: ap.h || p.h || 1 }
    }
    case 'bookmark': {
      const url = p.url || ap.src
      if (!url) return null
      return { kind: 'link', url, title: ap.title || hostOf(url), image: ap.image || undefined }
    }
    case 'embed':
      return p.url ? { kind: 'link', url: p.url, title: hostOf(p.url) } : null
    case 'text':
    case 'note':
    case 'geo': {
      const text = richTextToPlain(p.richText).trim()
      return text ? { kind: 'text', text } : null
    }
    default:
      // Drawings, arrows, lines and empty shapes don't read as items.
      return null
  }
}

export function summarizeSnapshot(snapshot: unknown): CanvasSummary {
  const store: Record<string, Rec> = (snapshot as any)?.store ?? (snapshot as any)?.document?.store ?? {}
  const records = Object.values(store)
  const shapes = new Map(records.filter((r) => r.typeName === 'shape').map((r) => [r.id, r]))
  const assets = new Map(records.filter((r) => r.typeName === 'asset').map((r) => [r.id, r]))

  // Page position (parents' offsets added up; rotation ignored, it only sets reading order).
  const pos = new Map<string, { x: number; y: number }>()
  const pagePos = (s: Rec): { x: number; y: number } => {
    const known = pos.get(s.id)
    if (known) return known
    const parent = s.parentId ? shapes.get(s.parentId) : undefined
    const base = parent ? pagePos(parent) : { x: 0, y: 0 }
    const p = { x: base.x + (s.x ?? 0), y: base.y + (s.y ?? 0) }
    pos.set(s.id, p)
    return p
  }
  // Nearest cluster (frame) above a shape, or UNSORTED.
  const clusterOf = (s: Rec): string => {
    let parent = s.parentId ? shapes.get(s.parentId) : undefined
    while (parent) {
      if (parent.type === 'frame') return parent.id
      parent = parent.parentId ? shapes.get(parent.parentId) : undefined
    }
    return UNSORTED
  }

  const byCluster = new Map<string, { shape: Rec; item: SummaryItem }[]>()
  for (const shape of shapes.values()) {
    if (shape.type === 'frame') continue
    const item = toItem(shape, assets)
    if (!item) continue
    const key = clusterOf(shape)
    if (!byCluster.has(key)) byCluster.set(key, [])
    byCluster.get(key)!.push({ shape, item })
  }

  // Reading order: top to bottom, then left to right. Things within 24px vertically share a line.
  const readingOrder = (a: Rec, b: Rec) => {
    const pa = pagePos(a)
    const pb = pagePos(b)
    return Math.abs(pa.y - pb.y) > 24 ? pa.y - pb.y : pa.x - pb.x
  }

  const frames = [...shapes.values()].filter((s) => s.type === 'frame').sort(readingOrder)
  const rows: SummaryRow[] = []
  for (const frame of frames) {
    const entries = byCluster.get(frame.id)
    if (!entries?.length) continue
    entries.sort((a, b) => readingOrder(a.shape, b.shape))
    rows.push({ title: String(frame.props?.name ?? '').trim() || 'Untitled cluster', items: entries.map((e) => e.item) })
  }
  const loose = byCluster.get(UNSORTED)
  if (loose?.length) {
    loose.sort((a, b) => readingOrder(a.shape, b.shape))
    rows.push({ title: null, items: loose.map((e) => e.item) })
  }
  return { rows, count: rows.reduce((n, r) => n + r.items.length, 0) }
}
