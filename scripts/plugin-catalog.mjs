// The plugin catalog: the plugins of this repository (their newest releases, unpacked on GitHub Pages) and the
// community plugins listed in plugins/community.json – one index.json the app (Plugins › Discover) and the plugin
// portal read.
//
//   node scripts/plugin-catalog.mjs newest <newest.json>   (release tags on stdin)
//       the newest version of every plugin: { id: version }
//   node scripts/plugin-catalog.mjs check
//       checks plugins/community.json (CI): every entry complete, its id unique and not one of this repository's,
//       its package.json reachable at its url with that id and a version, its main script there too
//   node scripts/plugin-catalog.mjs unreleased <newest.json>
//       the plugins of plugins/ without a release yet, one line each: <folder> <id> <version>
//   node scripts/plugin-catalog.mjs build <site> <newest.json> <owner/repo> [previews.json]
//       writes <site>/plugins/index.json from the unpacked releases (<site>/plugins/<id>/<version>/) named in
//       newest.json ({ id: version }), the previews built from main for plugins without a release (previews.json,
//       { id: version }, unpacked the same way – marked `preview`) and the community entries (their version read from
//       their package.json)
//
// A community entry: { "id", "name", "author", "url", "description"?, "homepage"?, "license"?, "thumbnail"? } – `url` is the
// plugin's folder on a web server that allows cross-origin requests (GitHub Pages does), holding its package.json
// as `npm run build` writes it into dist/.

import { copyFileSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const COMMUNITY = 'plugins/community.json';

const folderOf = (url) => url.replace(/package\.json([?#].*)?$/i, '').replace(/\/?$/, '/');

/** the plugin packages of this repository: their folder, id and version */
const ownPlugins = () =>
  readdirSync('plugins', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join('plugins', entry.name, 'package.json')))
    .map((entry) => {
      const manifest = JSON.parse(readFileSync(join('plugins', entry.name, 'package.json'), 'utf8'));
      return { folder: entry.name, id: manifest.shap3d?.id, version: manifest.version, thumbnail: manifest.portal?.thumbnail };
    })
    .filter((plugin) => plugin.id);

const ownIds = () => ownPlugins().map((plugin) => plugin.id);

const community = () => JSON.parse(readFileSync(COMMUNITY, 'utf8'));

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
};

/** problems with the community list – empty when it is fine */
const check = async () => {
  const problems = [];
  let list;
  try {
    list = community();
  } catch (error) {
    return [`${COMMUNITY} is not valid JSON: ${error.message}`];
  }
  if (!Array.isArray(list)) {
    return [`${COMMUNITY} must be an array of entries`];
  }
  const taken = new Set(ownIds());
  const seen = new Set();
  for (const [index, entry] of list.entries()) {
    const where = `entry ${index + 1} (${entry?.id ?? '?'})`;
    for (const field of ['id', 'name', 'author', 'url']) {
      if (typeof entry?.[field] !== 'string' || !entry[field].trim()) {
        problems.push(`${where}: "${field}" is missing`);
      }
    }
    if (typeof entry?.id !== 'string') {
      continue;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(entry.id)) {
      problems.push(`${where}: the id may only have lower-case letters, digits, - and _`);
    }
    if (taken.has(entry.id)) {
      problems.push(`${where}: "${entry.id}" is a plugin of this repository`);
    }
    if (seen.has(entry.id)) {
      problems.push(`${where}: "${entry.id}" is listed twice`);
    }
    seen.add(entry.id);
    if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) {
      problems.push(`${where}: the url must start with https://`);
      continue;
    }
    try {
      const base = folderOf(entry.url);
      const manifest = await fetchJson(base + 'package.json');
      if (manifest.shap3d?.id !== entry.id) {
        problems.push(`${where}: its package.json names the id "${manifest.shap3d?.id ?? ''}"`);
      }
      if (!manifest.version) {
        problems.push(`${where}: its package.json has no version`);
      }
      const main = manifest.shap3d?.main ?? manifest.main ?? 'plugin.js';
      const response = await fetch(base + main);
      if (!response.ok) {
        problems.push(`${where}: its main script ${main} is not there (HTTP ${response.status})`);
      }
    } catch (error) {
      problems.push(`${where}: ${error.message}`);
    }
  }
  return problems;
};

const build = async (site, newestFile, repository, previewsFile) => {
  const newest = JSON.parse(readFileSync(newestFile, 'utf8'));
  const previews = previewsFile && existsSync(previewsFile) ? JSON.parse(readFileSync(previewsFile, 'utf8')) : {};
  const released = Object.entries(newest).map(([id, version]) => [id, version, false]);
  const unreleased = Object.entries(previews).map(([id, version]) => [id, version, true]);
  const own = ownPlugins();
  const official = [...released, ...unreleased].map(([id, version, preview]) => {
    const manifest = JSON.parse(readFileSync(join(site, 'plugins', id, version, 'package.json'), 'utf8'));
    // the plugin's folder in this repository: its source, the pictures its README shows, its portal thumbnail
    const folder = own.find((plugin) => plugin.id === id)?.folder ?? id;
    const thumbnail = own.find((plugin) => plugin.id === id)?.thumbnail;
    let picture;
    if (thumbnail && existsSync(join('plugins', folder, thumbnail))) {
      picture = `${id}/thumbnail${extname(thumbnail)}`;
      copyFileSync(join('plugins', folder, thumbnail), join(site, 'plugins', picture));
    }
    return {
      id,
      name: manifest.shap3d?.name ?? manifest.name ?? id,
      version,
      description: manifest.description ?? '',
      license: manifest.license ?? '',
      author: manifest.author ?? 'Shap3D.ai',
      homepage: `https://github.com/${repository}/tree/main/plugins/${folder}`,
      minAppVersion: manifest.shap3d?.minAppVersion ?? null,
      source: 'official',
      url: `${id}/${version}/`,
      latest: `${id}/latest/`,
      ...(picture ? { thumbnail: picture } : {}),
      ...(existsSync(join(site, 'plugins', id, version, 'README.md')) ? { readme: `${id}/${version}/README.md` } : {}),
      // relative links and pictures in the README point into the plugin's folder in the repository
      readmeBase: `https://raw.githubusercontent.com/${repository}/main/plugins/${folder}/`,
      // a preview is built from main – there is no release (and no zip) for it yet
      ...(preview
        ? { preview: true }
        : { zip: `https://github.com/${repository}/releases/download/${id}-v${version}/${id}-${version}.zip` }),
    };
  });
  const listed = [];
  for (const entry of community()) {
    // a community plugin that cannot be reached right now stays out of this build – the next one tries again
    try {
      const base = folderOf(entry.url);
      const manifest = await fetchJson(base + 'package.json');
      listed.push({
        id: entry.id,
        name: entry.name,
        version: manifest.version ?? '',
        description: entry.description ?? manifest.description ?? '',
        license: entry.license ?? manifest.license ?? '',
        author: entry.author,
        homepage: entry.homepage ?? '',
        minAppVersion: manifest.shap3d?.minAppVersion ?? null,
        source: 'community',
        url: base,
        ...(entry.thumbnail ? { thumbnail: new URL(entry.thumbnail, base).href } : {}),
        ...((manifest.files ?? []).includes('README.md') ? { readme: base + 'README.md' } : {}),
        readmeBase: base,
      });
    } catch (error) {
      console.warn(`::warning::community plugin ${entry.id}: ${error.message}`);
    }
  }
  const index = { updated: new Date().toISOString(), plugins: [...official, ...listed] };
  writeFileSync(join(site, 'plugins', 'index.json'), JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index, null, 2));
};

/** is version a newer than b? ("1.10.0" > "1.9.2"; a pre-release before its release) */
const newer = (a, b) => {
  const parts = (version) => version.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    if (x[index] === y[index]) {
      continue;
    }
    if (x[index] === undefined) {
      return true;
    }
    if (y[index] === undefined) {
      return false;
    }
    return typeof x[index] === 'number' && typeof y[index] === 'number' ? x[index] > y[index] : String(x[index]) > String(y[index]);
  }
  return false;
};

/** the newest version of each plugin from release tags on stdin (<id>-v<version>; the app's v<version> are left out) */
const newest = async (file) => {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const versions = {};
  for (const tag of input.split(/\r?\n/)) {
    const match = /^([a-z0-9][a-z0-9_-]*)-v(\d.*)$/.exec(tag.trim());
    if (match && (!versions[match[1]] || newer(match[2], versions[match[1]]))) {
      versions[match[1]] = match[2];
    }
  }
  writeFileSync(file, JSON.stringify(versions));
  console.log(versions);
};

const [command, ...rest] = process.argv.slice(2);
if (command === 'newest') {
  await newest(rest[0] ?? 'newest.json');
} else if (command === 'check') {
  const problems = await check();
  for (const problem of problems) {
    console.error(`::error::${problem}`);
  }
  console.log(problems.length ? `${problems.length} problem(s) in ${COMMUNITY}` : `${COMMUNITY} is fine`);
  process.exit(problems.length ? 1 : 0);
} else if (command === 'unreleased') {
  const releasedVersions = JSON.parse(readFileSync(rest[0] ?? 'newest.json', 'utf8'));
  for (const plugin of ownPlugins().filter((candidate) => !releasedVersions[candidate.id])) {
    console.log(`${plugin.folder} ${plugin.id} ${plugin.version}`);
  }
} else if (command === 'build') {
  await build(...rest);
} else {
  console.error(
    'usage: node scripts/plugin-catalog.mjs newest <file> | unreleased <newest.json> | check | build <site> <newest.json> <owner/repo> [previews.json]',
  );
  process.exit(2);
}
