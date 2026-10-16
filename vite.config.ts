import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { Readable } from 'node:stream';
import { convertBridge } from './tools/convertBridge';

/**
 * Dev-only proxy for AI providers that don't send CORS headers (e.g. LM Studio without CORS,
 * custom servers). The browser sends the real URL in "x-ai-target"; only same-origin requests
 * from the app itself are forwarded.
 */
function aiProxy(): Plugin {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      server.middlewares.use('/__ai_proxy', async (req, res) => {
        try {
          const target = String(req.headers['x-ai-target'] ?? '');
          const site = String(req.headers['sec-fetch-site'] ?? 'same-origin');
          if (!/^https?:\/\//i.test(target) || site !== 'same-origin') { res.statusCode = 400; res.end('invalid proxy request'); return; }
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v !== 'string') continue;
            if (['host', 'origin', 'referer', 'connection', 'content-length', 'x-ai-target', 'cookie'].includes(k) || k.startsWith('sec-')) continue;
            headers[k] = v;
          }
          const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
          const upstream = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks) });
          res.statusCode = upstream.status;
          upstream.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) res.setHeader(k, v); });
          if (upstream.body) Readable.fromWeb(upstream.body as any).pipe(res); else res.end();
        } catch (e) {
          res.statusCode = 502; res.end('proxy error: ' + (e as Error).message);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), aiProxy(), convertBridge()],
});
