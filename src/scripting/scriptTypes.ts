/** one face of s3d.polyhedron(): point indices, or with holes and a material */
export type PolyhedronFace = number[] | { outer: number[]; holes?: number[][]; material?: string };

export interface ScriptLog {
  kind: 'log' | 'warn' | 'error' | 'result';
  text: string;
}

export interface RunResult {
  ok: boolean;
  logs: ScriptLog[];
  error?: string;
  durationMs: number;
  /** the script stopped because something it needs is still being made – run it again when this is done */
  retryAfter?: Promise<unknown>;
}
