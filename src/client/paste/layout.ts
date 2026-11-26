// Where pasted items land. Pure functions so they're easy to test.

export interface Size {
  w: number
  h: number
  /** Keep this item at its own size instead of scaling it to the row (e.g. link cards). */
  fixed?: boolean
}
export interface Placed extends Size {
  x: number
  y: number
}

export const LAYOUT = {
  /** Multiple items are scaled to this height and laid out in rows. */
  rowHeight: 240,
  gap: 24,
  /** Rows wrap once they'd get wider than this. */
  maxRowWidth: 1200,
  /** A single pasted item keeps its size, shrunk to fit inside this square. */
  singleMax: 480,
}

/**
 * Lays items out left-to-right in rows (top-left of the block at 0,0).
 * One item keeps its own proportions and is only ever shrunk, never enlarged.
 */
export function layoutBatch(sizes: Size[], opts = LAYOUT): Placed[] {
  const safe = sizes.map(({ w, h, fixed }) => ({ w: w > 0 ? w : 1, h: h > 0 ? h : 1, fixed }))
  if (safe.length === 0) return []

  if (safe.length === 1) {
    const { w, h, fixed } = safe[0]
    const scale = fixed ? 1 : Math.min(1, opts.singleMax / Math.max(w, h))
    return [{ x: 0, y: 0, w: w * scale, h: h * scale }]
  }

  const placed: Placed[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const { w, h, fixed } of safe) {
    let sw = fixed ? w : (w * opts.rowHeight) / h
    let sh = fixed ? h : opts.rowHeight
    if (sw > opts.maxRowWidth) {
      sh *= opts.maxRowWidth / sw
      sw = opts.maxRowWidth
    }
    if (x > 0 && x + sw > opts.maxRowWidth) {
      x = 0
      y += rowH + opts.gap
      rowH = 0
    }
    placed.push({ x, y, w: sw, h: sh })
    x += sw + opts.gap
    rowH = Math.max(rowH, sh)
  }
  return placed
}

/** Moves a laid-out block so its center sits on `point`. */
export function centerOn(placed: Placed[], point: { x: number; y: number }): Placed[] {
  if (placed.length === 0) return []
  const minX = Math.min(...placed.map((p) => p.x))
  const minY = Math.min(...placed.map((p) => p.y))
  const maxX = Math.max(...placed.map((p) => p.x + p.w))
  const maxY = Math.max(...placed.map((p) => p.y + p.h))
  const dx = point.x - (minX + maxX) / 2
  const dy = point.y - (minY + maxY) / 2
  return placed.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
}

/** If the pasted text is only http(s) links (separated by whitespace), returns them. */
export function parseUrlList(text: string): string[] | null {
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  for (const part of parts) {
    try {
      const u = new URL(part)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    } catch {
      return null
    }
  }
  return parts
}
