// Figma-style smart guides: red lines when edges/centres line up, and equal-spacing
// markers with the gap size in a red pill (Figma's "289").
// Replaces tldraw's snap indicator overlay, which draws the same guides without numbers.
import {
  SnapIndicatorOverlayUtil,
  type GapsSnapIndicator,
  type PointsSnapIndicator,
  type TLSnapIndicatorOverlay,
} from 'tldraw'

export const GUIDE_RED = '#f24822' // Figma's guide red
const LABEL_TEXT = '#ffffff'
const LABEL_FONT_PX = 12
const LABEL_LINE_PX = 16
const LABEL_PAD_X_PX = 4
const LABEL_RADIUS_PX = 4

export class SmartGuidesOverlayUtil extends SnapIndicatorOverlayUtil {
  static override type = 'snap_indicator'

  override render(ctx: CanvasRenderingContext2D, overlays: TLSnapIndicatorOverlay[]) {
    const zoom = this.editor.getZoomLevel()
    ctx.save()
    ctx.strokeStyle = GUIDE_RED
    ctx.lineWidth = 1 / zoom
    for (const { props } of overlays) {
      if (props.line.type === 'points') drawAlignment(ctx, props.line, zoom)
      else drawGaps(ctx, props.line, zoom)
    }
    ctx.restore()
  }
}

/** One straight line through every aligned point, with a small × on each point. */
function drawAlignment(ctx: CanvasRenderingContext2D, { points }: PointsSnapIndicator, zoom: number) {
  if (points.length === 0) return
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const vertical = maxX - minX < maxY - minY

  ctx.beginPath()
  if (vertical) {
    ctx.moveTo(minX, minY)
    ctx.lineTo(minX, maxY)
  } else {
    ctx.moveTo(minX, minY)
    ctx.lineTo(maxX, minY)
  }
  const l = 3 / zoom
  for (const p of points) {
    ctx.moveTo(p.x - l, p.y - l)
    ctx.lineTo(p.x + l, p.y + l)
    ctx.moveTo(p.x - l, p.y + l)
    ctx.lineTo(p.x + l, p.y - l)
  }
  ctx.stroke()
}

/** Equal gaps between items: a measured line across each gap with its size in a pill. */
function drawGaps(ctx: CanvasRenderingContext2D, { gaps, direction }: GapsSnapIndicator, zoom: number) {
  if (gaps.length === 0) return
  const horizontal = direction === 'horizontal'

  // Put the measuring line where all the gap edges overlap, so it touches every item.
  let lo = -Infinity
  let hi = Infinity
  for (const { startEdge, endEdge } of gaps) {
    for (const edge of [startEdge, endEdge]) {
      const a = horizontal ? edge[0].y : edge[0].x
      const b = horizontal ? edge[1].y : edge[1].x
      lo = Math.max(lo, Math.min(a, b))
      hi = Math.min(hi, Math.max(a, b))
    }
  }
  const mid = Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? (lo + hi) / 2 : horizontal ? gaps[0].startEdge[0].y : gaps[0].startEdge[0].x

  const tick = 4 / zoom
  ctx.beginPath()
  for (const { startEdge, endEdge } of gaps) {
    if (horizontal) {
      const x1 = startEdge[0].x
      const x2 = endEdge[0].x
      ctx.moveTo(x1, mid)
      ctx.lineTo(x2, mid)
      ctx.moveTo(x1, mid - tick)
      ctx.lineTo(x1, mid + tick)
      ctx.moveTo(x2, mid - tick)
      ctx.lineTo(x2, mid + tick)
    } else {
      const y1 = startEdge[0].y
      const y2 = endEdge[0].y
      ctx.moveTo(mid, y1)
      ctx.lineTo(mid, y2)
      ctx.moveTo(mid - tick, y1)
      ctx.lineTo(mid + tick, y1)
      ctx.moveTo(mid - tick, y2)
      ctx.lineTo(mid + tick, y2)
    }
  }
  ctx.stroke()

  for (const { startEdge, endEdge } of gaps) {
    const size = horizontal ? Math.abs(endEdge[0].x - startEdge[0].x) : Math.abs(endEdge[0].y - startEdge[0].y)
    const cx = horizontal ? (startEdge[0].x + endEdge[0].x) / 2 : mid
    const cy = horizontal ? mid : (startEdge[0].y + endEdge[0].y) / 2
    drawLabel(ctx, String(Math.round(size)), cx, cy, zoom)
  }
}

/** A red pill with white text, the same size on screen at any zoom. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, zoom: number) {
  ctx.save()
  ctx.font = `400 ${LABEL_FONT_PX / zoom}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + (LABEL_PAD_X_PX * 2) / zoom
  const h = LABEL_LINE_PX / zoom
  ctx.fillStyle = GUIDE_RED
  ctx.beginPath()
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, LABEL_RADIUS_PX / zoom)
  ctx.fill()
  ctx.fillStyle = LABEL_TEXT
  ctx.fillText(text, cx, cy)
  ctx.restore()
}
