---
title: Project conventions
sources: [CONTRIBUTING.md, docs/wiki/development.md, .oxlintrc.json, tsconfig.json]
updated: 2026-11-06
---

# Project conventions

The full rules are in [CONTRIBUTING.md](../../CONTRIBUTING.md). These are the ones agents get wrong most often.

## Where a change belongs

- **Kernel and engine** (`src/core/`, `src/engine/`): modelling and the view. `src/core/` does not import Vue. Only `src/core/textures.ts` touches the DOM.
- **UI** (`src/components/`): the `S3d…` components. Shared building blocks are in `src/components/ui/`.
- **Plugin packages** (`plugins/<name>/`): only use the plugin API in `src/plugins/types.ts`, never app modules. If the API cannot do something, extend the API.
- **Libraries** (`packages/<name>/`): pure functions with tests, no editor and no Vue.
- **LayOut** (`plugins/layout/`): only through the plugin API. Do not change `src/` for it.
- **Screenshots of a package**: the pictures and demos stay in its `docs/`, the list under `screenshots` in its `package.json`. The only script is `scripts/screenshots.mjs`, part of the app: a package has no screenshot script of its own. What it cannot do yet goes into that script or `src/devShots.ts`.

## Code

- Readable names: `selection`, `instance`, `definition`. Only `i`, `j`, `x`, `y`, `z` may be single letters.
- Function expressions: `const build = () => { … }`.
- Vue components start with `S3d`.
- Comments say why, in plain sentences.
- Units are metres, Z is up.
- `tsconfig.json` targets ES2021: no `Array.prototype.at`, `Object.hasOwn` or `toSorted`.

## Texts

Every visible text is a message key: `t('tools.select')`. New core keys go into `src/i18n/en.json` and all of `src/plugins/builtin/i18n/languages/`, then run `node scripts/i18n.mjs template`. Plugins have their own `i18n/` folder.

## Versions and changelogs

- A core change goes under `## [Unreleased]` in `CHANGELOG.md`.
- A plugin change goes into that plugin's `CHANGELOG.md`, never the core's. Raise its version, unless that version is not released yet: then add to it.

## Commits

Agents do not commit and do not offer to. The owner commits.

## Checks

```bash
npm run lint
npm run format:check
npx vue-tsc --noEmit -p tsconfig.json
npm run build
node scripts/i18n.mjs
```

Plugin packages run their own `npm run typecheck`, `lint`, `format:check`, `i18n` and `build`. Check visible changes in the running app.
