import type { HfModel } from '../hfsearch';
import { t, formatNumber, language } from '../../../../i18n';

/** Mixture-of-experts: only the active part is computed per token – the share of the parameters that runs. */
export const activeShare = (model: HfModel) => (model.active && model.params ? model.active / model.params : 1);

/** ≤ 4B fast, ≤ 9B okay, bigger is slow on a CPU */
export const paramClass = (billions: number) => (billions <= 4 ? 'fast' : billions <= 9 ? 'mid' : 'slow');

export const PARAM_BADGE = { fast: 'bg-warn-bg text-warn', mid: 'bg-surface-2 text-ink-2', slow: 'bg-warn-bg text-danger' };
export const SPEED_TEXT = { fast: 'font-bold text-warn', mid: 'text-ink-2', slow: 'text-danger' };

/** A parameter count in words: "7.6 billion", "350 million". */
export const formatParams = (count: number) =>
  count >= 1e9
    ? t('ai.search.billions', { count: formatNumber(count / 1e9, { maximumFractionDigits: 1 }) })
    : t('ai.search.millions', { count: Math.round(count / 1e6) });

/** A date as "3 Nov 2026" in the app language. */
export const formatDay = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(language.value, { day: 'numeric', month: 'short', year: 'numeric' });
