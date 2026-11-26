// Canvas theme: tldraw's default, with text in plain Helvetica instead of its handwritten font.
import { DEFAULT_THEME, type TLThemeFont, type TLThemes } from 'tldraw'

/** Helvetica is built into macOS, so there's nothing to download (no font faces). */
const helvetica: TLThemeFont = {
  fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif",
  faces: [],
}

export const themes: Partial<TLThemes> = {
  default: {
    ...DEFAULT_THEME,
    fonts: {
      ...DEFAULT_THEME.fonts,
      // "draw" is the font new text uses by default; "sans" is the other built-in choice.
      // Both become Helvetica, so all existing and new text matches.
      draw: helvetica,
      sans: helvetica,
    },
  },
}
