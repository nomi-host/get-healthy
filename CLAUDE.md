# Working notes for this repo

- **New icons**: when adding a new icon, search Google Material assets
  (fonts.google.com/icons — Material Symbols, Outlined/Filled) for the
  actual icon rather than hand-drawing one. Pull the real SVG path data
  (e.g. via the `@material-symbols/svg-400` npm package) and convert its
  `0 -960 960 960` coordinate space into this app's shared `0 0 24 24`
  icon grid before adding it to the icon map.
- **UI work**: always double-check alignment by default (spacing,
  vertical centering, wrapped/multi-line layout) — don't leave it to a
  follow-up round unless asked to skip it.
