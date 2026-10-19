// opentype.js 1.3 ships no types – only what the 3D-text plugin uses
declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): unknown;
}
