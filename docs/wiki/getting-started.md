# Getting started

Requirements: **Node.js 20.19+ or 22.12+** and a current Chromium, Firefox or Safari.

```bash
npm ci
npm run dev
```

`npm ci` installs exactly the versions in `package-lock.json` (checked against their hashes) and never changes the lock file – so nobody gets a newer, unreviewed dependency by accident. Use `npm install <package>` only when you deliberately add or update a dependency, and commit the changed lock file.

Open <http://localhost:5173>. The interface follows the browser language (English, German, French, Spanish or Arabic, switchable with 🌐 at the top). On the first start the welcome tour opens.

The 3D view needs WebGL. If the browser has turned it off (for example after a graphics driver crash), the app shows a short help page instead of the loading screen.

```bash
npm run build     # production build in dist/
npm run preview   # serve the build locally
```

Linting, formatting and the pre-commit hook are described under [Development](development.md#linting-and-formatting).

## With Docker

No Node.js needed – Docker (or Rancher/Podman Desktop) is enough:

```bash
docker compose up --build
```

Open <http://localhost:5173>. The container runs the dev server, so the [remote API](remote-api.md) works too: Swagger UI at <http://localhost:5173/api/docs>, MCP at `http://localhost:5173/mcp` (the project's `.mcp.json` works unchanged). Files the MCP tool `export_model` writes land in `./exports`. The port is published on this computer only (`127.0.0.1`).

|                                                                                    |                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `S3D_PORT=5174 docker compose up`                                                  | another port, e.g. while `npm run dev` already uses 5173 – then point MCP clients to that port (the Remote-API panel shows the right snippets) |
| `docker compose --profile static up --build static`                                | the production build behind nginx on <http://localhost:8080> – no remote API                                                                   |
| `docker build -t shap3d-ai .` / `docker run --rm -p 127.0.0.1:5173:5173 shap3d-ai` | the same without Compose (`--target static` for the nginx image)                                                                               |

The source is copied into the image – rebuild (`--build`) after changes. Two things do not run inside the container: the Blender and SketchUp converters (they need the programs on this computer), and an AI provider at `localhost` only works where the browser calls it directly; through the app's proxy use `http://host.docker.internal:11434` (Ollama) instead.

## Desktop app (Tauri)

Shap3D.ai also runs as a native desktop app built with [Tauri 2](https://tauri.app) – its own window and an executable, using the system's web view (WebView2 on Windows). Requirements besides Node.js: [Rust](https://rustup.rs) (via rustup) and, on Windows, the Visual Studio C++ build tools; macOS needs the Xcode command line tools, Linux the [webkit2gtk packages](https://tauri.app/start/prerequisites/).

```bash
npm run desktop:dev     # the app in its own window, with the dev server (and the remote API)
npm run desktop:build   # executable and installers
```

`desktop:dev` starts the dev server itself – stop a running `npm run dev` first (port 5173). `desktop:build` writes `src-tauri/target/release/shap3d-ai.exe` and the installers to `src-tauri/target/release/bundle/` (MSI and NSIS setup on Windows, `.dmg`/`.app` on macOS, `.deb`/`.rpm`/AppImage on Linux). The first build compiles the Rust dependencies and takes a few minutes. The version comes from `package.json`; the icons are generated from `public/favicon.svg` (`npx tauri icon public/favicon.svg`).

What the built app does not have, because it needs the dev server: the remote API (REST, Swagger UI, MCP), the AI proxy for providers without CORS and the Blender/SketchUp converters. A local AI server has to allow the app's origin – `http://tauri.localhost` on Windows, `tauri://localhost` on macOS and Linux (for Ollama e.g. `OLLAMA_ORIGINS`).

How releases are built and published is described under [Development](development.md#releases).
