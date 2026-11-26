// Clusters are tldraw frames. This hides the title on the canvas while a cluster has none
// (tldraw would show "Frame"). It still shows while editing, so a title can be typed.
import { FrameShapeUtil, type TLFrameShape } from 'tldraw'
import { Children, isValidElement, type ReactElement } from 'react'

export class ClusterShapeUtil extends FrameShapeUtil {
  override component(shape: TLFrameShape) {
    const full = super.component(shape) as ReactElement<{ children: unknown }>
    // "Untitled cluster" was the old default name, so older clusters count as untitled too.
    const name = shape.props.name.trim()
    const untitled = (!name || name === 'Untitled cluster') && this.editor.getEditingShapeId() !== shape.id
    if (!untitled || !isValidElement(full)) return full
    // The frame renders [body, heading]; keep just the body.
    return <>{Children.toArray(full.props.children as never)[0]}</>
  }
}
