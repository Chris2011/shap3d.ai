/**
 * Hugging Face model search (read-only, public API – no account needed).
 * Only GGUF repos are listed: that is the format Ollama can pull directly via "hf.co/<repo>:<quant>".
 * Searching is the only online step – the downloaded model runs locally.
 */
const API = 'https://huggingface.co/api/models';

export interface HfModel {
  id: string; author: string; downloads: number; likes: number; updated: number;
  gated: boolean; tags: string[]; license?: string; pipeline?: string;
  /** billions of parameters (repo name or GGUF metadata), null if unknown */
  params: number | null;
}
export interface HfQuant { quant: string; file: string; size: number; ollamaName: string }
export interface HfDetail { quants: HfQuant[]; params?: number; context?: number; arch?: string; split: number }

export type HfSort = 'downloads' | 'likes' | 'lastModified' | 'trendingScore';

export async function searchModels(query: string, sort: HfSort = 'downloads', signal?: AbortSignal): Promise<HfModel[]> {
  const u = new URL(API);
  if (query.trim()) u.searchParams.set('search', query.trim());
  u.searchParams.set('filter', 'gguf');
  u.searchParams.set('sort', sort);
  u.searchParams.set('direction', '-1');
  u.searchParams.set('limit', '100');
  for (const f of ['gguf', 'downloads', 'likes', 'lastModified', 'gated', 'tags', 'pipeline_tag', 'author']) u.searchParams.append('expand[]', f);
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`Hugging Face antwortet mit HTTP ${r.status}`);
  const list: any[] = await r.json();
  return list.map(m => ({
    id: m.id ?? m.modelId, author: m.author ?? String(m.id).split('/')[0],
    downloads: m.downloads ?? 0, likes: m.likes ?? 0, updated: Date.parse(m.lastModified ?? m.createdAt ?? '') || 0,
    gated: !!m.gated, tags: m.tags ?? [], pipeline: m.pipeline_tag,
    license: (m.tags ?? []).find((t: string) => t.startsWith('license:'))?.slice(8),
    params: bestParams(m.id ?? m.modelId, m.gguf?.total),
  }));
}

/** "Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf" → "Q4_K_M"; split files ("-00001-of-00002") are skipped (Ollama can't pull them). */
const QUANT_RE = /[-._]((?:I?Q\d[A-Z0-9_]*)|BF16|F16|F32)\.gguf$/i;

export async function modelDetail(id: string, signal?: AbortSignal): Promise<HfDetail> {
  const r = await fetch(`${API}/${id}?blobs=true`, { signal });
  if (!r.ok) throw new Error(`Hugging Face antwortet mit HTTP ${r.status}`);
  const j = await r.json();
  const files: { rfilename: string; size?: number }[] = j.siblings ?? [];
  let split = 0; const seen = new Set<string>(); const quants: HfQuant[] = [];
  for (const f of files) {
    if (!f.rfilename.toLowerCase().endsWith('.gguf')) continue;
    if (/-\d{5}-of-\d{5}\.gguf$/i.test(f.rfilename)) { split++; continue; }
    if (/mmproj/i.test(f.rfilename)) continue; // vision projector, not a chat model
    const m = f.rfilename.match(QUANT_RE); if (!m) continue;
    const quant = m[1].toUpperCase(); if (seen.has(quant)) continue; seen.add(quant);
    quants.push({ quant, file: f.rfilename, size: f.size ?? 0, ollamaName: `hf.co/${id}:${quant}` });
  }
  quants.sort((a, b) => a.size - b.size);
  const g = j.gguf ?? {};
  return { quants, params: g.total, context: g.context_length, arch: g.architecture, split };
}

/** Q4_K_M is the usual sweet spot between size and quality. */
export const RECOMMENDED_QUANT = 'Q4_K_M';

/** Rough speed class on a machine without a graphics card (file size ≈ RAM needed). */
export function speedClass(bytes: number): { label: string; cls: 'fast' | 'mid' | 'slow' } {
  if (bytes < 2.5e9) return { label: '⚡ schnell', cls: 'fast' };
  if (bytes < 6e9) return { label: 'mittel', cls: 'mid' };
  return { label: 'langsam ohne Grafikkarte', cls: 'slow' };
}

/** Name and GGUF metadata both can be off (e.g. a bundled draft model) – the larger one is the real size. */
function bestParams(id: string, ggufTotal?: number): number | null {
  const a = paramsFromName(id), b = ggufTotal ? Math.round(ggufTotal / 1e8) / 10 : null;
  return a == null ? b : b == null ? a : Math.max(a, b);
}

/** Parameter count from the repo name: "Qwen3-Coder-30B-A3B" → 30 (the "A3B" active-expert part is ignored). */
export function paramsFromName(id: string): number | null {
  const name = id.split('/').pop() ?? id;
  const m = [...name.matchAll(/(?<![A-Za-z])(\d+(?:\.\d+)?)[Bb](?![A-Za-z])/g)];
  return m.length ? parseFloat(m[0][1]) : null;
}

export function fmtCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' Mio.';
  if (n >= 1e3) return Math.round(n / 1e3) + ' Tsd.';
  return String(n);
}
