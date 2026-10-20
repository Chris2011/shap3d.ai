import { ref, shallowRef, computed, nextTick, type Ref } from 'vue';
import type { Editor } from '../engine/editor';
import { complete, type CompletionResult } from '../scripting/completion';

/** where the popup hangs: the start of the completed word in viewport pixels */
export interface CompletionAnchor {
  x: number;
  top: number;
  bottom: number;
}

const WORD_CHAR = /[\w$À-ɏ]/;
const QUOTES = ["'", '"', '`'];

let measureCanvas: HTMLCanvasElement | null = null;
/** viewport position of a text offset in a monospace textarea (no wrapping, tab size 2) */
const caretPoint = (area: HTMLTextAreaElement, offset: number): CompletionAnchor => {
  const style = getComputedStyle(area);
  measureCanvas ??= document.createElement('canvas');
  const context = measureCanvas.getContext('2d')!;
  context.font = `${style.fontSize} ${style.fontFamily}`;
  const charWidth = context.measureText('0'.repeat(20)).width / 20;
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const text = area.value.slice(0, offset);
  const lineStart = text.lastIndexOf('\n') + 1;
  const line = text.split('\n').length - 1;
  let column = 0;
  for (const char of text.slice(lineStart)) {
    column = char === '\t' ? column + 2 - (column % 2) : column + 1;
  }
  const rect = area.getBoundingClientRect();
  const x = rect.left + parseFloat(style.paddingLeft) + column * charWidth - area.scrollLeft;
  const top = rect.top + parseFloat(style.paddingTop) + line * lineHeight - area.scrollTop;
  return { x, top, bottom: top + lineHeight };
};

/**
 * VS Code-like code completion for the script editor's textarea: opens after `.`, quotes, `{`, `,`
 * and while typing a word, or with Ctrl+Space; arrows choose, Enter/Tab insert, Esc closes.
 */
export const useCodeCompletion = (options: { textarea: Ref<HTMLTextAreaElement | null>; lang: Ref<string>; editor: Editor }) => {
  const result = shallowRef<CompletionResult | null>(null);
  const selected = ref(0);
  const anchor = shallowRef<CompletionAnchor | null>(null);
  const isOpen = computed(() => !!result.value?.items.length);
  /** set while the editor inserts a suggestion itself (its input event is not typing) */
  let inserting = false;

  const close = () => {
    result.value = null;
  };

  const reposition = () => {
    const area = options.textarea.value;
    if (!area || !result.value) {
      return;
    }
    const point = caretPoint(area, result.value.from);
    const rect = area.getBoundingClientRect();
    // the word scrolled out of the editor: close instead of floating somewhere else
    if (point.bottom < rect.top || point.top > rect.bottom) {
      close();
      return;
    }
    anchor.value = point;
  };

  /** should a new popup open after typing `char`? */
  const opensOn = (next: CompletionResult, char: string) => {
    if (char === '.') {
      return next.context === 'member';
    }
    if (QUOTES.includes(char)) {
      return next.context === 'string' || next.context === 'key';
    }
    if (char === '{' || char === ',') {
      return next.context === 'option' || next.context === 'key';
    }
    // `material:` / `material: ` and right after inserting a key – values such as materials open by themselves
    if (char === ':' || char === ' ') {
      return next.context === 'value';
    }
    if (WORD_CHAR.test(char)) {
      return true;
    }
    return false;
  };

  const update = (explicit: boolean, char = '') => {
    const area = options.textarea.value;
    if (!area || area.selectionStart !== area.selectionEnd) {
      close();
      return;
    }
    const next = complete(options.lang.value, area.value, area.selectionStart, options.editor);
    if (!next?.items.length) {
      close();
      return;
    }
    if (!explicit) {
      const previous = result.value;
      const keepsGoing =
        !!previous &&
        (WORD_CHAR.test(char) ||
          (next.context === 'string' && previous.context === 'string' && previous.from === next.from && !QUOTES.includes(char)));
      if (!keepsGoing && !opensOn(next, char)) {
        close();
        return;
      }
      // the word is complete already
      if (next.items.length === 1 && next.items[0].label === next.word && next.context !== 'string') {
        close();
        return;
      }
    }
    const previousLabel = result.value?.from === next.from ? result.value.items[selected.value]?.label : undefined;
    const keep = previousLabel != null ? next.items.findIndex((item) => item.label === previousLabel) : -1;
    result.value = next;
    selected.value = keep >= 0 && next.word === '' ? keep : 0;
    reposition();
  };

  const onInput = (event: Event) => {
    if (inserting) {
      return;
    }
    const input = event as InputEvent;
    if (input.inputType?.startsWith('delete')) {
      if (isOpen.value) {
        update(false);
      }
      return;
    }
    if (input.inputType !== 'insertText' || !input.data) {
      close();
      return;
    }
    update(false, input.data.slice(-1));
  };

  const accept = (index = selected.value) => {
    const area = options.textarea.value,
      current = result.value;
    const item = current?.items[index];
    if (!area || !current || !item) {
      return;
    }
    const insert = item.insert ?? item.label;
    close();
    area.focus();
    area.setSelectionRange(current.from, current.to);
    // execCommand keeps the textarea's own undo history; the input event updates v-model
    inserting = true;
    let done = false;
    try {
      done = document.execCommand('insertText', false, insert);
    } catch {
      done = false;
    }
    if (!done) {
      area.setRangeText(insert, current.from, current.to, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    inserting = false;
    const caret = current.from + (item.caret ?? insert.length);
    area.setSelectionRange(caret, caret);
    nextTick(() => {
      area.setSelectionRange(caret, caret);
      // after a key (`material: `) its values follow right away, if it has any
      if (item.kind === 'option') {
        update(false, ':');
      }
    });
  };

  /** handles the key if the completion wants it – returns true then (the editor skips its own handling) */
  const onKeydown = (event: KeyboardEvent): boolean => {
    if (event.ctrlKey && !event.altKey && (event.key === ' ' || event.code === 'Space')) {
      event.preventDefault();
      update(true);
      return true;
    }
    if (!isOpen.value) {
      return false;
    }
    const count = result.value!.items.length;
    const move = (step: number) => {
      event.preventDefault();
      selected.value = (selected.value + step + count) % count;
    };
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        return true;
      case 'ArrowUp':
        move(-1);
        return true;
      case 'PageDown':
        event.preventDefault();
        selected.value = Math.min(count - 1, selected.value + 8);
        return true;
      case 'PageUp':
        event.preventDefault();
        selected.value = Math.max(0, selected.value - 8);
        return true;
      case 'Enter':
      case 'Tab':
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          close();
          return false;
        }
        event.preventDefault();
        accept();
        return true;
      case 'Escape':
        event.preventDefault();
        close();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
        close();
        return false;
      default:
        return false;
    }
  };

  return { result, selected, anchor, isOpen, close, accept, update, reposition, onInput, onKeydown };
};
