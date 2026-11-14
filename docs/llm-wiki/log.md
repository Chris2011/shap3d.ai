---
title: Log
sources: []
updated: 2026-11-12
---

# Log

Newest first. One line per change: date, what, why.

- 2026-11-12: Principles: splitting a large module (barrel, class in layers, side effects, workers); Vue composables: which VueUse helpers replace timers, listeners and storage code – after splitting `src/scripting/api.ts` and replacing hand-written timers.
- 2026-11-08: Vue components and reactivity: menu items, status message and floating window in the library; plugin panels split the same way; copies for plain session data – after splitting the rest of the large panels.
- 2026-11-08: Vue components, composables, reactivity, conventions: component library in `src/components/ui/`, one job per component, panel state through provide/inject, pure logic in utils/engine/core, why no Pinia, `useModel` and same objects – learned while splitting the big panels.
- 2026-11-06: Project conventions: screenshots of packages only through `scripts/screenshots.mjs`, after the user removed the packages' own scripts.
- 2026-11-06: Wiki created: conventions, principles and Vue pages, based on the official Vue docs and this repository (Vue 3.5).
