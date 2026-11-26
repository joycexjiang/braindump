// Notepad: plain left-to-right writing. Bold/italic/underline/strikethrough, headings, lists,
// quotes, markdown shortcuts (# , - , > , **bold**, ~~strike~~), pasted images/videos,
// and pasted links as preview cards. Hover a paragraph to see when it was last edited.
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { EditorView } from '@tiptap/pm/view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SideList } from '../SideList'
import { BlockTimestamps, LinkCard, Media } from './extensions'

type NoteMeta = { id: string; name: string; createdAt: string; updatedAt: string }
type Note = { meta: NoteMeta; doc: object }

const SAVE_DELAY_MS = 800
const URL_RE = /^https?:\/\/\S+$/
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

async function upload(file: File): Promise<string> {
  const res = await fetch('/api/media', { method: 'POST', headers: { 'content-type': file.type }, body: file })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  return ((await res.json()) as { src: string }).src
}

function insertFiles(view: EditorView, files: File[], pos?: number) {
  const media = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
  if (!media.length) return false
  ;(async () => {
    for (const file of media) {
      const src = await upload(file).catch(() => null)
      if (!src) continue
      const node = view.state.schema.nodes.media.create({ src, kind: file.type.startsWith('video/') ? 'video' : 'image' })
      const at = pos ?? view.state.selection.from
      view.dispatch(view.state.tr.insert(Math.min(at, view.state.doc.content.size), node))
    }
  })()
  return true
}

/** A link pasted on its own: an image/video URL shows the media, anything else a preview card. */
async function insertLink(editor: Editor, url: string) {
  const { pathname } = new URL(url)
  if (IMAGE_EXT.test(pathname) || VIDEO_EXT.test(pathname)) {
    editor.chain().focus().insertContent({ type: 'media', attrs: { src: url, kind: VIDEO_EXT.test(pathname) ? 'video' : 'image' } }).run()
    return
  }
  const meta = await api<{ title?: string; description?: string; image?: string; favicon?: string }>(
    `/api/unfurl?url=${encodeURIComponent(url)}`
  ).catch(() => ({}) as Record<string, string | undefined>)
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'linkCard',
      attrs: { url, title: meta.title ?? url, description: meta.description ?? '', image: meta.image ?? '', favicon: meta.favicon ?? '' },
    })
    .run()
}

export function NotepadView() {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [current, setCurrent] = useState<Note | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const pending = useRef<{ id: string; doc: object } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    setSaveState('saving')
    try {
      const meta = await api<NoteMeta>(`/api/notes/${p.id}`, { method: 'PUT', body: JSON.stringify({ doc: p.doc }) })
      setNotes((list) => [meta, ...list.filter((n) => n.id !== meta.id)])
      setSaveState(pending.current ? 'unsaved' : 'saved')
    } catch {
      pending.current ??= p
      setSaveState('error')
    }
  }, [])

  const editorRef = useRef<Editor | null>(null)
  const noteId = useRef<string | null>(null)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), Media, LinkCard, BlockTimestamps],
    editorProps: {
      attributes: { class: 'notepad-doc' },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])]
        if (files.length) return insertFiles(view, files)
        const text = event.clipboardData?.getData('text/plain').trim() ?? ''
        // A bare link pasted into an empty line becomes a card; inside a sentence it stays a link.
        const { $from } = view.state.selection
        if (URL_RE.test(text) && $from.parent.content.size === 0 && editorRef.current) {
          void insertLink(editorRef.current, text)
          return true
        }
        return false
      },
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files ?? [])]
        if (!files.length) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        return insertFiles(view, files, pos)
      },
    },
    onUpdate({ editor }) {
      const id = noteId.current
      if (!id) return
      pending.current = { id, doc: editor.getJSON() }
      setSaveState('unsaved')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    api<NoteMeta[]>('/api/notes/ensure', { method: 'POST' }).then(setNotes)
  }, [])

  const open = useCallback(
    async (id: string) => {
      await flush()
      const note = await api<Note>(`/api/notes/${id}`)
      setCurrent(note)
      setSaveState('saved')
    },
    [flush]
  )

  useEffect(() => {
    if (!current && notes[0]) void open(notes[0].id)
  }, [notes, current, open])

  // Load the opened note into the editor without it counting as an edit.
  useEffect(() => {
    if (!editor || !current) return
    noteId.current = current.meta.id
    editor.commands.setContent(current.doc, { emitUpdate: false })
    editor.commands.focus('end')
  }, [editor, current?.meta.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [flush])

  const create = async () => {
    const note = await api<Note>('/api/notes', { method: 'POST', body: '{}' })
    setNotes((list) => [note.meta, ...list])
    await open(note.meta.id)
  }

  const rename = async (id: string, name: string) => {
    if (!name.trim()) return
    const meta = await api<NoteMeta>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
    setNotes((list) => list.map((n) => (n.id === id ? meta : n)))
  }

  const remove = async (ids: string[]) => {
    if (current && ids.includes(current.meta.id)) {
      await flush()
      noteId.current = null
      setCurrent(null)
    }
    await Promise.allSettled(ids.map((id) => fetch(`/api/notes/${id}`, { method: 'DELETE' })))
    setNotes(await api<NoteMeta[]>('/api/notes/ensure', { method: 'POST' }))
  }

  return (
    <div className="notepad">
      <SideList
        label="Notes"
        noun={['note', 'notes']}
        newLabel="+ New note"
        items={notes}
        currentId={current?.meta.id ?? null}
        onNew={create}
        onOpen={open}
        onRename={rename}
        onDelete={remove}
      />
      <div className="notepad-main">
        {editor && <FormatBar editor={editor} saveState={saveState} />}
        <div className="notepad-scroll" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
          <EditorContent editor={editor} className="notepad-page" />
        </div>
      </div>
    </div>
  )
}

function FormatBar({ editor, saveState }: { editor: Editor; saveState: string }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('code'),
      link: e.isActive('link'),
    }),
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const c = () => editor.chain().focus()

  const buttons: { key: keyof typeof s; label: React.ReactNode; title: string; run: () => void }[] = [
    { key: 'bold', label: <b>B</b>, title: 'Bold  ⌘B', run: () => c().toggleBold().run() },
    { key: 'italic', label: <i>I</i>, title: 'Italic  ⌘I', run: () => c().toggleItalic().run() },
    { key: 'underline', label: <u>U</u>, title: 'Underline  ⌘U', run: () => c().toggleUnderline().run() },
    { key: 'strike', label: <s>S</s>, title: 'Strikethrough  ⌘⇧S', run: () => c().toggleStrike().run() },
    { key: 'code', label: '</>', title: 'Inline code  ⌘E', run: () => c().toggleCode().run() },
    { key: 'h1', label: 'H1', title: 'Heading  # ', run: () => c().toggleHeading({ level: 1 }).run() },
    { key: 'h2', label: 'H2', title: 'Subheading  ## ', run: () => c().toggleHeading({ level: 2 }).run() },
    { key: 'bullet', label: '•', title: 'Bullet list  - ', run: () => c().toggleBulletList().run() },
    { key: 'ordered', label: '1.', title: 'Numbered list  1. ', run: () => c().toggleOrderedList().run() },
    { key: 'quote', label: '❝', title: 'Quote  > ', run: () => c().toggleBlockquote().run() },
    {
      key: 'link',
      label: 'Link',
      title: 'Link',
      run: () => {
        if (editor.isActive('link')) return void c().unsetLink().run()
        const url = window.prompt('Link to')
        if (url) c().extendMarkRange('link').setLink({ href: url }).run()
      },
    },
  ]

  return (
    <div className="notepad-bar" role="toolbar" aria-label="Formatting">
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          className="notepad-bar-button"
          title={b.title}
          aria-pressed={s[b.key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
        >
          {b.label}
        </button>
      ))}
      <button type="button" className="notepad-bar-button" title="Add image or video" onClick={() => fileInput.current?.click()}>
        Media
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          insertFiles(editor.view, [...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <span className="notepad-save" data-state={saveState}>
        {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? "Couldn't save" : ''}
      </span>
    </div>
  )
}
