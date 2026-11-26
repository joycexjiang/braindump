// Clusters are tldraw frames with a title. ⌘G wraps the selection in one; ⌘⇧G takes it apart again.
import { createShapeId, removeFrame, type Editor, type TLShapeId } from 'tldraw'

// Smaller than the paste layout's row gap (24), so wrapping a row never touches the next one.
const PADDING = 16
export const DEFAULT_CLUSTER_NAME = 'Untitled cluster'

/** Wraps the selected items in a new titled cluster and starts editing its title. */
export function wrapSelectionInCluster(editor: Editor): TLShapeId | null {
  const ids = editor.getSelectedShapeIds()
  const bounds = editor.getSelectionPageBounds()
  if (ids.length === 0 || !bounds) return null

  // Keep the cluster at the same level as the items (e.g. a cluster inside a cluster).
  const parents = new Set(ids.map((id) => editor.getShape(id)?.parentId))
  const commonParent = parents.size === 1 ? [...parents][0] : undefined

  const frameId = createShapeId()
  editor.run(() => {
    editor.markHistoryStoppingPoint('wrap in cluster')
    editor.createShape({
      id: frameId,
      type: 'frame',
      x: bounds.x - PADDING,
      y: bounds.y - PADDING,
      props: { w: bounds.w + PADDING * 2, h: bounds.h + PADDING * 2, name: DEFAULT_CLUSTER_NAME },
    })
    if (commonParent && commonParent !== editor.getCurrentPageId()) {
      editor.reparentShapes([frameId], commonParent)
    }
    editor.reparentShapes(ids, frameId)
    editor.select(frameId)
  })
  editor.setEditingShape(frameId)
  return frameId
}

/** If only clusters are selected, removes them and keeps their items in place. */
export function unwrapSelectedClusters(editor: Editor): boolean {
  const selected = editor.getSelectedShapes()
  if (selected.length === 0 || !selected.every((s) => editor.isShapeFrameLike(s))) return false
  editor.markHistoryStoppingPoint('unwrap cluster')
  removeFrame(
    editor,
    selected.map((s) => s.id)
  )
  return true
}
