import { t, formatNumber } from '../../../i18n';
/**
 * Hugging Face model search (read-only, public API – no account needed).
 * Only GGUF repos are listed: that is the format Ollama can pull directly via "hf.co/<repo>:<quant>".
 * Searching is the only online step – the downloaded model runs locally.
 */
const API = 'https://huggingface.co/api/models';

export interface HfModel {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  updated: number;
  gated: boolean;
  tags: string[];
  license?: string;
  pipeline?: string;
  /** billions of parameters (repo name or GGUF metadata), null if unknown */
  params: number | null;
  /** mixture-of-experts: billions of parameters working per token ("30B-A3B" → 3) – decides the speed */
  active: number | null;
  /** false for image-to-3D, image generation … – GGUF too, but nothing Ollama can chat with */
  chat: boolean;
}

/** Hugging Face pipelines Ollama can run as a chat model (no tag = unknown, give it a try). */
const CHAT_PIPELINES = ['text-generation', 'image-text-to-text', 'text2text-generation', 'conversational'];
/** Tags and names of 3D / image / video generators that are also published as GGUF but are no chat models. */
const NOT_CHAT_TAGS = ['image-to-3d', 'text-to-3d', 'text-to-image', 'image-to-image', 'image-to-video', 'text-to-video', 'diffusers'];
const NOT_CHAT_NAME = /trellis|hunyuan-?3d|triposr|instantmesh|stable-?diffusion|sdxl|flux|wan2/i;

const isChatModel = (id: string, pipeline: string | undefined, tags: string[]) =>
  (!pipeline || CHAT_PIPELINES.includes(pipeline)) && !tags.some((tag) => NOT_CHAT_TAGS.includes(tag)) && !NOT_CHAT_NAME.test(id);
export interface HfQuant {
  quant: string;
  file: string;
  size: number;
  ollamaName: string;
}
export interface HfDetail {
  quants: HfQuant[];
  params?: number;
  context?: number;
  arch?: string;
  split: number;
}

export type HfSort = 'downloads' | 'likes' | 'lastModified' | 'trendingScore';

export const searchModels = async (query: string, sort: HfSort = 'downloads', signal?: AbortSignal): Promise<HfModel[]> => {
  const url = new URL(API);
  if (query.trim()) {
    url.searchParams.set('search', query.trim());
  }
  url.searchParams.set('filter', 'gguf');
  url.searchParams.set('sort', sort);
  url.searchParams.set('direction', '-1');
  url.searchParams.set('limit', '100');
  for (const field of ['gguf', 'downloads', 'likes', 'lastModified', 'gated', 'tags', 'pipeline_tag', 'author']) {
    url.searchParams.append('expand[]', field);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(t('ai.search.httpError', { status: response.status }));
  }
  const list: any[] = await response.json();
  return list.map((model) => ({
    id: model.id ?? model.modelId,
    author: model.author ?? String(model.id).split('/')[0],
    downloads: model.downloads ?? 0,
    likes: model.likes ?? 0,
    updated: Date.parse(model.lastModified ?? model.createdAt ?? '') || 0,
    gated: !!model.gated,
    tags: model.tags ?? [],
    pipeline: model.pipeline_tag,
    license: (model.tags ?? []).find((tag: string) => tag.startsWith('license:'))?.slice(8),
    params: bestParams(model.id ?? model.modelId, model.gguf?.total),
    active: activeParams(model.id ?? model.modelId),
    chat: isChatModel(model.id ?? model.modelId, model.pipeline_tag, model.tags ?? []),
  }));
};

/** "Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf" → "Q4_K_M"; split files ("-00001-of-00002") are skipped (Ollama can't pull them). */
const QUANT_RE = /[-._]((?:I?Q\d[A-Z0-9_]*)|BF16|F16|F32)\.gguf$/i;

export const modelDetail = async (id: string, signal?: AbortSignal): Promise<HfDetail> => {
  const response = await fetch(`${API}/${id}?blobs=true`, { signal });
  if (!response.ok) {
    throw new Error(t('ai.search.httpError', { status: response.status }));
  }
  const data = await response.json();
  const files: { rfilename: string; size?: number }[] = data.siblings ?? [];
  let split = 0;
  const seen = new Set<string>();
  const quants: HfQuant[] = [];
  for (const file of files) {
    if (!file.rfilename.toLowerCase().endsWith('.gguf')) {
      continue;
    }
    if (/-\d{5}-of-\d{5}\.gguf$/i.test(file.rfilename)) {
      split++;
      continue;
    }
    if (/mmproj/i.test(file.rfilename)) {
      continue;
    } // vision projector, not a chat model
    const match = file.rfilename.match(QUANT_RE);
    if (!match) {
      continue;
    }
    const quant = match[1].toUpperCase();
    if (seen.has(quant)) {
      continue;
    }
    seen.add(quant);
    quants.push({ quant, file: file.rfilename, size: file.size ?? 0, ollamaName: `hf.co/${id}:${quant}` });
  }
  quants.sort((left, right) => left.size - right.size);
  const gguf = data.gguf ?? {};
  return { quants, params: gguf.total, context: gguf.context_length, arch: gguf.architecture, split };
};

/** Q4_K_M is the usual sweet spot between size and quality. */
export const RECOMMENDED_QUANT = 'Q4_K_M';

/**
 * Rough speed class on a machine without a graphics card (file size ≈ RAM needed).
 * `share` = active / total parameters: a mixture-of-experts model only computes with that part per token.
 */
export const speedClass = (fileBytes: number, share = 1): { label: string; cls: 'fast' | 'mid' | 'slow' } => {
  const bytes = fileBytes * share;
  // the whole file has to fit into RAM – beyond ~24 GB most computers swap, mixture-of-experts models too
  if (fileBytes >= 24e9) {
    return { label: t('ai.search.slow'), cls: 'slow' };
  }
  if (bytes < 2.5e9) {
    return { label: `⚡ ${t('ai.search.fast')}`, cls: 'fast' };
  }
  if (bytes < 6e9) {
    return { label: t('ai.search.medium'), cls: 'mid' };
  }
  return { label: t('ai.search.slow'), cls: 'slow' };
};

/** Name and GGUF metadata both can be off (e.g. a bundled draft model) – the larger one is the real size. */
const bestParams = (id: string, ggufTotal?: number): number | null => {
  const fromName = paramsFromName(id),
    fromFile = ggufTotal ? Math.round(ggufTotal / 1e8) / 10 : null;
  return fromName == null ? fromFile : fromFile == null ? fromName : Math.max(fromName, fromFile);
};

/** Parameter count from the repo name: "Qwen3-Coder-30B-A3B" → 30 (the "A3B" active-expert part is ignored). */
export const paramsFromName = (id: string): number | null => {
  const name = id.split('/').pop() ?? id;
  const matches = [...name.matchAll(/(?<![A-Za-z])(\d+(?:\.\d+)?)[Bb](?![A-Za-z])/g)];
  return matches.length ? parseFloat(matches[0][1]) : null;
};

/** Active parameters of a mixture-of-experts repo: "Qwen3-Coder-30B-A3B" → 3. */
export const activeParams = (id: string): number | null => {
  const match = (id.split('/').pop() ?? id).match(/(?<![A-Za-z])A(\d+(?:\.\d+)?)B(?![A-Za-z])/);
  return match ? parseFloat(match[1]) : null;
};

/** 1.2 M / 1,2 Mio. / 1,2 M … – short counts in the format of the language */
export const fmtCount = (count: number): string => formatNumber(count, { notation: 'compact', maximumFractionDigits: 1 });
