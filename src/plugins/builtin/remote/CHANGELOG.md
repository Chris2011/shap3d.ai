# Changelog – Remote API

## [Unreleased]

Nothing yet.

## [1.0.0] – 2026-10-22 · Shap3D.ai 0.7.0

### Added

- **REST API** under `/api` for the most common actions: scene and objects, creating solids, moving/rotating/scaling, materials, running `s3d` scripts, undo/redo, camera and standard views, menu commands, export (GLB, glTF, OBJ, STL, JSON) and screenshots.
- **OpenAPI 3.1** at `/api/openapi.json` and **Swagger UI** at `/api/docs`.
- **MCP server** at `/mcp` (Streamable HTTP) with 21 tools, and `server/mcpStdio.mjs` for stdio clients.
- **Panel** *Remote-API*: which tab receives the requests (*Use this tab*), an activity log of every REST and MCP call, links to the documentation and the MCP set-up to copy.
- Requests go over the dev server's WebSocket to the tab that was active last; the plugin exists only on the dev server (`npm run dev`), not in a production build.

### Security

- Only requests from this computer are accepted: programs without a browser origin and pages on `localhost`; cross-site requests are refused.
