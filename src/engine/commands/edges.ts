// Rounding and chamfering the selected edges of an open group – the result stays editable as a procedure.
import type { Editor } from '../editor';
import { isProcedureInput } from '../../core/model';
import { createEdgeProcedure } from '../../core/procedures';
import { edgeSpecOf, type EdgeTreatment } from '../../core/roundEdges';
import { isSolid } from '../../core/solids';
import { parseLength } from '../../core/units';
import { t } from '../../i18n';

/** the size asked for last, offered again */
let lastSize = 0.01;

/**
 * Asks for the radius (or the chamfer's width) and turns the open group into a procedure that rounds or chamfers the
 * selected outer edges. The group must be a closed body and no procedure or part of one.
 */
export const treatSelectedEdges = async (editor: Editor, treatment: EdgeTreatment) => {
  const group = editor.activePath[editor.activePath.length - 1];
  const edgeIds = editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'edge')
    .map((entityRef) => entityRef.id);
  if (!group || !edgeIds.length) {
    editor.toast(t('toast.selectEdgesInGroup'));
    return;
  }
  if (group.definition.procedure || isProcedureInput(group)) {
    editor.toast(t('toast.edgesNotInProcedure'));
    return;
  }
  if (!isSolid(editor.entities)) {
    editor.toast(t('toast.notASolid', { name: group.name || group.definition.name }));
    return;
  }
  const specs = edgeIds.map((id) => edgeSpecOf(editor.entities, id)).filter((spec) => spec !== null);
  if (!specs.length) {
    editor.toast(t('toast.noOuterEdges'));
    return;
  }
  const text = await editor.prompt(t(treatment === 'round' ? 'procedures.radiusPrompt' : 'procedures.chamferPrompt'), editor.fmt(lastSize));
  const size = text == null ? null : parseLength(text, editor.model.settings.units);
  if (size == null || size <= 0) {
    return;
  }
  lastSize = size;
  editor.exitContext();
  try {
    editor.commit(treatment === 'round' ? 'commands.roundEdges' : 'commands.chamferEdges', () => {
      const procedure = createEdgeProcedure(editor.model, editor.entities, group, treatment, size, specs);
      editor.select([{ kind: 'instance', id: procedure.id }]);
    });
  } catch {
    // commit has put everything back and said so
  }
};
