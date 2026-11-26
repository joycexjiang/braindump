// Paste/drop handling: everything pasted at once lands as one tidy block (see layout.ts),
// then each item is free to drag. One paste = one undo step.
import {
  AssetRecordType,
  createShapeId,
  defaultHandleExternalTextContent,
  getHashForString,
  type Editor,
  type EmbedShapeUtil,
  type TLAsset,
  type TLShapePartial,
  type VecLike,
} from 'tldraw'
import { notify } from '../notify'
import { HOVER_VIDEO } from '../shapes/HoverVideoShape'
import { CARD_W, cardHeight } from '../shapes/LinkCardShape'
import { findFreeSpot } from './freeSpot'
import { centerOn, layoutBatch, parseUrlList } from './layout'

const MAX_URLS_AT_ONCE = 100
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i

type Item =
  | { kind: 'image' | 'video'; asset: TLAsset; w: number; h: number }
  | { kind: 'bookmark'; asset: TLAsset; url: string; w: number; h: number; fixed: true }
  | { kind: 'embed'; url: string; w: number; h: number }

export function registerPasteHandlers(editor: Editor) {
  // Link previews come from our local server (browsers can't read other sites' HTML).
  editor.registerExternalAssetHandler('url', async ({ url }) => {
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`)
    const meta = await res.json()
    // The image is now a local /media copy, so this is quick. Its size lets the card match its shape.
    const size = meta.image ? await probeImage(meta.image, null) : null
    return AssetRecordType.create({
      id: AssetRecordType.createId(getHashForString(url)),
      type: 'bookmark',
      props: {
        src: url,
        title: meta.title ?? url,
        description: meta.description ?? '',
        image: meta.image ?? '',
        favicon: meta.favicon ?? '',
      },
      meta: size ? { imageW: size.w, imageH: size.h } : {},
    })
  })

  editor.registerExternalContentHandler('files', async ({ files, point }) => {
    const results = await Promise.allSettled(
      files.map((file) => editor.getAssetForExternalContent({ type: 'file', file }))
    )
    const items: Item[] = []
    let failed = 0
    for (const r of results) {
      const asset = r.status === 'fulfilled' ? r.value : undefined
      if (asset && (asset.type === 'image' || asset.type === 'video')) {
        items.push({ kind: asset.type, asset, w: asset.props.w, h: asset.props.h })
      } else {
        failed++
        if (r.status === 'rejected') console.error(r.reason)
      }
    }
    if (failed) notify(`${failed} file${failed > 1 ? 's' : ''} couldn't be added (type or size not supported).`)
    placeItems(editor, items, point)
  })

  editor.registerExternalContentHandler('text', async (content) => {
    const urls = parseUrlList(content.text)
    if (!urls) return defaultHandleExternalTextContent(editor, content)
    await placeUrls(editor, urls, content.point)
  })

  editor.registerExternalContentHandler('url', async ({ url, point, shapeId }) => {
    // Pasting a link onto a selected shape sets that shape's link.
    const target = shapeId ? editor.getShape(shapeId) : undefined
    if (target && 'url' in target.props) {
      editor.updateShape({ id: target.id, type: target.type, props: { url } } as TLShapePartial)
      return
    }
    await placeUrls(editor, [url], point)
  })
}

async function placeUrls(editor: Editor, urls: string[], point?: VecLike) {
  if (urls.length > MAX_URLS_AT_ONCE) {
    notify(`Only the first ${MAX_URLS_AT_ONCE} links were added.`)
    urls = urls.slice(0, MAX_URLS_AT_ONCE)
  }
  const results = await Promise.allSettled(urls.map((url) => urlToItem(editor, url)))
  const items = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
  const failed = urls.length - items.length
  if (failed) notify(`${failed} link${failed > 1 ? 's' : ''} couldn't be added.`)
  placeItems(editor, items, point)
}

async function urlToItem(editor: Editor, url: string): Promise<Item | null> {
  const embedUtil = editor.getShapeUtil<EmbedShapeUtil>('embed')
  const embed = embedUtil?.getEmbedDefinition(url)
  if (embed && embed.definition.embedOnPaste !== false) {
    return { kind: 'embed', url: embed.url, w: embed.definition.width, h: embed.definition.height }
  }

  const { pathname } = new URL(url)
  if (VIDEO_EXT.test(pathname) || IMAGE_EXT.test(pathname)) {
    const isVideo = VIDEO_EXT.test(pathname)
    const size = await (isVideo ? probeVideo(url) : probeImage(url))
    const asset = AssetRecordType.create({
      id: AssetRecordType.createId(getHashForString(url)),
      type: isVideo ? 'video' : 'image',
      props: {
        name: pathname.split('/').pop() ?? url,
        src: url,
        w: size.w,
        h: size.h,
        mimeType: null,
        isAnimated: isVideo,
      },
    }) as TLAsset
    return { kind: isVideo ? 'video' : 'image', asset, w: size.w, h: size.h }
  }

  const asset = await editor.getAssetForExternalContent({ type: 'url', url })
  if (!asset) return null
  // Link cards keep a fixed width (not scaled to the row); the height follows the preview image's shape.
  return { kind: 'bookmark', asset, url, w: CARD_W, h: cardHeight(asset), fixed: true }
}

function placeItems(editor: Editor, items: Item[], point?: VecLike) {
  if (items.length === 0) return
  const wanted = point ?? editor.getViewportPageBounds().center
  const block = layoutBatch(items)
  const blockSize = {
    w: Math.max(...block.map((p) => p.x + p.w)),
    h: Math.max(...block.map((p) => p.y + p.h)),
  }
  const pageId = editor.getCurrentPageId()
  const obstacles = editor
    .getCurrentPageShapes()
    .filter((s) => s.parentId === pageId)
    .flatMap((s) => {
      const b = editor.getShapePageBounds(s)
      return b ? [{ x: b.x, y: b.y, w: b.w, h: b.h }] : []
    })
  const placed = centerOn(block, findFreeSpot(blockSize, wanted, obstacles))
  const ids = items.map(() => createShapeId())

  const shapes = items.map((item, i): TLShapePartial => {
    const { x, y, w, h } = placed[i]
    const base = { id: ids[i], x, y }
    switch (item.kind) {
      case 'image':
        return { ...base, type: 'image', props: { assetId: item.asset.id, w, h } }
      case 'video':
        return { ...base, type: HOVER_VIDEO, props: { assetId: item.asset.id, w, h } }
      case 'bookmark':
        return { ...base, type: 'bookmark', props: { assetId: item.asset.id, url: item.url, w, h } }
      case 'embed':
        return { ...base, type: 'embed', props: { url: item.url, w, h } }
    }
  })

  const assets = new Map<string, TLAsset>()
  for (const item of items) {
    if ('asset' in item && !editor.getAsset(item.asset.id)) assets.set(item.asset.id, item.asset)
  }

  editor.run(() => {
    editor.markHistoryStoppingPoint('paste')
    if (assets.size) editor.createAssets([...assets.values()])
    editor.createShapes(shapes)
    editor.select(...ids)
  })

  const bounds = editor.getSelectionPageBounds()
  if (bounds && !editor.getViewportPageBounds().contains(bounds)) {
    editor.zoomToSelection({ animation: { duration: 200 } })
  }
}

function probeVideo(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const done = (w: number, h: number) => {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      resolve({ w, h })
    }
    const timer = setTimeout(() => done(640, 360), 5000)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => done(video.videoWidth || 640, video.videoHeight || 360)
    video.onerror = () => done(640, 360)
    video.src = url
  })
}

function probeImage<F extends { w: number; h: number } | null = { w: number; h: number }>(
  url: string,
  fallback: F = { w: 400, h: 400 } as F
): Promise<{ w: number; h: number } | F> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(fallback), 5000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : fallback)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(fallback)
    }
    img.src = url
  })
}
