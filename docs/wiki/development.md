# Development

## Linting and formatting

Linting and formatting use [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) from the Oxc project. They cover the app – `src/` and `scripts/`; plugin packages in `plugins/` lint and format themselves (see below). The settings are in `.oxlintrc.json` and `.oxfmtrc.json`: every `if`/`else`/loop body gets braces and its own lines, with 2-space indent, single quotes, semicolons and a print width of 140.

```bash
npm run lint           # report lint problems
npm run lint:fix       # fix what oxlint can fix automatically
npm run format         # format all files in place
npm run format:check   # only report files that are not formatted
```

Run `lint:fix` before `format`: the fix adds the missing braces, and the formatter then puts the bodies on their own lines. For VS Code, the recommended Oxc extension is listed in `.vscode/extensions.json`.

A **pre-commit hook** does this for you: `npm install` sets it up ([husky](https://typicode.github.io/husky/), `.husky/pre-commit`), and on every commit [lint-staged](https://github.com/lint-staged/lint-staged) runs `oxlint --fix` and then `oxfmt` on the staged files in those folders (JSON, CSS and Markdown are only formatted). The fixes go into the commit; if oxlint still finds an error it cannot fix, the commit stops and shows it. Only the staged parts of a file are checked – changes you have not staged stay as they are. In an emergency, `git commit --no-verify` skips the hook.

Plugin packages (`plugins/<name>/`) are not part of the app, so the app's scripts and its lint-staged configuration leave them alone. Each package has the same scripts in its own `package.json` (`npm run lint`, `lint:fix`, `format`, `format:check` in its folder) and its own `lint-staged` configuration, which the hook uses for staged files in that package – lint-staged always takes the configuration closest to a file. The rules come from the `.oxlintrc.json` and `.oxfmtrc.json` in the repository root, which oxlint and oxfmt find from the package folder.

## Releases

Releases run by themselves – no tag by hand. The [release workflow](../../.github/workflows/release.yml) runs on every push to `main` and releases the version in `package.json` as soon as there is no release (tag `v<version>`) for it yet:

1. Raise `version` in `package.json` (`npm version 0.9.0 --no-git-tag-version` also updates the lock file) and turn `## [Unreleased]` in [CHANGELOG.md](../../CHANGELOG.md) into `## [0.9.0] – <date>`; commit both.
2. Push to `main`. Several commits may belong to one version – the release starts with the push that brings the new version, later pushes without a new version change nothing.

The workflow then

- checks whether `v<version>` exists already – if so, the run ends right there,
- takes the release notes from the `CHANGELOG.md` section for this version – without one it stops before anything is built,
- runs `npm run lint` and `npm run format:check`, builds the web app and creates a **draft** release with that changelog section as its text and the web build as `shap3d-ai_<version>_web.zip`,
- builds the desktop installers with Tauri and adds them to the draft: MSI and NSIS setup (Windows), a universal `.dmg` for Apple silicon and Intel (macOS), `.deb`, `.rpm` and AppImage (Linux),
- pushes two Docker images to the GitHub Container Registry: `ghcr.io/chris2011/shap3d.ai:<version>` / `:latest` (dev server with the remote API) and `:<version>-static` / `:static` (production build behind nginx), each for amd64 and arm64,
- publishes the release only when all of this has worked – publishing creates the tag `v<version>` on the pushed commit. If a job fails, the draft stays: fix the cause and push again (or use _Re-run failed jobs_ / _Run workflow_); the run reuses the draft and moves it to the new commit. A newer push to `main` while a release is still building replaces that run.

A version with a suffix such as `0.9.0-rc.1` in `package.json` becomes a pre-release: it does not get the `latest`/`static` image tags and is not marked as the latest release. The installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper warn on first start (macOS: right-click → _Open_). Plugin versions are not part of the release – they live in the plugin changelogs.

## Project structure

```
src/
  core/        geometry kernel (entities, faces, push/pull, CSG), materials, mesh operations
  engine/      editor state, undo, three.js viewer, camera, inference, commands
  tools/       interactive tools (draw, modify, select, construct, terrain)
  scripting/   s3d API, API catalog, examples, OBJ import, resolution changes
  plugins/     plugin system – the plugin API (types), context, loader/registry, example plugins;
               builtin/ holds the plugins that ship with the app (AI assistant with providers, prompts,
               agent, chat history and Hugging Face search; terrain sandbox; 3D text with its fonts; import formats;
               languages – German, French, Spanish, Arabic – and the translation editor; the remote API with
               REST, Swagger UI and MCP, its dev-server half in remote/server)
  i18n/        the i18n core – t(), message and language registry, number/unit formatting, English source texts (en.json)
  components/  Vue UI – toolbars, panels, dialogs, command palette, welcome tour
               (every component is prefixed with S3d, e.g. S3dTopBar.vue, so it never collides with library components)
  components/ui/  small reusable building blocks – S3dModalDialog, S3dToggleSwitch, S3dSegmentedControl, S3dProgressBar, S3dCloseButton
  composables/ reusable stateful logic – useModel/useSelection, usePopover, useScripts (built on VueUse)
  utils/       pure helper functions – e.g. material swatches
  styles.css   Tailwind CSS setup – design tokens for light and dark mode, shared UI classes
docs/          logo, README screenshots and this wiki (docs/wiki/)
plugins/       stand-alone plugin packages with their own package.json – openscad/, ifc/, layout/, roomplanner/, shaders/, noise/, level/ (not part of the app build)
packages/      libraries that plugins bundle at build time – procgen/ (procedural generation, with Vitest tests; not part of the app build)
scripts/       screenshot automation (headless Chrome: screenshots.ps1 for Windows, screenshots.sh for Linux/macOS, capture-shot.mjs for both), i18n.mjs (translation check and template)
tools/         dev-server helper convertBridge.ts (Blender/SketchUp import)
src-tauri/      the desktop app (Tauri 2): Rust shell, tauri.conf.json, app icons
Dockerfile, compose.yaml   container for trying it out – the dev server with the remote API, or the nginx build
```

## Regenerating the screenshots

The images in `docs/screenshots` are rendered from demo scenes (`src/devShots.ts`: `hero`, `night`, `scripts`, `terrain`, `mesh`, `measure`, `palette`, `tour`, `convert`, `plugins`, `text3d`, `translations`) with headless Chrome or Edge at 1600 × 900. Each scene can also be opened by hand, e.g. <http://localhost:5173/?shot=palette>.

```bash
npm run dev
powershell -File scripts/screenshots.ps1   # Windows
bash scripts/screenshots.sh                # Linux, macOS (and Git Bash)
```

Single scenes: `powershell -File scripts/screenshots.ps1 -Shots "palette,tour"` or `bash scripts/screenshots.sh --shots "palette,tour"`. Both scripts take the same options (`-Query`/`--query`, `-Out`/`--out`, `-Name`/`--name`, `-Url`/`--url`, `-Width`/`--width`, `-Height`/`--height`). The bash script finds Chrome, Chromium or Edge on the `PATH` (or `CHROME=/path/to/chrome`). Scenes that have to wait until they are ready are photographed over the DevTools protocol by `scripts/capture-shot.mjs` (Node.js 22) – the bash script uses it for every scene, the PowerShell script for the slow ones and for scenes that install a package.

The scenes know no plugin packages. `-Query "package=<folder>"` (URL parameter `&package=<folder>`, several separated by commas) installs a built package from `plugins/<folder>/dist` before the scene – its `dist/package.json` lists its files. The README's `convert` and `plugins` images show the OpenSCAD package that way: build it (`npm run build` in `plugins/openscad`), then `powershell -File scripts/screenshots.ps1 -Shots "convert,plugins" -Query "package=openscad"` (or `bash scripts/screenshots.sh --shots "convert,plugins" --query "package=openscad"`). The scene `script` (`&language=<id>&file=<path>`, optionally `&camera=x,y,z&target=x,y,z`) runs a file in the script editor, and `&command=<id>` (several separated by commas) runs commands after the scene; plugin packages use them for their own screenshots (`npm run screenshots` – or `npm run screenshots:sh` on Linux and macOS – in `plugins/openscad` writes `plugins/openscad/docs/openscad.png`, in `plugins/layout` `plugins/layout/docs/layout.png` and `layout-plan.png`, in `plugins/roomplanner` `plugins/roomplanner/docs/roomplanner.png`, `roomplanner-maisonette.png` and `roomplanner-house.png`, in `plugins/shaders` `plugins/shaders/docs/shaders.png`).
