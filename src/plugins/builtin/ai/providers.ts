import { reactive, watch } from 'vue';
import { t, formatNumber } from '../../../i18n';
import { RECOMMENDED_QUANT } from './hfsearch';

export type ProviderId = 'ollama' | 'lmstudio' | 'litellm' | 'custom';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  kind: 'openai';
  baseUrl: string;
  needsKey: boolean;
  local: boolean;
  blurb: string;
  setup: string[];
  suggested: string[];
}

/** Local servers only – all speak the OpenAI-compatible chat API (incl. Ollama's /v1 and LiteLLM). */
/** name, blurb and setup are message keys */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'ollama',
    name: 'ai.providers.ollama.name',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    local: true,
    blurb: 'ai.providers.ollama.blurb',
    setup: ['ai.providers.ollama.setup1', 'ai.providers.ollama.setup2', 'ai.providers.ollama.setup3'],
    suggested: ['hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M', 'qwen2.5-coder:7b', 'qwen3:8b', 'qwen2.5-coder:14b', 'llama3.1:8b'],
  },
  {
    id: 'lmstudio',
    name: 'ai.providers.lmstudio.name',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    blurb: 'ai.providers.lmstudio.blurb',
    setup: ['ai.providers.lmstudio.setup1', 'ai.providers.lmstudio.setup2', 'ai.providers.testConnection'],
    suggested: [],
  },
  {
    id: 'litellm',
    name: 'LiteLLM-Proxy',
    kind: 'openai',
    baseUrl: 'http://localhost:4000/v1',
    needsKey: false,
    local: true,
    blurb: 'ai.providers.litellm.blurb',
    setup: ['ai.providers.litellm.setup1', 'ai.providers.litellm.setup2', 'ai.providers.testConnection'],
    suggested: [],
  },
  {
    id: 'custom',
    name: 'ai.providers.custom.name',
    kind: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    needsKey: false,
    local: true,
    blurb: 'ai.providers.custom.blurb',
    setup: ['ai.providers.custom.setup1', 'ai.providers.testConnection'],
    suggested: [],
  },
];

export interface AiConfig {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  configured: boolean;
  autoRun: boolean;
  /** fast mode: short system prompt, small context, short answers – for slow (CPU-only) machines */
  fast: boolean;
}

const KEY = 's3d:ai';
const load = (): AiConfig => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored && PROVIDERS.some((provider) => provider.id === stored.provider)) {
      return { autoRun: true, fast: false, ...stored };
    }
  } catch {
    /* storage unavailable */
  }
  return { provider: 'ollama', baseUrl: PROVIDERS[0].baseUrl, apiKey: '', model: '', configured: false, autoRun: true, fast: false };
};
export const aiConfig = reactive<AiConfig>(load());
watch(
  aiConfig,
  (config) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
  },
  { deep: true },
);

export const providerInfo = (id: ProviderId) => PROVIDERS.find((provider) => provider.id === id)!;

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * fetch that falls back to the Vite dev proxy (/__ai_proxy) when the browser blocks the request
 * (CORS). The proxy only exists while running `npm run dev`.
 */
const aiFetch = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!import.meta.env.DEV || init.signal?.aborted) {
      throw error;
    }
    return proxyFetch(url, init);
  }
};

const proxyFetch = (url: string, init: RequestInit) => {
  const headers = new Headers(init.headers);
  headers.set('x-ai-target', url);
  return fetch('/__ai_proxy', { ...init, headers });
};

/**
 * For Ollama's native streams (application/x-ndjson): web filters such as Sophos hold those back until the
 * response is complete, so no progress or text shows up. In dev the proxy re-labels them as text/event-stream,
 * which these filters pass through.
 */
const ndjsonFetch = (url: string, init: RequestInit) => (import.meta.env.DEV ? proxyFetch(url, init) : aiFetch(url, init));

const openaiHeaders = (cfg: AiConfig): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  return headers;
};

/** Available model ids for the configured provider. */
export const listModels = async (cfg: AiConfig): Promise<string[]> => {
  const response = await aiFetch(cfg.baseUrl.replace(/\/$/, '') + '/models', { headers: openaiHeaders(cfg) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = await response.json();
  return (data.data ?? data.models ?? [])
    .map((model: any) => model.id ?? model.name)
    .filter(Boolean)
    .sort();
};

/** "Qwen3-4B-GGUF:Q4_K_M" → "Q4_K_M", "qwen2.5-coder:7b-instruct-q8_0" → "Q8_0", "…-fp16" → "F16" */
export const quantFromName = (name: string): string | null => {
  const match = name.match(/[:-](i?q\d[a-z0-9_]*|bf16|fp16|f16|f32)$/i);
  return match ? match[1].toUpperCase().replace(/^FP16$/, 'F16') : null;
};

/**
 * Quantization of every installed model (lower-case name without ":latest" → "Q4_K_M"). Only Ollama tells it
 * (/api/tags); models pulled from Hugging Face report "unknown" there, so their name is used instead.
 */
export const listQuants = async (cfg: AiConfig): Promise<Record<string, string>> => {
  if (cfg.provider !== 'ollama') {
    return {};
  }
  try {
    const tags = await (await aiFetch(ollamaRoot(cfg) + '/api/tags', {})).json();
    const quants: Record<string, string> = {};
    for (const model of tags.models ?? []) {
      const level: string | undefined = model.details?.quantization_level;
      const quant = level && level !== 'unknown' ? level.toUpperCase() : quantFromName(model.name);
      if (quant) {
        quants[normModel(model.name)] = quant;
      }
    }
    return quants;
  } catch {
    return {};
  }
};

/** Model names as Ollama compares them: case-insensitive, ":latest" is the default tag. */
export const normModel = (name: string) => name.toLowerCase().replace(/:latest$/, '');

/** Stream a chat completion; calls onText for every text delta and resolves with the full answer. */
export interface ChatOptions {
  numCtx?: number;
  numPredict?: number;
  temperature?: number;
  /** keep a cut-off answer instead of failing (LLaMA-Mesh: a partial mesh is still usable) */
  allowTruncated?: boolean;
  /** start of the answer the model continues from (Ollama only) – not part of the returned text */
  prefill?: string;
}

/** Ollama's native chat API – the only way to set a larger context window (default is just 2048 tokens). */
const chatOllama = async (
  cfg: AiConfig,
  system: string,
  messages: ChatMsg[],
  onText: (text: string) => void,
  signal: AbortSignal,
  chatOptions: ChatOptions,
): Promise<string> => {
  const options: Record<string, number> = { num_ctx: chatOptions.numCtx ?? 16384 };
  if (chatOptions.temperature != null) {
    options.temperature = chatOptions.temperature;
  }
  if (chatOptions.numPredict != null) {
    options.num_predict = chatOptions.numPredict;
  }
  const msgs = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages,
    ...(chatOptions.prefill ? [{ role: 'assistant', content: chatOptions.prefill }] : []),
  ];
  const response = await ndjsonFetch(ollamaRoot(cfg) + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ model: cfg.model, stream: true, messages: msgs, options }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '',
    full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf
        .slice(0, i)
        .trim()
        .replace(/^data: ?/, ''); // dev proxy sends ndjson as SSE
      buf = buf.slice(i + 1);
      if (!line) {
        continue;
      }
      const data = JSON.parse(line);
      if (data.error) {
        throw new Error(data.error);
      }
      const text = data.message?.content;
      if (text) {
        full += text;
        onText(text);
      }
      if (data.done && data.done_reason === 'length' && !chatOptions.allowTruncated) {
        throw new Error(t('ai.errors.truncated'));
      }
    }
  }
  return full;
};

export const chat = async (
  cfg: AiConfig,
  system: string,
  messages: ChatMsg[],
  onText: (text: string) => void,
  signal: AbortSignal,
  opts: ChatOptions = {},
): Promise<string> => {
  if (cfg.provider === 'ollama') {
    return chatOllama(cfg, system, messages, onText, signal, opts);
  }
  const response = await aiFetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: openaiHeaders(cfg),
    signal,
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: opts.temperature ?? 0.2,
      ...(opts.numPredict ? { max_tokens: opts.numPredict } : {}),
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '',
    full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) {
        continue;
      }
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        continue;
      }
      let choice;
      try {
        choice = JSON.parse(data).choices?.[0];
      } catch {
        continue; // partial line
      }
      const text = choice?.delta?.content;
      if (text) {
        full += text;
        onText(text);
      }
      if (choice?.finish_reason === 'length' && !opts.allowTruncated) {
        throw new Error(t('ai.errors.truncated'));
      }
    }
  }
  return full;
};

/** Human-readable error message. */
export const describeError = (error: unknown): string => {
  const message = (error as Error)?.message ?? String(error);
  if (/HTTP 404/.test(message)) {
    return t('ai.errors.notFound');
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return t('ai.errors.unreachable');
  }
  return message;
};

/** How the assistant talks to a model: "code" writes s3d-API scripts, "mesh" returns OBJ meshes (LLaMA-Mesh). */
export type ModelMode = 'code' | 'mesh';

export interface ModelPreset {
  id: string;
  label: string;
  mode: ModelMode;
  /** download size in GB (of the Q4_K_M variant) */ size: number;
  note: string;
  pull?: string;
  fast?: boolean;
  /** quantizations to choose from in the wizard (Q4_K_M = id / pull) and the name to pull for one of them */
  quants?: { list: string[]; tag: (quant: string) => string };
}

/** Rough bits per weight – estimates the download size of a quantization from the Q4_K_M one. */
const QUANT_BITS: Record<string, number> = { Q3_K_M: 3.9, Q4_K_M: 4.85, Q5_K_M: 5.7, Q6_K: 6.6, Q8_0: 8.5, F16: 16 };
const QUANTS = Object.keys(QUANT_BITS);

/** Ollama library tags spell quants in lower case ("…-instruct-q5_K_M", "…-fp16"). */
const ollamaTag = (prefix: string) => (quant: string) => prefix + (quant === 'F16' ? 'fp16' : 'q' + quant.slice(1));
const hfTag = (repo: string) => (quant: string) => `hf.co/${repo}:${quant}`;

/** Free local models that work well (Ollama names). */
/** label (text or key) and note (key) are read with localize/t; size in GB */
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'llama-mesh',
    pull: 'hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M',
    label: 'LLaMA-Mesh 8B',
    mode: 'mesh',
    size: 4.9,
    note: 'ai.presets.llamaMesh',
    quants: { list: QUANTS.slice(0, -1), tag: hfTag('bartowski/LLaMA-Mesh-GGUF') },
  },
  {
    id: 'qwen2.5-coder:3b',
    label: 'ai.presets.qwen3bLabel',
    mode: 'code',
    size: 1.9,
    fast: true,
    note: 'ai.presets.qwen3b',
    quants: { list: QUANTS, tag: ollamaTag('qwen2.5-coder:3b-instruct-') },
  },
  {
    id: 'qwen2.5-coder:7b',
    label: 'Qwen2.5-Coder 7B',
    mode: 'code',
    size: 4.7,
    note: 'ai.presets.qwen7b',
    quants: { list: QUANTS, tag: ollamaTag('qwen2.5-coder:7b-instruct-') },
  },
  {
    id: 'qwen2.5-coder:14b',
    label: 'Qwen2.5-Coder 14B',
    mode: 'code',
    size: 9.0,
    note: 'ai.presets.qwen14b',
    quants: { list: QUANTS, tag: ollamaTag('qwen2.5-coder:14b-instruct-') },
  },
  {
    id: 'qwen3:8b',
    label: 'Qwen3 8B',
    mode: 'code',
    size: 5.2,
    note: 'ai.presets.qwen3',
    quants: { list: ['Q4_K_M', 'Q8_0', 'F16'], tag: ollamaTag('qwen3:8b-') },
  },
  {
    id: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    mode: 'code',
    size: 4.9,
    note: 'ai.presets.llama31',
    quants: { list: QUANTS, tag: ollamaTag('llama3.1:8b-instruct-') },
  },
];

/** One quantization of a preset: `pull` is downloaded, `name` is the model the chat uses (LLaMA-Mesh: always its alias). */
export interface PresetVariant {
  quant: string;
  pull: string;
  name: string;
  /** download size in GB – estimated for all but Q4_K_M */
  size: number;
  estimated: boolean;
}

export const presetVariants = (preset: ModelPreset): PresetVariant[] =>
  (preset.quants?.list ?? [RECOMMENDED_QUANT]).map((quant) => {
    if (quant === RECOMMENDED_QUANT) {
      return { quant, pull: preset.pull ?? preset.id, name: preset.id, size: preset.size, estimated: false };
    }
    const pull = preset.quants!.tag(quant);
    const size = Math.round(((preset.size * QUANT_BITS[quant]) / QUANT_BITS[RECOMMENDED_QUANT]) * 10) / 10;
    return { quant, pull, name: preset.mode === 'mesh' ? MESH_ALIAS : pull, size, estimated: true };
  });

/** Small models (≤ 3B) are only worth it for speed – switching to one turns fast mode on. */
export const isSmallModel = (model: string) =>
  MODEL_PRESETS.some((preset) => preset.fast && preset.id === model) || /[:-](0\.5|1\.5|1\.7|1|2|3)b\b/i.test(model);
watch(
  () => aiConfig.model,
  (model, old) => {
    if (model && model !== old && isSmallModel(model)) {
      aiConfig.fast = true;
    }
    if (old && model !== old) {
      void unloadModel(aiConfig, old);
    }
  },
);

/**
 * Ollama keeps every used model in RAM for 5 minutes (and several at once) – on a switch the old one
 * is released right away (keep_alive 0). It only frees memory; the model stays on disk.
 */
export const unloadModel = async (cfg: AiConfig, model: string) => {
  if (cfg.provider !== 'ollama') {
    return;
  }
  // LLaMA-Mesh actually runs under its alias (see ensureMeshModel)
  const names = modeFor(model) === 'mesh' ? [model, MESH_ALIAS] : [model];
  for (const name of names) {
    try {
      await aiFetch(ollamaRoot(cfg) + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name, keep_alive: 0 }),
      });
    } catch {
      /* server offline or model unknown – nothing to free */
    }
  }
};

export const modeFor = (model: string): ModelMode => {
  return /mesh/i.test(model) ? 'mesh' : 'code';
};

/** Ollama's native API root (…/v1 stripped). */
export const ollamaRoot = (cfg: AiConfig) => {
  return cfg.baseUrl.replace(/\/v1\/?$/, '');
};

export interface PullProgress {
  status: string; // status text in the current language
  phase: 'start' | 'download' | 'verify' | 'done';
  completed: number; // bytes over all layers
  total: number; // bytes over all layers (grows while new layers are announced)
  frac: number; // 0..1
  speed: number; // bytes/s (smoothed)
  eta: number | null; // seconds remaining
}

const PULL_STATUS: [RegExp, string, PullProgress['phase']][] = [
  [/^pulling manifest/, 'ai.pull.manifest', 'start'],
  [/^pulling /, 'ai.pull.download', 'download'],
  [/^verifying/, 'ai.pull.verify', 'verify'],
  [/^writing manifest/, 'ai.pull.write', 'verify'],
  [/^success/, 'ai.pull.done', 'done'],
];

/**
 * Ollama reports at least every few seconds. Silence for this long means something between Ollama and the
 * browser (virus scanner / web filter such as Sophos) holds the stream back – Ollama keeps downloading anyway.
 */
const PULL_SILENT_MS = 15_000;

/** Download a model through Ollama (POST /api/pull) – sums all layers and estimates speed and remaining time. */
export const pullModel = async (cfg: AiConfig, name: string, onProgress: (progress: PullProgress) => void, signal?: AbortSignal) => {
  let last: PullProgress = { status: t('ai.pull.start'), phase: 'start', completed: 0, total: 0, frac: 0, speed: 0, eta: null };
  const report = (progress: PullProgress) => {
    last = progress;
    onProgress(progress);
    watchSilence();
  };
  let silenceTimer = 0;
  const watchSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = window.setTimeout(() => onProgress({ ...last, status: t('ai.pull.buffered'), speed: 0, eta: null }), PULL_SILENT_MS);
  };
  watchSilence();
  try {
    const response = await ndjsonFetch(ollamaRoot(cfg) + '/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, stream: true }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    await readPullStream(response.body.getReader(), report);
  } finally {
    clearTimeout(silenceTimer);
  }
};

const readPullStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, onProgress: (progress: PullProgress) => void) => {
  const layers = new Map<string, { completed: number; total: number }>();
  let speed = 0,
    lastT = performance.now(),
    lastBytes = 0;
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf
        .slice(0, i)
        .trim()
        .replace(/^data: ?/, ''); // dev proxy sends ndjson as SSE
      buf = buf.slice(i + 1);
      if (!line) {
        continue;
      }
      const data = JSON.parse(line);
      if (data.error) {
        throw new Error(data.error);
      }
      if (data.digest && data.total) {
        layers.set(data.digest, { completed: data.completed ?? 0, total: data.total });
      }
      let completed = 0,
        total = 0;
      for (const layer of layers.values()) {
        completed += layer.completed;
        total += layer.total;
      }
      const now = performance.now(),
        elapsed = (now - lastT) / 1000;
      if (elapsed >= 0.5) {
        const inst = Math.max(0, completed - lastBytes) / elapsed;
        speed = speed ? speed * 0.7 + inst * 0.3 : inst;
        lastT = now;
        lastBytes = completed;
      }
      const statusText = String(data.status ?? '');
      const match = PULL_STATUS.find(([pattern]) => pattern.test(statusText));
      onProgress({
        status: match ? t(match[1]) : statusText,
        phase: match?.[2] ?? 'download',
        completed,
        total,
        frac: match?.[2] === 'done' ? 1 : total ? completed / total : 0,
        speed,
        eta: speed > 0 && total ? (total - completed) / speed : null,
      });
    }
  }
};

/** Running downloads (kept outside the wizard so they survive closing it). */
export const downloads = reactive<Record<string, PullProgress & { error?: string; ctrl: AbortController }>>({});

export const startDownload = async (cfg: AiConfig, pullName: string, name = pullName): Promise<boolean> => {
  if (downloads[name] && !downloads[name].error) {
    return false;
  }
  const ctrl = new AbortController();
  downloads[name] = { status: t('ai.pull.start'), phase: 'start', completed: 0, total: 0, frac: 0, speed: 0, eta: null, ctrl };
  try {
    await pullModel({ ...cfg }, pullName, (progress) => Object.assign(downloads[name], progress), ctrl.signal);
    delete downloads[name];
    return true;
  } catch (error) {
    if (ctrl.signal.aborted) {
      delete downloads[name];
      return false;
    }
    downloads[name].error = describeError(error);
    return false;
  }
};
export const cancelDownload = (name: string) => {
  downloads[name]?.ctrl.abort();
};

export const fmtBytes = (bytes: number): string => {
  if (bytes >= 1e9) {
    return formatNumber(bytes / 1e9, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' GB';
  }
  if (bytes >= 1e6) {
    return formatNumber(bytes / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB';
  }
  return Math.round(bytes / 1e3) + ' kB';
};
export const fmtDuration = (seconds: number | null): string => {
  if (seconds == null || !isFinite(seconds)) {
    return t('ai.eta.unknown');
  }
  if (seconds < 60) {
    return t('ai.eta.seconds', { seconds: Math.max(1, Math.round(seconds)) });
  }
  const minutes = Math.floor(seconds / 60),
    rest = Math.round(seconds % 60);
  if (minutes < 60) {
    return t('ai.eta.minutes', { minutes, seconds: rest });
  }
  return t('ai.eta.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
};

// ------------------------------------------------------------------ LLaMA-Mesh fix
export const MESH_SOURCE = 'hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M';
export const MESH_ALIAS = 'llama-mesh';
/** Plain Llama-3 chat template. Ollama 0.6 wrongly assigns the Llama-Guard template to this GGUF (answers "Safe."). */
const LLAMA3_TEMPLATE = `{{- range .Messages }}<|start_header_id|>{{ .Role }}<|end_header_id|>

{{ .Content }}<|eot_id|>
{{- end }}<|start_header_id|>assistant<|end_header_id|>

`;

/**
 * Make sure the "llama-mesh" alias with the correct template exists (no download – reuses the weights).
 * `from` (re)points it at that download – how the wizard switches the quantization.
 */
export const ensureMeshModel = async (cfg: AiConfig, from?: string): Promise<string> => {
  const tags = await (await aiFetch(ollamaRoot(cfg) + '/api/tags', {})).json();
  const names: string[] = (tags.models ?? []).map((model: any) => model.name);
  if (!from && names.some((candidate) => candidate === MESH_ALIAS || candidate === MESH_ALIAS + ':latest')) {
    return MESH_ALIAS;
  }
  const src = from ?? names.find((candidate) => /llama-mesh/i.test(candidate) && normModel(candidate) !== MESH_ALIAS);
  if (!src) {
    throw new Error(t('ai.errors.noMeshModel'));
  }
  const response = await aiFetch(ollamaRoot(cfg) + '/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MESH_ALIAS,
      from: src,
      template: LLAMA3_TEMPLATE,
      stream: false,
      parameters: { num_ctx: 8192, num_predict: 7000, temperature: 0.9, top_p: 0.9, stop: ['<|eot_id|>', '<|start_header_id|>'] },
    }),
  });
  if (!response.ok) {
    throw new Error(t('ai.errors.createMesh', { error: (await response.text()).slice(0, 200) }));
  }
  return MESH_ALIAS;
};
