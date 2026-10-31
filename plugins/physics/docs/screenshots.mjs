#!/usr/bin/env node
/**
 * Renders the README screenshots of the physics plugin – one per demo – with the app's screenshot script
 * (scripts/screenshots.ps1 on Windows, scripts/screenshots.sh elsewhere). Start the dev server first (npm run dev in
 * the repository root) and build the package (npm run build), then from plugins/physics:
 *
 *   node docs/screenshots.mjs [--url http://localhost:5173] [--only physics]
 *
 * Each demo starts the simulation itself (s3d.physicsStart({ at })); the command physics.pause holds it at that moment.
 */
import { spawnSync } from 'node:child_process';

const SHOTS = [
  { name: 'physics', file: 'demo.js', command: 'physics.pause,physics.open', camera: '2.5,-15,8', target: '3.5,0,1' },
  { name: 'physics-guide', file: 'demo.js', command: 'physics.pause,physics.guide', camera: '2.5,-15,8', target: '3.5,0,1' },
  { name: 'physics-robot', file: 'demo-robot.js', command: 'physics.pause,physics.open', camera: '5.1,-6.6,3.9', target: '0.6,0,0.9' },
  {
    name: 'physics-machines',
    file: 'demo-machines.js',
    command: 'physics.pause,physics.open',
    camera: '5.5,-12.5,7',
    target: '5.5,0.5,1.2',
  },
  { name: 'physics-ropes', file: 'demo-crane.js', command: 'physics.pause,physics.open', camera: '1,-18,8', target: '2.5,0,2.5' },
  { name: 'physics-flight', file: 'demo-flight.js', command: 'physics.pause,physics.open', camera: '-1,-30,9', target: '0,0,4' },
  { name: 'physics-water', file: 'demo-water.js', command: 'physics.pause,physics.open', camera: '4,-8,8', target: '4,2.5,0.5' },
  { name: 'physics-liquid', file: 'demo-liquid.js', command: 'physics.pause,physics.open', camera: '4.5,-4.2,4.2', target: '2.4,0.6,0.2' },
  { name: 'physics-tunnel', file: 'demo-tunnel.js', command: 'physics.pause,physics.open', camera: '1.5,-13,9', target: '3,0,0.8' },
];

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const url = option('--url') ?? 'http://localhost:5173';
const only = option('--only')?.split(',');

for (const shot of SHOTS.filter((entry) => !only || only.some((name) => entry.name.endsWith(name)))) {
  const query = `package=physics&file=/plugins/physics/docs/${shot.file}&command=${shot.command}&camera=${shot.camera}&target=${shot.target}`;
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
