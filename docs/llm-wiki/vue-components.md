---
title: Vue components
sources: [https://vuejs.org/style-guide/, https://vuejs.org/guide/components/v-model.html, src/components/ui/S3dToggleSwitch.vue]
updated: 2026-11-06
---

# Vue components

Vue 3.5 with `<script setup lang="ts">`. No Pinia and no router: this app does not need them. Do not add them.

## Structure

- File order: `<template>`, then `<script setup lang="ts">`. Name files `S3d<Thing>.vue`, multi-word.
- Check `src/components/ui/` before building a button, switch, dialog or progress bar.
- Split a component when it has two jobs, not because it is long. Move logic out into a composable first. Long components such as `src/components/S3dWelcomeTour.vue` are no model to copy.
- No logic in templates beyond one simple expression. Name it with a `computed`.

## Props and events

- Type props with `defineProps<{ … }>()` and events with `defineEmits<{ … }>()`.
- Props go down, events go up. Never change a prop: emit, or copy into local state on purpose.
- Keep props minimal. Pass what the component shows, not a whole object it could dig through.
- `v-model` in this repository is written out: `modelValue` plus `update:modelValue`, as in `src/components/ui/S3dToggleSwitch.vue`. `defineModel` is available, but nothing here uses it yet. Match the file you are in.
- Boolean props read as adjectives: `small`, `readonly`.

## Sharing the editor

- Components get the editor with `useEditor()` from `src/components/keys.ts`, based on `provide`/`inject` with a typed `InjectionKey`.
- Do not pass it through props, and do not import a global instance.
- Use `provide`/`inject` for what a whole tree needs. For one level, use props.

## Templates

- `v-for` always has a stable `:key` from the data, never the index if items can move.
- No `v-if` on the same element as `v-for`: filter in a `computed`. See `shownPlugins` in `src/components/panels/S3dPluginManager.vue`.
- `v-if` for what rarely changes, `v-show` for what toggles often.
- Style with Tailwind classes and the shared `s3d-…` classes. Colours come from the theme, not from hard-coded values, so night mode keeps working.

## Template refs

Use `useTemplateRef('name')` in new code. Older components use `shallowRef` with `ref="name"`; both work, so match the file.

## Text and direction

- All text through `t()`, also `title` and `aria-label`.
- Arabic is right to left: use logical classes (`ms-`, `ps-`, `text-end`), not `ml-`, `pl-`, `text-right`.

## Accessibility

- Something clickable is a `<button>` or `<a>`, not a `<div>`. Give a button that only shows an icon an `aria-label`.
- Inputs have a label or `aria-label`. A switch has `role="switch"` and `aria-checked`, as `src/components/ui/S3dToggleSwitch.vue` does.
- Everything must work by keyboard. Do not take away the focus outline.

## Plugin UI

Plugin panels are components or `mount(element)` functions registered with `context.panels.register`. They get Vue from `context.vue`, not from their own copy. Plugin text inserted with `innerHTML` is escaped first: [Vue security](vue-security.md).

## Do not

- Do not touch the DOM directly when a binding can do it.
- Do not use `$parent` or `$refs` to reach into another component.
- Do not use `defineExpose` unless a parent really must call in. `focusVcb` on the status bar is that kind of case.
