import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView, basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

export type Lang = 'html' | 'css' | 'js'
const LANGS = { html, css, js: javascript }

/** CodeMirror wrapper. Re-created when `docKey` or `lang` changes; otherwise uncontrolled. */
export function CodeEditor({
  docKey,
  lang,
  value,
  onChange,
}: {
  docKey: string
  lang: Lang
  value: string
  onChange: (value: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        basicSetup,
        LANGS[lang](),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    view.focus()
    return () => view.destroy()
    // value is only the initial doc; edits flow out through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, lang])

  return <div className="code-editor" ref={host} />
}
