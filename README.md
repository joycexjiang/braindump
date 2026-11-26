# braindump

A personal visual diary: an infinite canvas for collecting screenshots, videos and links, one page per day or per obsession, plus a notepad and a small code editor. Built on [tldraw](https://tldraw.dev).

It runs entirely on your own computer. There's no account and no cloud: everything you add is saved as plain files in a folder on that machine (`~/Diary` by default), and the app is only reachable from that computer.

## Run it on your machine

You need [Node.js](https://nodejs.org) 24 or newer (it's developed on 26) and git.

1. Get the code:

   ```bash
   git clone https://github.com/joycexjiang/braindump.git
   cd braindump
   ```

2. Install dependencies (first time, and after pulling changes that touch `package.json`):

   ```bash
   npm install
   ```

3. Start it:

   ```bash
   npm run dev
   ```

4. Open **http://localhost:4600**.

Leave the terminal open while you use it; press `Ctrl+C` there to stop. Next time, `cd braindump` and run `npm run dev` again.

To get the latest version later: `git pull`, then `npm install`, then `npm run dev`.

## Where your data lives

Everything is in `~/Diary` (created on first run):

- `canvases/`: one JSON file per canvas
- `media/`: every image and video you paste or drop in
- `notes/`: the Notepad
- `pages/`: the Code tab's pages
- `trash/`: anything deleted, so it can be restored by moving it back

Nothing in `~/Diary` is part of this repo, and nothing is uploaded anywhere. To back it up, copy the folder (or point `DATA_DIR` at a synced folder such as iCloud Drive). To move to another computer, copy `~/Diary` there before the first run.

**Run only one copy of the app against the same folder at a time.** Canvases save as whole files, so two copies editing at once would overwrite each other.

## Options

Set these in front of `npm run dev`:

| Variable | Default | What it does |
| --- | --- | --- |
| `DATA_DIR` | `~/Diary` | Folder where everything is saved |
| `CLIENT_PORT` | `4600` | Port of the app in the browser |
| `SERVER_PORT` | `4601` | Port of the local file server |

For example, a second copy with its own data, for trying things out:

```bash
CLIENT_PORT=4610 SERVER_PORT=4611 DATA_DIR=~/Diary-test npm run dev
```

## Using it

- **Canvas**: paste (`⌘V`) or drop images, videos and links. `⌥N` makes a new canvas. Today's page is always at the top of the list and is saved once you add something.
- **Clusters**: select items and press `⌘G` to group them under a title; `⌘⇧G` takes them apart.
- **All days**: every canvas in one scroll, oldest at the top. Click a page to open it, `Esc` to come back.
- **Right-click** a canvas in the list to rename, tag or delete it.
- **Notepad** and **Code** are the other two tabs at the top.

A small "Get a license" note from tldraw shows in the corner; that's expected for local use.

## Development

```bash
npm run typecheck   # TypeScript
npm test            # unit tests
```

`plan.md` is the long-term vision, `v0.md` is the current build plan, and `style.md` has the visual rules (light mode only, weight 400, 4px grid).
