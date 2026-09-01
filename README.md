# TJ AI Partner

A desktop app that routes each chat message between a local Ollama model
(small/cheap tasks), Claude Code, and OpenAI Codex — both running headless
for big/complex tasks or anything needing real file access — with projects,
persistent chat history, and connector plugins.

## Three backends, two different sandbox models

Claude and Codex are both invoked headless using your existing subscription
login (Max plan / ChatGPT) — no API keys. But their sandboxes work
differently, verified empirically for both (see the tables below and in-app
"Edits" tier hint):

- **Claude** separates *what tool* runs — file edits (Edit/Write) can be
  allowed while shell commands (Bash) stay blocked. That's the "Edits" tier.
- **Codex** sandboxes command execution as a whole — there is no flag that
  allows writing files but blocks shell commands, because Codex doesn't have
  separate tools for those. Its "Edits" tier is therefore the same
  capability as "Full" except for the workspace-directory and network
  boundary.

Pick Codex explicitly via the routing pill / Settings segmented control
(Auto only ever chooses between Local and Claude — extending the auto
classifier to pick between two different cloud agents felt too speculative
to guess at, so Codex is manual-only for now).

## Run it as a desktop app

```bash
npm run electron
```

Opens a native window — no browser tab needed. Electron's main process spawns
the existing Express server as a child process under your system Node (see
"Why a child process" below), then loads it into the window.

- **Cmd+N** — new chat
- **Cmd+O** — open a project (native folder picker)

To build a standalone `.app`/`.dmg` (unsigned, for your own machine):
```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --publish never
```
→ `dist/ai-with-tj-<version>-arm64.dmg`. Unsigned, so macOS Gatekeeper will
block it on first open — right-click the app → Open, or allow it in
System Settings → Privacy & Security. If startup ever fails silently, check
`~/Library/Application Support/ai-with-tj/startup.log` (see below).

## Or run it as a plain web app

```bash
npm start
```

Open http://localhost:4141. Same app, same server — just in a browser tab
instead of a native window.

## What's in it

**Chat** — persistent sessions (left sidebar), multi-turn memory (transcript
resent as context each turn, so it works even when messages alternate
between backends), image attachments, a "thinking" indicator, per-message
backend/latency/cost.

**Projects** — point the app at a local folder (native picker in Electron, a
path prompt in the browser) and chat with real file access to it. Three
permission tiers, adjustable per project in the right sidebar, **each
verified empirically** (not just from flag docs) by asking Claude to write a
file and run a shell command in a scratch directory, then checking the
directory on disk:

| Tier | File edits | Shell commands | Flags |
|------|-----------|-----------------|-------|
| **Plan** (default for new projects) | ✗ | ✗ | `--restricted --permission-mode plan --disallowedTools "Edit Write MultiEdit NotebookEdit"` |
| **Edits** | ✓ | ✗ | `--restricted --permission-mode acceptEdits` |
| **Full** ⚠ | ✓ | ✓ | `--permission-mode bypassPermissions` |

Global chat (no project selected) always runs at the Plan tier's safety level
— it can't touch your files regardless of what you ask it.

**Connectors (plugins)** — `src/connectors/` is the extension point for
external services; each module exposes a `status()` check and fetch
functions returning `{label, text}` context blocks. Ships with **GitHub**
(via the `gh` CLI — installed for you, but you still need to run
`gh auth login` yourself since that's an interactive OAuth step). Attach an
issue or PR to a message with the 🔗 button in the composer; it auto-detects
the repo when you're inside a project. Add Slack/Linear/etc. later by
dropping in a module with the same shape and registering it in
`src/connectors/index.js`.

**Sidebar** — two tabs. **Insights**: live "agents running" list (elapsed
time per in-flight request, supports genuine concurrency), routing mode +
local model picker + auto-route sensitivity slider, an installed-models list
(delete to free disk space) + a model manager that pulls any Ollama tag with
a real, stoppable progress bar, stats tiles, an activity chart,
recent-requests log. **Agents**: real-time sub-agent visualization — when
Claude delegates part of a task to a Task-tool sub-agent (needs a project
with Edits or Full access; Plan mode blocks the Task tool itself), a pulsing
banner appears above the chat ("N sub-agents working") and tapping it jumps
to this tab, which lists each sub-agent top-to-bottom with live status,
elapsed/duration, token usage, and its result summary once it completes.

## Electron packaging gotchas (both hit and fixed while building this)

1. **Bundled Node vs `node:sqlite`.** Electron ships its own Node build,
   which doesn't yet support the built-in `node:sqlite` module this app's
   database uses (confirmed by hitting `ERR_UNKNOWN_BUILTIN_MODULE` running
   it in-process). Fix: `electron/main.js` spawns `src/server.js` as a child
   process under the *system* `node` (same one `npm start` uses) instead of
   importing the server in-process. `db.js` itself needed zero changes.
2. **No PATH in a Finder/`open`-launched app.** `spawn('node', ...)` works
   under `npm run electron` (inherits the terminal's PATH) but fails
   silently in a packaged, Finder-launched app — confirmed by shipping a
   first DMG where the app opened but no server child ever appeared. Fix:
   `resolveNodeBinary()` checks common install paths directly
   (`~/.local/bin/node`, Homebrew, etc.), falling back to asking the user's
   own login shell (`zsh -lic 'command -v node'`), which sources
   `.zshrc`/`.zprofile` and finds version managers (mise, nvm) the same way
   a real terminal would.
3. **`asar` breaks spawning your own server.** electron-builder packs app
   code into a single `app.asar` archive by default. `require()`/`fs.*` get
   transparent asar support from Electron's patched Node, but the *spawned*
   `node` child here is a plain, unpatched Node process — `spawn ENOTDIR`
   the moment it tried to run a script path inside the archive (confirmed via
   a persistent startup log, see below). Unpacking just `server.js` wouldn't
   have been enough either, since it also `import`s the rest of `src/**` and
   `node_modules` (express, multer) — none of which a plain Node process can
   read out of an asar archive. Fix: `"asar": false` in `package.json`'s
   `build` config; everything ships as real files.
4. **A silent icon-loading failure blocked startup entirely.** An unguarded
   `app.dock.setIcon()` call (icon path not yet in the packaged `files`
   list) threw before the code ever reached the try/catch around server
   startup — an unhandled rejection with no window, no dialog, no visible
   error. Fixed by wrapping it in its own try/catch and adding
   `build/icon-1024.png` to `files`.

Given how much of this only shows up in a *packaged, Finder-launched* build —
never in `npm run electron` dev mode — `electron/main.js` writes a persistent
trail to `~/Library/Application Support/ai-with-tj/startup.log` on every
launch (node resolution, server spawn args + PATH, exit codes, full error
stacks), not just on failure. That log is what actually diagnosed gotchas
2–4 above; `console.log` alone goes nowhere useful for a GUI app with no
attached terminal.

## Setup (already done on this machine)

```bash
brew install ollama gh
brew services start ollama
ollama pull llama3.2:3b   # local text
ollama pull moondream     # local vision (small — real photos work much
                          # better than tiny synthetic test images; llava:7b
                          # is a stronger but bigger local vision option,
                          # pullable from the sidebar model manager)
npm install
```

Still needed from you: `gh auth login` (interactive, can't be scripted).

## Notes

- `cost_usd` for Claude requests is the **list-price equivalent** the CLI
  reports, not a separate charge — under the Max plan you're not billed per
  call.
- The classifier (`src/classifier.js`) is a transparent heuristic — word
  count + keyword matches — tunable via `BIG_KEYWORDS`/`SMALL_KEYWORDS` or
  the sidebar sensitivity slider.
- Session images persist in `data/attachments/<sessionId>/`; ad-hoc (no
  session) image requests still clean up after themselves.
- Everything lives in `data/router.db` (SQLite via `node:sqlite`), gitignored.
