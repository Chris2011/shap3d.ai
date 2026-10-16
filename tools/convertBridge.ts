/**
 * Local converter for 3D formats the browser cannot read itself (dev and preview server only).
 *
 *   GET  /__convert/status            → which converters are available on this computer
 *   POST /__convert?from=blend        → body: the .blend file, answer: a .glb (via Blender, running in the background)
 *   POST /__convert?from=skp          → body: the .skp file, answer: a .glb (via the official SketchUp SDK)
 *
 * Only same-origin requests from the app itself are accepted. Files go to a temporary folder that is removed afterwards.
 */
import type { Plugin, Connect } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 300 * 1024 * 1024;
const TIMEOUT_MS = 180_000;
const HERE = dirname(fileURLToPath(import.meta.url));

/** Blender: BLENDER_PATH, the usual install folders, or "blender" on the PATH. */
function findBlender(): string | null {
  const env = process.env.BLENDER_PATH; if (env && existsSync(env)) return env;
  const roots = [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Blender Foundation'), 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blender', '/Applications/Blender.app/Contents/MacOS', '/usr/bin', '/snap/bin'];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    const direct = [join(r, 'blender.exe'), join(r, 'blender'), join(r, 'Blender')].find(existsSync); if (direct) return direct;
    // "Blender Foundation\Blender 4.2\blender.exe" – newest version first
    try { for (const d of readdirSync(r).sort().reverse()) { const exe = join(r, d, 'blender.exe'); if (existsSync(exe)) return exe; } } catch { /* unreadable */ }
  }
  return null;
}

/** SketchUp SDK: SKETCHUP_SDK (folder that contains SketchUpAPI.dll somewhere below), or tools/sketchup-sdk in the project. */
function findSketchUpSdk(): string | null {
  const roots = [process.env.SKETCHUP_SDK, join(HERE, 'sketchup-sdk')].filter(Boolean) as string[];
  const search = (dir: string, depth: number): string | null => {
    try {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (/^SketchUpAPI\.(dll|dylib|framework)$/i.test(name)) return p;
        if (depth > 0 && statSync(p).isDirectory()) { const hit = search(p, depth - 1); if (hit) return hit; }
      }
    } catch { /* missing */ }
    return null;
  };
  for (const r of roots) { const hit = existsSync(r) ? search(r, 5) : null; if (hit) return hit; }
  return null;
}
const SKP_SCRIPT = join(HERE, 'skp', 'skp2glb.py');

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { env, windowsHide: true });
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { p.kill(); out += '\n[timeout]'; }, TIMEOUT_MS);
    p.on('error', e => { clearTimeout(t); resolve({ code: -1, out: String(e) }); });
    p.on('close', code => { clearTimeout(t); resolve({ code: code ?? -1, out }); });
  });
}

const send = (res: any, status: number, body: unknown, type = 'application/json') => {
  res.statusCode = status; res.setHeader('Content-Type', type);
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const handler: Connect.NextHandleFunction = async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const site = String(req.headers['sec-fetch-site'] ?? 'same-origin');
  if (site !== 'same-origin' && site !== 'none') return send(res, 403, { error: 'Nur Anfragen aus der App selbst.' });

  if (req.method === 'GET' && url.pathname === '/status') {
    const sdk = findSketchUpSdk();
    return send(res, 200, { blender: findBlender(), sketchupSdk: sdk, skpConverter: !!sdk && existsSync(SKP_SCRIPT) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST erwartet' });

  const from = url.searchParams.get('from');
  if (from !== 'blend' && from !== 'skp') return send(res, 400, { error: 'Unbekanntes Format' });

  // read the upload
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > MAX_BYTES) return send(res, 413, { error: 'Datei zu groß (max. 300 MB)' }); chunks.push(c as Buffer); }

  const dir = await mkdtemp(join(tmpdir(), 'shap3d-convert-'));
  const input = join(dir, `in.${from}`), output = join(dir, 'out.glb');
  try {
    await writeFile(input, Buffer.concat(chunks));
    let r: { code: number; out: string };
    if (from === 'blend') {
      const blender = findBlender();
      if (!blender) return send(res, 503, { error: 'Blender wurde nicht gefunden. Blender installieren (blender.org) oder BLENDER_PATH auf blender.exe setzen und den Dev-Server neu starten.' });
      const py = `import bpy; bpy.ops.export_scene.gltf(filepath=r"${output}", export_format="GLB", export_apply=True, export_yup=True)`;
      r = await run(blender, ['--background', '--factory-startup', input, '--python-expr', py]);
    } else {
      const sdk = findSketchUpSdk();
      if (!sdk) return send(res, 503, { error: 'Für .skp-Dateien wird das kostenlose SketchUp SDK von Trimble benötigt (developer.sketchup.com). Entpacken nach tools/sketchup-sdk oder SKETCHUP_SDK setzen und den Dev-Server neu starten.' });
      if (!existsSync(SKP_SCRIPT)) return send(res, 501, { error: 'Das SketchUp SDK ist da, der SKP-Konverter aber noch nicht eingerichtet.' });
      r = await run(process.env.PYTHON ?? 'python', [SKP_SCRIPT, input, output], { ...process.env, SKETCHUP_API: sdk });
    }
    if (r.code !== 0 || !existsSync(output)) return send(res, 422, { error: 'Konvertierung fehlgeschlagen', log: r.out.slice(-2000) });
    return send(res, 200, await readFile(output), 'model/gltf-binary');
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

export function convertBridge(): Plugin {
  return {
    name: 'convert-bridge',
    configureServer(server) { server.middlewares.use('/__convert', handler); },
    configurePreviewServer(server) { server.middlewares.use('/__convert', handler); },
  };
}
