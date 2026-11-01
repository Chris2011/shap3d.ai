#!/usr/bin/env node
/**
 * Renders the README screenshots of the animation plugin – one per demo – with the app's screenshot script
 * (scripts/screenshots.ps1 on Windows, scripts/screenshots.sh elsewhere). Start the dev server first (npm run dev in
 * the repository root) and build the package (npm run build), then from plugins/animation:
 *
 *   node docs/screenshots.mjs [--url http://localhost:5173] [--only robot]
 *
 * Each demo shows a frame of its own (s3d.animatePlay({ frame })); the command animation.shot opens the panel and the timeline.
 */
import { spawnSync } from 'node:child_process';

const SHOTS = [
  { name: 'animation', file: 'demo.js', command: 'animation.shot', camera: '-4,-21,10', target: '0,0,0.5' },
  { name: 'animation-guide', file: 'demo.js', command: 'animation.timeline,animation.guide', camera: '-4,-21,10', target: '0,0,0.5' },
  { name: 'animation-robot', file: 'demo-robot.js', command: 'animation.shot', camera: '6,-8,4.5', target: '0.4,0,1.6' },
  { name: 'animation-camera', file: 'demo-camera.js', command: 'animation.shot', camera: '-10,-4,6', target: '0,0,1.5' },
  { name: 'animation-colors', file: 'demo-colors.js', command: 'animation.shot', camera: '4.5,-10,4.5', target: '4.5,0,0.6' },
];

const args = process.argv.slice(2);
const option = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const url = option('--url') ?? 'http://localhost:5173';
const only = option('--only')?.split(',');

for (const shot of SHOTS.filter((entry) => !only || only.some((name) => entry.name.endsWith(name)))) {
  const query = `package=animation&file=/plugins/animation/docs/${shot.file}&command=${shot.command}&camera=${shot.camera}&target=${shot.target}`;
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
