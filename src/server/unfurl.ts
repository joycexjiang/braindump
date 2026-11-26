// Pulls Open Graph / Twitter card metadata out of a page's HTML.
// Regex-based on purpose: we only need a handful of <meta>/<link> tags from <head>.

export interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
  /** Original remote URLs, kept when image/favicon were saved into the media folder. */
  remoteImage?: string
  remoteFavicon?: string
}

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function attr(tag: string, name: string) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : ''
}

function absolute(href: string, base: string) {
  if (!href) return ''
  try {
    return new URL(href, base).href
  } catch {
    return ''
  }
}

/** @param pageUrl final URL after redirects (for resolving relative links). @param originalUrl what was pasted. */
export function parseLinkPreview(html: string, pageUrl: string, originalUrl: string): LinkPreview {
  const head = html.slice(0, 300_000)
  const meta = new Map<string, string>()
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && !meta.has(key)) meta.set(key, content)
  }

  let favicon = ''
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel').toLowerCase()
    if (rel.includes('apple-touch-icon') || (!favicon && rel.split(/\s+/).includes('icon'))) {
      favicon = attr(tag, 'href')
    }
  }

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const host = (() => {
    try {
      return new URL(originalUrl).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()

  return {
    url: originalUrl,
    title: meta.get('og:title') || meta.get('twitter:title') || (titleTag ? decodeEntities(titleTag) : '') || originalUrl,
    description: meta.get('og:description') || meta.get('twitter:description') || meta.get('description') || '',
    image: absolute(meta.get('og:image') || meta.get('og:image:url') || meta.get('twitter:image') || '', pageUrl),
    favicon: absolute(favicon || '/favicon.ico', pageUrl),
    siteName: meta.get('og:site_name') || host,
  }
}
