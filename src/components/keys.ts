import { inject, type InjectionKey } from 'vue';
import type { Editor } from '../engine/editor';

export const EDITOR: InjectionKey<Editor> = Symbol('editor');
export function useEditor(): Editor { return inject(EDITOR)!; }
