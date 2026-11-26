// Finds the nearest empty spot for a block of pasted items, so a paste never lands on top of existing ones.
import type { Placed, Size } from './layout'

export interface Point {
  x: number
  y: number
}

export const FREE_SPOT = {
  /** Clear space kept around the pasted block. */
  padding: 32,
  /** Search grid spacing in canvas units. */
  step: 64,
  /** How far to search (in steps) before giving up and going below everything. */
  maxRings: 40,
}

function overlaps(a: Placed, b: Placed) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Returns the center point closest to `center` where a block of `size` (plus padding)
 * doesn't overlap any obstacle. Searches outward ring by ring.
 */
export function findFreeSpot(size: Size, center: Point, obstacles: Placed[], opts = FREE_SPOT): Point {
  const pw = size.w + opts.padding * 2
  const ph = size.h + opts.padding * 2
  const isFree = (c: Point) => {
    const rect = { x: c.x - pw / 2, y: c.y - ph / 2, w: pw, h: ph }
    return obstacles.every((o) => !overlaps(rect, o))
  }

  for (let ring = 0; ring <= opts.maxRings; ring++) {
    const candidates: Point[] = []
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue // only this ring's edge
        candidates.push({ x: center.x + i * opts.step, y: center.y + j * opts.step })
      }
    }
    candidates.sort(
      (a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y)
    )
    const free = candidates.find(isFree)
    if (free) return free
  }

  // Everything nearby is full: go just below the lowest obstacle.
  const bottom = Math.max(...obstacles.map((o) => o.y + o.h))
  return { x: center.x, y: bottom + opts.padding + ph / 2 }
}
