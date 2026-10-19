// Builds the installable plugin folder dist/: the plugin module, the OpenSCAD WebAssembly build
// and a package.json that tells Shap3D.ai which file to start. Install it in Shap3D.ai via
// Plugins › Plugin-Ordner laden… and pick the dist folder.
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const openscadDir = dirname(require.resolve('openscad-wasm/package.json'));
const openscadVersion = JSON.parse(readFileSync(join(openscadDir, 'package.json'), 'utf8')).version;
// default fonts for text(): Liberation Sans/Serif/Mono (SIL OFL 1.1) from TypoPRO
const fontDir = dirname(require.resolve('@typopro/dtp-liberation/package.json'));
const fontVersion = JSON.parse(readFileSync(join(fontDir, 'package.json'), 'utf8')).version;

rmSync(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); // retries: Windows may hold files briefly
mkdirSync(dist, { recursive: true });

copyFileSync(join(root, 'src', 'plugin.js'), join(dist, 'plugin.js'));
copyFileSync(join(openscadDir, 'openscad.js'), join(dist, 'openscad.js'));
copyFileSync(join(root, 'README.md'), join(dist, 'README.md'));
mkdirSync(join(dist, 'fonts'));
const fonts = readdirSync(fontDir).filter(name => name.endsWith('.ttf'));
for (const name of fonts) copyFileSync(join(fontDir, name), join(dist, 'fonts', name));
if (existsSync(join(root, 'THIRD-PARTY-NOTICES.md'))) copyFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), join(dist, 'THIRD-PARTY-NOTICES.md'));

writeFileSync(join(dist, 'package.json'), JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  license: manifest.license,
  shap3d: { id: manifest.shap3d.id, main: 'plugin.js' },
  bundled: { 'openscad-wasm': openscadVersion, '@typopro/dtp-liberation': fontVersion },
}, null, 2) + '\n');

console.log(`dist/ ist fertig (openscad-wasm ${openscadVersion}, ${fonts.length} Schriften). In Shap3D.ai: Plugins › Plugin-Ordner laden… › diesen dist-Ordner wählen.`);
