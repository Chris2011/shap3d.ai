/** An edit of the code: the new text and where the caret goes. */
export interface CodeEdit {
  code: string;
  caret: number;
}

/** Replaces `code[start…end]` with `text`; the caret lands after it. */
export const replaceRange = (code: string, start: number, end: number, text: string): CodeEdit => ({
  code: code.slice(0, start) + text + code.slice(end),
  caret: start + text.length,
});

/** Enter that keeps the line's indentation – two spaces more after an opening bracket. */
export const newlineKeepingIndent = (code: string, start: number, end: number): CodeEdit => {
  const lineStart = code.lastIndexOf('\n', start - 1) + 1;
  const line = code.slice(lineStart, start);
  const indent = (line.match(/^\s*/) ?? [''])[0] + (/[{[(]\s*$/.test(line) ? '  ' : '');
  return replaceRange(code, start, end, '\n' + indent);
};

/** Inserts a snippet at the caret – a multi-line snippet starts on its own line. */
export const insertSnippet = (code: string, start: number, end: number, text: string): CodeEdit => {
  const before = code.slice(0, start);
  const pre = before && text.includes('\n') && !before.endsWith('\n') ? '\n' : '';
  return replaceRange(code, start, end, pre + text);
};

/** Number of lines, at least 1. */
export const lineCount = (code: string) => Math.max(1, code.split('\n').length);
