import { prepareScript } from '../../../scripting/languages';
import * as THREE from 'three';
import { reactive } from 'vue';
import type { Editor } from '../../../engine/editor';
import { runScriptAsync, runJson, type RunResult } from '../../../scripting/api';
import { aiConfig, chat, describeError, modeFor, ensureMeshModel, type ChatMsg } from './providers';
import { buildSystemPrompt, buildFastPrompt } from './prompt';
import { currentSession, newSession, touch } from './history';
import { importObj } from '../../../scripting/mesh';
import { parseLength } from '../../../core/units';
import { t } from '../../../i18n';

export interface AiTurn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string; // reasoning of thinking models (<think>…</think>), shown collapsed
  createdAt: number; // created (ms since epoch)
  endedAt?: number; // finished (assistant turns)
  model?: string;
  code?: string;
  lang?: 'js' | 'json' | 'obj';
  status?: 'streaming' | 'running' | 'done' | 'error' | 'stopped' | 'pending';
  result?: string;
  error?: string;
  undoable?: boolean;
  auto?: boolean;
  targetSize?: number;
  /** pictures the user sent with the message (data URLs, scaled down) */
  images?: string[];
  /** what this turn's code built: the ids of the groups it added to the model */
  built?: number[];
  /** a change of an earlier result: the groups that are taken out when this code runs (in the same undo step) */
  replaces?: number[];
}

/** Turns always come from the current session of the history. */
export const aiState = reactive({
  busy: false,
  get turns(): AiTurn[] {
    return currentSession().turns;
  },
});
let controller: AbortController | null = null;
const nextId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

const push = (turnData: Omit<AiTurn, 'id' | 'createdAt'> & Partial<Pick<AiTurn, 'createdAt'>>): AiTurn => {
  const session = currentSession();
  session.turns.push({ id: nextId(), createdAt: Date.now(), ...turnData } as AiTurn);
  touch(session, aiConfig.model);
  return session.turns[session.turns.length - 1]; // the reactive proxy
};
const finish = (turn: AiTurn, status: AiTurn['status']) => {
  turn.status = status;
  turn.endedAt = Date.now();
  touch(currentSession(), aiConfig.model);
};

/** Short description of what is in the model so the assistant can refer to it. */
// i18n-ignore-start – the scene summary is part of the prompt for the model, not shown in the UI
const sceneSummary = (editor: Editor, maxObjects = 40, skipPeople = false): string => {
  const lines: string[] = [];
  const bounds = editor.model.bounds();
  if (bounds.isEmpty()) {
    return 'Das Modell ist leer.';
  }
  lines.push(
    `Modellgrenzen: x ${bounds.min.x.toFixed(2)}…${bounds.max.x.toFixed(2)}, y ${bounds.min.y.toFixed(2)}…${bounds.max.y.toFixed(2)}, z ${bounds.min.z.toFixed(2)}…${bounds.max.z.toFixed(2)} m`,
  );
  for (const instance of [...editor.model.root.instances.values()]
    .filter((x) => !(skipPeople && x.definition.faceMe))
    .slice(0, maxObjects)) {
    const box = instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone());
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    lines.push(
      `- ${instance.name || instance.definition.name}${instance.definition.faceMe ? ' (Referenzperson)' : ''}: Mitte [${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}], Größe ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m${instance.material ? `, Material ${instance.material}` : ''}`,
    );
  }
  if (editor.model.root.faces.size) {
    lines.push(`Lose Geometrie außerhalb von Gruppen: ${editor.model.root.faces.size} Flächen.`);
  }
  if (editor.model.materials.length) {
    lines.push(
      'Vorhandene Materialien: ' +
        editor.model.materials
          .map((material) => material.name + (material.texture ? ` (${material.texture})` : ''))
          .slice(0, 30)
          .join(', '),
    );
  }
  return lines.join('\n');
};
// i18n-ignore-end

/**
 * Thinking models (Qwen3, DeepSeek-R1 …) write their reasoning as <think>…</think> before the answer.
 * Qwen3 templates put the opening tag into the prompt, so the output starts with the bare reasoning –
 * `stillThinking` treats text without a closing tag as reasoning (while a thinking model streams).
 */
export const splitThinking = (raw: string, stillThinking = false): { thinking: string; text: string } => {
  const start = raw.indexOf('<think>'),
    end = raw.indexOf('</think>');
  if (end >= 0) {
    return { thinking: raw.slice(start >= 0 && start < end ? start + 7 : 0, end).trim(), text: raw.slice(end + 8).trimStart() };
  }
  if (start >= 0 && !raw.slice(0, start).trim()) {
    return { thinking: raw.slice(start + 7).trim(), text: '' };
  }
  return stillThinking ? { thinking: raw.trim(), text: '' } : { thinking: '', text: raw };
};

/** Prefilled start of the answer: an empty reasoning block makes Qwen3 answer right away. */
const SKIP_THINKING = '<think>\n\n</think>\n\n';

/** Models that think before answering – the thinking counts against the token limit. */
const isThinkingModel = (model: string) => /qwen3(?!-coder)|deepseek-r1|qwq|think|reason|magistral/i.test(model);

/** Extract the first ```js / ```json code block. */
export const extractCode = (text: string): { code: string; lang: 'js' | 'json' | 'obj' } | null => {
  const match = text.match(/```(js|javascript|ts|json)?\s*\n([\s\S]*?)```/i);
  if (!match) {
    return null;
  }
  const lang = (match[1] ?? '').toLowerCase() === 'json' ? 'json' : 'js';
  return { code: match[2].trim(), lang };
};

/** Recent conversation (the assistant sees its own code and the execution results). */
const history = (limit = 12): ChatMsg[] => {
  const out: ChatMsg[] = [];
  const turns = aiState.turns.slice(-limit);
  // pictures only with the last two messages that have some – they are large and the newest are what counts
  const withPictures = new Set(
    turns
      .filter((turn) => turn.images?.length)
      .slice(-2)
      .map((turn) => turn.id),
  );
  for (const turn of turns) {
    if (turn.status === 'streaming') {
      continue;
    }
    if (turn.role === 'user') {
      out.push({ role: 'user', content: turn.text, ...(withPictures.has(turn.id) ? { images: turn.images } : {}) });
    } else {
      const code = turn.code && turn.lang !== 'obj' ? `\n\`\`\`${turn.lang ?? 'js'}\n${turn.code}\n\`\`\`` : '';
      out.push({
        role: 'assistant',
        content:
          turn.text +
          code +
          (turn.error ? `\n\n[Ausführung fehlgeschlagen: ${turn.error}]` : turn.result ? `\n\n[Ausgeführt: ${turn.result}]` : ''),
      });
    }
  }
  return out;
};

/** Runs the code of an assistant turn: OBJ import / declarative JSON on the main thread, JavaScript in the worker. */
const runCode = async (editor: Editor, turn: AiTurn): Promise<RunResult> => {
  if (turn.lang === 'obj') {
    return importObj(editor, turn.code!, { size: turn.targetSize ?? 1, name: t('ai.agent.objectName'), label: 'ai.undoLabel' });
  }
  return turn.lang === 'json' ? runJson(editor, turn.code!) : runScriptAsync(editor, turn.code!, 'ai.undoLabel');
};

// ------------------------------------------------------------------ mesh models (LLaMA-Mesh)
/** LLaMA-Mesh was fine-tuned on short English prompts – this is the phrasing from its demo. */
const meshPrompt = (description: string) => `Create a 3D obj file using the following description: ${description}`;

const sendMesh = async (editor: Editor, prompt: string) => {
  const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model });
  let raw = '';
  try {
    const model = await ensureMeshModel(aiConfig);
    raw = await chat(
      { ...aiConfig, model },
      '',
      [{ role: 'user', content: meshPrompt(prompt) }],
      (chunk) => {
        raw += chunk;
        const vertexCount = (raw.match(/^v\s/gm) ?? []).length,
          faceCount = (raw.match(/^f\s/gm) ?? []).length;
        turn.text = vertexCount || faceCount ? t('ai.agent.meshProgress', { vertices: vertexCount, faces: faceCount }) : raw.slice(-400);
      },
      controller!.signal,
      { numCtx: 8192, numPredict: 7000, temperature: 0.9, allowTruncated: true },
    );
  } catch (error) {
    if (controller?.signal.aborted) {
      finish(turn, 'stopped');
      return;
    }
    turn.error = describeError(error);
    finish(turn, 'error');
    return;
  }
  const obj = raw
    .split(/\r?\n/)
    .filter((line) => /^\s*(v|f)\s/.test(line))
    .join('\n');
  if (!/^\s*f\s/m.test(obj)) {
    turn.text = raw.trim().slice(0, 800);
    turn.error = t('ai.agent.noMesh');
    finish(turn, 'error');
    return;
  }
  turn.code = obj;
  turn.lang = 'obj';
  const size = prompt.match(/(\d+(?:[.,]\d+)?\s*(?:mm|cm|m))/i);
  turn.text = size ? t('ai.agent.meshForSized', { prompt, size: size[1] }) : t('ai.agent.meshFor', { prompt });
  turn.targetSize = size ? (parseLength(size[1], 'm') ?? 1) : 1;
  if (!aiConfig.autoRun) {
    finish(turn, 'pending');
    return;
  }
  await execute(editor, turn);
};

// ------------------------------------------------------------------ changing what was built
/** the groups of a turn that are still in the model */
const stillThere = (editor: Editor, ids: number[] = []) => ids.filter((id) => editor.model.root.instances.has(id));

/**
 * The result a new message changes: the last JavaScript the assistant built whose groups are still in the model –
 * null when there is none (then a message builds something new).
 */
export const changeTarget = (editor: Editor): AiTurn | null => {
  for (const turn of [...aiState.turns].reverse()) {
    if (turn.role === 'assistant' && turn.code && turn.lang === 'js' && stillThere(editor, turn.built).length) {
      return turn;
    }
  }
  return null;
};

/** the names of a turn's groups in the model – shown above the input */
export const builtNames = (editor: Editor, turn: AiTurn) =>
  stillThere(editor, turn.built).map((id) => {
    const instance = editor.model.root.instances.get(id)!;
    return instance.name || instance.definition.name;
  });

export interface SendOptions {
  /** pictures to send along (data URLs) */
  images?: string[];
  /** change the last result instead of building something new next to it */
  change?: boolean;
}

// ------------------------------------------------------------------ main entry
export const send = async (editor: Editor, prompt: string, options: SendOptions = {}) => {
  if (aiState.busy || !prompt.trim()) {
    return;
  }
  const target = options.change ? changeTarget(editor) : null;
  const replaces = target ? stillThere(editor, target.built) : undefined;
  push({ role: 'user', text: prompt.trim(), ...(options.images?.length ? { images: options.images } : {}) });
  aiState.busy = true;
  controller = new AbortController();
  try {
    if (modeFor(aiConfig.model) === 'mesh') {
      await sendMesh(editor, prompt.trim());
      return;
    }
    // fast mode: ~700-token prompt, small context window, capped answer, one auto-fix at most
    const fast = aiConfig.fast;
    const thinker = isThinkingModel(aiConfig.model);
    const attempts = fast ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const turn = push({ role: 'assistant', text: '', status: 'streaming', model: aiConfig.model, replaces });
      const change = target ? { code: target.code!, names: builtNames(editor, target) } : undefined;
      const pictures = aiState.turns.some((candidate) => candidate.images?.length);
      const system = fast
        ? buildFastPrompt(sceneSummary(editor, 8, true), { change, pictures })
        : buildSystemPrompt(sceneSummary(editor), { change, pictures });
      // fast mode: skip the reasoning (minutes on a CPU – and it would use up the 900-token cap on its own)
      const opts = fast
        ? { numCtx: 4096, numPredict: 900, temperature: 0.2, prefill: thinker ? SKIP_THINKING : undefined }
        : { numCtx: 16384, temperature: 0.2 };
      const thinks = thinker && !fast;
      let raw = '';
      const show = (streaming = true) => {
        const parts = splitThinking(raw, thinks && streaming);
        turn.thinking = parts.thinking || undefined;
        turn.text = parts.text;
      };
      try {
        raw = await chat(
          aiConfig,
          system,
          history(fast ? 4 : 12),
          (chunk) => {
            raw += chunk;
            show();
          },
          controller.signal,
          opts,
        );
        show(false);
      } catch (error) {
        if (controller.signal.aborted) {
          finish(turn, 'stopped');
          return;
        }
        turn.error = describeError(error);
        finish(turn, 'error');
        return;
      }
      let block = extractCode(turn.text);
      // a general model may also answer with an OBJ mesh
      if (block && /^v\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+/m.test(block.code) && /^f\s/m.test(block.code)) {
        block = { code: block.code, lang: 'obj' };
      }
      if (!block) {
        finish(turn, 'done');
        return;
      }
      turn.code = block.code;
      turn.lang = block.lang;
      turn.text = turn.text.replace(/```[\s\S]*?```/, '').trim();
      if (!aiConfig.autoRun) {
        finish(turn, 'pending');
        return;
      }
      if (await execute(editor, turn)) {
        return;
      }
      // feed the error back so the model can fix its own code
      if (attempt < attempts - 1) {
        push({
          role: 'user',
          auto: true,
          text: `Der Code ist mit diesem Fehler abgebrochen: ${turn.error}\nBitte korrigiere ihn und gib das vollständige Skript erneut aus.`,
        });
      } // i18n-ignore – message to the model
    }
  } finally {
    aiState.busy = false;
    controller = null;
  }
};

/** Run the code of an assistant turn as one undo step. */
export const execute = async (editor: Editor, turn: AiTurn): Promise<boolean> => {
  if (!turn.code) {
    return false;
  }
  turn.status = 'running';
  if (turn.lang !== 'obj') {
    await prepareScript(turn.code);
  } // plugins prepare their s3d extensions (fonts, OpenSCAD …)
  // a change takes out what it replaces – and running the same code again replaces what it built the last time –
  // in the same undo step, by a first line of the script
  const takeOut = turn.lang === 'js' ? [...new Set([...stillThere(editor, turn.replaces), ...stillThere(editor, turn.built)])] : [];
  const code = turn.code;
  const facesBefore = editor.model.root.stats().faces;
  const idsBefore = new Set(editor.model.root.instances.keys());
  const result = takeOut.length
    ? await runCode(editor, {
        ...turn,
        code: `for (const id of ${JSON.stringify(takeOut)}) s3d.editor.model.root.instances.delete(id);\n${code}`,
      })
    : await runCode(editor, turn);
  if (result.ok) {
    const added = editor.model.root.stats().faces - facesBefore;
    turn.built = [...editor.model.root.instances.keys()].filter((id) => !idsBefore.has(id));
    turn.undoable = true;
    turn.result =
      (takeOut.length
        ? t('ai.agent.changed', { count: takeOut.length, ms: Math.round(result.durationMs) })
        : t('ai.agent.result', { faces: `${added >= 0 ? '+' : ''}${added}`, ms: Math.round(result.durationMs) })) +
      (result.logs.length ? ' · ' + result.logs.map((log) => log.text).join(' · ') : '');
    finish(turn, 'done');
    return true;
  }
  turn.error = result.error?.split('\n')[0] ?? t('ai.agent.unknownError');
  finish(turn, 'error');
  return false;
};

export const stop = () => {
  controller?.abort();
};
export const clearChat = () => {
  newSession(aiConfig.model);
};
