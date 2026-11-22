import { createSolidProcedure, PROCEDURE_SOLID_OPS, type ProcedureSolidOp } from '../../core/procedures';
import type { Editor } from '../editor';
import type { EntityRef, Instance } from '../../core/model';
import { copyInstanceDetails } from '../../core/model';
import { cutKeepingGroups, isSolid, type SolidOp } from '../../core/solids';
import { t } from '../../i18n';

/** SketchUp solid tools on selected groups/components (first selected = cutter). */
export const runSolid = (editor: Editor, operation: SolidOp) => {
  const insts = editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'instance')
    .map((entityRef) => editor.entities.instances.get(entityRef.id)!)
    .filter(Boolean);
  if (insts.length < 2) {
    editor.toast(t('toast.selectTwoSolids'));
    return;
  }
  const bad = insts.find((instance) => !isSolid(instance.definition.entities));
  if (bad) {
    editor.toast(t('toast.notASolid', { name: bad.name || bad.definition.name }));
    return;
  }
  // the operations with one result stay editable: the inputs go into a procedure
  if ((PROCEDURE_SOLID_OPS as SolidOp[]).includes(operation)) {
    // Subtract keeps the last one selected and takes the others from it, the others build on the first
    const target = operation === 'subtract' ? insts[insts.length - 1] : insts[0];
    try {
      editor.commit(`commands.solid-${operation}`, () => {
        const procedure = createSolidProcedure(
          editor.model,
          editor.entities,
          operation as ProcedureSolidOp,
          target,
          insts.filter((instance) => instance !== target),
        );
        editor.select([{ kind: 'instance', id: procedure.id }]);
      });
    } catch {
      // commit has put everything back and said so
    }
    return;
  }
  try {
    editor.commit(`commands.solid-${operation}`, () => {
      // the first two selected; each piece keeps the place, name, tag, data and inner groups of the solid it comes from
      const [first, second] = insts;
      const cut = (mode: 'subtract' | 'intersect', source: Instance, tool: Instance) => ({
        source,
        entities: cutKeepingGroups(mode, source.definition.entities, tool, source.matrix.clone().invert().multiply(tool.matrix), {
          defs: editor.model,
        }),
      });
      const pieces =
        operation === 'trim'
          ? [cut('subtract', second, first)]
          : [cut('subtract', first, second), cut('subtract', second, first), cut('intersect', first, second)];
      const refs: EntityRef[] = [];
      for (const { source, entities } of pieces) {
        if (!entities.faces.size && !entities.instances.size) {
          continue;
        }
        const def = editor.model.newDefinition(editor.model.uniqueDefName(source.definition.name || t('names.solid')), false, entities);
        if (source.definition.pluginData) {
          def.pluginData = JSON.parse(JSON.stringify(source.definition.pluginData));
        }
        const piece = copyInstanceDetails(source, editor.entities.addInstance(def, source.matrix.clone(), source.name));
        refs.push({ kind: 'instance', id: piece.id });
      }
      if (operation !== 'trim') {
        editor.entities.instances.delete(first.id);
      }
      editor.entities.instances.delete(second.id);
      editor.model.purge();
      editor.select(refs);
    });
  } catch (error: any) {
    editor.toast(t('toast.solidFailed', { error: error?.message ?? error }));
  }
};
