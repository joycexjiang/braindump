// The left column shared by Canvas and Pages: a "+ New" button and a list of items.
// - Click opens an item. Double-click renames it (Enter or clicking away saves, Escape cancels).
// - Shift-click selects a range from the last clicked item; ⌘-click adds/removes one item.
// - Right-click: Rename, Tags (when the list supports them), or Delete (for everything selected).
//   Delete asks first.
// - ⌥N makes a new item. (⌘N can't be used: the browser keeps it for a new window.)
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { timestampName } from '../shared/canvasName'

export interface SideListItem {
  id: string
  name: string
  /** ISO time. Shown at the bottom of the right-click menu once an item has been renamed. */
  createdAt?: string
  /** The name it was given automatically, if not a timestamp (e.g. a day page's "tue nov 24, 26"). */
  autoName?: string
  /** Shown in the list but not saved yet (today's page before anything is added). Can't be deleted. */
  placeholder?: boolean
  /** Project tags, shown after the name. */
  tags?: string[]
}

/** "istanbul, the body" → ['istanbul', 'the body']: trimmed, no blanks or repeats. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

/** "Created nov 24, 26 12:50am", only once an item has been renamed from its automatic name. */
function createdNote(item: SideListItem | undefined): string | undefined {
  if (!item?.createdAt) return undefined
  const created = timestampName(new Date(item.createdAt))
  return item.name === (item.autoName ?? created) ? undefined : `Created ${created}`
}

interface Props {
  label: string
  /** Singular and plural nouns for menus and the delete prompt, e.g. ['canvas', 'canvases']. */
  noun: [string, string]
  newLabel: string
  items: SideListItem[]
  currentId: string | null
  onNew: () => void
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (ids: string[]) => void
  /** Turns on the Tags menu item. */
  onTags?: (id: string, tags: string[]) => void
  /** A fixed row above the items, e.g. Canvas's "All days". */
  topItem?: { label: string; current: boolean; title?: string; onClick: () => void }
}

type Menu = { x: number; y: number; ids: string[] }

export function SideList({
  label,
  noun,
  newLabel,
  items,
  currentId,
  onNew,
  onOpen,
  onRename,
  onDelete,
  onTags,
  topItem,
}: Props) {
  const [editing, setEditing] = useState<{ id: string; field: 'name' | 'tags' } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  // The open item counts as selected (and as the range anchor) until something else is clicked.
  useEffect(() => {
    if (!currentId) return
    setSelected((s) => (s.size === 0 || (s.size === 1 && !s.has(currentId)) ? new Set([currentId]) : s))
    setAnchor((a) => a ?? currentId)
  }, [currentId])

  // Drop selections of items that no longer exist (e.g. after a delete).
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id))
    setSelected((s) => {
      const kept = [...s].filter((id) => ids.has(id))
      return kept.length === s.size ? s : new Set(kept.length ? kept : currentId ? [currentId] : [])
    })
  }, [items, currentId])

  // ⌥N: new item, unless I'm typing somewhere. Matches on the key's position, because on a Mac
  // ⌥N types "˜" rather than "n".
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"], .cm-editor')) return
      e.preventDefault()
      onNewRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Enter and blur can both fire for one edit; only the first one counts.
  const editDone = useRef(false)
  useEffect(() => {
    editDone.current = false
  }, [editing])
  /** Saves the typed name or tags, or cancels when `text` is null. */
  const finishEdit = (item: SideListItem, text: string | null) => {
    if (editDone.current || !editing) return
    editDone.current = true
    const field = editing.field
    setEditing(null)
    if (text === null) return
    if (field === 'name') {
      if (text.trim() && text.trim() !== item.name) onRename(item.id, text.trim())
    } else {
      const tags = parseTags(text)
      if (tags.join('\n') !== (item.tags ?? []).join('\n')) onTags?.(item.id, tags)
    }
  }

  const onItemClick = (e: MouseEvent, id: string) => {
    if (e.shiftKey) {
      const from = items.findIndex((i) => i.id === (anchor ?? currentId))
      const to = items.findIndex((i) => i.id === id)
      if (from === -1) return setSelected(new Set([id]))
      const [lo, hi] = from < to ? [from, to] : [to, from]
      setSelected(new Set(items.slice(lo, hi + 1).map((i) => i.id)))
      return
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchor(id)
      return
    }
    setSelected(new Set([id]))
    setAnchor(id)
    onOpen(id)
  }

  const onItemContextMenu = (e: MouseEvent, id: string) => {
    e.preventDefault()
    // Like Finder: right-clicking inside the selection acts on all of it; outside, on just that item.
    const ids = selected.has(id) ? items.filter((i) => selected.has(i.id)).map((i) => i.id) : [id]
    if (!selected.has(id)) {
      setSelected(new Set([id]))
      setAnchor(id)
    }
    setMenu({ x: e.clientX, y: e.clientY, ids })
  }

  /** The ids that can be deleted, as a one-item list (or none, so the menu leaves Delete out). */
  const deletable = (ids: string[]) => {
    const real = ids.filter((id) => !items.find((i) => i.id === id)?.placeholder)
    return real.length ? [real] : []
  }

  const confirmDelete = (ids: string[]) => {
    const names = ids.map((id) => items.find((i) => i.id === id)?.name ?? '')
    const what = ids.length === 1 ? `“${names[0]}”` : `${ids.length} ${noun[1]}`
    if (window.confirm(`Delete ${what}?\n\nIt moves to the trash folder in ~/Diary, so it can be restored.`)) {
      onDelete(ids)
    }
  }

  return (
    <nav className="side-list" aria-label={label}>
      <button type="button" className="side-list-new" title="⌥N" onClick={onNew}>
        {newLabel}
      </button>
      {topItem && (
        <button
          type="button"
          className="side-list-item side-list-top"
          aria-current={topItem.current}
          title={topItem.title}
          onClick={topItem.onClick}
        >
          <span className="side-list-name">{topItem.label}</span>
        </button>
      )}
      {items.map((item) =>
        editing?.id === item.id ? (
          <input
            key={item.id}
            className="side-list-item side-list-input"
            defaultValue={editing.field === 'name' ? item.name : (item.tags ?? []).join(', ')}
            placeholder={editing.field === 'tags' ? 'Tags, comma separated' : undefined}
            aria-label={editing.field === 'name' ? `Rename ${item.name}` : `Tags for ${item.name}`}
            ref={(el) => el?.select()}
            onBlur={(e) => finishEdit(item, e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishEdit(item, e.currentTarget.value)
              if (e.key === 'Escape') finishEdit(item, null)
            }}
          />
        ) : (
          <button
            key={item.id}
            type="button"
            className="side-list-item"
            aria-current={currentId === item.id}
            // While the top row is open (e.g. All days), only it shows as current.
            data-selected={(!topItem?.current && selected.has(item.id)) || undefined}
            title="Double-click to rename"
            onClick={(e) => onItemClick(e, item.id)}
            onDoubleClick={() => setEditing({ id: item.id, field: 'name' })}
            onContextMenu={(e) => onItemContextMenu(e, item.id)}
          >
            <span className="side-list-name">{item.name}</span>
            {item.tags?.length ? <span className="side-list-tags">{item.tags.join(', ')}</span> : null}
          </button>
        )
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          footer={menu.ids.length === 1 ? createdNote(items.find((i) => i.id === menu.ids[0])) : undefined}
          onClose={() => setMenu(null)}
          actions={[
            ...(menu.ids.length === 1
              ? [
                  { label: 'Rename', run: () => setEditing({ id: menu.ids[0], field: 'name' }) },
                  ...(onTags ? [{ label: 'Tags', run: () => setEditing({ id: menu.ids[0], field: 'tags' }) }] : []),
                ]
              : []),
            ...deletable(menu.ids).map((ids) => ({
              label: ids.length === 1 ? 'Delete' : `Delete ${ids.length} ${noun[1]}`,
              danger: true,
              run: () => confirmDelete(ids),
            })),
          ]}
        />
      )}
    </nav>
  )
}

interface Action {
  label: string
  danger?: boolean
  run: () => void
}

function ContextMenu({
  x,
  y,
  actions,
  footer,
  onClose,
}: {
  x: number
  y: number
  actions: Action[]
  footer?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: x, top: y }}>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          className="context-menu-item"
          data-danger={a.danger || undefined}
          onClick={() => {
            onClose()
            a.run()
          }}
        >
          {a.label}
        </button>
      ))}
      {footer && <p className="context-menu-footer">{footer}</p>}
    </div>
  )
}
