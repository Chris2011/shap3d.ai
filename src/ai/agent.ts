import * as THREE from 'three';
import { reactive } from 'vue';
import type { Editor } from '../engine/editor';
import { runScript, runJson, type RunResult } from '../scripting/api';
import { aiConfig, chat, describeError, modeFor, ensureMeshModel, type ChatMsg } from './providers';
import { buildSystemPrompt, buildFastPrompt } from './prompt';
import { currentSession, newSession, touch } from './history';
import { importObj } from '../scripting/mesh';
import { parseLength } from '../core/units';

export interface AiTurn {
  id: number; role: 'user' | 'assistant'; text: string;
  ts: number;            // created (ms since epoch)
  endTs?: number;        // finished (assistant turns)
  model?: string;
  code?: string; lang?: 'js' | 'json' | 'obj';
  status?: 'streaming' | 'running' | 'done' | 'error' | 'stopped' | 'pending';
  result?: string; error?: string; undoable?: boolean; auto?: boolean; targetSize?: number;
}

/** Turns always come from the current session of the history. */
export const aiState = reactive({ busy: false, get turns(): AiTurn[] { return currentSession().turns; } });
let controller: AbortController | null = null;
const nextId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

function push(t: Omit<AiTurn, 'id' | 'ts'> & Partial<Pick<AiTurn, 'ts'>>): AiTurn {
  const s = currentSession();
  s.turns.push({ id: nextId(), ts: Date.now(), ...t } as AiTurn);
  touch(s, aiConfig.model);
  return s.turns[s.turns.length - 1]; // the reactive proxy
}
function finish(turn: AiTurn, status: AiTurn['status']) { turn.status = status; turn.endTs = Date.now(); touch(currentSession(), aiConfig.model); }

/** Short description of what is in the model so the assistant can refer to it. */
function sceneSummary(ed: Editor, maxObjects = 40, skipPeople = false): string {
  const lines: string[] = [];
  const b = ed.model.bounds();
  if (b.isEmpty()) return 'Das Modell ist leer.';
  lines.push(`Modellgrenzen: x ${b.min.x.toFixed(2)}…${b.max.x.toFixed(2)}, y ${b.min.y.toFixed(2)}…${b.max.y.toFixed(2)}, z ${b.min.z.toFixed(2)}…${b.max.z.toFixed(2)} m`);
  for (const i of [...ed.model.root.instances.values()].filter(x => !(skipPeople && x.def.faceMe)).slice(0, maxObjects)) {
    const bb = i.def.entities.bounds(new THREE.Box3(), i.matrix.clone());
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    lines.push(`- ${i.name || i.def.name}${i.def.faceMe ? ' (Referenzperson)' : ''}: Mitte [${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}], Größe ${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} m${i.material ? `, Material ${i.material}` : ''}`);
  }
  if (ed.model.root.faces.size) lines.push(`Lose Geometrie außerhalb von Gruppen: ${ed.model.root.faces.size} Flächen.`);
  if (ed.model.materials.length) lines.push('Vorhandene Materialien: ' + ed.model.materials.map(m => m.name + (m.texture ? ` (${m.texture})` : '')).slice(0, 30).join(', '));
  return lines.join('\n');
}

/** Extract the first ```js / ```json code block. */
export function extractCode(text: string): { code: string; lang: 'js' | 'json' | 'obj' } | null {
  const m = text.match(/```(js|javascript|ts|json)?\s*\n([\s\S]*?)```/i);
  if (!m) return null;
  const lang = (m[1] ?? '').toLowerCase() === 'json' ? 'json' : 'js';
  return { code: m[2].trim(), lang };
}

/** Recent conversation (the assistant sees its own code and the execution results). */
function history(limit = 12): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const t of aiState.turns.slice(-limit)) {
    if (t.status === 'streaming') continue;
    if (t.role === 'user') out.push({ role: 'user', content: t.text });
    else {
      const code = t.code && t.lang !== 'obj' ? `\n\`\`\`${t.lang ?? 'js'}\n${t.code}\n\`\`\`` : '';
      out.push({ role: 'assistant', content: t.text + code + (t.error ? `\n\n[Ausführung fehlgeschlagen: ${t.error}]` : t.result ? `\n\n[Ausgeführt: ${t.result}]` : '') });
    }
  }
  return out;
}

function runCode(ed: Editor, turn: AiTurn): RunResult {
  if (turn.lang === 'obj') return importObj(ed, turn.code!, { size: turn.targetSize ?? 1, name: 'KI-Objekt', label: 'KI-Assistent' });
  return turn.lang === 'json' ? runJson(ed, turn.code!) : runScript(ed, turn.code!, 'KI-Assistent');
}

// ------------------------------------------------------------------ mesh models (LLaMA-Mesh)
/** LLaMA-Mesh was fine-tuned on short English prompts – this is the phrasing from its demo. */
const meshPrompt = (p: string) => `Create a 3D obj file using the following description: ${p}`;

async function sendMesh(ed: Editor, prompt: string) {
  const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model });
  let raw = '';
  try {
    const model = await ensureMeshModel(aiConfig);
    raw = await chat({ ...aiConfig, model }, '', [{ role: 'user', content: meshPrompt(prompt) }], t => {
      raw += t; const v = (raw.match(/^v\s/gm) ?? []).length, f = (raw.match(/^f\s/gm) ?? []).length;
      turn.text = v || f ? `Erzeuge Mesh … ${v} Ecken, ${f} Flächen` : raw.slice(-400);
    }, controller!.signal, { numCtx: 8192, numPredict: 7000, temperature: 0.9 });
  } catch (e) {
    if (controller?.signal.aborted) { finish(turn, 'stopped'); return; }
    turn.error = describeError(e); finish(turn, 'error'); return;
  }
  const obj = raw.split(/\r?\n/).filter(l => /^\s*(v|f)\s/.test(l)).join('\n');
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
  execute(ed, turn);
}


// ------------------------------------------------------------------ main entry
export async function send(ed: Editor, prompt: string) {
  if (aiState.busy || !prompt.trim()) return;
  push({ role: 'user', text: prompt.trim() });
  aiState.busy = true; controller = new AbortController();
  try {
    if (modeFor(aiConfig.model) === 'mesh') { await sendMesh(ed, prompt.trim()); return; }
    // fast mode: ~700-token prompt, small context window, capped answer, one auto-fix at most
    const fast = aiConfig.fast;
    const attempts = fast ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model });
      const system = fast ? buildFastPrompt(sceneSummary(ed, 8, true)) : buildSystemPrompt(sceneSummary(ed));
      const opts = fast ? { numCtx: 4096, numPredict: 900, temperature: 0.2 } : { numCtx: 16384, temperature: 0.2 };
      try {
        const full = await chat(aiConfig, system, history(fast ? 4 : 12), t => { turn.text += t; }, controller.signal, opts);
        turn.text = full;
      } catch (e) {
        if (controller.signal.aborted) { finish(turn, 'stopped'); return; }
        turn.error = describeError(e); finish(turn, 'error'); return;
      }
      let block = extractCode(turn.text);
      // a general model may also answer with an OBJ mesh
      if (block && /^v\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+/m.test(block.code) && /^f\s/m.test(block.code)) block = { code: block.code, lang: 'obj' };
      if (!block) { finish(turn, 'done'); return; }
      turn.code = block.code; turn.lang = block.lang;
      turn.text = turn.text.replace(/```[\s\S]*?```/, '').trim();
      if (!aiConfig.autoRun) { finish(turn, 'pending'); return; }
      if (execute(ed, turn)) return;
      // feed the error back so the model can fix its own code
      if (attempt < attempts - 1) push({ role: 'user', auto: true, text: `Der Code ist mit diesem Fehler abgebrochen: ${turn.error}\nBitte korrigiere ihn und gib das vollständige Skript erneut aus.` });
    }
  } finally { aiState.busy = false; controller = null; }
}

/** Run the code of an assistant turn as one undo step. */
export function execute(ed: Editor, turn: AiTurn): boolean {
  if (!turn.code) return false;
  turn.status = 'running';
  const facesBefore = ed.model.root.stats().faces;
  const r = runCode(ed, turn);
  if (r.ok) {
    const d = ed.model.root.stats().faces - facesBefore;
    turn.undoable = true;
    turn.result = `${d >= 0 ? '+' : ''}${d} Flächen in ${r.ms.toFixed(0)} ms` + (r.logs.length ? ' · ' + r.logs.map(l => l.text).join(' · ') : '');
    finish(turn, 'done');
    return true;
  }
  turn.error = r.error?.split('\n')[0] ?? 'Unbekannter Fehler';
  finish(turn, 'error');
  return false;
}

export function stop() { controller?.abort(); }
export function clearChat() { newSession(aiConfig.model); }
