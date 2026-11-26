import { useEditor } from '../components/keys';
import { rebuildProcedure } from '../core/procedures';
import { parseLength } from '../core/units';
import { useSelection } from './useModel';
import { t } from '../i18n';

/** the value of the field an event came from */
export const inputValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

/** The selected procedural group and how its parameters change: each change is one undo step and builds it again. */
export const useProcedureParams = () => {
  const editor = useEditor();
  const instance = useSelection(() => {
    const selection = editor.selected();
    const only = selection.length === 1 && selection[0].kind === 'instance' ? editor.entities.instances.get(selection[0].id) : undefined;
    return only?.definition.procedure ? only : null;
  });
  // a copy per model change: the procedure object stays the same while its parameters change, the fields must follow
  const procedure = useSelection(() => {
    const current = instance.value?.definition.procedure;
    return current && { ...current, params: { ...current.params } };
  });
  /** the groups it is made from (sources of a mirror, pattern or Copy Along) */
  const sources = () =>
    [...(instance.value?.definition.entities.instances.values() ?? [])].filter((input) => input.procedureRole === 'source');

  const setParams = (change: Record<string, string | number | boolean>) => {
    const definition = instance.value?.definition;
    if (!definition?.procedure) {
      return;
    }
    editor.commit('procedures.undoParams', () => {
      Object.assign(definition.procedure!.params, change);
      const error = rebuildProcedure(definition, editor.model);
      if (error) {
        editor.toast(t(error));
      }
    });
  };
  /** a whole number from 1 up – back to the old value otherwise */
  const setCount = (event: Event) => {
    const count = Math.round(Number(inputValue(event)));
    if (Number.isFinite(count) && count >= 1) {
      setParams({ count });
    } else {
      (event.target as HTMLInputElement).value = String(procedure.value?.params.count ?? 1);
    }
  };
  /** a length typed for a parameter (spacing, radius …); `positive` refuses 0 and less – back to the old value then */
  const setLength = (key: string, event: Event, positive = true) => {
    const length = parseLength(inputValue(event), editor.model.settings.units);
    if (length != null && (!positive || length > 0)) {
      setParams({ [key]: length });
    } else {
      (event.target as HTMLInputElement).value = editor.fmt(Number(procedure.value?.params[key] ?? (positive ? 1 : 0)));
    }
  };
  return { editor, instance, procedure, sources, setParams, setCount, setLength };
};
