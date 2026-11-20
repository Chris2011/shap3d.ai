import { createEditor } from '../src/engine/setup';
import { initPlugins } from '../src/plugins/registry';
import { createPluginContext } from '../src/plugins/context';
import type { S3dPlugin } from '../src/plugins/types';
import { addMessages } from '../src/i18n';
import { EXAMPLES } from '../src/scripting/examples';
import { runScript } from '../src/scripting/runScript';
import { addScene } from '../src/engine/scenes';
import { runSolid } from '../src/engine/commands';

/**
 * One real editor for all stories, like in the app: its viewer draws into a hidden canvas,
 * and the built-in plugins (languages, AI, terrain …) are started once.
 */
export const editor = createEditor();
const hiddenCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  canvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:240px';
  document.body.append(canvas);
  return canvas;
};
editor.attach(hiddenCanvas(), hiddenCanvas());
(window as any).editor = editor; // handy for debugging in the console

/** a small model, so panels like Outliner, Materials and the scene tabs have something to show */
const buildDemoModel = () => {
  const house = EXAMPLES.find((example) => example.id === 'house')!.code;
  const result = runScript(
    editor,
    `${house}
const stuhl = s3d.component('Stuhl', () => s3d.box([0, 0, 0], 0.45, 0.45, 0.9, { material: 'Holz' }));
for (const x of [9, 10, 11]) stuhl.place([x, 1, 0]);`,
  );
  if (!result.ok) {
    console.error('Demo-Modell fehlgeschlagen', result.error);
  }
  // a procedural group for Procedure Info: a block with a hole, made with Subtract (the cutter is selected first)
  runScript(editor, "s3d.box([9, 4, 0], 0.4, 0.4, 1.2, { name: 'Loch' }); s3d.box([8.5, 3.5, 0], 1.4, 1.4, 0.6, { name: 'Block' });");
  const [block, hole] = [...editor.model.root.instances.values()].reverse();
  editor.select([
    { kind: 'instance', id: hole.id },
    { kind: 'instance', id: block.id },
  ]);
  runSolid(editor, 'subtract');
  editor.select([]);
  addScene(editor);
  addScene(editor);
};

/** the built-in plugins are running and the demo model is there */
export const editorReady = initPlugins(editor)
  .then(buildDemoModel)
  .catch((error) => console.error('Plugins konnten nicht geladen werden', error));

const startedPackages = new Map<string, Promise<void>>();
/**
 * A loader for the stories of a plugin package (`plugins/<id>`): the package gets the app only through the context
 * of `activate()`, so it is started once – with its texts – before its components are shown.
 */
export const startPluginPackage = (plugin: S3dPlugin) => async () => {
  await editorReady;
  if (!startedPackages.has(plugin.id)) {
    Object.entries(plugin.messages ?? {}).forEach(([language, messages]) => addMessages(language, messages, plugin.id));
    startedPackages.set(plugin.id, Promise.resolve(plugin.activate(createPluginContext(editor, plugin, [])) as void | Promise<void>));
  }
  await startedPackages.get(plugin.id);
  return {};
};
