import * as THREE from 'three';

/** Procedural textures (drawn on a canvas, tinted with the material colour). */
export const TEXTURES = {
  holz: 'Holz', ziegel: 'Ziegel', stein: 'Naturstein', gras: 'Gras', fliesen: 'Fliesen', beton: 'Beton',
  metall: 'Metall gebürstet', stoff: 'Stoff', wasser: 'Wasser', marmor: 'Marmor', dach: 'Dachziegel', parkett: 'Parkett',
} as const;
export type TextureKind = keyof typeof TEXTURES;
export const isTextureKind = (k: unknown): k is TextureKind => typeof k === 'string' && k in TEXTURES;

/** Default real-world size (m) one texture tile covers. */
export const TEXTURE_SIZE: Record<TextureKind, number> = {
  holz: 1, ziegel: 0.8, stein: 1.2, gras: 1.5, fliesen: 0.6, beton: 2, metall: 1, stoff: 0.4, wasser: 2, marmor: 1.5, dach: 1, parkett: 1,
};

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const shade = (c: THREE.Color, f: number) => { const o = c.clone().multiplyScalar(f); return `rgb(${Math.min(255, o.r * 255) | 0},${Math.min(255, o.g * 255) | 0},${Math.min(255, o.b * 255) | 0})`; };

export function makeTexture(kind: TextureKind, color: string): THREE.CanvasTexture {
  const key = kind + color; const hit = cache.get(key); if (hit) return hit;
  const N = 256; const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d')!;
  const base = new THREE.Color(color); const r = rng(kind.length * 977 + Math.floor(base.r * 255));
  g.fillStyle = shade(base, 1); g.fillRect(0, 0, N, N);
  const noise = (amt: number, n = 4000, s = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = shade(base, 1 + (r() - 0.5) * amt); g.fillRect(r() * N, r() * N, s, s); } };
  switch (kind) {
    case 'holz': case 'parkett': {
      const planks = kind === 'parkett' ? 8 : 4;
      for (let p = 0; p < planks; p++) {
        const y0 = p * N / planks, f = 0.85 + r() * 0.3;
        g.fillStyle = shade(base, f); g.fillRect(0, y0, N, N / planks);
        for (let k = 0; k < 14; k++) { g.strokeStyle = shade(base, f * (0.75 + r() * 0.2)); g.lineWidth = 1 + r() * 1.5; g.beginPath(); const y = y0 + r() * N / planks; g.moveTo(0, y); for (let x = 0; x <= N; x += 16) g.lineTo(x, y + Math.sin(x / 30 + k) * 2); g.stroke(); }
        g.fillStyle = shade(base, 0.55); g.fillRect(0, y0, N, 1.5);
        if (kind === 'parkett') { const x = r() * N; g.fillRect(x, y0, 1.5, N / planks); }
      }
      break;
    }
    case 'ziegel': case 'fliesen': {
      const rows = kind === 'ziegel' ? 8 : 4, cols = kind === 'ziegel' ? 4 : 4, h = N / rows, w = N / cols;
      g.fillStyle = kind === 'ziegel' ? '#d8d2c6' : '#e9e9e9'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) {
        const ox = kind === 'ziegel' && y % 2 ? w / 2 : 0;
        g.fillStyle = shade(base, 0.85 + r() * 0.3); g.fillRect(x * w + ox + 2, y * h + 2, w - 4, h - 4);
      }
      noise(0.15, 3000, 1.5);
      break;
    }
    case 'dach': {
      const rows = 6, cols = 5, h = N / rows, w = N / cols;
      for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) {
        const ox = y % 2 ? w / 2 : 0; g.fillStyle = shade(base, 0.85 + r() * 0.25);
        g.beginPath(); g.moveTo(x * w + ox, y * h); g.lineTo(x * w + ox + w, y * h); g.lineTo(x * w + ox + w, y * h + h * 0.75); g.quadraticCurveTo(x * w + ox + w / 2, y * h + h * 1.05, x * w + ox, y * h + h * 0.75); g.closePath(); g.fill();
        g.fillStyle = shade(base, 0.6); g.fillRect(x * w + ox, y * h + h - 2, w, 2);
      }
      break;
    }
    case 'stein': {
      g.fillStyle = shade(base, 0.6); g.fillRect(0, 0, N, N);
      for (let i = 0; i < 40; i++) {
        const cx = r() * N, cy = r() * N, rad = 18 + r() * 22; g.fillStyle = shade(base, 0.8 + r() * 0.4); g.beginPath();
        for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2, rr = rad * (0.75 + r() * 0.3); const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr; if (a) g.lineTo(px, py); else g.moveTo(px, py); }
        g.closePath(); g.fill();
      }
      noise(0.2, 2000, 1.5);
      break;
    }
    case 'gras': {
      noise(0.35, 9000, 2);
      for (let i = 0; i < 1500; i++) { g.strokeStyle = shade(base, 0.7 + r() * 0.6); g.lineWidth = 1; const x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6); g.stroke(); }
      break;
    }
    case 'beton': noise(0.18, 12000, 1.5); for (let i = 0; i < 30; i++) { g.fillStyle = shade(base, 0.8); g.beginPath(); g.arc(r() * N, r() * N, 1 + r() * 2, 0, 7); g.fill(); } break;
    case 'metall': for (let y = 0; y < N; y++) { g.fillStyle = shade(base, 0.9 + r() * 0.2); g.fillRect(0, y, N, 1); } break;
    case 'stoff': for (let i = 0; i < N; i += 4) { g.fillStyle = shade(base, 0.85); g.fillRect(i, 0, 2, N); g.fillStyle = shade(base, 1.1); g.fillRect(0, i, N, 2); } break;
    case 'wasser': for (let k = 0; k < 40; k++) { g.strokeStyle = shade(base, 1.1 + r() * 0.3); g.lineWidth = 1.5; g.beginPath(); const y = r() * N; for (let x = 0; x <= N; x += 8) g.lineTo(x, y + Math.sin(x / 18 + k) * 4); g.stroke(); } break;
    case 'marmor': noise(0.06, 4000, 2); for (let k = 0; k < 9; k++) { g.strokeStyle = shade(base, 0.6 + r() * 0.2); g.lineWidth = 0.8 + r() * 1.6; g.beginPath(); let x = r() * N, y = 0; g.moveTo(x, y); while (y < N) { x += (r() - 0.5) * 30; y += 10 + r() * 20; g.lineTo(x, y); } g.stroke(); } break;
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
