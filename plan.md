# plan.md — a visual diary canvas

> Working name: TBD. This is the long-term vision and design spec, not a build log.
> **What's being built now is in [`v0.md`](v0.md)**: the version just for me, running locally, with no packaging, installers or other users. Everything here that isn't in v0.md is for later.
>
> In §6, ~~struck through~~ = done (updated 2026-11-24).

## 1. What this is

A no-bullshit infinite whiteboard canvas for **personal, non-work collecting**: screenshots, bookmarks, videos and other visual evidence of a thing I'm obsessed with (example: the graphic design of *The Body*: blackletter title cards, Halloween 2004 type, outfit references).

It beats Figma for this job because Figma only does static images and is built for production design work. This app is for **gathering, clustering and thinking**, then handing the pile to an agent that understands it the way I do.

It's three things that sit next to each other:

1. **Canvases**: as many as I want, one per day or per obsession. Drop media in, cluster it, draw on it. I can scroll back through them like flipping through a diary (§4.0).
2. **Notes**: a plain notepad on the same level as the canvas, not hidden inside it.
3. **Taste** (working name): what I'm into *right now*, built from what I save on social media. It's not a storage archive. It's a jumping-off point: every save is a thread to pull, and the app helps me go down the rabbit hole of *why* I saved it.

An **agent** sits across all three. It can see the canvas, read the notes and knows my current taste.

## 2. Principles

- **Install it, own it.** An app people install and run on their own computer (the Obsidian model). Everything lives in local files. There's no server, no accounts, and no one else ever holds your data or logins.
- **Web, not flash.** Design reference is Spotify's web app: dark, dense, calm, sidebar + main area, quick and responsive, almost no decorative animation. Motion only where it explains something (hover-to-play video, drag feedback).
- **My brain's clustering, not a grid.** Things land neatly (auto layout) but stay free to drag anywhere.
- **Keyboard first.** Every common action has a shortcut that works the way Figma or macOS already taught me.
- **Personal.** Built for me first. Anyone can install their own copy, but each copy has one user and one person's taste. No team features, comments or permissions.

## 3. Information architecture

```
┌──────────────┬─────────────────────────────────────────┐
│ Sidebar      │                                         │
│              │                                         │
│  Notes       │        Main area                        │
│  Canvases    │        (whichever item is open)         │
│   · the body │                                         │
│   · istanbul │                                         │
│   · 1102     │                                         │
│  Taste       │                                  [Agent]│
│              │                                         │
└──────────────┴─────────────────────────────────────────┘
```

- **Notes, Canvases and Taste are siblings** in the top-level navigation. Notes are not a sub-feature of a canvas. (2026-11-24: the app's sections moved from a left sidebar to a header bar across the top; the diagram above predates that.)
- Canvases are a list of pages (like the Figma pages in my current file: *nice, istanbul, 1102, oct 29 26 10pm, fonts/graphic design of the body*). Make a new one with `⌘N`. The **Canvases** heading itself opens the day-scroll view (§4.0).
- The agent is a panel you can open from anywhere, and it knows which view you're in.

## 4. Feature spec

### 4.0 Multiple canvases + scrolling through days

Reference: tomjohn.design's day-scroll interaction (x.com/tomjohndesign/status/2123843662195138775). It fits the original "basically a diary app" idea.

**Multiple canvases**
- Make as many canvases as I want. Each has a name, a created date and an optional project tag (e.g. *the body*, *istanbul*).
- Two kinds, same underlying thing:
  - **Day pages**: one canvas per day, auto-named by date ("Monday Sep 21"). Opening the app on a new day gives a fresh one. Whatever I paste that day lands there unless I pick another canvas.
  - **Named canvases**: topic boards I create on purpose ("fonts/graphic design of the body").
- Items can be copied or moved between canvases (`⌘C`/`⌘V` already covers this).

**The day-scroll view** (what the reference shows)
- **One long vertical scroll of pages, newest at the bottom** (or top, decided in the spike). Each page is one canvas.
- **Headers stack at the top like a deck of cards.** As I scroll, past pages collapse into thin header strips ("Saturday Sep 12", "Sunday Sep 13") stacked above the current one. Click a strip to jump back to it.
- **Each header shows the page's project tag(s)** on the right (e.g. *pilgrimage*, *tomjohn.design*), so I can see at a glance what I was into that day.
- **Inside a page, clusters show as titled rows** ("Settlement economy", "Home page and branding", "Game icons"), with their images in a tidy grid. It's a readable, document-like summary of the canvas, not the free canvas itself.
- **Timeline scrubber on the right edge**: tick marks for days with month labels ("Oct") and day numbers. Hover shows a date pill ("Monday Sep 21"). Drag to scrub through time quickly. Taller ticks = more stuff saved that day.
- **Bottom pill**: the current date (click for a date picker) plus a search button (search across all canvases by title, cluster name, caption, URL or agent-extracted hook).
- **Click into a page** to open it as the full free-form canvas. `Esc` goes back to the scroll at the same spot.
- Motion stays "web, not flash": the header stacking is the only real animation, and it follows scroll position directly (no timed animations).

**Why two views of the same canvas:** the free canvas is for arranging and thinking. The scroll view is for *looking back*: what was I into on Sep 14, how did a theme grow over a few weeks. Clusters are what connect the two (a cluster on the canvas = a titled row in the scroll).

### 4.1 Canvas: media types

| Type | Behaviour |
|---|---|
| **Image** (screenshot, png, jpg, gif, webp) | Paste, drag in or drop a file. Shows at native aspect ratio. |
| **Bookmark** (any URL) | Paste a link and get an **embed preview card**: OG image, title, site and favicon. Rich embeds where the site allows it (X/Twitter posts, YouTube, Spotify, Pinterest pins, Are.na). Click to open the source. |
| **Video** (mp4, mov, webm, or a link to one) | Shows the first frame as a still and **autoplays muted on hover**. Click for sound/controls. |
| **Text** | Plain labels and captions on the canvas. |

### 4.2 Canvas: organising

- **Clusters**: select items and group them into a named cluster (a light frame or region). Clusters are what the agent reasons about ("the blackletter cluster", "the outfits cluster").
- **Lines and arrows** between items or clusters, easy to drag out from an edge.
- **Pen / pencil** drawing straight on the canvas (circle things, scribble notes).
- Free move, resize, zoom and pan. Multi-select.

### 4.3 Canvas: paste behaviour

- `⌘C` / `⌘V` copy and paste items within a canvas, across canvases and from outside (browser images, Finder files, URLs, text).
- **Paste lands in auto layout**: pasting several items arranges them in a tidy row/grid near the cursor or viewport centre, not stacked on top of each other.
- After paste, every item is freely draggable. Auto layout is only where things land, not a constraint.
- Pasting a URL makes a bookmark card. Pasting a video URL makes a video item.

### 4.4 Keyboard shortcuts (v1 set)

Standard expectations: `V` select, `H`/space-drag pan, `P` pen, `L` or `A` line/arrow, `T` text, `F` frame/cluster, `⌘G` group into cluster, `⌘C/⌘V/⌘D` copy/paste/duplicate, `⌫` delete, `⌘Z/⇧⌘Z` undo/redo, `⇧1` zoom to fit, `⌘K` command palette, `⌘J` open agent. Final mapping is decided in phase 1.

### 4.5 Import

- **Pinterest board URL** (e.g. `pinterest.com/artificialsoul8/bedazzled-blackletter/`): pull every pin's image into a new cluster.
- **Parsable lists**: paste a list of URLs (or a text/markdown/CSV file) and get one item per URL, laid out in a grid.
- **From Figma**: select images in Figma, copy, paste into the app and get them as separate images. *Needs a spike, see risks.*

### 4.6 Notes

- A plain notepad (reference: Kaan's notepad). One long running page, or a list of notes. Type and go, no formatting chrome.
- **Every entry is timestamped.** The timestamp stays hidden and shows on hover.
- Notes can reference canvas items or clusters (stretch goal), and the agent can read them.

### 4.7 Taste: what I'm into right now

Not an archive. Saving a post is a signal that something caught me. This view should **expand on each save** so I learn more and go deeper, instead of the save just sitting there.

- **Input:** posts I've liked or bookmarked (X, Instagram, Pinterest, TikTok, YouTube…), plus anything I drop on a canvas.
- **How saves get in (in order of reliability):**
  1. **Data-export import (the default).** Drop in a platform's data download (X archive, Instagram "download your information", etc.) and the app parses it. One-off backfill, no login needed.
  2. **Paste or share links.** Paste links, or use a share-sheet / bookmarklet to send new saves.
  3. **Live sync connectors (optional plugins).** A per-platform plugin that reads the user's own saves through their own signed-in browser on their machine, on a slow schedule (e.g. nightly). Off by default. Each user opts in and runs it on their own account at their own risk.
- **"Why did I save this?"** For each save, the agent pulls out the hooks that probably caught me: a typeface (blackletter), a film (*The Body*), a designer, a studio, an era (Halloween 2004), a technique, a garment, a place. I can confirm, dismiss or add my own reason in one click.
- **Rabbit holes:** every hook opens into a thread: who made it, where it comes from, related work, the history, people to follow, things to read or watch next. Each thread can keep going (hook → related hook → …). Results come back as real media and links I can drop onto a canvas.
- **Current interests, not all-time:** saves get grouped into themes ("blackletter in pop culture", "2000s horror title design"). Themes rise and fade by how recently and how often I save into them, so the view shows what I'm into *now*. Old themes stay findable but recede.
- **Connections:** show when saves from different places share a hook ("these 6 posts are all the same type foundry").
- **Learning, not hoarding:** a theme can turn into a canvas (a starter board with the saves plus what the rabbit hole found) or a note.
- **It's the taste profile the agent reads** when it makes things for me (§4.8).

### 4.8 Agent

The agent has to see the canvas **the way I'm seeing it**:

- **Model: bring your own.** Each user pastes in their own model API key, or points the app at a model running on their machine. Keys stay in local settings. I never pay for or see anyone else's usage.
- **Inputs**: a screenshot of the current viewport (what I see) **plus** structured canvas data: each item's type, position, size, cluster membership, source URL, captions and lines between items. It also gets my notes and current taste themes.
- **Actions on the canvas**: move, arrange or re-cluster items; add labels or notes; find duplicates; "pull everything blackletter into one cluster"; summarise a cluster.
- **Generative output**: "create an interactive website based on this" produces a working web page built from the selected cluster(s) plus my current taste. The result shows up **on the canvas** as a live embed I can open full-screen.
- Selection-aware: if I've selected a cluster, that's the scope.

### 4.8.1 Code editor with live preview

Reference: Tumblr's "Edit HTML" theme customiser, where the code is on one side and the blog re-renders live on the other. I haven't checked whether Tumblr still works this way.

- **Split view:** the code editor on the left (HTML / CSS / JS tabs, or one file), and the rendered page on the right, updating as I type (short debounce, no Run button needed).
- **Where it opens:** any web page the agent makes (§4.8), or a new blank page. On the canvas it shows as a live embed. Double-click it to open the split view.
- **Agent + me on the same code:** I can edit by hand or ask the agent to change it, and the preview updates either way.
- **Canvas media is usable in the code:** images and videos from the canvas can be referenced by their local `/media/...` URLs.
- **Safe preview:** the page runs in a sandboxed iframe, so a broken or bad script can't touch the app or my data.
- Saved as plain files (`pages/<id>/index.html`, `style.css`, `script.js`) in the data folder.
- Editor: a ready-made code editor component (CodeMirror or Monaco), not a homemade one.

### 4.9 Replay ("Procreate timelapse")

- Every canvas records its history from creation. You can play back how a board was built, like Procreate's time-lapse replay.
- Comes almost for free if every change is stored as an ordered log (needed for undo/sync anyway).

### 4.10 Storage and sharing (no accounts)

- All data is plain local files in a folder the user picks (canvases, notes, media, Taste). Back it up or sync it with whatever they already use (iCloud Drive, Dropbox, git).
- No accounts, no server.
- Sharing = **export**: a canvas as an image, a PDF or a static web page the user can host wherever they like.

## 5. Build vs. buy: tldraw SDK or a custom canvas?

**Recommendation: build on the tldraw SDK, not from scratch.**

- What it gives you on day one: infinite canvas, selection, multi-select, pen/draw, arrows that bind to shapes, frames, undo/redo, copy/paste, zoom/pan, keyboard shortcuts and a change log (which makes replay possible).
- It's built to be customised: **custom shapes** (bookmark card, hover-video, cluster), the default UI can be fully hidden and replaced with your own (so it doesn't have to look like tldraw), and custom tools and shortcuts are supported.
- It already has an agent starter kit pattern (the agent gets a screenshot plus shape data and can create or edit shapes). That's very close to §4.8.
- "Sublime is just tldraw" isn't a reason against it. It shows the base works, and the difference is in the custom shapes, the Notes/Archive IA and the agent.
- Building your own canvas means months spent on hit-testing, selection, arrows, undo and zoom performance before you get to the parts that make this different.
- **Check before committing:** tldraw's current licence terms for a non-commercial or hobby project (production use has needed a licence key and/or a watermark).

### 5.1 How much of tldraw's UI and interaction can be changed

The most important question is whether the look and the tool interactions can be mine. From what I know of the SDK (not yet checked against current docs):

**UI: fully replaceable**
- Every built-in piece (toolbar, style panel, menus, zoom controls) can be hidden and replaced with my own React components, so the Spotify-style sidebar and toolbar are my code.
- Or swap single pieces and keep the rest.
- Selection box, handles, brush rectangle, grid, cursors and snap lines can be overridden.
- Colours, fonts and stroke sizes come from CSS variables and custom style options.

**Interactions: tools are rewritable**
- Each tool is a small state machine (on click, drag, release, key press). Built-in tools (select, draw, arrow, hand) can be edited, or I write new ones. Example: paste-into-auto-layout, or dragging a whole cluster.
- Shortcuts can be remapped, and custom actions added.
- Paste and drop handling is mine to define (URL becomes a bookmark card, video file becomes a hover-video item).
- Each item type controls its own rendering (any React/HTML, so hover `<video>` and embeds work), plus resizing, handles, snapping and what lines attach to.
- Camera (zoom speed, pan limits, wheel behaviour) is configurable.

**Harder**
- **The feel of the pen.** Their stroke rendering isn't very tweakable. A very different pencil feel means writing my own draw tool and item type.
- **Arrows.** Small changes are fine. Very different line behaviour means building my own.
- **The core engine** (hit-testing, selection model, undo history) is meant to be used, not rewritten.

### 5.2 Spike: hover-video item + one custom tool (about half a day)

Build:
1. **Hover-video item:** shows the first frame, plays muted on hover, click for sound. Resizes at a fixed aspect ratio.
2. **One custom tool:** paste lands in auto layout. Paste several images or URLs and they arrange into a grid near the cursor, then drag freely.
3. All of it running with tldraw's default UI hidden and my own minimal toolbar.

**Pass if all of these are true:**
- Hover playback is smooth with about 30 videos on a canvas (no jank while panning or zooming).
- The custom tool feels native: undo/redo works, and it doesn't fight the select tool.
- Nothing visible says "tldraw" except what the licence requires.
- It took about a day or less, without digging into tldraw internals.

### 5.3 If the spike doesn't work out

First, work out *why* it failed. Each cause has a different next step:

| What went wrong | Next step |
|---|---|
| **Videos are janky** (too many playing `<video>` elements, lag while panning) | Not a tldraw problem. Use static poster frames, play only the hovered video, unload videos that are off-screen, use short low-res preview clips. Test again. Every canvas library has this problem. |
| **The custom tool fights the built-in select tool** | Implement auto-layout paste as a paste handler plus a layout function, not a new tool. Ask in the tldraw Discord or look at their examples. Give it one more half-day. |
| **The UI can't be made to look like mine** (leftover styles, hard-to-remove elements) | Try harder overrides (fully hiding the UI and supplying my own components). If the licence watermark is what's left, decide whether it's acceptable for a personal project. |
| **Licence terms don't work for me** | Try other canvas libraries before building from scratch: **Excalidraw** (MIT, embeddable, more opinionated hand-drawn look, less customisable shapes) or **React Flow** (MIT, great for items and lines, no freehand pen). Re-run the same spike on whichever one fits. |
| **It just feels wrong** (the interaction model itself, the feel of the pen) | **Build my own canvas**, scoped tightly: a DOM/React canvas with CSS-transform pan/zoom, absolutely-positioned items, drag/resize, multi-select, and an operation log for undo and replay. Lines and pen come later (SVG on top, `perfect-freehand` for strokes, the same library tldraw uses). Budget weeks, not days, and phase 1 shrinks to: images + bookmarks + hover-video + drag + paste. |

**Decision rule:** if two of the fixes above don't solve it within about two more days, stop patching and move down the table (to another library, then to a custom build). Don't let the spike run on indefinitely.

## 6. Phases

**Phase 0: spikes (decide, don't build)**
- ~~tldraw licence check, then the hover-video + custom tool spike (§5.2). If it fails, follow §5.3.~~ Spike passed. Licence: a small "Get a license" note still shows on localhost.
- ~~Figma paste: what's actually on the clipboard when copying from Figma (see risks).~~ Answer: use Figma's Copy as PNG.
- Pinterest: can a public board be fetched reliably?
- ~~Link previews: which sites allow iframe embeds vs. OG-card only.~~ Live embeds for YouTube, Vimeo, Spotify; preview cards for everything else.

**Phase 1: the canvas beats Figma for collecting**
- ~~Canvas with image, bookmark card, hover-video and text shapes.~~
- ~~Paste with auto layout, free drag, lines/arrows, pen, clusters.~~
- ~~Keyboard shortcuts. Multiple canvases (day pages + named canvases) in the sidebar. Local persistence.~~
- ~~**Day-scroll view** (§4.0): stacked day headers, clusters as titled rows, right-edge timeline scrubber, click in/out of a page. Search can wait until phase 2.~~ Opens from **All days** in the canvas list; newest at the bottom.
- Spotify-web-like visual design.
- ✅ Done when: I can rebuild my "graphic design of the body" Figma page here faster than in Figma, with videos and links included.

**Phase 2: notes + import**
- Notes view in the sidebar with hover timestamps.
- Import a list of URLs. Import a Pinterest board. Figma paste (whatever the spike says is possible).

**Phase 3: agent**
- Agent panel that sees the viewport plus canvas data and can arrange, cluster and summarise.
- "Make a website from this" with the result embedded on the canvas.

**Phase 4: taste + rabbit holes**
- Bring in social saves. Pull out "why I saved it" hooks per save.
- Rabbit-hole threads per hook. Themes that rise and fade by recency.
- Turn a theme into a canvas. Agent uses current themes as taste context.

**Phase 5: packaging, updates, connectors, replay**
- Package as an installable desktop app (Tauri or Electron), with macOS code signing and notarization, plus auto-updates.
- Move live sync connectors into separate, optional plugins that can update on their own when a platform changes its pages.
- Export canvases (image, PDF, static page).
- Canvas time-lapse replay.

## 7. Out of scope (v1)

Real-time multiplayer, comments, teams/permissions, vector design tools (pen paths, boolean ops, components), mobile app, exporting to Figma.

## 8. Risks and unknowns

- **Social saves have no easy API.** X bookmarks API access is paid; Instagram saves have no API. Hence data-export import as the default and live sync as opt-in plugins (§4.7). A browser extension is not on the table.
- **Connector maintenance.** When a platform changes its pages, every user's live sync breaks at once and waits on a fix. Keep connectors separate and optional so the rest of the app never depends on them.
- **Terms of service.** Publishing a tool that automates people's accounts carries more risk than using one yourself (platforms do send takedowns). Keep sync opt-in and slow, run only on the user's own account, and say so plainly.
- **Support.** Decide whether this is "use it if you like, no promises" or something I maintain.
- **Pinterest** has no open API for reading boards without app approval. Public boards expose an RSS feed (recent pins only) and the HTML can be parsed, but that's fragile. Treat it as best-effort.
- **Figma clipboard** is a proprietary format. `⌘C` in Figma won't reliably give separate images to another app; "Copy as PNG" gives one flattened image. Separate images probably need export-then-drop or the Figma API. Decide in the phase 0 spike.
- **Embeds**: many sites block iframes. Default to an OG preview card and only use live embeds for sites with official oEmbed/embed support.
- **Video hosting**: autoplaying video from arbitrary links may not be possible (no direct file URL). Uploaded files and known providers will work.
- **Agent cost/keys**: bring-your-own key or local model, so no shared cost. Never ship or use work-provisioned keys in it.
- **Keep it separate from work.** Build it on personal time, on a personal machine, under a personal GitHub, with no Ramp systems or keys involved.
- **tldraw licence for a distributed app.** Giving it to other people counts as production use. Confirm which licence covers a free, installable app (phase 0).

## 9. Open questions for me

1. Open source, or just a free download?
2. Clusters: a visible frame with a title, or a soft "these are near each other" grouping the agent infers?
3. Notes: one endless timestamped page, or separate notes? Should a note be able to live *on* a canvas too?
4. When the agent makes a website, where does it live: only on the canvas, or also downloadable/hostable?
5. Which social platform matters most for Taste? (Pick one to start.)
6. What should a rabbit hole feel like: a reading list, a mini canvas, or a chat with the agent?
7. Name for the Taste view: *Taste*, *Into*, *Now*, *Threads*, *Obsessions*?
8. Name for the app?
9. Day pages: does a new day *always* get a fresh canvas, or only once I add something? Can one day hold several canvases (one per project), shown as several cards under one date?
10. In the day-scroll view, newest at the bottom (like a chat or diary) or at the top (like a feed)?
11. Should Notes join the day scroll too, so a day shows that day's notes next to its canvas?
