/**
 * An error a generator raises on purpose – too much asked of it, nothing fits. The library has no texts of its
 * own: `code` names the case and `params` hold its numbers, the plugin turns both into a message in its language.
 */
export class ProcgenError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ProcgenError';
  }
}
