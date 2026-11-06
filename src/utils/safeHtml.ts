const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Text for `v-html` that may carry simple emphasis. Translations come from language files anyone can hand around, so
 * only these tags stay, without attributes – everything else shows as the text it is.
 */
export const richText = (text: string) =>
  text
    .replace(/&(?!#?\w+;)|[<>"']/g, (char) => ESCAPES[char])
    .replace(/&lt;(\/?)(b|i|em|strong|kbd|code)&gt;/g, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>');

/** a link address from data that is not ours: only web addresses – `javascript:` runs in the app when clicked */
export const webUrl = (value: unknown) => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};
