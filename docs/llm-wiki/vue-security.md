---
title: Vue security
sources: [https://vuejs.org/guide/best-practices/security.html, SECURITY.md, src/utils/safeHtml.ts, plugins/layout/src/safeSvg.ts, tools/requestGuard.ts]
updated: 2026-11-06
---

# Vue security

The threat model is in [SECURITY.md](../../SECURITY.md). In short: model files, language files and plugin catalogs come from strangers and must never run code. Plugins and scripts are code, and users choose to trust them.

## What counts as untrusted

Everything from outside: model files (names, `pluginData`, materials), language files, catalogs, imported files, URL parameters, AI answers, responses from servers.

## Output

- Text goes through `{{ }}`: Vue escapes it. This is the default; stay with it.
- **`v-html` only with safe input.** Translated text: `richText` from `src/utils/safeHtml.ts`. SVG from a file: `safeSvg` from `plugins/layout/src/safeSvg.ts`. Code display: `highlight`, which escapes.
- Building markup by hand (`innerHTML`, SVG strings): escape every value, also those that should be numbers. A model file can put a string anywhere. `plugins/openscad/src/panel.ts` shows `escapeHtml`.
- Never pass user content as a Vue template.

## Attributes

- `:href`, `:src` from data: only web addresses. `webUrl` from `src/utils/safeHtml.ts` blocks `javascript:`.
- `target="_blank"` with `rel="noopener"`.
- Do not bind `:style` or a whole attribute object from untrusted data.
- Images in model files must be stored in the file (`data:`). A remote address would tell that server who opened the model.

## Scripts and plugins

- `new Function` is for the script runner only, not for data.
- Scripts run in `src/scripting/scriptWorker.ts`, locked down. Do not widen what reaches them, and do not move them to the main thread without need.
- Install plugins only after asking the user.

## Dev server

- Every endpoint goes through `refusal` in `tools/requestGuard.ts`. A new endpoint without it is a hole.
- File access through a tool stays inside a fixed folder, as `exportTarget` in `src/plugins/builtin/remote/server/mcp.ts` does.

## Content Security Policy

The policy has no `unsafe-inline` for scripts: no inline event handlers and no inline scripts in built pages. It lives in three places that must match: `tools/contentSecurityPolicy.ts`, `tools/nginx-security.conf`, `src-tauri/tauri.conf.json`.

## Secrets

AI keys are in `localStorage`, readable by anything that runs in the app. Never put keys in URLs, logs or model files.
