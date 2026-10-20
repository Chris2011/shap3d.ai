import { inject, type InjectionKey } from 'vue';
import type { Editor } from '../engine/editor';

export const EDITOR: InjectionKey<Editor> = Symbol('editor');
export const useEditor = (): Editor => {
  return inject(EDITOR)!;
};
