// A video that sits still on its first frame and plays (muted) only while hovered.
// Double-click (or Enter) to "edit" it: plays with sound and shows controls.
import { useEffect, useRef } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useImageOrVideoAsset,
  useIsEditing,
  useValue,
  type TLAssetId,
  type TLShape,
} from 'tldraw'

export const HOVER_VIDEO = 'hover-video'

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [HOVER_VIDEO]: { w: number; h: number; assetId: TLAssetId | null }
  }
}

export type HoverVideoShape = TLShape<typeof HOVER_VIDEO>

export class HoverVideoShapeUtil extends BaseBoxShapeUtil<HoverVideoShape> {
  static override type = HOVER_VIDEO
  static override props = {
    w: T.number,
    h: T.number,
    assetId: T.string.nullable() as T.Validator<TLAssetId | null>,
  }

  getDefaultProps(): HoverVideoShape['props'] {
    return { w: 320, h: 180, assetId: null }
  }

  override isAspectRatioLocked() {
    return true
  }

  override canEdit() {
    return true
  }

  component(shape: HoverVideoShape) {
    return <HoverVideo shape={shape} />
  }

  getIndicatorPath(shape: HoverVideoShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }
}

function HoverVideo({ shape }: { shape: HoverVideoShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const isHovered = useValue('hover-video hovered', () => editor.getHoveredShapeId() === shape.id, [
    editor,
    shape.id,
  ])
  const { asset, url } = useImageOrVideoAsset({
    shapeId: shape.id,
    assetId: shape.props.assetId,
    width: shape.props.w,
  })
  const ref = useRef<HTMLVideoElement>(null)

  const shouldPlay = isHovered || isEditing
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = !isEditing
    if (shouldPlay) video.play().catch(() => {})
    else video.pause()
  }, [shouldPlay, isEditing, url])

  return (
    <HTMLContainer
      className="hover-video"
      style={{ pointerEvents: isEditing ? 'all' : undefined }}
    >
      {url ? (
        <video
          ref={ref}
          // "#t=0.001" makes browsers paint the first frame instead of a black box.
          src={url.startsWith('blob:') ? url : `${url}#t=0.001`}
          muted
          loop
          playsInline
          preload="metadata"
          draggable={false}
          controls={isEditing}
          disablePictureInPicture
          disableRemotePlayback
          aria-label={asset?.props.name}
        />
      ) : (
        <div className="media-placeholder">{asset ? 'Loading…' : 'Missing video'}</div>
      )}
    </HTMLContainer>
  )
}
