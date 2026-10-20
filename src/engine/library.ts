import type { Editor } from './editor';
import { Entities } from '../core/model';
import { ScriptApi } from '../scripting/api';
import type { PlaceTool } from '../tools/place';
import { localized } from '../i18n';

/** Small built-in component library (Komponenten panel and command palette). */
export interface Lib {
  id: string;
  name: string;
  icon: string;
  build: (s3d: ScriptApi) => void;
}
/** name = message `library.<id>` (also the name of the component it creates) */
export const LIB: Lib[] = (
  [
    {
      id: 'door',
      icon: 'cube',
      build: (s3d) => {
        s3d.box([0, 0, 0], 0.9, 0.05, 2.1, { group: false });
      },
    },
    {
      id: 'window',
      icon: 'cube',
      build: (s3d) => {
        const pane = s3d.rect([0, 0, 0], 1.2, 1.2, 'xz');
        pane.offset(0.08);
      },
    },
    {
      id: 'table',
      icon: 'cube',
      build: (s3d) => {
        s3d.box([0, 0, 0.72], 1.6, 0.9, 0.04, { group: false });
        for (const [x, y] of [
          [0.05, 0.05],
          [1.5, 0.05],
          [0.05, 0.8],
          [1.5, 0.8],
        ]) {
          s3d.box([x, y, 0], 0.05, 0.05, 0.72, { group: false });
        }
      },
    },
    {
      id: 'chair',
      icon: 'cube',
      build: (s3d) => {
        s3d.box([0, 0, 0.45], 0.45, 0.45, 0.04, { group: false });
        for (const [x, y] of [
          [0, 0],
          [0.41, 0],
          [0, 0.41],
          [0.41, 0.41],
        ]) {
          s3d.box([x, y, 0], 0.04, 0.04, 0.45, { group: false });
        }
        s3d.box([0, 0.41, 0.49], 0.45, 0.04, 0.45, { group: false });
      },
    },
    {
      id: 'tree',
      icon: 'cube',
      build: (s3d) => {
        s3d.cylinder([0, 0, 0], 0.15, 2, { group: false, segments: 12 });
        s3d.sphere([0, 0, 3], 1.2, { segments: 16, material: 'Rasen' });
      },
    },
    {
      id: 'stairs',
      icon: 'cube',
      build: (s3d) => {
        const profile: [number, number, number][] = [[0, 0, 0]];
        for (let i = 0; i < 8; i++) {
          profile.push([0, i * 0.28, (i + 1) * 0.175], [0, (i + 1) * 0.28, (i + 1) * 0.175]);
        }
        profile.push([0, 8 * 0.28, 0]);
        s3d.face(profile).extrude(1, 'x');
      },
    },
  ] as Omit<Lib, 'name'>[]
).map((item) => localized(item as Lib, 'name', `library.${item.id}`));
/** Builds a library item as a new component and starts placing it. */
export const insertLibrary = (editor: Editor, item: Lib) => {
  const ents = new Entities();
  const api = new ScriptApi(editor, ents);
  item.build(api);
  const def = editor.model.newDefinition(editor.model.uniqueDefName(item.name), true, ents);
  (editor.tools.get('place') as PlaceTool).start(def);
};
