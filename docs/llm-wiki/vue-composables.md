---
title: Vue composables
sources: [https://vuejs.org/guide/reusability/composables.html, src/composables/usePopover.ts, src/composables/useModel.ts]
updated: 2026-11-06
---

# Vue composables

A composable is a function `use…` that uses Vue's reactivity or lifecycle. They live in `src/composables/`.

## Which tool

1. VueUse already has it (`@vueuse/core`, installed): use that.
2. No reactive state and no lifecycle: a plain function in `src/utils/`, not a composable.
3. Stateful logic used in two or more places, or a component with two jobs: a composable.
4. Used once and short: leave it in the component.

## Rules

- Name it `useThing`, as a `const`: `export const usePopover = (…) => { … }`.
- Return a plain object of refs and functions, so callers can destructure: `const { open, toggle } = usePopover(target)`. Not `reactive`.
- Do one thing. `src/composables/usePopover.ts` is the size to aim for.
- Accept `MaybeRefOrGetter` when the input can change, and read it with `toValue`.
- Call it synchronously at the top of `setup`: lifecycle hooks and `inject` need the active component. Never inside `await`, a click handler or a timer.
- A composable cleans up what it starts, in `onScopeDispose` or through VueUse helpers.

## State: per call or shared

- State declared **inside** the function exists per caller.
- State declared **at module level** is shared by the whole app, as `openPanel` in `src/components/panelState.ts`. Do that on purpose, and say so in a comment.

Shared module state replaces a store here. Keep each piece small and near what uses it.

## Example

```ts
export const usePopover = (target: MaybeRefOrGetter<HTMLElement | null | undefined>) => {
  const open = ref(false);
  const close = () => {
    open.value = false;
  };
  const toggle = () => {
    open.value = !open.value;
  };
  onClickOutside(target, close);
  return { open, toggle, close };
};
```

## Do not

- Do not hide `watch` calls that change global state in a composable with an innocent name.
- Do not add options nobody passes.
- Do not wrap a single VueUse call in a composable of your own.
