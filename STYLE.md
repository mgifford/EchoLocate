# STYLE.md: Design and content standards

This file defines how content is written, designed, and published in this project.
It governs both the live web app and the repository documentation, and is the
authoritative reference for both humans and AI coding agents contributing to
EchoLocate.

---

## Scope: documentation files vs. the web app

This project has two surfaces that share the same standards:

| Surface | Files | Audience |
| :--- | :--- | :--- |
| **Web app (GitHub Pages)** | `index.html`, `style.css`, `app.js`, `sw.js` | Public users running live captioning sessions |
| **Repository documentation** | `README.md`, `AGENTS.md`, `STYLE.md`, `ACCESSIBILITY.md`, `FEATURES.md` | Contributors, adopters, and AI agents reading files directly on GitHub |

**What applies to both surfaces:**
- Section 2 — Content and voice standards (plain language, active voice, sentence-case headings, American English, abbreviations, content structure)
- Section 4 — Accessibility and semantic logic (heading hierarchy, alt text, link text)
- Section 5 — AI agent instructions
- Section 6 — Content governance

**What applies to the web app only:**
- Section 3 — Design foundations (color tokens, typography, breakpoints, layout)

Even though documentation files are rendered as plain Markdown rather than styled
HTML, they share the same voice, tone, and heading conventions as the app UI. This
keeps the project a unified whole for every reader, regardless of which surface they
encounter first.

---

## 1. Core philosophy

We design for the reader and the user, not the institution. The goal is to reduce
cognitive load through consistency, clarity, and radical accessibility.

EchoLocate exists to provide live, private, in-browser captions for deaf and
hard-of-hearing users. Every design and writing decision must serve that purpose.

1. **Reader-first.** Start with the user's need, not the technical structure.
2. **Plain language.** If a 12-year-old cannot understand it, it is a barrier.
3. **Inclusive by default.** See [ACCESSIBILITY.md](./ACCESSIBILITY.md) for all
   interaction and visual standards.
4. **Privacy-first.** All audio and transcript processing stays in the browser.
   Nothing is sent to a server or third-party cloud service.
5. **Consistency is trust.** AI agents and humans must use the same tokens, patterns,
   and vocabulary.
6. **Radically open.** Work transparently; share methods and findings openly.

---

## 2. Content and voice standards

Derived from UK GDS and Digital.gov plain language standards.

### 2.1 Voice and tone

We use an **authoritative peer** tone: professional and knowledgeable, but accessible
and supportive.

| Context | Tone | Strategy |
| :--- | :--- | :--- |
| **Onboarding / labels** | Encouraging | Focus on the benefit to the user |
| **Technical / reference** | Precise | Be unambiguous; explain "why" if a rule is complex |
| **Error states** | Calm / helpful | Do not blame the user; provide a clear path forward |
| **Privacy / legal** | Clear and grounded | Use plain statements; avoid legalese |

### 2.2 Plain language and word choice

AI agents must prioritize these substitutions:

| Avoid | Use instead |
| :--- | :--- |
| Utilize / leverage | Use |
| Facilitate / implement | Help / carry out |
| At this point in time | Now |
| In order to | To |
| Notwithstanding | Despite / even though |
| Requirements | Rules / what you need |

### 2.3 Grammar and mechanics

- **Active voice:** "The scanner checks the link" — not "The link is checked by
  the scanner."
- **Sentence case:** Use sentence case for all headings and UI labels. "Save and
  continue" — not "Save and Continue."
- **Lists:** Use bullets for unordered items. Use numbered lists only for sequential
  steps.
- **Oxford comma:** Always use the serial comma in lists of three or more.

### 2.4 Spelling convention

This project uses **American English** as its default spelling standard.

| Variant | Example spellings | When to use |
| :--- | :--- | :--- |
| **American English** (default) | color, center, optimize, behavior | All documentation and UI text in this project |

> **AI agents:** Always apply American English spelling rules throughout all
> documents and UI strings.

### 2.5 Abbreviations, numbers, and dates

#### Abbreviations

- Spell out an abbreviation on first use, then use the short form: "Web Content
  Accessibility Guidelines (WCAG)."
- Do not use periods in acronyms: "HTML," "CSS," "ASR" — not "H.T.M.L."
- Avoid jargon-only abbreviations without explanation unless writing for a
  specialist audience.

#### Numbers

| Context | Rule | Example |
| :--- | :--- | :--- |
| **In body text** | Spell out one through nine; use numerals for 10 and above | "three speakers," "12 cards" |
| **Starts a sentence** | Always spell out | "Six speaker lanes are supported." |
| **Percentages** | Use numerals and the % symbol | "4.5% contrast ratio" |
| **Versions and technical values** | Always use numerals | "WCAG 2.2," "font-size: 1rem" |

#### Dates

- Use **ISO 8601** for machine-readable dates: `2025-06-01`.
- Use **spelled-out months** for human-readable dates: "June 1, 2025."
- Do not use all-numeric dates that could be ambiguous across locales (01/06/2025).

### 2.6 Attribution and citation

When quoting, adapting, or referencing external work in documentation:

- **Quote directly** only when the original wording matters and cannot be improved.
  Block-quote passages over three lines.
- **Paraphrase** when the idea is what matters. Paraphrasing does not remove the
  need to credit the source.
- **Credit the source** inline or in a references section.
- **Link to the source** rather than reproducing large portions of external content.
- **Do not reproduce** entire copyrighted works, style guides, or specifications.
  Reference them and link to the canonical source.

> **AI agents:** Do not reproduce large passages from external style guides or
> specifications verbatim. Summarize, paraphrase, and link to the canonical source.

### 2.7 Content structure and document types

Different document types follow different patterns. Use the appropriate structure
rather than treating all Markdown files the same.

| Document type | Purpose | Structure pattern |
| :--- | :--- | :--- |
| **Reference** (STYLE.md, ACCESSIBILITY.md) | Authoritative rules; consulted, not read cover-to-cover | Numbered sections, tables, bullet rules |
| **Guide or how-to** (README.md, INSTALL.txt) | Step-by-step walkthrough for a specific audience | Numbered steps, "you" voice, outcome-focused |
| **Feature catalog** (FEATURES.md) | Comprehensive technical inventory | Categorized sections, file paths, option tables |
| **Agent instructions** (AGENTS.md) | Working agreements for AI contributors | Short rules, checklists, concise facts |

Rules that apply to all document types:

- Use heading levels in order (`#` then `##` then `###`). Do not skip levels.
- Open each document with a one-sentence purpose statement.
- Keep paragraphs short: three to five sentences is a good maximum.
- Prefer short sentences over long, complex ones.

---

## 3. Design foundations (web app only)

These rules apply to `index.html`, `style.css`, `app.js`, `sw.js`, and any UI
element rendered in the browser. They do not govern plain Markdown documentation.

### 3.1 Design tokens

The canonical values live in `style.css` under `:root` (dark defaults) and
`[data-theme="light"]` (light overrides). Agents must read and update only these
tokens when changing the visual design; never hardcode hex values outside
`style.css`.

#### Dark theme (default — `:root`)

| Token | Value | Role |
| :--- | :--- | :--- |
| `--bg-page` | `#000000` | Base page background |
| `--bg-surface` | `#0d0d0d` | Surface-level backgrounds (header, footer) |
| `--bg-card-a` | `#071524` | Speaker A card background (blue-tinted) |
| `--bg-card-b` | `#160826` | Speaker B card background (purple-tinted) |
| `--accent-a` | `#4dabf7` | Speaker A accent color (sky blue) |
| `--accent-b` | `#cc5de8` | Speaker B accent color (vivid purple) |
| `--text-primary` | `#f1f3f5` | Primary readable text |
| `--text-muted` | `#868e96` | Supporting / secondary text |
| `--text-interim` | `rgba(241,243,245,0.45)` | In-progress speech text |
| `--warning` | `#ffd43b` | Warning states |
| `--danger` | `#ff6b6b` | Error / destructive states |
| `--success` | `#69db7c` | Success / positive states |

#### Light theme overrides (`[data-theme="light"]`)

| Token | Value | Role |
| :--- | :--- | :--- |
| `--bg-page` | `#f0f2f5` | Base page background |
| `--bg-surface` | `#ffffff` | Surface-level backgrounds |
| `--bg-card-low` | `#e8f4fd` | Low-confidence card background |
| `--bg-card-mid` | `#fef9e7` | Mid-confidence card background |
| `--bg-card-high` | `#f5e6ff` | High-confidence card background |
| `--text-primary` | `#1a1a2e` | Primary readable text |
| `--text-muted` | `#5c6370` | Supporting / secondary text |
| `--danger` | `#c92a2a` | Error / destructive states |
| `--success` | `#2f9e44` | Success / positive states |
| `--warning` | `#e67600` | Warning states |

Both themes must meet WCAG 2.2 AA contrast requirements. Verify contrast for any
new color using a tool such as the
[WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).

### 3.2 Typography

- **Font stack:** `'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`
  (defined as `--font` in `style.css`).
- **Font scaling:** Use `rem` units. Never use `px` for font sizes.
- **Line length:** 45–75 characters per line for prose blocks.
- **Line height:** Minimum `1.6` for body text.
- **Text alignment:** Use left-aligned text for transcript cards and UI labels.
  Avoid `text-align: justify`.
- **Capitalization:** Use CSS `text-transform` for decorative uppercase styling.
  Do not write uppercase text directly in HTML source.

### 3.3 Responsive design (mobile-first)

Write base CSS for the smallest screen first, then enhance with `min-width` queries.

| Layer | Breakpoint | Intent |
| :--- | :--- | :--- |
| **Mobile** | `0`–`599px` (base, no query) | Single-column, touch targets >= 44x44 px |
| **Tablet** | `min-width: 600px` | Two-column lane layouts where content benefits |
| **Desktop** | `min-width: 900px` | Multi-lane grids, wider prose |

- **Never block zoom.** The viewport meta tag must not include `maximum-scale=1` or
  `user-scalable=no`. Users must be able to scale the page freely.

### 3.4 User-preference media queries

| Query | Status | Implementation |
| :--- | :--- | :--- |
| `prefers-color-scheme` | — | Theme is user-controlled via the Theme button; `[data-theme]` attribute overrides OS preference |
| `prefers-reduced-motion` | Required | Remove or reduce transitions and animations |
| `prefers-contrast` | Planned | Not yet implemented |
| `forced-colors` | Planned | Not yet implemented |
| `print` | Recommended | Hide controls and decorative elements; render transcript text at >= 12pt |

### 3.5 UI component conventions

- **Buttons:** Use `<button>` elements with visible focus rings. Never use `<div>` or
  `<span>` as interactive controls.
- **Speaker lanes:** Each lane has a header with a speaker label and controls. Lane
  color is drawn from the speaker's assigned accent token.
- **Transcript cards:** Cards display speaker label, timestamp, confidence meter, and
  transcript text. Low-confidence cards receive additional visual marking.
- **Interim speech strip:** Displays in-progress text with `role="status"` and
  `aria-live="polite"`. Uses `--text-interim` for visual distinction.
- **Security / privacy notice:** Styled with `--warning` border. Must remain visible
  until explicitly dismissed by the user.
- **Sanitization:** Always use `escapeHtml()` in `sw.js` before inserting any
  user-controlled or externally sourced string into a rendered HTML fragment.

### 3.6 Navigation menu pattern

EchoLocate uses a **progressive disclosure** pattern for the header toolbar. This
keeps the primary row compact enough for phones and laptops while still exposing all
controls.

#### Primary toolbar (always visible)

The primary toolbar contains only the controls a user needs in every session:

| Control | Purpose |
| :--- | :--- |
| Status indicator | Shows whether the microphone is active |
| Start / Stop | Begin or end a transcription session |
| Layout toggle | Switch between chat and lanes views |
| Options button | Open the secondary options panel |
| Theme toggle | Switch between dark and light modes |

#### Options panel (revealed on demand)

All secondary controls live in a collapsible panel anchored below the header. The
panel opens when the user activates the Options button and closes when the button is
pressed again, the user clicks outside the header, or the Escape key is pressed.

Secondary controls include: language picker, audio input selector, Export VTT, Debug,
Stereo, Sys Audio, and Clear Local. The Merge tools group is an additional exception:
it is hidden until two or more speaker profiles exist, because merging requires at
least two channels.

#### ARIA requirements

- The Options toggle button uses `aria-expanded` (`"true"` / `"false"`) to
  communicate panel state to assistive technology.
- `aria-controls` on the button points to the panel's `id` (`nav-options-panel`).
- The panel uses the native `hidden` attribute so browsers and screen readers treat
  it as absent from the accessibility tree when closed.
- Pressing Escape while the panel is open closes it and returns focus to the toggle
  button.

#### Implementation references

- [ARIA Disclosure (Show/Hide) pattern — W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [Navigation menus examples — mgifford/STYLES.md](https://github.com/mgifford/STYLES.md/tree/main/examples/navigation-menus)

---

## 4. Accessibility and semantic logic

These rules apply to **both surfaces**. EchoLocate exists to serve deaf and
hard-of-hearing users; our own implementation must meet or exceed the same
accessibility standards we advocate for.

- Use heading levels in order: `h1` then `h2` then `h3`. Do not skip levels.
- Write descriptive link text. "Read more about plain language" — not "click here."
- Every image needs meaningful alt text. Decorative images use `alt=""`.
- Use `aria-label` on landmark elements when the role is ambiguous.
- Minimum color contrast: 4.5:1 for body text, 3:1 for large text and UI components.
- Do not convey information by color alone. Always pair color with a secondary
  indicator: an icon, label, pattern, or text.
- Ensure touch and click targets are at least 44x44 pixels for primary interactive
  elements.
- Use underlines only for links, not for decorative or non-link text.
- Provide a "skip to main content" skip link at the start of each page so keyboard
  users can bypass repeated navigation.
- Live transcript lanes must use `role="log"` so additions are announced by screen
  readers.
- The interim speech strip must use `role="status"` and `aria-live="polite"`.

See [ACCESSIBILITY.md](./ACCESSIBILITY.md) for the full accessibility commitment,
conformance target (WCAG 2.2 AA), and manual test checklist.

---

## 5. AI agent instructions

These rules apply to both surfaces. Agents editing documentation and agents
generating UI code must follow all of them.

- Read [AGENTS.md](./AGENTS.md) before making any change to this repository.
- Identify which surface is being edited (web app or documentation) and apply the
  correct rule set.
- Never override [ACCESSIBILITY.md](./ACCESSIBILITY.md) constraints.
- Never add network transmission of audio or transcript data. All processing must
  remain client-side.
- Use American English throughout.
- Keep changes scoped to the minimum necessary to fulfill the user's request.
- Verify all cross-file references resolve before committing.
- When rendering HTML in `sw.js`, always use `escapeHtml()` for any user-controlled
  or externally sourced data.
- Use UTF-8 encoding only. Do not use smart quotes, em dashes, or Windows-1252
  characters in source files.
- Use absolute or project-relative paths (for example, `app.js`, `vendor/htmx/`),
  never bare filenames without context.
- Before committing, verify `node --check app.js` and `node --check sw.js` both
  pass with no errors.
- Preserve theme parity: any new UI component must be readable in both dark and
  light modes.
- Do not silently override or quietly contradict rules in this file. If a requested
  change would conflict with an existing rule, surface the conflict and ask for
  clarification before proceeding.

---

## 6. Content governance

These rules describe how this style guide itself is maintained and updated.

- **Ownership:** The project maintainer is responsible for keeping these standards
  current. Contributors may propose changes via pull request.
- **Conflict resolution:** When two rules conflict, the more specific rule takes
  precedence. When this file conflicts with ACCESSIBILITY.md, ACCESSIBILITY.md wins.
- **Versioning:** Changes to standards that affect existing content should be noted
  in commit messages.
- **Review cycle:** Standards should be reviewed at least once per year or when a
  significant feature or platform change occurs.
- **Deprecation:** Remove outdated rules rather than leaving contradictions. A rule
  that no longer applies should be deleted, not commented out.

---

## 7. References

- [Plain Language Guidelines — Digital.gov](https://www.plainlanguage.gov/guidelines/)
- [GOV.UK Content Design Guide](https://www.gov.uk/guidance/content-design/writing-for-gov-uk)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Nielsen Norman Group: Ten Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [STYLES.md reference template](https://github.com/mgifford/STYLES.md)
- [ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [AGENTS.md](./AGENTS.md)
- [FEATURES.md](./FEATURES.md)
- [README.md](./README.md)
