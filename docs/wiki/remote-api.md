# Remote control: REST API, Swagger UI and MCP

While the dev server runs, other programs and AI agents can control the open editor – over a REST API (with an OpenAPI definition and Swagger UI) or as an MCP server, e.g. for Claude Code.

```bash
npm run dev
```

Then open the app in a browser (http://localhost:5173) and keep the tab open – the model lives in the browser. The dev server passes every request over its WebSocket to the tab that was active last; the built-in plugin **Remote-API** answers it there (it can be switched off in the plugin manager). A toast in the app shows when an external program starts controlling it. The **Remote-API** tile in the right-hand bar opens a panel with the connection status (which tab receives the requests, with _Use this tab_ when several are open), an activity log of every REST and MCP call with its parameters, result and duration, links to Swagger UI and the OpenAPI definition, the list of endpoints and MCP tools, and the MCP set-up (Claude Code command, `.mcp.json`, stdio) to copy.

| URL                                    | What                                          |
| -------------------------------------- | --------------------------------------------- |
| http://localhost:5173/api/docs         | Swagger UI – every endpoint with “Try it out” |
| http://localhost:5173/api/openapi.json | OpenAPI 3.1 definition                        |
| http://localhost:5173/api/…            | REST endpoints                                |
| http://localhost:5173/mcp              | MCP server (Streamable HTTP)                  |

The most common actions (units are metres, Z is up; lengths may also be strings like `"75cm"`):

| REST                                                   | MCP tool                                   |                                                                       |
| ------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `GET /api/status`                                      | `app_status`                               | is a tab connected?                                                   |
| `GET /api/scene`                                       | `get_scene`                                | name, units, bounds, objects, materials, tags, selection, undo state  |
| `GET /api/objects`, `GET /api/objects/{id}`            | `list_objects`, `get_object`               | groups and components with position and world bounds                  |
| `POST /api/objects`                                    | `create_object`                            | box, cylinder, sphere, cone, pyramid, prism, tube, torus, wedge, dome |
| `PATCH /api/objects/{id}`                              | `transform_object`                         | move, rotate, scale, rename, material, hide                           |
| `DELETE /api/objects/{id}`                             | `delete_object`                            |                                                                       |
| `GET/POST /api/materials`                              | `list_materials`, `create_material`        |                                                                       |
| `POST /api/script`, `GET /api/script/reference`        | `run_script`, `get_script_reference`       | run an `s3d` script (JavaScript or JSON)                              |
| `POST /api/undo`, `POST /api/redo`                     | `undo`, `redo`                             |                                                                       |
| `POST /api/model/clear`, `GET/PUT /api/model`          | `clear_model`                              | clear, save or load the `.shap3d.json` model                          |
| `GET /api/export/{glb\|gltf\|obj\|stl\|json}`          | `export_model`                             | the MCP tool writes the file (default `exports/`)                     |
| `GET /api/screenshot?width=&height=`                   | `screenshot`                               | PNG; the MCP tool returns it as an image                              |
| `GET/PUT /api/camera`, `POST /api/camera/zoom-extents` | `get_camera`, `set_camera`, `zoom_extents` | standard views, position/target, zoom extents                         |
| `GET /api/commands`, `POST /api/commands/{id}`         | `list_commands`, `run_command`             | every menu/palette command                                            |

Every change is a normal undo step in the app. A few examples:

```bash
curl -X POST http://localhost:5173/api/objects -H "content-type: application/json" -d "{\"shape\":\"box\",\"width\":2,\"depth\":1,\"height\":\"75cm\",\"material\":\"Holz hell\"}"
curl -X PATCH http://localhost:5173/api/objects/42 -H "content-type: application/json" -d "{\"move\":[0,2,0],\"rotate\":{\"degrees\":90}}"
curl -X POST http://localhost:5173/api/script -H "content-type: application/json" -d "{\"code\":\"s3d.torus([0,0,0.3], 1, 0.2)\"}"
curl -o model.glb http://localhost:5173/api/export/glb
```

**MCP in Claude Code:** the project brings a [`.mcp.json`](../../.mcp.json) that points to `http://localhost:5173/mcp` – start `npm run dev`, open the app, then start Claude Code in this folder and allow the server `shap3d` (or add it by hand with `claude mcp add --transport http shap3d http://localhost:5173/mcp`). For MCP clients that only speak stdio there is a small bridge that forwards to the same endpoint:

```json
{
  "mcpServers": {
    "shap3d": {
      "command": "node",
      "args": ["src/plugins/builtin/remote/server/mcpStdio.mjs"],
      "env": { "S3D_URL": "http://localhost:5173" }
    }
  }
}
```

Only requests from this computer are accepted: programs without a browser origin (curl, MCP clients) and pages on `localhost` – other websites cannot drive the app. The remote API exists only on the dev server (`npm run dev`), not in a production build. Everything lives in the built-in plugin [`src/plugins/builtin/remote/`](../../src/plugins/builtin/remote): the app side (handlers, connection, panel) and in [`server/`](../../src/plugins/builtin/remote/server) the dev-server side – a Vite plugin registered in `vite.config.ts` with the action list, OpenAPI, MCP and the WebSocket bridge. The server side runs in Node and has its own `tsconfig.json` (`npx tsc -p src/plugins/builtin/remote/server`).
