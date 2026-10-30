#!/usr/bin/env node
/**
 * Renders the README screenshots of the level editor plugin – one per feature – with the app's screenshot script
 * (scripts/screenshots.ps1 on Windows, scripts/screenshots.sh elsewhere). Start the dev server first (npm run dev in
 * the repository root) and build the package (npm run build), then from plugins/level:
 *
 *   node docs/screenshots.mjs [--url http://localhost:5173] [--only level]
 */
import { spawnSync } from 'node:child_process';

const SHOTS = [
  { name: 'level', file: 'demo.js', command: 'level.open', camera: '-2,-26,24', target: '3,1,0' },
  { name: 'level-house', file: 'demo.js', command: 'level.open', camera: '22,-17,17', target: '30,1,0' },
  { name: 'level-blockout', file: 'demo-blockout.js', command: 'level.blockout', camera: '3,-17,26', target: '9,7,1' },
  { name: 'level-guide', file: 'demo-blockout.js', command: 'level.guide', camera: '3,-17,26', target: '9,7,1' },
  // the test run: through the hall's fixed camera, and from behind on the arena
  { name: 'level-play', file: 'demo-blockout.js', command: 'level.play', camera: '0,0,10', target: '1,1,0' },
  { name: 'level-play-arena', file: 'demo.js', command: 'level.play-third', camera: '0,0,10', target: '1,1,0' },
  // light and atmosphere: the mansion at night while editing, and in the test run with the torch
  { name: 'level-night', file: 'demo-night.js', command: 'level.open', camera: '9.6,0.4,3.4', target: '2.5,8,1' },
  { name: 'level-night-play', file: 'demo-night.js', command: 'level.play-first', camera: '0,0,10', target: '1,1,0' },
  // a level generated from a seed
  { name: 'level-generated', file: 'demo-generate.js', command: 'level.blockout', camera: '18,-22,52', target: '24,24,0' },
  { name: 'level-nav', file: 'demo-generate.js', command: 'level.nav', camera: '18,-22,52', target: '24,24,0' },
  { name: 'level-storeys', file: 'demo-storeys.js', command: 'level.nav', camera: '1,-7,15', target: '7,3.5,1' },
];

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const url = option('--url') ?? 'http://localhost:5173';
const only = option('--only')?.split(',');

for (const shot of SHOTS.filter((entry) => !only || only.some((name) => entry.name.endsWith(name)))) {
  const query = `package=level&file=/plugins/level/docs/${shot.file}&command=${shot.command}&camera=${shot.camera}&target=${shot.target}`;
  const [program, scriptArgs] =
    process.platform === 'win32'
      ? [
          'powershell',
          ['-File', '../../scripts/screenshots.ps1', '-Url', url, '-Shots', 'script', '-Name', shot.name, '-Out', 'docs', '-Query', query],
        ]
      : [
          'bash',
          ['../../scripts/screenshots.sh', '--url', url, '--shots', 'script', '--name', shot.name, '--out', 'docs', '--query', query],
        ];
  console.log(`${shot.name}.png`);
  const result = spawnSync(program, scriptArgs, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
