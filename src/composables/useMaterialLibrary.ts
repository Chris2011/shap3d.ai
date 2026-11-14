import type { MaterialDef } from '../core/document';
import { countMaterialUses, replaceMaterialRefs, uniqueMaterialName } from '../core/materialRefs';
import { useEditor } from '../components/keys';

/** The model's material list: pick the paint material, add, rename and delete materials (each one undo step). */
export const useMaterialLibrary = () => {
  const editor = useEditor();

  /** makes `name` the paint material (null = default) and switches to the Paint Bucket */
  const choose = (name: string | null) => {
    editor.ui.currentMaterial = name;
    if (editor.ui.tool !== 'paint') {
      editor.setTool('paint');
    } else {
      editor.refreshStatus();
    }
  };

  const create = (wantedName: string, color: string) => {
    const name = uniqueMaterialName(editor.model.materials, wantedName);
    editor.commit('undo.createMaterial', () => editor.model.materials.push({ name, color, opacity: 1 }));
    choose(name);
  };

  /** renames and keeps every face and group painted with it – an empty or taken name is ignored */
  const rename = (material: MaterialDef, wantedName: string) => {
    const name = wantedName.trim();
    if (!name || editor.model.materials.some((other) => other.name === name)) {
      return;
    }
    const old = material.name;
    editor.commit('undo.renameMaterial', () => {
      material.name = name;
      replaceMaterialRefs(editor.model.root, old, name);
    });
    editor.ui.currentMaterial = name;
  };

  /** deletes the material – what was painted with it gets the default material */
  const remove = (material: MaterialDef) => {
    const old = material.name;
    editor.commit('materials.delete', () => {
      editor.model.materials = editor.model.materials.filter((other) => other !== material);
      replaceMaterialRefs(editor.model.root, old, undefined);
    });
    editor.ui.currentMaterial = null;
  };

  const usesOf = (name: string) => countMaterialUses(editor.model.root, name);

  return { choose, create, rename, remove, usesOf };
};
