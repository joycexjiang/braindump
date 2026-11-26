// Canvas grid: very faint lines instead of tldraw's dots. Lines sit on the 16px snap grid;
// when zoomed out far enough that they'd crowd together, only every 4th (64px) line is drawn.
import type { TLGridProps } from 'tldraw'

export function Grid({ x, y, z, size }: TLGridProps) {
  let step = size * z
  while (step < 12) step *= 4
  const line = 'var(--grid-line)'
  return (
    <div
      className="tl-grid canvas-grid"
      style={{
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${(x * z) % step}px ${(y * z) % step}px`,
      }}
    />
  )
}
