# style.md: intentional stylistic choices

> Working name. These are the deliberate visual decisions for the app. Anyone building UI here (me or an agent) follows them. Breaking one needs my explicit say-so.
> The tokens behind these rules live at the top of `src/client/styles.css`.

## 1. Light mode, always. Never dark.

- The app is light. There is no dark theme and no following the system setting. That covers the canvas, the code editor and every panel.
- Backgrounds: `#ffffff` main area, `#f6f6f6` sidebar, `#efefef` raised surfaces, `#e4e4e4` hover, `#f7f7f7` canvas background.
- Text: `#121212` for primary, `#6a6a6a` for secondary.
- Exception: content I bring in (screenshots, a page I write in Pages) keeps its own colours. The app around it stays light.

## 2. Font weight: 400, unless I say otherwise

- **Everything is weight 400.** That includes headings, buttons, active states, labels and `<b>`/`<strong>`.
- Nothing goes above 400 unless I've asked for it explicitly, for a specific element.
- **Canvas text is Helvetica** (set in `src/client/canvas/theme.ts`), never tldraw's handwritten font.
- Hierarchy comes from **size and colour** (white vs. grey, a larger size), not from boldness.
- When boldness *is* used, it's a deliberate choice and gets noted here.
- **Exception: bold in Notepad.** Text I make bold in a note (⌘B) is real bold (700). That's formatting I chose, not UI. The B button shows bold too. Everything else in Notepad stays 400.

## 3. The 4px grid

- Every spacing value (padding, margin, gap), size, offset, radius and line-height is a multiple of 4.
- Scale: 4, 8, 12, 16, 24, 32 (`--s1`…`--s8`).
- Type sizes and line-heights come as pairs on the grid: 12/16, 14/20, 16/24.
- The one allowed exception is 1px hairline borders.

## 4. Rounded, concentric corners

- Clean rounded corners, no sharp edges on UI elements.
- **Concentric:** when one rounded thing sits inside another, the outer radius = the inner radius + the padding between them, so the curves run parallel. Example: a 4px-padded container around 8px-radius buttons gets a 12px radius.
- Pills inside pills (the toolbar) are concentric automatically.
- Radii: 4 (small), 8 (default), 12 (containers), 16 (link cards), pill.

## 4.1 Shadows

- **One shadow token: `--shadow`** (`0 0 16px` at 8% black). Minimal, soft and even all around, not a heavy drop shadow under the element.
- Whenever a shadow is asked for, use `--shadow`. On SVG (where box-shadow doesn't work, e.g. clusters) use `--shadow-drop`, the same shadow as a filter. Don't write a new shadow value unless I ask for a different one.

## 5. Web, not flash

(From `plan.md`.) Spotify's web app is the reference: calm, dense, sidebar + main area. Motion only where it explains something (hover-to-play video, drag feedback). No decorative animation.
