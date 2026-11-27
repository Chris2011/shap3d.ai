// Procedure parameters typed with variables: the number is kept as before, the text beside it as `$key` – when a
// variable changes, the parameter is worked out again and the procedure built anew.
import type { Model, Units } from './document';
import { rebuildProcedure } from './procedures';
import { parseLength } from './units';

/** the key of the text a parameter was typed as (`spacing` → `$spacing`) */
export const expressionKey = (key: string) => `$${key}`;

/** every procedure whose typed parameters give other values now is built again; returns the keys of what failed */
export const applyVariables = (model: Model, units: Units): string[] => {
  const errors: string[] = [];
  for (const definition of model.definitions.values()) {
    const params = definition.procedure?.params;
    if (!params) {
      continue;
    }
    let changed = false;
    for (const [key, text] of Object.entries(params)) {
      if (!key.startsWith('$') || typeof text !== 'string' || !text) {
        continue;
      }
      const value = parseLength(text, units);
      const target = key.slice(1);
      if (value !== null && Math.abs(value - Number(params[target])) > 1e-12) {
        params[target] = value;
        changed = true;
      }
    }
    if (changed) {
      const error = rebuildProcedure(definition, model);
      if (error) {
        errors.push(error);
      }
    }
  }
  return errors;
};

/** a variable renamed: `#old` becomes `#new` in the other variables and in typed procedure parameters */
export const renameVariableUses = (model: Model, from: string, to: string) => {
  const pattern = new RegExp(`#${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu');
  for (const variable of model.variables) {
    variable.value = variable.value.replace(pattern, `#${to}`);
  }
  for (const definition of model.definitions.values()) {
    const params = definition.procedure?.params;
    for (const [key, text] of Object.entries(params ?? {})) {
      if (key.startsWith('$') && typeof text === 'string') {
        params![key] = text.replace(pattern, `#${to}`);
      }
    }
  }
};
