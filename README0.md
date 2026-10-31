# Tinta

A local-first novel writing workspace: manuscript editor, worldbuilding
vault, story tools, and exports — all in the browser, all on your machine.
No account, no server, no build step.

## Quick start

Double-click the launcher for your system (`Launch Tinta (Windows).bat`,
`Launch Tinta (Mac).command`, or `Launch Tinta (Linux).sh`), or run
`python3 serve.py` and open the printed address. Tinta needs a real
`http://` origin (ES modules + service worker), so opening `index.html`
directly from the file system will not work.

## Where your writing lives

In your browser's **IndexedDB**, with a best-effort localStorage mirror as
a fallback. Full details — including the backup/restore model and the one
opt-in network feature (the Grammar check endpoint) — are in
[docs/README.md](docs/README.md) (see its **Data** section) and
[docs/TINTA-MASTER-TRUTH.md](docs/TINTA-MASTER-TRUTH.md).

## Documentation

- [docs/README.md](docs/README.md) — the full user + internals guide
- [docs/ROADMAP.md](docs/ROADMAP.md) — change log and session history
- [docs/TINTA-MASTER-TRUTH.md](docs/TINTA-MASTER-TRUTH.md) —
  source-verified feature status (BUILT / NOT BUILT)
- [docs/CODEBASE_NOTES.md](docs/CODEBASE_NOTES.md) — module map for
  contributors

## Development

```bash
npm install        # dev tooling only — the app itself has zero dependencies
npm run lint       # eslint over app + test code
npm run smoketest  # Node-side store/engine suite (js/*.smoketest.mjs)
npm test           # Playwright browser specs (tests/)
```

## License

[MIT](LICENSE)
