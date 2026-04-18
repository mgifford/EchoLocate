## Primary References

Before making any changes, read this document in the repository root:

- **[AGENTS.md](/mgifford/EchoLocate/blob/main/AGENTS.md)** - AI agent instructions, coding standards, project conventions, and the code change checklist. This is the primary guide for all coding agents.

---

## Project Overview

EchoLocate is a fully client-side live captioning web app with simulated speaker grouping, deployed via GitHub Pages. There is no backend service.

- **Live site**: <https://mgifford.github.io/EchoLocate/>
- **Repository**: <https://github.com/mgifford/EchoLocate>

### Architecture

| File | Purpose |
|------|---------|
| `index.html` | App structure, controls, ARIA semantics, privacy notice |
| `style.css` | Dark/light themes, high-contrast card styles, responsive layout |
| `app.js` | Speech recognition, pitch analysis, lane management, storage, export |
| `sw.js` | Service worker — local fragment rendering route for HTMX card insertion |
| `vendor/` | Vendored JS dependencies (committed to repo, no CDN required) |

### Key Constraints

- All processing stays in the browser — do **not** add network transmission of transcript or audio data.
- Keep generated HTML safe: sanitize/escape all user-controlled strings in `sw.js`.
- Preserve accessibility semantics and keyboard usability when adding controls.
- Any new component must work in both dark and light themes.
- Speaker limit is capped at 6.

---

## Key Commands

```bash
# Syntax check
node --check app.js
node --check sw.js

# Run tests
npm test

# Start local dev server (required for service worker)
python3 server.py          # http://localhost:8080/
python3 server.py 9000     # alternate port
```

---

## Pull Request Checklist

Before opening a PR, verify:

1. `node --check app.js` and `node --check sw.js` pass
2. Start / Stop / Export / Clear / Theme controls still work
3. New cards render in the correct lane and include a card-level match note
4. Existing cards remain visible while new speakers are added
5. Privacy notice text remains accurate and visible until dismissed
6. Light and dark themes both remain readable
