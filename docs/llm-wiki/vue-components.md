---
title: Vue components
sources: [https://vuejs.org/style-guide/, https://vuejs.org/guide/components/v-model.html, src/components/ui/S3dToggleSwitch.vue, src/components/panels/S3dMaterials.vue]
updated: 2026-11-08
---

# Vue components

Vue 3.5 with `<script setup lang="ts">`. No Pinia and no router: this app does not need them. Do not add them.

Why no Pinia: the model is `markRaw` on purpose and lives outside Vue (engine, tools, commands), with `editor.ui` as its one reactive part. A store would either make the model reactive (slow) or hold it raw (no gain). The UI's shared state is small and independent: module refs such as `src/components/panelState.ts`, and panel state shared through `provide`/`inject` ([Vue composables](vue-composables.md)). Plugins would need Pinia passed through `context.vue` too. Revisit only when many shared states depend on each other.

## Structure

- File order: `<template>`, then `<script setup lang="ts">`. Name files `S3d<Thing>.vue`, multi-word.
- Use the component library in `src/components/ui/` instead of writing the `s3d-…` classes by hand: `S3dButton` (`primary`, `small`), `S3dIconButton` (needs `label`), `S3dSectionTitle`, `S3dFieldRow` (label + controls), `S3dCheckbox`, `S3dRadio`, `S3dTextInput` (`v-model` per key, `@commit` on Enter/blur), `S3dSelect`, `S3dRangeSlider`, `S3dColorPicker` (`wide`), `S3dMenuItem` (icon, ✓ column, shortcut, submenu slot) with `S3dMenuSeparator`, `S3dStatusMessage`, `S3dToggleSwitch`, `S3dSegmentedControl`, `S3dModalDialog`, `S3dCloseButton`, `S3dProgressBar`. Attributes such as `title`, `disabled` and `class` fall through to the native element. A pattern used in three places becomes a library component.
- One job per component. Split by jobs, not by lines: `src/components/panels/S3dMaterials.vue` only puts together its parts (picker, basics, surface, PBR, texture layout, shader parameters, create). The panel file reads like a table of contents.
- A list item with its own actions is its own component (`src/components/panels/pluginManager/S3dInstalledPluginCard.vue`).
- The same holds for the built-in plugins in `src/plugins/builtin/`: their parts go into a folder next to the panel (`ai/chat/`, `ai/wizard/`, `ai/search/`, `i18n/editor/`, `terrain/panel/`).
- A floating window that is dragged by its title bar uses `useFloatingWindow` from `src/composables/useFloatingWindow.ts`.
- No logic in templates beyond one simple expression. Name it with a `computed`.

## Props and events

- Type props with `defineProps<{ … }>()` and events with `defineEmits<{ … }>()`.
- Props go down, events go up. Never change a prop: emit, or copy into local state on purpose.
- Keep props minimal. Pass what the component shows, not a whole object it could dig through.
- `v-model` in this repository is written out: `modelValue` plus `update:modelValue`, as in `src/components/ui/S3dToggleSwitch.vue`. `defineModel` is available, but nothing here uses it yet. Match the file you are in.
- A field that writes into the model commits on `change`, not on every key (`@commit` of `S3dTextInput`), so typing is one undo step. Sliders and colour wells update live without undo (`src/composables/useLiveEdit.ts`).
- Boolean props read as adjectives: `small`, `readonly`.

## Sharing the editor

- Components get the editor with `useEditor()` from `src/components/keys.ts`, based on `provide`/`inject` with a typed `InjectionKey`.
- Do not pass it through props, and do not import a global instance.
- Use `provide`/`inject` for what a whole tree needs. For one level, use props.

## Templates

- `v-for` always has a stable `:key` from the data, never the index if items can move.
- No `v-if` on the same element as `v-for`: filter in a `computed`. See `shown` in `src/components/panels/pluginManager/S3dInstalledPlugins.vue`.
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
