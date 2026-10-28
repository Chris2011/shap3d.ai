#!/usr/bin/env node
/**
 * Renders the README screenshots of the noise plugin – one per feature – with the app's screenshot script
 * (scripts/screenshots.ps1 on Windows, scripts/screenshots.sh elsewhere). Start the dev server first (npm run dev in
 * the repository root) and build the package (npm run build), then from plugins/noise:
 *
 *   node docs/screenshots.mjs [--url http://localhost:5173] [--only stones,deform]
 */
import { spawnSync } from 'node:child_process';

const SHOTS = [
  { name: 'noise', file: 'demo.js', command: 'noise.open', camera: '58,-62,44', target: '36,30,2' },
  { name: 'noise-scatter', file: 'demo-scatter.js', command: 'noise.scatter', camera: '24,-30,30', target: '24,10,0' },
  { name: 'noise-stones', file: 'demo-paving.js', command: 'noise.paving', camera: '9,-12,8', target: '8.5,2.5,0.5' },
  { name: 'noise-deform', file: 'demo-deform.js', command: 'noise.deform', camera: '8,-17,9', target: '8.5,0.5,1.8' },
];

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const url = option('--url') ?? 'http://localhost:5173';
const only = option('--only')?.split(',');

for (const shot of SHOTS.filter((entry) => !only || only.some((name) => entry.name.endsWith(name)))) {
  const query = `package=noise&file=/plugins/noise/docs/${shot.file}&command=${shot.command}&camera=${shot.camera}&target=${shot.target}`;
  const [program, scriptArgs] =
    process.platform === 'win32'
      ? ['powershell', ['-File', '../../scripts/screenshots.ps1', '-Url', url, '-Shots', 'script', '-Name', shot.name, '-Out', 'docs', '-Query', query]]
      : ['bash', ['../../scripts/screenshots.sh', '--url', url, '--shots', 'script', '--name', shot.name, '--out', 'docs', '--query', query]];
  console.log(`${shot.name}.png`);
  const result = spawnSync(program, scriptArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
