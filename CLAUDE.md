# Working notes for this repo

## Before any UI change: read `design.md`

`design.md` is the design system **and** the rulebook for this app. It is not
reference-only — §0 is a checklist that must be walked every time UI is added
or changed, and §7 documents traps in this codebase that have already caused
repeated re-work.

At minimum, before touching UI:

1. Walk **§0 UI 작업 체크리스트**.
2. Take values (color, font size, radius, spacing) from §1–§4 rather than
   inventing new ones.
3. Reuse the patterns in §5–§6 (collapse/expand specs, component recipes)
   instead of styling from scratch.
4. Run the §0 "마무리" steps — `node --check` on **all three** `<script>` tags,
   plus a Playwright render check with zero page errors.

When a UI change establishes a new rule or fixes a new class of bug, **update
`design.md` in the same change** so the next round doesn't repeat it.

## Standing rules

- **New icons**: when adding a new icon, search Google Material assets
  (fonts.google.com/icons — Material Symbols, Outlined/Filled) for the
  actual icon rather than hand-drawing one. Pull the real SVG path data
  (e.g. via the `@material-symbols/svg-400` npm package) and convert its
  `0 -960 960 960` coordinate space into this app's shared `0 0 24 24`
  icon grid before adding it to the icon map. (Details: `design.md` §9)
- **UI work**: always double-check alignment by default (spacing,
  vertical centering, wrapped/multi-line layout) — don't leave it to a
  follow-up round unless asked to skip it. Verify alignment fixes by
  measuring `getBoundingClientRect()`, not by eyeballing a screenshot.
  (Details: `design.md` §0, §7-1)
- **Icons are the user's own choices** — don't "consolidate" or redraw
  existing icons during consistency passes unless explicitly asked.
