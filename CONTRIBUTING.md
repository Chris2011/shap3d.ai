# Contributing to Shap3D.ai

Thanks for wanting to help. This page has the rules; the tools behind them (linting, the pre-commit hook, releases, the project structure, screenshots) are described in [Development](docs/wiki/development.md).

## Getting started

You need **Node.js 20.19+ or 22.12+**.

```bash
npm ci
npm run dev
```

`npm ci` installs exactly what `package-lock.json` says and also sets up the pre-commit hook. Docker and the desktop app are described in [Getting started](docs/wiki/getting-started.md).

## Where a change belongs

- **Core** (`src/`): modeling, the editor, the UI and the **plugin API**. Something more than one plugin needs goes into the core as a plugin API, not into a plugin.
- **Built-in plugins** (`src/plugins/builtin/`): ship with the app, use the same plugin API as everyone else.
- **Plugin packages** (`plugins/<name>/`): separate programs with their own `package.json`, version and license. They only use the plugin API ([`src/plugins/types.ts`](src/plugins/types.ts)), never the app's modules directly. If a plugin needs something the API cannot do, add it to the core API instead of working around it.
- **Libraries** (`packages/<name>/`): code plugins bundle at build time, e.g. [`packages/procgen`](packages/procgen/README.md). Pure functions, no editor, no Vue, with tests.
- Plugins never depend on each other at run time. Data they share goes through a data format (`context.data.formats`), several plugins delivered together through a bundle – see [Writing plugins](docs/wiki/plugins.md).

## Code style

oxlint and oxfmt enforce the formatting (`npm run lint:fix`, `npm run format`; the hook runs both on staged files). Beyond that:

- **Readable names** – `selection`, `instance`, `definition`, not `sel`, `inst`, `def` in new code.
- **Function expressions** – `const build = () => { … }` rather than `function build() { … }`.
- **Composables** for reusable stateful logic in Vue (`src/composables/use….ts`).
- **Vue components** are prefixed with `S3d` (`S3dTopBar.vue`) so they never collide with library components.
- Comments say _why_, in plain sentences, as densely as the surrounding code does.
- Units are **metres**, **Z is up**.

## Texts and languages

Every visible text is a message key (`t('tools.select')`), never a hard-coded string. English is the source:

- the app: [`src/i18n/en.json`](src/i18n/en.json), plus German, French, Spanish and Arabic in [`src/plugins/builtin/i18n/languages/`](src/plugins/builtin/i18n/languages/) – add new keys to all of them and run `node scripts/i18n.mjs template` for `template.json`;
- a plugin: its own `i18n/<code>.json` files.

`node scripts/i18n.mjs` (and `npm run i18n` in a plugin package) lists missing and unused keys. Details: [Languages and translations](docs/wiki/languages.md).

## Versions and changelogs

- **The app** has [CHANGELOG.md](CHANGELOG.md): new entries go under `## [Unreleased]`.
- **Every plugin** – built-in or package – has its own version and its own `CHANGELOG.md` in its folder. A change to a plugin raises **that plugin's** version and goes into **its** changelog, not into the app's. New features raise the minor version, fixes and a few translated texts the patch version.
- Several changes before a release share one version: if the plugin's version is not released yet, add to it instead of raising it again.
- Releases happen automatically when `version` in `package.json` changes on `main` – see [Releases](docs/wiki/development.md#releases).

## Checks before a pull request

In the repository root:

```bash
npm run lint
npm run format:check
npx vue-tsc --noEmit -p tsconfig.json
npm run build
node scripts/i18n.mjs
```

CI runs the first four on every push. For a plugin package or a library, run its own scripts in its folder (`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`, and `npm test` where there are tests) – CI runs them too: the tests and checks of `packages/procgen`, and for every package in `plugins/` its type, lint, format and text checks and its build.

For changes you can see, check them in the running app (`npm run dev`). If screenshots in a README show what you changed, regenerate them ([Regenerating the screenshots](docs/wiki/development.md#regenerating-the-screenshots)).

## Commits and pull requests

- Short commit subjects in English, in the imperative: _Add …_, _Fix …_, _Move …_. A body with bullet points for larger commits.
- One topic per commit. Split app, plugin and documentation changes when they stand on their own – and commit a core API before the plugin that uses it.
- Pull requests target `main`. Describe what changed and how you checked it.

## License

Shap3D.ai is licensed under the [Apache License 2.0](LICENSE). By contributing you agree that your contribution is licensed under it too. Plugin packages may have their own license (e.g. OpenSCAD is GPL) – it is stated in their folder.
