// The cut list as a file – shared by the panel's button and File › Export.
import { t } from './runtime';
import type { PluginContext } from '../../../src/plugins/types';
import { cutList, cutListCsv } from './boards';
import { collectBoards } from './collect';

const COLUMNS = ['name', 'material', 'count', 'length', 'width', 'thickness', 'bandLong', 'bandShort', 'banding'];

export const cutListFileName = (context: PluginContext) =>
  `${context.editor.model.name || t('woodshop.cutList.file')}-${t('woodshop.cutList.file')}.csv`;

export const cutListFile = (context: PluginContext) => {
  const rows = cutList(collectBoards(context));
  if (!rows.length) {
    throw new Error(t('woodshop.cutList.empty'));
  }
  return cutListCsv(
    rows,
    COLUMNS.map((column) => t(`woodshop.columns.${column}`)),
  );
};
