/** Tiny syntax highlighter for s3d scripts (JS) and JSON – returns HTML with span classes c/s/n/b/k/api. */
export type CodeLang = 'js' | 'json' | 'obj';

export const esc = (text: string) => { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

const JS_TOKENS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|\b(const|let|var|for|of|in|if|else|return|function|new|while|true|false|null|undefined|break|continue)\b|\b(s3d|fw|su)\b/g;
const JSON_RE = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g;
const OBJ = /^(#[^\n]*)|^(v|vn|vt|f|o|g)\b|(-?\b\d+(?:\.\d+)?(?:\/\d*)*\b)/gm;

export const highlight = (code: string, lang: CodeLang): string => {
  const pattern = new RegExp(lang === 'json' ? JSON_RE : lang === 'obj' ? OBJ : JS_TOKENS);
  let out = '', last = 0; let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    if (!match[0]) { pattern.lastIndex++; continue; }
    out += esc(code.slice(last, match.index));
    const cls = lang === 'json' ? (match[1] ? 'k' : match[2] ? 's' : match[3] ? 'n' : 'b')
      : lang === 'obj' ? (match[1] ? 'c' : match[2] ? 'b' : 'n')
      : (match[1] ? 'c' : match[2] ? 's' : match[3] ? 'n' : match[4] ? 'b' : 'api');
    out += `<span class="${cls}">${esc(match[0])}</span>`; last = match.index + match[0].length;
  }
  return out + esc(code.slice(last));
};

/** Map a fence tag (```js, ```javascript, ```json …) to a highlighter language. */
export const fenceLang = (tag: string): CodeLang => {
  const lower = tag.toLowerCase();
  return lower === 'json' ? 'json' : lower === 'obj' ? 'obj' : 'js';
};

/** Split markdown-ish text into prose and fenced code parts (an unclosed fence while streaming counts as code). */
export const splitFences = (text: string): ({ kind: 'text'; text: string } | { kind: 'code'; lang: CodeLang; code: string; open: boolean })[] => {
  const parts: ReturnType<typeof splitFences> = [];
  const fence = /```([\w-]*)[^\n]*\n?([\s\S]*?)(```|$)/g;
  let last = 0; let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'code', lang: fenceLang(match[1]), code: match[2].replace(/\n$/, ''), open: !match[3] });
    last = match.index + match[0].length;
    if (!match[0]) break;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.filter(part => part.kind === 'code' || part.text.trim());
};
