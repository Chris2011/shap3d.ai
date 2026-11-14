/**
 * A set-up instruction as HTML: the text escaped, commands to copy (`ollama pull …`, `litellm …`,
 * `OLLAMA_ORIGINS="*"`) in `<code>`.
 */
export const setupStepHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/(ollama [a-z]+ [^\s]+|litellm [^\n]+|OLLAMA_ORIGINS="\*")/g, '<code>$1</code>');
