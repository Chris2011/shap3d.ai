import { reactive, watch } from 'vue';

export type ProviderId = 'ollama' | 'lmstudio' | 'litellm' | 'custom';

export interface ProviderInfo {
  id: ProviderId; name: string; kind: 'openai';
  baseUrl: string; needsKey: boolean; local: boolean;
  blurb: string; setup: string[]; suggested: string[];
}

/** Local servers only – all speak the OpenAI-compatible chat API (incl. Ollama's /v1 and LiteLLM). */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'ollama', name: 'Ollama (lokal, kostenlos)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, local: true,
    blurb: 'Läuft komplett auf deinem Rechner, ohne Konto und ohne Kosten. Ideal zum Ausprobieren.',
    setup: ['Ollama von ollama.com installieren und starten.', 'Hier auf „Verbindung testen“ klicken.', 'Im nächsten Schritt ein Modell wählen – fehlende Modelle lassen sich direkt installieren.'],
    suggested: ['hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M', 'qwen2.5-coder:7b', 'qwen3:8b', 'qwen2.5-coder:14b', 'llama3.1:8b'],
  },
  {
    id: 'lmstudio', name: 'LM Studio (lokal)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', needsKey: false, local: true,
    blurb: 'Lokale Modelle mit grafischer Oberfläche.',
    setup: ['LM Studio installieren und ein Modell herunterladen.', 'Im Reiter „Developer“ den lokalen Server starten (CORS aktivieren).', 'Verbindung testen.'],
    suggested: [],
  },
  {
    id: 'litellm', name: 'LiteLLM-Proxy', kind: 'openai', baseUrl: 'http://localhost:4000/v1', needsKey: false, local: true,
    blurb: 'Ein Proxy vor vielen Anbietern (OpenAI, Azure, Bedrock, Gemini …) mit einer Adresse.',
    setup: ['LiteLLM-Proxy starten, z. B.: litellm --model ollama/qwen2.5-coder', 'Adresse und ggf. Master-Key eintragen.', 'Verbindung testen.'],
    suggested: [],
  },
  {
    id: 'custom', name: 'Eigener Server (OpenAI-kompatibel)', kind: 'openai', baseUrl: 'http://localhost:8000/v1', needsKey: false, local: true,
    blurb: 'Jeder Dienst mit OpenAI-kompatibler Schnittstelle (vLLM, llama.cpp, Jan, …).', setup: ['Basis-URL inkl. /v1 eintragen.', 'Verbindung testen.'], suggested: [],
  },
];

export interface AiConfig { provider: ProviderId; baseUrl: string; apiKey: string; model: string; configured: boolean; autoRun: boolean;
  /** fast mode: short system prompt, small context, short answers – for slow (CPU-only) machines */
  fast: boolean }

const KEY = 's3d:ai';
const load = (): AiConfig => {
  try { const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (stored && PROVIDERS.some(provider => provider.id === stored.provider)) return { autoRun: true, fast: false, ...stored }; } catch { /* storage unavailable */ }
  return { provider: 'ollama', baseUrl: PROVIDERS[0].baseUrl, apiKey: '', model: '', configured: false, autoRun: true, fast: false };
};
export const aiConfig = reactive<AiConfig>(load());
watch(aiConfig, config => { try { localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* ignore */ } }, { deep: true });

export const providerInfo = (id: ProviderId) => PROVIDERS.find(provider => provider.id === id)!;

export interface ChatMsg { role: 'user' | 'assistant'; content: string }

/**
 * fetch that falls back to the Vite dev proxy (/__ai_proxy) when the browser blocks the request
 * (CORS). The proxy only exists while running `npm run dev`.
 */
const aiFetch = async (url: string, init: RequestInit): Promise<Response> => {
  try { return await fetch(url, init); }
  catch (error) {
    if (!import.meta.env.DEV || init.signal?.aborted) throw error;
    const headers = new Headers(init.headers); headers.set('x-ai-target', url);
    return fetch('/__ai_proxy', { ...init, headers });
  }
};

const openaiHeaders = (cfg: AiConfig): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  return headers;
};

/** Available model ids for the configured provider. */
export const listModels = async (cfg: AiConfig): Promise<string[]> => {
  const response = await aiFetch(cfg.baseUrl.replace(/\/$/, '') + '/models', { headers: openaiHeaders(cfg) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return (data.data ?? data.models ?? []).map((model: any) => model.id ?? model.name).filter(Boolean).sort();
};

/** Stream a chat completion; calls onText for every text delta and resolves with the full answer. */
export interface ChatOptions { numCtx?: number; numPredict?: number; temperature?: number }

/** Ollama's native chat API – the only way to set a larger context window (default is just 2048 tokens). */
const chatOllama = async (cfg: AiConfig, system: string, messages: ChatMsg[], onText: (text: string) => void, signal: AbortSignal, chatOptions: ChatOptions): Promise<string> => {
  const options: Record<string, number> = { num_ctx: chatOptions.numCtx ?? 16384 };
  if (chatOptions.temperature != null) options.temperature = chatOptions.temperature;
  if (chatOptions.numPredict != null) options.num_predict = chatOptions.numPredict;
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const response = await aiFetch(ollamaRoot(cfg) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ model: cfg.model, stream: true, messages: msgs, options }) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      const data = JSON.parse(line); if (data.error) throw new Error(data.error);
      const text = data.message?.content; if (text) { full += text; onText(text); }
    }
  }
  return full;
};

export const chat = async (cfg: AiConfig, system: string, messages: ChatMsg[], onText: (text: string) => void, signal: AbortSignal, opts: ChatOptions = {}): Promise<string> => {
  if (cfg.provider === 'ollama') return chatOllama(cfg, system, messages, onText, signal, opts);
  const response = await aiFetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', headers: openaiHeaders(cfg), signal,
    body: JSON.stringify({ model: cfg.model, stream: true, temperature: opts.temperature ?? 0.2, ...(opts.numPredict ? { max_tokens: opts.numPredict } : {}), messages: system ? [{ role: 'system', content: system }, ...messages] : messages }),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const reader = response.body.getReader(); const dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try { const text = JSON.parse(data).choices?.[0]?.delta?.content; if (text) { full += text; onText(text); } } catch { /* partial line */ }
    }
  }
  return full;
};

/** Human-readable error message. */
export const describeError = (error: unknown): string => {
  const message = (error as Error)?.message ?? String(error);
  if (/HTTP 404/.test(message)) return 'Modell nicht gefunden. Bei Ollama installieren mit: ollama pull <modell>';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Server nicht erreichbar. Läuft er? Bei lokalen Servern ggf. CORS erlauben (Ollama: OLLAMA_ORIGINS="*").';
  return message;
};

/** How the assistant talks to a model: "code" writes s3d-API scripts, "mesh" returns OBJ meshes (LLaMA-Mesh). */
export type ModelMode = 'code' | 'mesh';

export interface ModelPreset { id: string; label: string; mode: ModelMode; size: string; note: string; pull?: string; fast?: boolean }

/** Free local models that work well (Ollama names). */
export const MODEL_PRESETS: ModelPreset[] = [
  { id: 'llama-mesh', pull: 'hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M', label: 'LLaMA-Mesh 8B', mode: 'mesh', size: '4,9 GB', note: 'Speziell für 3D: erzeugt Dreiecks-Meshes direkt aus Text (NVIDIA, Llama-3.1-Lizenz). Gut für einzelne Objekte.' },
  { id: 'qwen2.5-coder:3b', label: 'Qwen2.5-Coder 3B (schnell)', mode: 'code', size: '1,9 GB', fast: true, note: 'Am schnellsten – antwortet auch ohne Grafikkarte in Sekunden. Einfachere Objekte, schaltet den Schnellmodus ein.' },
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5-Coder 7B', mode: 'code', size: '4,7 GB', note: 'Schreibt Modellier-Code – ganze Szenen mit Materialien und Texturen. Bester Allrounder für normale Rechner.' },
  { id: 'qwen2.5-coder:14b', label: 'Qwen2.5-Coder 14B', mode: 'code', size: '9,0 GB', note: 'Genauer als 7B, braucht mehr Speicher.' },
  { id: 'qwen3:8b', label: 'Qwen3 8B', mode: 'code', size: '5,2 GB', note: 'Neueres Allround-Modell mit guter Planung.' },
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B', mode: 'code', size: '4,9 GB', note: 'Solides Allround-Modell.' },
];

/** Small models (≤ 3B) are only worth it for speed – switching to one turns fast mode on. */
export const isSmallModel = (model: string) => MODEL_PRESETS.some(preset => preset.fast && preset.id === model) || /[:-](0\.5|1\.5|1\.7|1|2|3)b\b/i.test(model);
watch(() => aiConfig.model, (model, old) => {
  if (model && model !== old && isSmallModel(model)) aiConfig.fast = true;
  if (old && model !== old) void unloadModel(aiConfig, old);
});

/**
 * Ollama keeps every used model in RAM for 5 minutes (and several at once) – on a switch the old one
 * is released right away (keep_alive 0). It only frees memory; the model stays on disk.
 */
export const unloadModel = async (cfg: AiConfig, model: string) => {
  if (cfg.provider !== 'ollama') return;
  // LLaMA-Mesh actually runs under its alias (see ensureMeshModel)
  const names = modeFor(model) === 'mesh' ? [model, MESH_ALIAS] : [model];
  for (const name of names) {
    try { await aiFetch(ollamaRoot(cfg) + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, keep_alive: 0 }) }); }
    catch { /* server offline or model unknown – nothing to free */ }
  }
};

export const modeFor = (model: string): ModelMode => { return /mesh/i.test(model) ? 'mesh' : 'code'; };

/** Ollama's native API root (…/v1 stripped). */
export const ollamaRoot = (cfg: AiConfig) => { return cfg.baseUrl.replace(/\/v1\/?$/, ''); };

export interface PullProgress {
  status: string;      // German status text
  phase: 'start' | 'download' | 'verify' | 'done';
  completed: number;   // bytes over all layers
  total: number;       // bytes over all layers (grows while new layers are announced)
  frac: number;        // 0..1
  speed: number;       // bytes/s (smoothed)
  eta: number | null;  // seconds remaining
}

const PULL_STATUS: [RegExp, string, PullProgress['phase']][] = [
  [/^pulling manifest/, 'Lade Modellbeschreibung …', 'start'],
  [/^pulling /, 'Lade herunter …', 'download'],
  [/^verifying/, 'Prüfe heruntergeladene Datei …', 'verify'],
  [/^writing manifest/, 'Speichere Modell …', 'verify'],
  [/^success/, 'Fertig', 'done'],
];

/** Download a model through Ollama (POST /api/pull) – sums all layers and estimates speed and remaining time. */
export const pullModel = async (cfg: AiConfig, name: string, onProgress: (progress: PullProgress) => void, signal?: AbortSignal) => {
  const response = await aiFetch(ollamaRoot(cfg) + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }), signal });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const layers = new Map<string, { completed: number; total: number }>();
  let speed = 0, lastT = performance.now(), lastBytes = 0;
  const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      const data = JSON.parse(line); if (data.error) throw new Error(data.error);
      if (data.digest && data.total) layers.set(data.digest, { completed: data.completed ?? 0, total: data.total });
      let completed = 0, total = 0; for (const layer of layers.values()) { completed += layer.completed; total += layer.total; }
      const now = performance.now(), elapsed = (now - lastT) / 1000;
      if (elapsed >= 0.5) { const inst = Math.max(0, completed - lastBytes) / elapsed; speed = speed ? speed * 0.7 + inst * 0.3 : inst; lastT = now; lastBytes = completed; }
      const statusText = String(data.status ?? ''); const match = PULL_STATUS.find(([pattern]) => pattern.test(statusText));
      onProgress({
        status: match?.[1] ?? statusText, phase: match?.[2] ?? 'download', completed, total,
        frac: match?.[2] === 'done' ? 1 : total ? completed / total : 0,
        speed, eta: speed > 0 && total ? (total - completed) / speed : null,
      });
    }
  }
};

/** Running downloads (kept outside the wizard so they survive closing it). */
export const downloads = reactive<Record<string, PullProgress & { error?: string; ctrl: AbortController }>>({});

export const startDownload = async (cfg: AiConfig, pullName: string, name = pullName): Promise<boolean> => {
  if (downloads[name] && !downloads[name].error) return false;
  const ctrl = new AbortController();
  downloads[name] = { status: 'Starte Download …', phase: 'start', completed: 0, total: 0, frac: 0, speed: 0, eta: null, ctrl };
  try { await pullModel({ ...cfg }, pullName, progress => Object.assign(downloads[name], progress), ctrl.signal); delete downloads[name]; return true; }
  catch (error) {
    if (ctrl.signal.aborted) { delete downloads[name]; return false; }
    downloads[name].error = describeError(error); return false;
  }
};
export const cancelDownload = (name: string) => { downloads[name]?.ctrl.abort(); };

export const fmtBytes = (bytes: number): string => {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2).replace('.', ',') + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1).replace('.', ',') + ' MB';
  return Math.round(bytes / 1e3) + ' kB';
};
export const fmtDuration = (seconds: number | null): string => {
  if (seconds == null || !isFinite(seconds)) return 'Restzeit wird berechnet …';
  if (seconds < 60) return `noch ca. ${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.floor(seconds / 60), rest = Math.round(seconds % 60);
  if (minutes < 60) return `noch ca. ${minutes} Min. ${rest} s`;
  return `noch ca. ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
};

// ------------------------------------------------------------------ LLaMA-Mesh fix
export const MESH_SOURCE = 'hf.co/bartowski/LLaMA-Mesh-GGUF:Q4_K_M';
export const MESH_ALIAS = 'llama-mesh';
/** Plain Llama-3 chat template. Ollama 0.6 wrongly assigns the Llama-Guard template to this GGUF (answers "Safe."). */
const LLAMA3_TEMPLATE = `{{- range .Messages }}<|start_header_id|>{{ .Role }}<|end_header_id|>

{{ .Content }}<|eot_id|>
{{- end }}<|start_header_id|>assistant<|end_header_id|>

`;

/** Make sure the "llama-mesh" alias with the correct template exists (no download – reuses the weights). */
export const ensureMeshModel = async (cfg: AiConfig): Promise<string> => {
  const tags = await (await aiFetch(ollamaRoot(cfg) + '/api/tags', {})).json();
  const names: string[] = (tags.models ?? []).map((model: any) => model.name);
  if (names.some(candidate => candidate === MESH_ALIAS || candidate === MESH_ALIAS + ':latest')) return MESH_ALIAS;
  const src = names.find(candidate => /llama-mesh/i.test(candidate) && candidate !== MESH_ALIAS);
  if (!src) throw new Error('LLaMA-Mesh ist nicht installiert. Bitte im Einrichtungs-Assistenten installieren.');
  const response = await aiFetch(ollamaRoot(cfg) + '/api/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MESH_ALIAS, from: src, template: LLAMA3_TEMPLATE, stream: false,
      parameters: { num_ctx: 8192, num_predict: 7000, temperature: 0.9, top_p: 0.9, stop: ['<|eot_id|>', '<|start_header_id|>'] } }),
  });
  if (!response.ok) throw new Error('Konnte llama-mesh nicht anlegen: ' + (await response.text()).slice(0, 200));
  return MESH_ALIAS;
};
