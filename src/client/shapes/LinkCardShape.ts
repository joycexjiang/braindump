// tldraw's bookmark card, with its height following the preview image's shape
// instead of tldraw's fixed 320px. Look is restyled in styles.css (.tl-bookmark__*).
import { BookmarkShapeUtil, type Editor, type TLAsset, type TLBookmarkShape } from 'tldraw'

export const CARD_W = 300
const CARD_TEXT_H = 120 // the text card under the image
const CARD_GAP = 8 // space between the image and the text card (--s2)
const IMAGE_MIN_H = 100
const IMAGE_MAX_H = 400
const DEFAULT_H = 320

/** Image area at the image's own aspect ratio (clamped), plus the text area, snapped to the 4px grid. */
export function cardHeight(asset: TLAsset | undefined | null, w = CARD_W) {
  if (!asset || asset.type !== 'bookmark') return DEFAULT_H
  if (!asset.props.image) return CARD_TEXT_H
  const { imageW, imageH } = asset.meta as { imageW?: number; imageH?: number }
  if (!imageW || !imageH) return DEFAULT_H
  const image = Math.min(IMAGE_MAX_H, Math.max(IMAGE_MIN_H, (w * imageH) / imageW))
  return Math.round((image + CARD_GAP + CARD_TEXT_H) / 4) * 4
}

function withCardHeight(editor: Editor, shape: TLBookmarkShape): TLBookmarkShape {
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  if (!asset) return shape
  const h = cardHeight(asset, shape.props.w)
  return h === shape.props.h ? shape : { ...shape, props: { ...shape.props, h } }
}

export class LinkCardShapeUtil extends BookmarkShapeUtil {
  override onBeforeCreate(next: TLBookmarkShape) {
    return withCardHeight(this.editor, super.onBeforeCreate(next) ?? next)
  }

  override onBeforeUpdate(prev: TLBookmarkShape, next: TLBookmarkShape) {
    const updated = super.onBeforeUpdate(prev, next) ?? next
    const fixed = withCardHeight(this.editor, updated)
    return fixed === next ? undefined : fixed
  }
}
