// Pages: a full-screen code editor (left) with a live, sandboxed preview (right).
import { useCallback, useEffect, useRef, useState } from 'react'
import { SideList } from '../SideList'
import { CodeEditor, type Lang } from './CodeEditor'

type PageMeta = { id: string; name: string; createdAt: string; updatedAt: string }
type PageFiles = Record<Lang, string>

const TABS: { id: Lang; label: string }[] = [
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'js', label: 'JS' },
]
const PREVIEW_DELAY_MS = 300
const SAVE_DELAY_MS = 800

/** One document for the iframe. Base points at the app so /media/... URLs resolve. */
function buildDoc(files: PageFiles) {
  // Keep a literal "</script>" in user JS from closing our tag early.
  const js = files.js.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/"><style>${files.css}</style></head><body>${files.html}<script>${js}</script></body></html>`
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

export function PagesView() {
  const [pages, setPages] = useState<PageMeta[]>([])
  const [current, setCurrent] = useState<{ meta: PageMeta; files: PageFiles } | null>(null)
  const [tab, setTab] = useState<Lang>('html')
  const [previewDoc, setPreviewDoc] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')

  const filesRef = useRef<PageFiles | null>(null)
  const dirty = useRef<Partial<PageFiles>>({})
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const refreshList = useCallback(() => api<PageMeta[]>('/api/pages').then(setPages), [])
  // First visit: the server makes a starter page if there are none, so there's always one open.
  useEffect(() => {
    api<PageMeta[]>('/api/pages/ensure', { method: 'POST' }).then(setPages)
  }, [])

  const flush = useCallback(async (id: string) => {
    clearTimeout(saveTimer.current)
    const changes = dirty.current
    if (!Object.keys(changes).length) return
    dirty.current = {}
    setSaveState('saving')
    try {
      await api(`/api/pages/${id}`, { method: 'PUT', body: JSON.stringify(changes) })
      setSaveState(Object.keys(dirty.current).length ? 'unsaved' : 'saved')
    } catch {
      dirty.current = { ...changes, ...dirty.current }
      setSaveState('error')
    }
  }, [])

  const open = useCallback(
    async (id: string) => {
      if (current) await flush(current.meta.id)
      const page = await api<{ meta: PageMeta; files: PageFiles }>(`/api/pages/${id}`)
      filesRef.current = page.files
      setCurrent(page)
      setPreviewDoc(buildDoc(page.files))
      setSaveState('saved')
    },
    [current, flush]
  )

  const create = async () => {
    const page = await api<{ meta: PageMeta }>('/api/pages', { method: 'POST', body: '{}' })
    await refreshList()
    await open(page.meta.id)
  }

  // Open the most recent page on first load.
  useEffect(() => {
    if (!current && pages[0]) open(pages[0].id)
  }, [pages, current, open])

  // Save on tab close / view switch.
  useEffect(() => {
    if (!current) return
    const id = current.meta.id
    const onHide = () => void flush(id)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [current, flush])

  const onEdit = (value: string) => {
    if (!current || !filesRef.current) return
    filesRef.current = { ...filesRef.current, [tab]: value }
    dirty.current[tab] = value
    setSaveState('unsaved')
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => setPreviewDoc(buildDoc(filesRef.current!)), PREVIEW_DELAY_MS)
    clearTimeout(saveTimer.current)
    const id = current.meta.id
    saveTimer.current = setTimeout(() => void flush(id), SAVE_DELAY_MS)
  }

  const rename = async (id: string, name: string) => {
    const old = pages.find((p) => p.id === id)?.name ?? current?.meta.name
    if (!name.trim() || name.trim() === old) return
    const meta = await api<PageMeta>(`/api/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    })
    setCurrent((c) => (c && c.meta.id === id ? { ...c, meta } : c))
    refreshList()
  }

  // Delete = move to ~/Diary/trash/pages. If the open page goes, save its last edits first,
  // then open whichever page is left (a new starter page if none are).
  const remove = async (ids: string[]) => {
    if (current && ids.includes(current.meta.id)) {
      clearTimeout(saveTimer.current)
      await flush(current.meta.id)
      filesRef.current = null
      setCurrent(null)
    }
    setPages((list) => list.filter((p) => !ids.includes(p.id)))
    await Promise.allSettled(ids.map((id) => fetch(`/api/pages/${id}`, { method: 'DELETE' })))
    setPages(await api<PageMeta[]>('/api/pages/ensure', { method: 'POST' }))
  }

  return (
    <div className="pages">
      <SideList
        label="Code"
        noun={['page', 'pages']}
        onDelete={remove}
        newLabel="+ New page"
        items={pages}
        currentId={current?.meta.id ?? null}
        onNew={create}
        onOpen={open}
        onRename={rename}
      />

      {current ? (
        <>
          <section className="pages-code">
            <header className="pages-header">
              <input
                // Keyed on the name too, so a rename from the list shows up here.
                key={`${current.meta.id}:${current.meta.name}`}
                className="pages-name"
                defaultValue={current.meta.name}
                aria-label="Page name"
                onBlur={(e) => rename(current.meta.id, e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="pages-save" data-state={saveState}>
                {{ saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed' }[saveState]}
              </span>
            </header>
            <div className="pages-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className="pages-tab"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <CodeEditor
              docKey={current.meta.id}
              lang={tab}
              value={filesRef.current?.[tab] ?? ''}
              onChange={onEdit}
            />
          </section>
          <section className="pages-preview">
            {/* No allow-same-origin: page scripts can't reach the app, its storage or the API. */}
            <iframe title="Preview" sandbox="allow-scripts allow-modals allow-forms" srcDoc={previewDoc} />
          </section>
        </>
      ) : (
        <div className="pages-empty">
          <p>No pages yet.</p>
          <button type="button" className="side-list-new" onClick={create}>
            + New page
          </button>
        </div>
      )}
    </div>
  )
}
