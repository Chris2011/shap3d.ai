#!/usr/bin/env node
/**
 * Translation helper for developers (no dependencies):
 *
 *   node scripts/i18n.mjs check      – missing / unused keys per language file, then `scan`
 *   node scripts/i18n.mjs scan [dir] – German-looking text still hard-coded in .vue/.ts/.js files (src/ and plugins/<name>/src/)
 *   node scripts/i18n.mjs template   – writes src/plugins/builtin/i18n/languages/template.json
 *
 * Source texts (English): src/i18n/en.json and boot.en.json (the app) plus the en.json of every built-in
 * plugin (src/plugins/builtin/<id>/i18n/en.json) and of every plugin package (plugins/<name>/src/i18n/en.json).
 * Translations: src/plugins/builtin/i18n/languages/<code>.json (the app) and <code>.json next to each en.json
 * (the plugins' own texts). The template only covers the app and the built-in plugins.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const languagesDir = join(root, 'src/plugins/builtin/i18n/languages');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** { a: { b: 'x' } } → { 'a.b': 'x' } (hint keys like "select#en" are skipped) */
const flatten = (messages, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(messages ?? {})) {
    if (key.includes('#')) {
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      flatten(value, path, out);
    } else {
      out[path] = String(value ?? '');
    }
  }
  return out;
};

/** folders with a plugin's language files: built-in plugins (src/plugins/builtin/<id>/i18n) and, unless `builtinOnly`, plugin packages (plugins/<name>/src/i18n) */
const pluginLanguageDirs = (builtinOnly = false) => {
  const builtin = join(root, 'src/plugins/builtin');
  const dirs = readdirSync(builtin).map((id) => join(builtin, id, 'i18n'));
  const packages = join(root, 'plugins');
  if (!builtinOnly && existsSync(packages)) {
    dirs.push(...readdirSync(packages).map((name) => join(packages, name, 'src/i18n')));
  }
  return dirs.filter((dir) => existsSync(join(dir, 'en.json')));
};
/** source folders scanned for t() keys and hard-coded text: the app and the plugin packages */
const codeRoots = () => {
  const packages = join(root, 'plugins');
  const roots = [join(root, 'src')];
  if (existsSync(packages)) {
    roots.push(
      ...readdirSync(packages)
        .map((name) => join(packages, name, 'src'))
        .filter(existsSync),
    );
  }
  return roots;
};

/** every English source file: the app's and the plugins' */
const sourceFiles = (builtinOnly = false) => [
  join(root, 'src/i18n/en.json'),
  join(root, 'src/i18n/boot.en.json'),
  ...pluginLanguageDirs(builtinOnly).map((dir) => join(dir, 'en.json')),
];
const sourceMessages = () => Object.assign({}, ...sourceFiles().map((file) => flatten(readJson(file).messages)));

/** translations: languages/<code>.json and <code>.json in every plugin's language folder */
const languageCodes = () =>
  readdirSync(languagesDir)
    .filter((name) => name.endsWith('.json') && name !== 'template.json')
    .map((name) => name.slice(0, -5))
    .filter((code) => code !== 'en');
const languageMessages = (code) => {
  const files = [join(languagesDir, `${code}.json`), ...pluginLanguageDirs().map((dir) => join(dir, `${code}.json`))];
  return Object.assign({}, ...files.filter(existsSync).map((file) => flatten(readJson(file).messages)));
};

const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort()
    .join(',');

const check = () => {
  const source = sourceMessages();
  let problems = 0;
  console.log(`Englisch (Quelle): ${Object.keys(source).length} Schlüssel`);
  for (const code of languageCodes()) {
    const messages = languageMessages(code);
    const missing = Object.keys(source).filter((key) => !messages[key]);
    const unused = Object.keys(messages).filter((key) => !(key in source));
    const badPlaceholders = Object.keys(source).filter((key) => messages[key] && placeholders(messages[key]) !== placeholders(source[key]));
    console.log(`${code}: ${Object.keys(source).length - missing.length}/${Object.keys(source).length} übersetzt`);
    for (const key of missing) {
      console.log(`  fehlt: ${key}  (${source[key]})`);
    }
    for (const key of unused) {
      console.log(`  unbenutzt: ${key}`);
    }
    for (const key of badPlaceholders) {
      console.log(`  Platzhalter weichen ab: ${key}  {${placeholders(source[key])}} ≠ {${placeholders(messages[key])}}`);
    }
    problems += missing.length + unused.length + badPlaceholders.length;
  }
  // keys used in code but missing in en.json
  const used = new Set();
  for (const file of codeRoots().flatMap((dir) => codeFiles(dir))) {
    const code = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n'); // not in comments
    for (const match of code.matchAll(/\bt\(\s*'([\w.-]+)'/g)) {
      used.add(match[1]);
    }
  }
  const undefinedKeys = [...used].filter((key) => !(key in source));
  for (const key of undefinedKeys) {
    console.log(`  im Code, aber nicht in en.json: ${key}`);
  }
  problems += undefinedKeys.length;
  return problems;
};

/** Writes the template: all keys with empty values, the English text as "<key>#en" right below. */
const template = () => {
  const withHints = (messages) => {
    const out = {};
    for (const [key, value] of Object.entries(messages)) {
      if (value && typeof value === 'object') {
        out[key] = withHints(value);
      } else {
        out[key] = '';
        out[`${key}#en`] = value;
      }
    }
    return out;
  };
  const merged = {};
  const mergeInto = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object') {
        mergeInto((target[key] ??= {}), value);
      } else {
        target[key] = value;
      }
    }
  };
  for (const file of sourceFiles(true)) {
    mergeInto(merged, readJson(file).messages);
  }
  const result = {
    $schema:
      'Shap3D.ai language file – fill in "code", "name" and every empty text; lines ending in "#en" are only hints with the English text and may stay or go.',
    code: '',
    name: '',
    dir: 'ltr',
    messages: withHints(merged),
  };
  writeFileSync(join(languagesDir, 'template.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`template.json: ${Object.keys(flatten(merged)).length} Schlüssel`);
};

// ------------------------------------------------------------ scan for hard-coded German text

const IGNORED = [
  /devShots\.ts$/,
  /[\\/]examples[\\/]/,
  /scripting[\\/]examples\.ts$/,
  /builtin[\\/]ai[\\/]prompt\.ts$/,
  /core[\\/]materialLibrary\.ts$/,
  /\.d\.ts$/,
];
const codeFiles = (dir) => {
  if (!statSync(dir).isDirectory()) {
    return [dir];
  }
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules' && name !== 'fonts') {
        out.push(...codeFiles(path));
      }
    } else if (/\.(vue|ts|js)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
};
const GERMAN_WORD =
  /\b(der|die|das|den|dem|und|oder|nicht|mit|für|ist|sind|ein|eine|einen|kein|keine|zu|von|auf|im|wird|werden|alle|alles|nach|bei|aus|über|wählen|bitte|noch|nur|hier|zum|zur)\b/i;
const looksGerman = (text) => {
  const plain = text
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .trim();
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(plain)) {
    return false;
  }
  if (/\d+px\b|sans-serif|\[[^\]]*\]|^[\w-]+(\s+[\w-]+:[\w\-[\].]+)+/.test(plain)) {
    return false;
  } // CSS fonts and Tailwind classes
  if (/^[\w$.\-/:@#*?=&]+$/.test(plain) && !/[äöüÄÖÜß]/.test(plain)) {
    return /^[A-ZÄÖÜ][a-zäöüß]{3,}$/.test(plain) && !ENGLISH.has(plain);
  } // single capitalised word: maybe German
  return /[äöüÄÖÜß„“]/.test(plain) || GERMAN_WORD.test(plain) || /\b[A-ZÄÖÜ][a-zäöüß]+(ung|keit|heit)\b/.test(plain);
};
const ENGLISH = new Set([
  'Escape',
  'Enter',
  'Shift',
  'Delete',
  'Backspace',
  'Control',
  'Meta',
  'Arial',
  'Helvetica',
  'Standard',
  'Files',
  'Plugins',
  'Orbit',
  'Lasso',
  'Text',
  'Tags',
  'Trackpad',
  'System',
  'Iso',
  'Monochrom',
  'Inter',
  'Roboto',
  'Lobster',
  'Pacifico',
  'Orbitron',
  'Caveat',
  'Fredoka',
  'Material',
  'Panel',
  'Mentor',
  'Untagged',
  'Space',
  'Shap',
  'Promise',
  'Update',
  'Mesh',
  'Home',
  'Math',
  'Entities',
  'Deutsch',
  'English',
  'Option',
  'Variable',
  'Anna',
  'Chris',
  'Dana',
  'Emre',
  'Fatima',
  'Gina',
  'Hugo',
  'Ellipsoid',
  'Torus',
  'Likes',
  'Code',
  'Qwen',
  'Llama',
  'Gemma',
  'Helvetiker',
  'Optimer',
  'Attribute',
  'Blender',
  'Bearer',
  'Sans',
  'Serif',
  'Mono',
]);

const scan = (dir) => {
  let hits = 0;
  for (const file of (dir ? [dir] : codeRoots()).flatMap((folder) => codeFiles(folder))) {
    if (IGNORED.some((pattern) => pattern.test(file))) {
      continue;
    }
    const lines = readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
    let ignoring = false; // between "i18n-ignore-start" and "i18n-ignore-end" (search words, data)
    lines.forEach((line, index) => {
      if (line.includes('i18n-ignore-start')) {
        ignoring = true;
      }
      if (line.includes('i18n-ignore-end')) {
        ignoring = false;
      }
      if (ignoring || line.includes('i18n-ignore') || lines[index - 1]?.includes('i18n-ignore-next-line')) {
        return;
      }
      const code = line
        .replace(/^\s*(\/\/|\*|\/\*).*$/, '')
        .replace(/\s\/\/\s.*$/, '')
        .replace(/<!--.*?-->/g, '');
      if (/^\s*import\s|console\.(log|warn|error|debug)/.test(code)) {
        return;
      }
      const candidates = [];
      for (const match of code.matchAll(/(?<![\w$])(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g)) {
        const before = code.slice(0, match.index);
        if (/\bt\(\s*$|\bi18n\.t\(\s*$/.test(before)) {
          continue;
        } // key of a t() call
        if (/\b(name|label) \?\? $|uniqueDefName\($|ensureMaterial\($|material: $/.test(before)) {
          continue;
        } // model content (default names, materials) stays as it is
        candidates.push(match[1] ?? match[2] ?? match[3] ?? '');
      }
      if (file.endsWith('.vue')) {
        for (const match of code.matchAll(/>([^<>]+)</g)) {
          candidates.push(match[1].replace(/\{\{.*?\}\}/g, ' '));
        }
      }
      if (file.endsWith('.vue')) {
        const tail = code.match(/^[^<>]*?([A-Za-zÄÖÜäöüß„][^<>]*)</);
        if (tail && !/[=:]\s*["'`]?$/.test(code.slice(0, code.indexOf(tail[1])))) {
          candidates.push(tail[1].replace(/\{\{.*?\}\}/g, ' '));
        }
      }
      const german = candidates.filter(looksGerman);
      if (german.length) {
        hits++;
        console.log(
          `${relative(root, file)}:${index + 1}: ${german
            .map((text) => text.trim())
            .join(' | ')
            .slice(0, 160)}`,
        );
      }
    });
  }
  console.log(hits ? `${hits} Zeilen mit möglichem hart codiertem Text` : 'Kein hart codierter deutscher Text gefunden');
  return hits;
};

const [command = 'check', argument] = process.argv.slice(2);
if (command === 'template') {
  template();
} else if (command === 'scan') {
  scan(argument ? join(root, argument) : undefined);
} else {
  const problems = check();
  console.log('');
  scan();
  process.exitCode = problems ? 1 : 0;
}
