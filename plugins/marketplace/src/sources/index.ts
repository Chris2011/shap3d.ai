import type { ModelSource } from '../source';
import { commons } from './commons';
import { myMiniFactory } from './myminifactory';
import { openStreetMap } from './openstreetmap';
import { polyHaven } from './polyhaven';
import { sketchfab } from './sketchfab';
import { thingiverse } from './thingiverse';

/** the sources in the panel's list: those without a key first */
export const SOURCES: ModelSource[] = [polyHaven, commons, openStreetMap, sketchfab, thingiverse, myMiniFactory];
