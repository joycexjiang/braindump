// Tiny message bus for short status messages (tldraw's own toasts are hidden with its UI).
const EVENT = 'canvas:notify'

export function notify(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export function onNotify(listener: (message: string) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<string>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
