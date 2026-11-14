import { ScriptApi } from './scriptApi/scriptApi';
import { t } from '../i18n';

/** every member of the `s3d` object – its class is built in layers, so all prototypes up the chain */
const scriptApiNames = () => {
  const names = new Set<string>();
  for (let proto = ScriptApi.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name !== 'constructor' && !name.startsWith('_')) {
        names.add(name);
      }
    }
  }
  return [...names];
};

/** how many letters apart two names are */
const lettersApart = (first: string, second: string) => {
  let row = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i++) {
    const next = [i];
    for (let j = 1; j <= second.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[second.length];
};

/** what went wrong in a script, in its own lines: a command that does not exist names the one probably meant */
export const scriptErrorText = (error: any): string => {
  let text = error?.message ?? String(error);
  const missing = /^s3d\.(\w+) is not a function/.exec(text);
  if (missing) {
    const names = scriptApiNames();
    const nearest = names.reduce((best, name) => (lettersApart(name, missing[1]) < lettersApart(best, missing[1]) ? name : best), names[0]);
    text = t('script.errors.unknownCommand', { name: missing[1] });
    if (lettersApart(nearest, missing[1]) <= 2) {
      text += ` ${t('script.errors.didYouMean', { name: nearest })}`;
    }
  }
  // new Function puts three lines in front of the code
  const line = /<anonymous>:(\d+):\d+/.exec(String(error?.stack));
  return line && Number(line[1]) > 3 ? `${text} ${t('script.errors.line', { line: Number(line[1]) - 3 })}` : text;
};
