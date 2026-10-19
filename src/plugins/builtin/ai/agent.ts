import { prepareScript } from '../../../scripting/languages';
import * as THREE from 'three';
import { reactive } from 'vue';
import type { Editor } from '../../../engine/editor';
import { runScript, runJson, type RunResult } from '../../../scripting/api';
import { aiConfig, chat, describeError, modeFor, ensureMeshModel, type ChatMsg } from './providers';
import { buildSystemPrompt, buildFastPrompt } from './prompt';
import { currentSession, newSession, touch } from './history';
import { importObj } from '../../../scripting/mesh';
import { parseLength } from '../../../core/units';

export interface AiTurn {
  id: number; role: 'user' | 'assistant'; text: string;
  createdAt: number;            // created (ms since epoch)
  endedAt?: number;        // finished (assistant turns)
  model?: string;
  code?: string; lang?: 'js' | 'json' | 'obj';
  status?: 'streaming' | 'running' | 'done' | 'error' | 'stopped' | 'pending';
  result?: string; error?: string; undoable?: boolean; auto?: boolean; targetSize?: number;
}

/** Turns always come from the current session of the history. */
export const aiState = reactive({ busy: false, get turns(): AiTurn[] { return currentSession().turns; } });
let controller: AbortController | null = null;
const nextId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

const push = (turnData: Omit<AiTurn, 'id' | 'createdAt'> & Partial<Pick<AiTurn, 'createdAt'>>): AiTurn => {
  const session = currentSession();
  session.turns.push({ id: nextId(), createdAt: Date.now(), ...turnData } as AiTurn);
  touch(session, aiConfig.model);
  return session.turns[session.turns.length - 1]; // the reactive proxy
};
const finish = (turn: AiTurn, status: AiTurn['status']) => { turn.status = status; turn.endedAt = Date.now(); touch(currentSession(), aiConfig.model); };

/** Short description of what is in the model so the assistant can refer to it. */
const sceneSummary = (editor: Editor, maxObjects = 40, skipPeople = false): string => {
  const lines: string[] = [];
  const bounds = editor.model.bounds();
  if (bounds.isEmpty()) return 'Das Modell ist leer.';
  lines.push(`Modellgrenzen: x ${bounds.min.x.toFixed(2)}…${bounds.max.x.toFixed(2)}, y ${bounds.min.y.toFixed(2)}…${bounds.max.y.toFixed(2)}, z ${bounds.min.z.toFixed(2)}…${bounds.max.z.toFixed(2)} m`);
  for (const instance of [...editor.model.root.instances.values()].filter(x => !(skipPeople && x.definition.faceMe)).slice(0, maxObjects)) {
    const box = instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone());
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    lines.push(`- ${instance.name || instance.definition.name}${instance.definition.faceMe ? ' (Referenzperson)' : ''}: Mitte [${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}], Größe ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m${instance.material ? `, Material ${instance.material}` : ''}`);
  }
  if (editor.model.root.faces.size) lines.push(`Lose Geometrie außerhalb von Gruppen: ${editor.model.root.faces.size} Flächen.`);
  if (editor.model.materials.length) lines.push('Vorhandene Materialien: ' + editor.model.materials.map(material => material.name + (material.texture ? ` (${material.texture})` : '')).slice(0, 30).join(', '));
  return lines.join('\n');
};

/** Extract the first ```js / ```json code block. */
export const extractCode = (text: string): { code: string; lang: 'js' | 'json' | 'obj' } | null => {
  const match = text.match(/```(js|javascript|ts|json)?\s*\n([\s\S]*?)```/i);
  if (!match) return null;
  const lang = (match[1] ?? '').toLowerCase() === 'json' ? 'json' : 'js';
  return { code: match[2].trim(), lang };
};

/** Recent conversation (the assistant sees its own code and the execution results). */
const history = (limit = 12): ChatMsg[] => {
  const out: ChatMsg[] = [];
  for (const turn of aiState.turns.slice(-limit)) {
    if (turn.status === 'streaming') continue;
    if (turn.role === 'user') out.push({ role: 'user', content: turn.text });
    else {
      const code = turn.code && turn.lang !== 'obj' ? `\n\`\`\`${turn.lang ?? 'js'}\n${turn.code}\n\`\`\`` : '';
      out.push({ role: 'assistant', content: turn.text + code + (turn.error ? `\n\n[Ausführung fehlgeschlagen: ${turn.error}]` : turn.result ? `\n\n[Ausgeführt: ${turn.result}]` : '') });
    }
  }
  return out;
};

const runCode = (editor: Editor, turn: AiTurn): RunResult => {
  if (turn.lang === 'obj') return importObj(editor, turn.code!, { size: turn.targetSize ?? 1, name: 'KI-Objekt', label: 'KI-Assistent' });
  return turn.lang === 'json' ? runJson(editor, turn.code!) : runScript(editor, turn.code!, 'KI-Assistent');
};

// ------------------------------------------------------------------ mesh models (LLaMA-Mesh)
/** LLaMA-Mesh was fine-tuned on short English prompts – this is the phrasing from its demo. */
const meshPrompt = (description: string) => `Create a 3D obj file using the following description: ${description}`;

const sendMesh = async (editor: Editor, prompt: string) => {
  const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model });
  let raw = '';
  try {
    const model = await ensureMeshModel(aiConfig);
    raw = await chat({ ...aiConfig, model }, '', [{ role: 'user', content: meshPrompt(prompt) }], chunk => {
      raw += chunk; const vertexCount = (raw.match(/^v\s/gm) ?? []).length, faceCount = (raw.match(/^f\s/gm) ?? []).length;
      turn.text = vertexCount || faceCount ? `Erzeuge Mesh … ${vertexCount} Ecken, ${faceCount} Flächen` : raw.slice(-400);
    }, controller!.signal, { numCtx: 8192, numPredict: 7000, temperature: 0.9 });
  } catch (error) {
    if (controller?.signal.aborted) { finish(turn, 'stopped'); return; }
    turn.error = describeError(error); finish(turn, 'error'); return;
  }
  const obj = raw.split(/\r?\n/).filter(line => /^\s*(v|f)\s/.test(line)).join('\n');
  if (!/^\s*f\s/m.test(obj)) {
    turn.text = raw.trim().slice(0, 800);
    turn.error = 'Das Modell hat kein Mesh geliefert. Tipp: kurze englische Beschreibung eines einzelnen Objekts, z. B. „a wooden chair“.';
    finish(turn, 'error'); return;
  }
  turn.code = obj; turn.lang = 'obj';
  const size = prompt.match(/(\d+(?:[.,]\d+)?\s*(?:mm|cm|m))/i);
  turn.text = `Mesh für „${prompt}“` + (size ? ` (Größe ${size[1]})` : ' (größte Seite 1 m)');
  turn.targetSize = size ? parseLength(size[1], 'm') ?? 1 : 1;
  if (!aiConfig.autoRun) { finish(turn, 'pending'); return; }
  await execute(editor, turn);
};


// ------------------------------------------------------------------ main entry
export const send = async (editor: Editor, prompt: string) => {
  if (aiState.busy || !prompt.trim()) return;
  push({ role: 'user', text: prompt.trim() });
  aiState.busy = true; controller = new AbortController();
  try {
    if (modeFor(aiConfig.model) === 'mesh') { await sendMesh(editor, prompt.trim()); return; }
    // fast mode: ~700-token prompt, small context window, capped answer, one auto-fix at most
    const fast = aiConfig.fast;
    const attempts = fast ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model });
      const system = fast ? buildFastPrompt(sceneSummary(editor, 8, true)) : buildSystemPrompt(sceneSummary(editor));
      const opts = fast ? { numCtx: 4096, numPredict: 900, temperature: 0.2 } : { numCtx: 16384, temperature: 0.2 };
      try {
        const full = await chat(aiConfig, system, history(fast ? 4 : 12), chunk => { turn.text += chunk; }, controller.signal, opts);
        turn.text = full;
      } catch (error) {
        if (controller.signal.aborted) { finish(turn, 'stopped'); return; }
        turn.error = describeError(error); finish(turn, 'error'); return;
      }
      let block = extractCode(turn.text);
      // a general model may also answer with an OBJ mesh
      if (block && /^v\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+/m.test(block.code) && /^f\s/m.test(block.code)) block = { code: block.code, lang: 'obj' };
      if (!block) { finish(turn, 'done'); return; }
      turn.code = block.code; turn.lang = block.lang;
      turn.text = turn.text.replace(/```[\s\S]*?```/, '').trim();
      if (!aiConfig.autoRun) { finish(turn, 'pending'); return; }
      if (await execute(editor, turn)) return;
      // feed the error back so the model can fix its own code
      if (attempt < attempts - 1) push({ role: 'user', auto: true, text: `Der Code ist mit diesem Fehler abgebrochen: ${turn.error}\nBitte korrigiere ihn und gib das vollständige Skript erneut aus.` });
    }
  } finally { aiState.busy = false; controller = null; }
};

/** Run the code of an assistant turn as one undo step. */
export const execute = async (editor: Editor, turn: AiTurn): Promise<boolean> => {
  if (!turn.code) return false;
  turn.status = 'running';
  if (turn.lang !== 'obj') await prepareScript(turn.code); // plugins prepare their s3d extensions (fonts, OpenSCAD …)
  const facesBefore = editor.model.root.stats().faces;
  const result = runCode(editor, turn);
  if (result.ok) {
    const added = editor.model.root.stats().faces - facesBefore;
    turn.undoable = true;
    turn.result = `${added >= 0 ? '+' : ''}${added} Flächen in ${result.durationMs.toFixed(0)} ms` + (result.logs.length ? ' · ' + result.logs.map(log => log.text).join(' · ') : '');
    finish(turn, 'done');
    return true;
  }
  turn.error = result.error?.split('\n')[0] ?? 'Unbekannter Fehler';
  finish(turn, 'error');
  return false;
};

export const stop = () => { controller?.abort(); };
export const clearChat = () => { newSession(aiConfig.model); };
