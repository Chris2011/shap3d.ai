import { interleave, type ModelSource, type SearchPage } from '../source';
import { commons } from './commons';
import { myMiniFactory } from './myminifactory';
import { openStreetMap } from './openstreetmap';
import { polyHaven } from './polyhaven';
import { sketchfab } from './sketchfab';
import { thingiverse } from './thingiverse';

/** the sources by themselves: those without a key first */
const SINGLE: ModelSource[] = [polyHaven, commons, openStreetMap, sketchfab, thingiverse, myMiniFactory];

/** all sources that can answer: one that needs a key only with it, the map's places only without a search for things */
export const ALL_SOURCES: ModelSource = {
  id: 'all',
  label: 'marketplace.panel.allSources',
  search: async ({ query, category, next, keys, signal }) => {
    const cursors: Record<string, string> | undefined = next ? JSON.parse(next) : undefined;
    const asked = SINGLE.filter(
      (source) =>
        (source.key?.needed !== 'search' || keys[source.id]) &&
        (!source.places || (!query && !category && !next)) &&
        (!cursors || source.id in cursors),
    );
    const answers = await Promise.allSettled(
      asked.map((source) => source.search({ query, category, next: cursors?.[source.id], key: keys[source.id] ?? '', keys, signal })),
    );
    signal.throwIfAborted();
    const pages = answers.flatMap((answer, index) =>
      answer.status === 'fulfilled' ? [{ source: asked[index], page: answer.value as SearchPage }] : [],
    );
    // one source that fails does not take the others with it; only when none answers there is nothing to show
    if (!pages.length) {
      const failed = answers.find((answer) => answer.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }
    }
    const left = pages.filter(({ page }) => page.next).map(({ source, page }) => [source.id, page.next as string]);
    return {
      items: interleave(pages.map(({ page }) => page.items)),
      next: left.length ? JSON.stringify(Object.fromEntries(left)) : undefined,
    };
  },
};

/** the sources in the panel's list */
export const SOURCES: ModelSource[] = [ALL_SOURCES, ...SINGLE];
