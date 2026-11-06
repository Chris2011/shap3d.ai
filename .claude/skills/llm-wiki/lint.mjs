// Checks docs/llm-wiki: links, named repository files, page headers, the index. Exits with 1 if it finds a problem.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const wiki = join(root, 'docs/llm-wiki');
const REPO_PATH = /`((?:src|plugins|packages|tools|scripts|docs)\/[\w./-]+\.\w+)`/g;
const LINK = /\]\(([^)#\s]+)(?:#[^)]*)?\)/g;
const pages = readdirSync(wiki).filter((name) => name.endsWith('.md'));
const index = readFileSync(join(wiki, 'README.md'), 'utf8');
const problems = [];

for (const page of pages) {
  const text = readFileSync(join(wiki, page), 'utf8');
  for (const [, link] of text.matchAll(LINK)) {
    if (!/^https?:/.test(link) && !existsSync(resolve(wiki, link))) {
      problems.push(`${page}: broken link ${link}`);
    }
  }
  for (const [, path] of text.matchAll(REPO_PATH)) {
    if (!existsSync(join(root, path))) {
      problems.push(`${page}: no such file ${path}`);
    }
  }
  if (page !== 'README.md') {
    if (!/^---\r?\ntitle: .+\r?\nsources: .*\r?\nupdated: \d{4}-\d{2}-\d{2}\r?\n---/.test(text)) {
      problems.push(`${page}: page header missing or incomplete`);
    }
    if (!index.includes(`(${page})`)) {
      problems.push(`${page}: not in the index`);
    }
  }
}

console.log(problems.length ? problems.join('\n') : `${pages.length} pages, no problems`);
process.exitCode = problems.length ? 1 : 0;
