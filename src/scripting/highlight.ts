/** Tiny syntax highlighter for s3d scripts (JS) and JSON – returns HTML with span classes c/s/n/b/k/api. */
export type CodeLang = 'js' | 'json' | 'obj';

export function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const JS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|\b(const|let|var|for|of|in|if|else|return|function|new|while|true|false|null|undefined|break|continue)\b|\b(s3d|fw|su)\b/g;
const JSON_RE = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g;
const OBJ = /^(#[^\n]*)|^(v|vn|vt|f|o|g)\b|(-?\b\d+(?:\.\d+)?(?:\/\d*)*\b)/gm;

export function highlight(code: string, lang: CodeLang): string {
  const re = new RegExp(lang === 'json' ? JSON_RE : lang === 'obj' ? OBJ : JS);
  let out = '', last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const cls = lang === 'json' ? (m[1] ? 'k' : m[2] ? 's' : m[3] ? 'n' : 'b')
      : lang === 'obj' ? (m[1] ? 'c' : m[2] ? 'b' : 'n')
      : (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'b' : 'api');
    out += `<span class="${cls}">${esc(m[0])}</span>`; last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}

/** Map a fence tag (```js, ```javascript, ```json …) to a highlighter language. */
export function fenceLang(tag: string): CodeLang {
  const t = tag.toLowerCase();
  return t === 'json' ? 'json' : t === 'obj' ? 'obj' : 'js';
}

/** Split markdown-ish text into prose and fenced code parts (an unclosed fence while streaming counts as code). */
export function splitFences(text: string): ({ kind: 'text'; text: string } | { kind: 'code'; lang: CodeLang; code: string; open: boolean })[] {
  const parts: ReturnType<typeof splitFences> = [];
  const re = /```([\w-]*)[^\n]*\n?([\s\S]*?)(```|$)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'code', lang: fenceLang(m[1]), code: m[2].replace(/\n$/, ''), open: !m[3] });
    last = m.index + m[0].length;
    if (!m[0]) break;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.filter(p => p.kind === 'code' || p.text.trim());
}
