# Changelog – Remote API

## [1.0.1] – Unreleased

### Changed

- No tile in the right-hand bar: the panel opens from the _Plugins_ menu or the command palette.

### Security

- REST, MCP, AI proxy and converter check the Host header (DNS rebinding) and the connection: from elsewhere only with the token `S3D_REMOTE_TOKEN`. Browsers only from the app's own origin – not from another port of this computer.
- `export_model` writes only below `exports/` (or `S3D_EXPORT_DIR`), with the format's file ending and not through links.
- At most 64 messages in one MCP batch; `nosniff` and `no-store` on answers, Swagger UI not in frames.

## [1.0.0] – 2026-10-22 · Shap3D.ai 0.7.0

### Added

- **REST API** under `/api` for the most common actions: scene and objects, creating solids, moving/rotating/scaling, materials, running `s3d` scripts, undo/redo, camera and standard views, menu commands, export (GLB, glTF, OBJ, STL, JSON) and screenshots.
- **OpenAPI 3.1** at `/api/openapi.json` and **Swagger UI** at `/api/docs`.
- **MCP server** at `/mcp` (Streamable HTTP) with 21 tools, and `server/mcpStdio.mjs` for stdio clients.
- **Panel** _Remote-API_: which tab receives the requests (_Use this tab_), an activity log of every REST and MCP call, links to the documentation and the MCP set-up to copy.
- Requests go over the dev server's WebSocket to the tab that was active last; the plugin exists only on the dev server (`npm run dev`), not in a production build.

### Security

- Only requests from this computer are accepted: programs without a browser origin and pages on `localhost`; cross-site requests are refused.
