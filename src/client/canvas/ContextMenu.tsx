// tldraw's own right-click menu, with "Prettify" added at the top when images are selected.
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { isPretty, togglePretty } from '../shapes/PrettyImageShape'

export function CanvasContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  const images = useValue('selected images', () => editor.getSelectedShapes().filter((s) => s.type === 'image'), [editor])
  return (
    <DefaultContextMenu {...props}>
      {images.length > 0 && (
        <TldrawUiMenuGroup id="prettify">
          <TldrawUiMenuItem
            id="prettify"
            label={images.every(isPretty) ? 'Un-prettify' : 'Prettify'}
            onSelect={() => togglePretty(editor, images)}
          />
        </TldrawUiMenuGroup>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  )
}
