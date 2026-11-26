// Notepad editor pieces:
// - BlockTimestamps: every top-level block (paragraph, heading, image, link card…) remembers
//   when it was last edited, and shows it in the left margin on hover.
// - Media: a pasted/dropped image or video (videos play on hover, like on the canvas).
// - LinkCard: a pasted link on its own line becomes the same image + text card as the canvas.
import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { timestampName } from '../../shared/canvasName'

const TS_META = 'block-ts'
const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'media', 'linkCard']

export const BlockTimestamps = Extension.create({
  name: 'blockTimestamps',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          ts: {
            default: null,
            parseHTML: (el) => Number(el.getAttribute('data-ts')) || null,
            renderHTML: (attrs) => (attrs.ts ? { 'data-ts': attrs.ts } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockTimestamps'),
        // Unchanged blocks are the same node objects before and after an edit,
        // so any top-level block that's new or different was just edited: stamp it.
        // Stamped in a follow-up transaction (not appendTransaction), because TipTap's markdown
        // shortcuts (# , **bold**) run in appendTransaction too and an extra step there cancels them.
        view: () => {
          let stamping = false // our own stamp isn't an edit
          return {
          update(view, prevState) {
            if (stamping || view.state.doc === prevState.doc) return
            const before = new Set<unknown>()
            prevState.doc.forEach((n) => before.add(n))
            const edited: number[] = []
            view.state.doc.forEach((node, pos) => {
              if (before.has(node) || !BLOCK_TYPES.includes(node.type.name)) return
              if (node.type.name === 'paragraph' && node.content.size === 0) return // empty line: nothing to date
              edited.push(pos)
            })
            if (!edited.length) return
            const doc = view.state.doc
            queueMicrotask(() => {
              if (view.isDestroyed || view.state.doc !== doc) return
              const now = Date.now()
              const tr = view.state.tr
              for (const pos of edited) tr.setNodeAttribute(pos, 'ts', now)
              stamping = true
              try {
                view.dispatch(tr.setMeta(TS_META, true).setMeta('addToHistory', false))
              } finally {
                stamping = false
              }
            })
          },
          }
        },
        props: {
          decorations(state) {
            const decos: Decoration[] = []
            state.doc.forEach((node, pos) => {
              if (node.attrs.ts) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-time': timestampName(new Date(node.attrs.ts)) }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

export const Media = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null }, kind: { default: 'image' } }
  },

  parseHTML() {
    return [
      { tag: 'figure[data-media]', getAttrs: (el) => ({ src: el.querySelector('img,video')?.getAttribute('src'), kind: el.querySelector('video') ? 'video' : 'image' }) },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, kind } = node.attrs
    const inner: [string, Record<string, unknown>] =
      kind === 'video' ? ['video', { src, muted: 'true', loop: 'true', playsinline: 'true', preload: 'metadata' }] : ['img', { src, alt: '' }]
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-media': kind, class: 'note-media' }), inner]
  },

  // Videos play while hovered, same as on the canvas.
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('figure')
      dom.className = 'note-media'
      if (HTMLAttributes['data-ts']) dom.dataset.ts = HTMLAttributes['data-ts']
      if (node.attrs.kind === 'video') {
        const v = document.createElement('video')
        Object.assign(v, { src: node.attrs.src, muted: true, loop: true, playsInline: true, preload: 'metadata' })
        dom.addEventListener('mouseenter', () => void v.play().catch(() => {}))
        dom.addEventListener('mouseleave', () => v.pause())
        dom.append(v)
      } else {
        const img = document.createElement('img')
        img.src = node.attrs.src
        img.alt = ''
        dom.append(img)
      }
      return { dom }
    }
  },
})

export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { url: { default: '' }, title: { default: '' }, description: { default: '' }, image: { default: '' }, favicon: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'div[data-link-card]', getAttrs: (el) => ({ url: el.getAttribute('data-url') }) }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-link-card': '', 'data-url': node.attrs.url }), node.attrs.title || node.attrs.url]
  },

  // Same two-piece look as the canvas link card: a plain image, then a rounded text card.
  addNodeView() {
    return ({ node }) => {
      const { url, title, description, image, favicon } = node.attrs
      const dom = document.createElement('a')
      dom.className = 'note-link'
      dom.href = url
      dom.target = '_blank'
      dom.rel = 'noreferrer'
      dom.contentEditable = 'false'
      if (image) {
        const img = document.createElement('img')
        img.className = 'note-link-image'
        img.src = image
        img.alt = ''
        dom.append(img)
      }
      const card = document.createElement('div')
      card.className = 'note-link-card'
      const h = document.createElement('div')
      h.className = 'note-link-title'
      h.textContent = title || url
      card.append(h)
      if (description) {
        const p = document.createElement('div')
        p.className = 'note-link-desc'
        p.textContent = description
        card.append(p)
      }
      const src = document.createElement('div')
      src.className = 'note-link-source'
      if (favicon) {
        const f = document.createElement('img')
        f.src = favicon
        f.alt = ''
        src.append(f)
      }
      src.append(new URL(url).hostname.replace(/^www\./, ''))
      card.append(src)
      dom.append(card)
      // Plain click selects the card (to move or delete it); ⌘-click opens the link.
      dom.title = '⌘-click to open'
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        if (e.metaKey || e.ctrlKey) window.open(url, '_blank', 'noreferrer')
      })
      return { dom }
    }
  },
})
