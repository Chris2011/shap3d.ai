/**
 * Remote API for the running app (dev server only) – lets other programs and AI agents control the editor in the browser.
 *
 *   /api/...          REST endpoints (see actions.ts)
 *   /api/openapi.json OpenAPI 3.1 definition
 *   /api/docs         Swagger UI to read and try the API
 *   /mcp              MCP server (Streamable HTTP); src/plugins/builtin/remote/server/mcpStdio.mjs for stdio clients
 *
 * The model lives in the browser, so every request goes over Vite's WebSocket to the open tab (see bridge.ts)
 * and is answered there by this plugin (../handlers.ts). Only requests from this computer's own pages or
 * from programs (no browser origin) are accepted – other websites cannot drive the app.
 */
import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize } from 'node:path';
import { ACTIONS, inputProperties, pathParameters, usesQuery, type JsonSchema, type RemoteAction } from './actions';
import { buildOpenApi } from './openapi';
import { createBridge, RemoteError } from './bridge';
import { createMcp } from './mcp';

const MAX_BODY_BYTES = 200 * 1024 * 1024;
const SWAGGER_DIR = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body, null, 2));
};

/** browsers mark cross-site requests – those (and foreign origins) are refused; curl, scripts and MCP clients send neither */
const isTrusted = (req: IncomingMessage) => {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    return false;
  }
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    const host = new URL(origin).hostname;
    return LOCAL_HOSTS.includes(host) || host.endsWith('.localhost');
  } catch {
    return false;
  }
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new RemoteError(413, 'Request too large');
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new RemoteError(400, 'The body is not valid JSON');
  }
};

/** query/path strings → the types the schema asks for */
const coerce = (value: string, schema: JsonSchema | undefined) => {
  const type = schema?.type;
  if (type === 'integer' || type === 'number') {
    const number = Number(value);
    if (Number.isNaN(number)) {
      throw new RemoteError(400, `Not a number: ${value}`);
    }
    return number;
  }
  if (type === 'boolean') {
    return value === 'true' || value === '1' || value === '';
  }
  return value;
};

const routes = ACTIONS.map((action) => ({
  action,
  pattern: new RegExp('^' + action.path.replace(/\{(\w+)\}/g, '([^/]+)') + '/?$'),
  names: pathParameters(action),
}));

const findRoute = (method: string, pathname: string) => {
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (match && route.action.method === method) {
      return { action: route.action, values: match.slice(1).map(decodeURIComponent), names: route.names };
    }
  }
  return routes.some((route) => route.pattern.test(pathname)) ? 'method' : null;
};

const collectInput = async (req: IncomingMessage, url: URL, action: RemoteAction, names: string[], values: string[]) => {
  const properties = inputProperties(action);
  const input: Record<string, unknown> = {};
  if (usesQuery(action)) {
    for (const [key, value] of url.searchParams) {
      input[key] = coerce(value, properties[key]);
    }
  } else {
    const body = await readBody(req);
    if (body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
      throw new RemoteError(400, 'The body must be a JSON object');
    }
    Object.assign(input, body);
  }
  names.forEach((name, index) => {
    input[name] = coerce(values[index], properties[name]);
  });
  for (const name of (action.input?.required as string[] | undefined) ?? []) {
    if (input[name] === undefined) {
      throw new RemoteError(400, `Missing parameter: ${name}`);
    }
  }
  return input;
};

const swaggerPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shap3D.ai Remote API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"><link rel="icon" href="/favicon.svg">
<style>body{margin:0} .topbar{display:none}</style></head>
<body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true, tryItOutEnabled: true, displayRequestDuration: true, defaultModelsExpandDepth: 0 });</script>
</body></html>`;

const serveSwaggerFile = (res: ServerResponse, name: string) => {
  const file = normalize(join(SWAGGER_DIR, name));
  if (!file.startsWith(SWAGGER_DIR) || !existsSync(file)) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  createReadStream(file).pipe(res);
};

export function remoteApi(): Plugin {
  return {
    name: 'remote-api',
    apply: 'serve',
    configureServer(server) {
      const bridge = createBridge(server);
      const mcp = createMcp(bridge, server.config.root);

      const handleApi = async (req: Connect.IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', 'http://local');
        const method = req.method ?? 'GET';
        if (!isTrusted(req)) {
          return sendJson(res, 403, { error: 'Only requests from this computer (no other websites).' });
        }
        if (url.pathname === '/' || url.pathname === '') {
          res.statusCode = 302;
          res.setHeader('Location', '/api/docs');
          return res.end();
        }
        if (url.pathname === '/docs' || url.pathname === '/docs/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(swaggerPage);
        }
        if (url.pathname.startsWith('/docs/')) {
          return serveSwaggerFile(res, url.pathname.slice('/docs/'.length));
        }
        if (url.pathname === '/openapi.json') {
          return sendJson(res, 200, buildOpenApi(`http://${req.headers.host ?? 'localhost:5173'}`));
        }

        const route = findRoute(method, url.pathname);
        if (route === 'method') {
          return sendJson(res, 405, { error: `${method} is not supported here` });
        }
        if (!route) {
          return sendJson(res, 404, { error: `Unknown endpoint: ${url.pathname} – see /api/docs` });
        }
        try {
          const input = await collectInput(req, url, route.action, route.names, route.values);
          if (route.action.local) {
            return sendJson(res, 200, bridge.status());
          }
          const answer = await bridge.call(route.action.id, input, 'rest');
          if (!answer.ok) {
            return sendJson(res, answer.status ?? 400, { error: answer.error ?? 'Failed' });
          }
          if (answer.file) {
            const bytes = Buffer.from(answer.file.base64, 'base64');
            res.statusCode = 200;
            res.setHeader('Content-Type', answer.file.mimeType);
            res.setHeader('Content-Length', bytes.length);
            res.setHeader(
              'Content-Disposition',
              `${answer.file.mimeType === 'image/png' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(answer.file.name)}"`,
            );
            return res.end(bytes);
          }
          return sendJson(res, 200, answer.result ?? { ok: true });
        } catch (error) {
          return sendJson(res, error instanceof RemoteError ? error.status : 500, { error: (error as Error).message });
        }
      };

      const handleMcp = async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (!isTrusted(req)) {
          return sendJson(res, 403, { error: 'Only requests from this computer (no other websites).' });
        }
        // no server-sent event stream and no sessions: GET/DELETE are not offered
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return sendJson(res, 405, { error: 'POST JSON-RPC messages to /mcp' });
        }
        try {
          const body = await readBody(req);
          const messages = Array.isArray(body) ? body : [body];
          const answers = (await Promise.all(messages.map((message) => mcp.handle(message)))).filter(Boolean);
          if (!answers.length) {
            res.statusCode = 202;
            return res.end();
          }
          return sendJson(res, 200, Array.isArray(body) ? answers : answers[0]);
        } catch (error) {
          return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: (error as Error).message } });
        }
      };

      // Connect does not wait for promises – unexpected errors go to next() instead of getting lost
      server.middlewares.use('/api', (req, res, next) => {
        handleApi(req, res).catch(next);
      });
      server.middlewares.use('/mcp', (req, res, next) => {
        handleMcp(req, res).catch(next);
      });
    },
  };
}
