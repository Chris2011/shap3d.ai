#!/usr/bin/env node
/**
 * Renders the screenshots of plugin packages, the only place that does. A package only lists them, in its package.json:
 *
 *   "screenshots": [{ "name": "shaders", "file": "demo.js", "command": "shaders.open", "camera": "6,-6,4", "target": "1,0,0" }]
 *
 * `name` is the picture (docs/<name>.png), `file` a demo script in the package's docs/. Every other field is a URL parameter
 * of the scene `script` in src/devShots.ts, and a list repeats it (`"step": ["search:chair", "wait:900"]`).
 * Start the dev server (npm run dev) and build the packages first, then from the repository root:
 *
 *   node scripts/screenshots.mjs [folder …] [--only name,name] [--url http://localhost:5173]
 *
 * Without a folder: all packages. `--only` keeps the shots whose name ends with one of the names. Pictures of the app
 * itself: screenshots.ps1 or screenshots.sh, which this script also calls for each shot.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginsFolder = join(here, '..', 'plugins');

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args.splice(index, 2)[1] : undefined;
};
const url = option('--url') ?? 'http://localhost:5173';
const only = option('--only')?.split(',');

const allFolders = readdirSync(pluginsFolder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const folders = args.length ? args : allFolders;
const shotsOf = (folder) => {
  try {
    return JSON.parse(readFileSync(join(pluginsFolder, folder, 'package.json'), 'utf8')).screenshots ?? [];
  } catch (error) {
    throw new Error(`plugins/${folder}: ${error.message}`, { cause: error });
  }
};

const queryOf = (folder, { name: _name, file, ...parameters }) => {
  const query = new URLSearchParams({ package: folder, file: `/plugins/${folder}/docs/${file}` });
  for (const [key, value] of Object.entries(parameters)) {
    for (const entry of [value].flat()) {
      query.append(key, entry);
    }
  }
  return query.toString();
};

for (const folder of folders) {
  for (const shot of shotsOf(folder).filter((entry) => !only || only.some((name) => entry.name.endsWith(name)))) {
    const query = queryOf(folder, shot);
    const [program, scriptArgs] =
      process.platform === 'win32'
        ? [
            'powershell',
            ['-File', join(here, 'screenshots.ps1'), '-Url', url, '-Shots', 'script', '-Name', shot.name, '-Out', 'docs', '-Query', query],
          ]
        : [
            'bash',
            [join(here, 'screenshots.sh'), '--url', url, '--shots', 'script', '--name', shot.name, '--out', 'docs', '--query', query],
          ];
    console.log(`plugins/${folder}/docs/${shot.name}.png`);
    const result = spawnSync(program, scriptArgs, { stdio: 'inherit', cwd: join(pluginsFolder, folder) });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
