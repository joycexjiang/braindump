// tldraw's image, plus an optional "prettified" look: the same 16px rounded corners and
// soft shadow as link cards. Stored per image as shape.meta.pretty, toggled from the right-click menu.
import { ImageShapeUtil, type Editor, type TLImageShape, type TLShape } from 'tldraw'

const RADIUS = 16 // --r-xl, same as link cards

export const isPretty = (shape: TLShape) => shape.type === 'image' && shape.meta?.pretty === true

export class PrettyImageShapeUtil extends ImageShapeUtil {
  override component(shape: TLImageShape) {
    const inner = super.component(shape)
    if (!isPretty(shape)) return inner
    return <div className="pretty-image">{inner}</div>
  }

  override getIndicatorPath(shape: TLImageShape) {
    if (!isPretty(shape)) return super.getIndicatorPath(shape)
    if (this.editor.getCroppingShapeId() === shape.id) return undefined
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, Math.min(RADIUS, shape.props.w / 2, shape.props.h / 2))
    return path
  }
}

/** Prettify the given images, or un-prettify them if they all already are. One undo step. */
export function togglePretty(editor: Editor, shapes: TLShape[]) {
  const images = shapes.filter((s) => s.type === 'image')
  if (!images.length) return
  const pretty = !images.every(isPretty)
  editor.markHistoryStoppingPoint('prettify')
  editor.updateShapes(images.map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, pretty } })))
}
