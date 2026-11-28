import { reactive } from 'vue';
import { DEFAULT_DOOR, DEFAULT_WINDOW, type OpeningKind, type OpeningParams } from './parts';

/** the settings for the next window and the next door – they stay while the app runs */
let drafts: Record<OpeningKind, OpeningParams> | null = null;
let chosen: { kind: OpeningKind } | null = null;

/** made on first use: the package's `vue` is the app's only after the plugin started */
export const useDrafts = () => (drafts ??= reactive({ window: { ...DEFAULT_WINDOW }, door: { ...DEFAULT_DOOR } }));
export const useChosen = () => (chosen ??= reactive({ kind: 'window' as OpeningKind }));

/** the settings the tool sets now */
export const currentDraft = () => useDrafts()[useChosen().kind];
