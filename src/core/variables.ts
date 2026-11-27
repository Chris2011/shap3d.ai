// Named values of the model (like Onshape's Variable Studio): `#wand = 240 mm`, usable wherever a length is typed, with
// simple arithmetic (`#wand * 2 + 10 cm`). A small parser of its own – typed text is never run as code.

/** a variable as the model saves it: its name (without #) and the expression typed for it */
export interface ModelVariable {
  name: string;
  value: string;
}

/** the result of an expression: a number, and whether it is a length (m) or a plain factor */
export interface ExpressionValue {
  value: number;
  length: boolean;
}

/** what a variable reference looks like: `#` and a name of letters, digits and underscores */
export const VARIABLE_PATTERN = /#([\p{L}_][\p{L}\p{N}_]*)/u;
export const isVariableName = (name: string) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name);

let source: () => ModelVariable[] = () => [];
/** where the variables come from – the editor hands in its model's list once */
export const useVariableSource = (variables: () => ModelVariable[]) => {
  source = variables;
};
export const currentVariables = () => source();

type Token = { kind: 'number'; value: number; unit: string | null } | { kind: 'name'; name: string } | { kind: 'op'; op: string };

const tokenize = (text: string, units: Record<string, number>): Token[] | null => {
  const tokens: Token[] = [];
  const unitNames = Object.keys(units).sort((left, right) => right.length - left.length);
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = rest.match(/^\s+/);
    if (space) {
      at += space[0].length;
      continue;
    }
    const number = rest.match(/^\d*\.?\d+(?:e[-+]?\d+)?/i);
    if (number) {
      at += number[0].length;
      const after = text.slice(at).replace(/^\s+/, '');
      const unit = unitNames.find((name) => after.toLowerCase().startsWith(name) && !/^[\p{L}\p{N}_]/u.test(after.slice(name.length)));
      if (unit) {
        at = text.length - after.length + unit.length;
      }
      tokens.push({ kind: 'number', value: parseFloat(number[0]), unit: unit ?? null });
      continue;
    }
    const name = rest.match(/^#([\p{L}_][\p{L}\p{N}_]*)/u);
    if (name) {
      tokens.push({ kind: 'name', name: name[1] });
      at += name[0].length;
      continue;
    }
    if ('+-*/()'.includes(rest[0])) {
      tokens.push({ kind: 'op', op: rest[0] });
      at++;
      continue;
    }
    return null;
  }
  return tokens;
};

/**
 * Evaluates an expression of numbers (with or without a unit), `#name`s, + − × ÷ and brackets. A number with a unit is a
 * length; a bare number is a factor next to × or ÷ and a length in `defaultUnit` next to + or −. Null when it is no valid
 * expression, a name is unknown or refers to itself, or the units do not fit (a length times a length).
 */
export const evaluateExpression = (
  text: string,
  units: Record<string, number>,
  defaultUnit: string,
  variables: ModelVariable[] = currentVariables(),
  seen: string[] = [],
): ExpressionValue | null => {
  const tokens = tokenize(text, units);
  if (!tokens?.length) {
    return null;
  }
  let at = 0;
  const unitFactor = units[defaultUnit] ?? 1;
  const asLength = (item: ExpressionValue): ExpressionValue => (item.length ? item : { value: item.value * unitFactor, length: true });
  const peek = () => tokens[at];
  const isOp = (op: string) => peek()?.kind === 'op' && (peek() as { op: string }).op === op;

  const factor = (): ExpressionValue | null => {
    const token = tokens[at++];
    if (!token) {
      return null;
    }
    if (token.kind === 'number') {
      return token.unit ? { value: token.value * units[token.unit], length: true } : { value: token.value, length: false };
    }
    if (token.kind === 'name') {
      const variable = variables.find((candidate) => candidate.name === token.name);
      if (!variable || seen.includes(token.name)) {
        return null;
      }
      return evaluateExpression(variable.value, units, defaultUnit, variables, [...seen, token.name]);
    }
    if (token.op === '-' || token.op === '+') {
      const inner = factor();
      return inner && { ...inner, value: token.op === '-' ? -inner.value : inner.value };
    }
    if (token.op === '(') {
      const inner = sum();
      if (!inner || !isOp(')')) {
        return null;
      }
      at++;
      return inner;
    }
    return null;
  };
  const product = (): ExpressionValue | null => {
    let left = factor();
    while (left && (isOp('*') || isOp('/'))) {
      const op = (tokens[at++] as { op: string }).op;
      const right = factor();
      if (!right) {
        return null;
      }
      if (op === '*') {
        if (left.length && right.length) {
          return null;
        }
        left = { value: left.value * right.value, length: left.length || right.length };
      } else {
        if ((!left.length && right.length) || right.value === 0) {
          return null;
        }
        left = { value: left.value / right.value, length: left.length && !right.length };
      }
    }
    return left;
  };
  const sum = (): ExpressionValue | null => {
    let left = product();
    while (left && (isOp('+') || isOp('-'))) {
      const op = (tokens[at++] as { op: string }).op;
      const right = product();
      if (!right) {
        return null;
      }
      // a factor next to a length is a length in the model's unit (like a bare number typed alone)
      const [a, b] = left.length !== right.length ? [asLength(left), asLength(right)] : [left, right];
      left = { value: op === '+' ? a.value + b.value : a.value - b.value, length: a.length };
    }
    return left;
  };

  const result = sum();
  return result && at === tokens.length && Number.isFinite(result.value) ? result : null;
};
