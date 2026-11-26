// Pasted/dropped files are uploaded to the local server and saved in ~/Diary/media.
// The canvas only stores the /media/... URL, never the file itself.
import type { TLAssetStore } from 'tldraw'

export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Upload failed (${res.status})`)
    }
    const { src } = (await res.json()) as { src: string }
    return { src }
  },
  resolve(asset) {
    return asset.props.src
  },
}
