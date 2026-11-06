---
title: Vue reactivity
sources: [https://vuejs.org/guide/extras/reactivity-in-depth.html, https://vuejs.org/api/reactivity-advanced.html, src/composables/useModel.ts, src/engine/editor.ts]
updated: 2026-11-06
---

# Vue reactivity

## The most important rule here: the model is not reactive

The kernel holds hundreds of thousands of objects. Vue proxies around them would be slow and memory-hungry, so they stay plain:

- `src/engine/editor.ts` wraps the model, viewer and inference engine in `markRaw`.
- Only `editor.ui` is `reactive`. The editor raises `ui.revision` after each model change and `ui.selRev` after each selection change.
- Components read model data through `useModel` or `useSelection` from `src/composables/useModel.ts`.

```ts
const modelName = useModel(() => editor.model.name); // follows every change
const name = computed(() => editor.model.name); // wrong: never updates
```

Change the model inside `editor.commit(label, () => …)`: that makes the undo step and tells the UI. A change outside it needs `editor.invalidate()` and `editor.ui.saved = false`.

Never put an `Entities`, `Face`, three.js object, texture or `Worker` into `ref` or `reactive`. Use `shallowRef` or `markRaw`.

## Choosing the container

| Use                             | For                                                                  |
| ------------------------------- | -------------------------------------------------------------------- |
| `ref`                           | small values and plain objects of the UI                             |
| `shallowRef`                    | big or foreign objects; replace `.value` to update                   |
| `reactive`                      | a fixed group of fields that belong together; never replaced         |
| `shallowReactive`               | lists of registered things that hold components or functions         |
| `computed`                      | anything derived from other state                                    |

- Destructuring `reactive` loses reactivity. Use `toRefs`, or keep the object.
- `ref` unwraps in templates, not in `<script>`.

## computed

- A getter has no side effects: no writes, requests or DOM changes.
- Do not change what it returns. Copy first.
- Derived state is a `computed`, never a `ref` kept in sync by a `watch`.

## watch

- Use `watch` for reactions to the outside world: storage, requests, DOM APIs. If the result only feeds the template, it is a `computed`.
- Name the source: `watch(() => props.id, load)`. Prefer it to `watchEffect`, so dependencies stay visible.
- Async work: cancel old runs through the `onCleanup` argument, or results come back in the wrong order.
- `deep: true` walks the whole object. Avoid it on anything big.
- A watcher created inside an `await` or a timer is not stopped on unmount. Create watchers in setup, synchronously.

## Persisted settings

Settings remembered in the browser use `useLocalStorage` or `useStorage` from VueUse, with an `s3d…` key. `autosaveOn` in `src/engine/defaults.ts` is an example. Reading from them may fail, so code that touches storage directly catches errors.

## Cleanup

Anything started by hand must end: listeners, timers, observers, workers, object URLs. Prefer `useEventListener` and `useIntervalFn` from VueUse, which clean up by themselves. Otherwise clean up in `onBeforeUnmount`. Plugins register cleanup with `context.onDispose`.
