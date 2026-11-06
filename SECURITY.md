# Security

## Reporting a vulnerability

Please do not open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/Chris2011/shap3d.ai/security/advisories/new) with what you did, what happened and which version. Fixes go into the next release; the changelog names them.

## What can be attacked

Shap3D.ai runs in the browser or as a desktop app, without an account. There is no server of ours. Everything below is about the machine it runs on.

| Part                                      | Exposure                                                                   | Protection                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Model files** (`.shap3d.json`)          | Anyone can hand you one. Opening one runs no code                          | Text goes into pages as text. LayOut sheets go through an SVG allow-list. Images must be stored in the file (no addresses elsewhere). Names cannot break out of generated code              |
| **Language files**                        | Anyone can hand you one                                                    | Only `<b> <i> <em> <strong> <kbd> <code> <br>` work in translated texts, without attributes                                                                                                |
| **Built app** (web, Tauri, Docker static) | Any page you open                                                          | Content Security Policy without inline scripts ([`tools/contentSecurityPolicy.ts`](tools/contentSecurityPolicy.ts)); with nginx also `frame-ancestors`, `nosniff` and `no-referrer`        |
| **Dev server** (`npm run dev`)            | Remote API (`/api`, `/mcp`), AI proxy (`/__ai_proxy`), converter (`/__convert`) | [`tools/requestGuard.ts`](tools/requestGuard.ts): the Host header must be this computer (no DNS rebinding), the connection too (or a token), browsers only from the app's own origin      |
| **MCP `export_model`**                    | Writes files on this computer                                              | Only below `exports/` (or `S3D_EXPORT_DIR`), with the format's file ending; no way out through `..` or links                                                                               |
| **Converter** (`.blend`, `.skp`)          | Opens uploaded files in programs                                           | Temporary folder, time and size limits, two at a time; Blender with `--disable-autoexec`                                                                                                   |
| **Plugin catalogs**                       | A catalog you add can name anything                                        | Links must be web addresses. Plugins from outside this repository ask before they install                                                                                                  |

The production build contains no remote API, no AI proxy on its own and no screenshot mode.

## What is code, and has full access

These are not bugs but what they are for. Treat them like programs you install:

- **Plugins** run in the app with full access: the model, stored settings, AI keys, the network. Only install plugins you trust. They are not signed.
- **Scripts** run in a worker without network, storage or anything else outside the model – unless they call an `s3d` function a plugin brought (`s3d.scad()`, for example). Those run on the main thread, with the same access as a plugin. Do not run scripts you do not understand.
- **AI scripts** are scripts. With _run automatically_ on, a model's answer runs right away, under the same rules. Switch it off for models you do not trust.
- **AI keys** are stored in the browser's `localStorage`, as plain text. Anything that runs in the app can read them.

## Running the dev server

Without settings, its endpoints only answer this computer. Do not expose it to a network: it is a development server.

| Setting                      | Effect                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S3D_REMOTE_TOKEN=…`         | Connections from elsewhere must send `Authorization: Bearer …`. Use a long random value, and HTTPS in front of it: the token travels in plain text    |
| `S3D_ALLOWED_HOSTS=a.b,c.d`  | Further host names, e.g. behind a reverse proxy                                                                                                      |
| `S3D_REMOTE_TRUST_NETWORK=1` | Accepts connections from anywhere when no token is set. Only for containers whose port is published on `127.0.0.1` – the Docker image sets it |
| `S3D_EXPORT_DIR=…`           | The folder `export_model` writes to (default `exports/`)                                                                                             |

With Docker, publish the port on `127.0.0.1` only (`compose.yaml` does) or set `S3D_REMOTE_TOKEN`: the image trusts its network, and the remote API can change the model and run scripts.
