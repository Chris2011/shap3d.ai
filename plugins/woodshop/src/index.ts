// Woodshop for Shap3D.ai – woodworking: groups and components become boards (grain, edge banding); the cut list counts
// equal boards and goes out as CSV, nesting lays them out on sheets. s3d.board() marks a group from a script.
import type { Instance } from '../../../src/core/model';
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dWoodshopPanel from './S3dWoodshopPanel.vue';
import { DEFAULT_BOARD, type BoardData } from './boards';
import { setBoards } from './collect';
import { cutListFile, cutListFileName } from './cutListFile';
import { MESSAGES, useRuntime } from './runtime';
import { injectStyles } from './styles';

const woodshopPlugin: S3dPlugin = {
  id: 'woodshop',
  name: 'woodshop.plugin.name',
  version: '1.1.0',
  author: 'Shap3D.ai',
  description: 'woodshop.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    // without a tile: the app adds the command "Woodshop…" (menu Plugins, command palette)
    context.panels.register({ id: 'panel', label: 'woodshop.plugin.name', component: S3dWoodshopPanel, icon: 'component' });
    context.files.registerExporter({
      id: 'cut-list',
      label: 'woodshop.cutList.export',
      mimeType: 'text/csv;charset=utf-8',
      fileName: () => cutListFileName(context),
      export: () => cutListFile(context),
    });
    context.script.extend(
      'board',
      (_api, group: { inst?: Instance }, options: Partial<BoardData> = {}) => {
        if (!group?.inst) {
          throw new Error(context.i18n.t('woodshop.script.noGroup'));
        }
        setBoards(context, [group.inst], { ...DEFAULT_BOARD, ...options }, 'woodshop.undo.mark');
        return group;
      },
      {
        category: 'Plugins',
        signature: "s3d.board(group, { grain: 'length' | 'width', bandLong: 0–2, bandShort: 0–2 })",
        description: 'woodshop.script.board',
        example: 'const side = s3d.box([0, 0, 0], 0.018, 0.4, 1.8);\ns3d.board(side, { bandLong: 1 });',
      },
    );
  },
};

export default woodshopPlugin;
