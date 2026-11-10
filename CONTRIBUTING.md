# Contributing to SkyBrowse

Thanks for taking an interest in SkyBrowse. This guide explains how to build, what to check before submitting, and the rules that keep the project healthy.

## Building from source

Prerequisites: **Node.js 20 or newer** and npm.

```bash
git clone <repo-url>
cd skybrowse
npm install
npm run dev        # develop with hot reload
npm run typecheck  # strict TypeScript check — must pass
npm run build      # production build into out/
```

## Before you open a PR

1. `npm run typecheck` passes with zero errors.
2. `npm run build` succeeds.
3. The app launches (`npm run preview`) and basic navigation (back/forward/reload/tabs) works.
4. No new dependencies without discussion — keep the footprint minimal.

## Code rules

These are non-negotiable:

- **Never disable web security** (`webSecurity`, `contextIsolation`, `sandbox`, `nodeIntegration: false` must stay).
- **Web content never gets Node.js** — pages are untrusted; all privileged behavior goes through the narrow preload bridges, and every IPC handler validates sender identity and payloads.
- **Built-in pages** (`resources/skybrowse/*`) stay dependency-free vanilla HTML/CSS/JS with strict CSP meta tags, and inline scripts are not allowed — keep JS in external `.js` files.
- **Validate everything** from the network, guests, and IPC — sanitize on read *and* write.
- Keep it working: milestones land incrementally; partial features behind user-facing "pretending to work" UI are not accepted.

## Reporting bugs / proposing features

- Bugs: open an issue with reproduction steps, your OS version, and what you expected to happen.
- Features: open an issue explaining the use case before writing code — it may change the design.
- Security vulnerabilities: do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Commit style

Short, imperative commit messages (`add history search`, `fix side panel resize bounds`). One logical change per commit.
