# SkyBrowse

A lightweight, modern desktop browser with its own identity — built with Electron, React, TypeScript and Vite. Windows 10/11 first, Linux later. **Open source (MIT).**

Contributions welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) first.

## Quick start

```bash
npm install
npm run dev        # develop with hot reload
npm run build      # production build into out/
npm run preview    # run the production build
npm run typecheck  # strict TypeScript check
npm run dist:win   # build the Windows installer into dist/ (electron-builder, NSIS)
```

Windows packages are built via electron-builder (NSIS, per-user install, no admin required, desktop + Start Menu shortcuts): `dist/SkyBrowse-Setup-<version>.exe`. Packages are currently **unsigned** — Windows SmartScreen will warn; users click **More info → Run anyway**, or build it yourself with `npm run dist:win` and verify the source.

## Status: v1.1.0 — Milestones 1 + 2 (complete)

- Frameless application with custom title bar, toolbar and tab strip
- Chromium browsing via native `WebContentsView` per tab (sandboxed guests, no Node integration)
- Address bar with URL validation + search fallback (Google / Bing / DuckDuckGo)
- Back / forward / reload / stop / home
- Multiple tabs: create, close (button, middle-click, Ctrl+W), reorder (drag), Ctrl+1–9 switching, favicons, loading spinners
- `skybrowse://` internal protocol with built-in pages and a settings store
- Side panel (settings, shortcuts, about) with chrome-resizing page area
- HTML fullscreen support — chrome hides completely (e.g. YouTube fullscreen)
- Toast notifications for certificate errors, crashes and load failures
- **Bookmarks**: `skybrowse://bookmarks` — folders, filter, rename, delete, move between folders; star in the address bar (Ctrl+D), always-on bookmarks bar with folder dropdowns
- **History**: `skybrowse://history` — grouped by day, searchable, per-entry delete, clear all; feeds address-bar suggestions (bookmarks first)
- **Downloads**: `skybrowse://downloads` — live progress, pause/resume/cancel, open file, reveal in Explorer, persisted completed list
- Address bar autocomplete from bookmarks + history (arrow keys, Enter, Esc)

## Security model

SkyBrowse treats web content as hostile by default:

- **No Node in guests** — web pages get no `require`, no filesystem, no process access; internal pages get a narrow bridge with only what they need
- **Context isolation + sandbox** everywhere, including built-in pages
- **Two preloads by design**: host bridge (window controls, settings subscription) and builtin bridge (settings get/update, openTab, onSettingsChanged). External web content gets **neither**
- **In-place guest migration** across `http(s)` ↔ `skybrowse://` transitions — each world gets exactly its own privileges
- **Navigation allowlist**: only `skybrowse:`, `http(s)` and `about:blank` may load; popups are denied and forwarded to new tabs instead of new windows
- **Certificates are denied on error** and the user is told which host was blocked — invalid certs never silently connect
- **All permissions denied by default** (camera, mic, notifications, clipboard, geolocation, …) via session-level request/check handlers
- **CSP everywhere**: host chrome (`default-src 'self'`, no inline scripts, `object-src 'none'`) and built-in pages (`default-src 'none'`, scripts only from `'self'`)
- **Validated IPC**: host-window vs builtin-guest sender verification, payload validation on every handler, settings sanitized on read and on write; atomic settings writes (temp file + rename) so a crash can't corrupt preferences
- **No telemetry** — SkyBrowse collects and transmits nothing; weather/search only happens at the user's explicit action

## The `skybrowse://` API

SkyBrowse ships its own internal scheme, like `chrome://`, served by the main process (`protocol.handle` over `resources/skybrowse/`):

| Page | What it is |
| --- | --- |
| `skybrowse://newtab` | New Tab page — clock, search (your configured engine), quick dials |
| `skybrowse://about` | Version, platform and stack |
| `skybrowse://settings` | Real, persisted settings (search engine, startup page, homepage) |
| `skybrowse://bookmarks` | Bookmark manager — folders, filter, rename, move |
| `skybrowse://history` | Browsable, searchable history — clear per entry or entirely |
| `skybrowse://downloads` | Active and completed downloads — open, reveal, manage |
| anything else | Friendly 404 |

### Settings

- **Default search engine** — Google, Bing or DuckDuckGo; applies to the address bar and New Tab search instantly
- **Startup page** — New Tab or your homepage
- **Homepage** — the Home button target; `skybrowse://newtab` or any `https://` URL

Settings persist to `%APPDATA%/skybrowse/settings.json` and broadcast to every page and the chrome on change.

### Page API for built-in pages

Built-in pages get a small sandboxed bridge (`window.skybrowse` in `src/preload/builtin.ts`):

- `getAppInfo()` / `getSettings()`
- `updateSetting(key, value)` — validated write (`searchEngine`, `homepage`, `startupPage`)
- `openTab(url)` — validated (http/https/skybrowse only)
- `onSettingsChanged(cb)` — live updates

## Architecture

```
src/
  main/        Electron main process — window, guests (WebContentsView), protocol, IPC, settings store
  preload/     index.ts — host bridge | builtin.ts — internal-page bridge
  renderer/    React UI (tab strip, toolbar, address bar, side panel) — no page content
  renderer/src/lib/  URL normalization, search engines
resources/
  skybrowse/   Built-in pages (newtab, about, settings) + external JS, served over skybrowse://
  icon.png     Generated by scripts/make-icon.mjs (pure Node, no deps)
```

### Key decisions

- **`WebContentsView` over `<webview>`**: guests attach as native views sized to the window (below the 90px chrome, minus the side panel) and re-layout on every resize event.
- **Side panel is a chrome-resizing panel, not an overlay** (native views sit above the DOM): opening it shrinks guest bounds by 340px.
- **HTML fullscreen via `enter/leave-html-full-screen`**: the guest expands to full window bounds, covering the chrome entirely.
- **Certificate errors always block + notify**, never silently continue.
- **Permissions always denied** unless SkyBrowse intentionally grants one in the future.
- **electron-vite** for dev/build; packaging (installer, Linux targets) is Milestone 4.

## Roadmap

- **M3**: more settings (theme, clear browsing data, session restore), new-tab shortcut customization, keyboard shortcut list page
- **M4**: performance pass, UI polish, code signing, Windows auto-update, Linux packaging

## Production notes

- User data lives in `%APPDATA%/skybrowse/` (`settings.json`, `bookmarks.json`, `history.json`, `downloads.json`); nothing is written elsewhere
- To reset to a clean state: quit SkyBrowse and delete `%APPDATA%/skybrowse/settings.json` — it is recreated with defaults
- Settings failures surface in-app: failed writes report inline (settings page/panel), certificate/crash/load failures report as toast notifications — nothing fails silently

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to build, what to check, and the code rules that keep the project secure and maintainable. Security issues go to [SECURITY.md](SECURITY.md), not public issues.

## License

[MIT](LICENSE). SkyBrowse builds on open source software — including [Electron](https://www.electronjs.org/) and [Chromium](https://www.chromium.org/Home) — each under its own license. The SkyBrowse logo and wordmark are the project's identity; brand marks shown in the dials (YouTube, GitHub, Reddit, Wikipedia, Twitch, Google Maps, X) belong to their respective owners and are used for linking only, not to imply endorsement.
