---
title: Vue performance
sources: [https://vuejs.org/guide/best-practices/performance.html, src/engine/viewer.ts, src/scripting/meshJobs.ts]
updated: 2026-11-06
---

# Vue performance

Measure first: long tasks in the browser, time around the suspect. Do not optimise on a guess. Vue is rarely the slow part here; the kernel and the view usually are.

## Keep the main thread free

- Work that can take over about 50 ms and needs no DOM goes to a worker. Examples: `src/scripting/meshJobs.ts`, `src/scripting/scriptWorker.ts`.
- Use typed arrays and transfer them instead of copying.
- A worker that is done gets terminated, so its memory is freed.
- Work that must stay on the main thread runs in slices, with a `setTimeout` in between. `advanceInSlices` in `plugins/physics/src/sim.ts` does that.

## Reactivity

- Big or foreign data stays out of reactive state: [Vue reactivity](vue-reactivity.md).
- `useModel` runs again on every change of the model. Keep its getter cheap, and do not walk the whole model in it.
- Do not read frequently changing state high in the tree. Read it in the small component that shows it.

## Rendering

- Keep props stable: pass `active` to each row rather than `activeId` to all, so only two rows update.
- `v-show` for panels that toggle often, `v-if` for what is rarely shown.
- `v-once` for content that never changes; `v-memo` only after measuring.
- Long lists: render what is visible. `loading="lazy"` for pictures.
- Load heavy parts when needed with a dynamic `import()` or `defineAsyncComponent`. The loaders in `src/plugins/builtin/imports/index.ts` show it.

## The 3D view

- Draw on demand: call `editor.invalidate()` or `editor.redraw()`. There is no constant redraw to rely on.
- Share geometry and materials where possible: `sharedParts` in `src/engine/viewer.ts`.
- Dispose of what you create: geometry, material, render target, texture.
- Do not allocate in loops that run for every edge or every frame.

## Memory

- Lists that only grow need a limit, such as `HISTORY_BUDGET_BYTES` in `src/engine/history.ts`.
- Caches need a way out, such as `releaseImageTextures` in `src/core/textures.ts`.
- Check for leaks with repeated open and close, not just a single run.
