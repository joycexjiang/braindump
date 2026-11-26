// My own minimal toolbar, replacing tldraw's. Icons are Heroicons (MIT).
import {
  ArrowUpRightIcon,
  Bars3BottomLeftIcon,
  CursorArrowRaysIcon,
  HandRaisedIcon,
  PencilIcon,
  RectangleGroupIcon,
  SlashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { useEditor, useValue } from 'tldraw'
import { onNotify } from './notify'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const TOOLS: { id: string; label: string; kbd: string; Icon: Icon }[] = [
  { id: 'select', label: 'Select', kbd: 'V', Icon: CursorArrowRaysIcon },
  { id: 'hand', label: 'Hand', kbd: 'H', Icon: HandRaisedIcon },
  { id: 'draw', label: 'Pen', kbd: 'P', Icon: PencilIcon },
  { id: 'arrow', label: 'Arrow', kbd: 'A', Icon: ArrowUpRightIcon },
  { id: 'line', label: 'Line', kbd: 'L', Icon: SlashIcon },
  { id: 'text', label: 'Text', kbd: 'T', Icon: Bars3BottomLeftIcon },
  { id: 'frame', label: 'Cluster', kbd: 'F', Icon: RectangleGroupIcon },
]

export function Toolbar() {
  const editor = useEditor()
  const current = useValue('current tool', () => editor.getCurrentToolId(), [editor])

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Tools">
        {TOOLS.map(({ id, label, kbd, Icon }) => (
          <button
            key={id}
            type="button"
            className="toolbar-button"
            aria-label={`${label} (${kbd})`}
            aria-pressed={current === id}
            data-tooltip={label}
            data-kbd={kbd}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => editor.setCurrentTool(id)}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
      <Notifications />
    </>
  )
}

function Notifications() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const off = onNotify((m) => {
      setMessage(m)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 4000)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])
  if (!message) return null
  return (
    <div className="notification" role="status">
      {message}
    </div>
  )
}
