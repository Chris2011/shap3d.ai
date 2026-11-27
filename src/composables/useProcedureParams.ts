import { useEditor } from '../components/keys';
import { rebuildProcedure } from '../core/procedures';
import { parseLength } from '../core/units';
import { VARIABLE_PATTERN } from '../core/variables';
import { expressionKey } from '../core/variableProcedures';
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

  /** `undefined` takes a parameter away (e.g. the text of a length typed without variables) */
  const setParams = (change: Record<string, string | number | boolean | undefined>) => {
    const definition = instance.value?.definition;
    if (!definition?.procedure) {
      return;
    }
    editor.commit('procedures.undoParams', () => {
      const params = definition.procedure!.params;
      for (const [key, value] of Object.entries(change)) {
        if (value === undefined) {
          delete params[key];
        } else {
          params[key] = value;
        }
      }
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
  /** a length parameter as its field shows it: the text typed with variables (`#wand * 2`), else the length */
  const lengthText = (key: string, fallback = 1) => {
    const typed = procedure.value?.params[expressionKey(key)];
    return typeof typed === 'string' && typed ? typed : editor.fmt(Number(procedure.value?.params[key] ?? fallback));
  };
  /**
   * a length typed for a parameter (spacing, radius …), also with variables – their text is kept, so the parameter
   * follows when a variable changes; `positive` refuses 0 and less – back to the old value then
   */
  const setLength = (key: string, event: Event, positive = true) => {
    const text = inputValue(event).trim();
    const length = parseLength(text, editor.model.settings.units);
    if (length != null && (!positive || length > 0)) {
      setParams({ [key]: length, [expressionKey(key)]: VARIABLE_PATTERN.test(text) ? text : undefined });
    } else {
      (event.target as HTMLInputElement).value = lengthText(key, positive ? 1 : 0);
    }
  };
  return { editor, instance, procedure, sources, setParams, setCount, setLength, lengthText };
};
