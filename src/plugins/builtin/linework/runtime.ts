import type { PluginContext } from '../../types';

let current: PluginContext | null = null;

/** called first thing in activate() */
export const useLineworkContext = (context: PluginContext) => {
  current = context;
};

export const lineworkContext = () => {
  if (!current) {
    throw new Error('Parts from lines is not active'); // i18n-ignore – programming error
  }
  return current;
};
