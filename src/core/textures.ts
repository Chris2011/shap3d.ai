import * as THREE from 'three';

/** Procedural textures (drawn on a canvas, tinted with the material colour). */
export const TEXTURES = {
  holz: 'Holz', ziegel: 'Ziegel', stein: 'Naturstein', gras: 'Gras', fliesen: 'Fliesen', beton: 'Beton',
  metall: 'Metall gebürstet', stoff: 'Stoff', wasser: 'Wasser', marmor: 'Marmor', dach: 'Dachziegel', parkett: 'Parkett',
} as const;
export type TextureKind = keyof typeof TEXTURES;
export const isTextureKind = (value: unknown): value is TextureKind => typeof value === 'string' && value in TEXTURES;

/** Default real-world size (m) one texture tile covers. */
export const TEXTURE_SIZE: Record<TextureKind, number> = {
  holz: 1, ziegel: 0.8, stein: 1.2, gras: 1.5, fliesen: 0.6, beton: 2, metall: 1, stoff: 0.4, wasser: 2, marmor: 1.5, dach: 1, parkett: 1,
};

const cache = new Map<string, THREE.CanvasTexture>();

const rng = (seed: number) => { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; };
const shade = (color: THREE.Color, factor: number) => { const scaled = color.clone().multiplyScalar(factor); return `rgb(${Math.min(255, scaled.r * 255) | 0},${Math.min(255, scaled.g * 255) | 0},${Math.min(255, scaled.b * 255) | 0})`; };

export const makeTexture = (kind: TextureKind, color: string): THREE.CanvasTexture => {
  const key = kind + color; const hit = cache.get(key); if (hit) return hit;
  const SIZE = 256; const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; const context = canvas.getContext('2d')!;
  const base = new THREE.Color(color); const random = rng(kind.length * 977 + Math.floor(base.r * 255));
  context.fillStyle = shade(base, 1); context.fillRect(0, 0, SIZE, SIZE);
  const noise = (amt: number, count = 4000, dotSize = 2) => { for (let i = 0; i < count; i++) { context.fillStyle = shade(base, 1 + (random() - 0.5) * amt); context.fillRect(random() * SIZE, random() * SIZE, dotSize, dotSize); } };
  switch (kind) {
    case 'holz': case 'parkett': {
      const planks = kind === 'parkett' ? 8 : 4;
      for (let plank = 0; plank < planks; plank++) {
        const plankTop = plank * SIZE / planks, tint = 0.85 + random() * 0.3;
        context.fillStyle = shade(base, tint); context.fillRect(0, plankTop, SIZE, SIZE / planks);
        for (let k = 0; k < 14; k++) { context.strokeStyle = shade(base, tint * (0.75 + random() * 0.2)); context.lineWidth = 1 + random() * 1.5; context.beginPath(); const y = plankTop + random() * SIZE / planks; context.moveTo(0, y); for (let x = 0; x <= SIZE; x += 16) context.lineTo(x, y + Math.sin(x / 30 + k) * 2); context.stroke(); }
        context.fillStyle = shade(base, 0.55); context.fillRect(0, plankTop, SIZE, 1.5);
        if (kind === 'parkett') { const x = random() * SIZE; context.fillRect(x, plankTop, 1.5, SIZE / planks); }
      }
      break;
    }
    case 'ziegel': case 'fliesen': {
      const rows = kind === 'ziegel' ? 8 : 4, cols = kind === 'ziegel' ? 4 : 4, rowHeight = SIZE / rows, colWidth = SIZE / cols;
      context.fillStyle = kind === 'ziegel' ? '#d8d2c6' : '#e9e9e9'; context.fillRect(0, 0, SIZE, SIZE);
      for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) {
        const offsetX = kind === 'ziegel' && y % 2 ? colWidth / 2 : 0;
        context.fillStyle = shade(base, 0.85 + random() * 0.3); context.fillRect(x * colWidth + offsetX + 2, y * rowHeight + 2, colWidth - 4, rowHeight - 4);
      }
      noise(0.15, 3000, 1.5);
      break;
    }
    case 'dach': {
      const rows = 6, cols = 5, rowHeight = SIZE / rows, colWidth = SIZE / cols;
      for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) {
        const offsetX = y % 2 ? colWidth / 2 : 0; context.fillStyle = shade(base, 0.85 + random() * 0.25);
        context.beginPath(); context.moveTo(x * colWidth + offsetX, y * rowHeight); context.lineTo(x * colWidth + offsetX + colWidth, y * rowHeight); context.lineTo(x * colWidth + offsetX + colWidth, y * rowHeight + rowHeight * 0.75); context.quadraticCurveTo(x * colWidth + offsetX + colWidth / 2, y * rowHeight + rowHeight * 1.05, x * colWidth + offsetX, y * rowHeight + rowHeight * 0.75); context.closePath(); context.fill();
        context.fillStyle = shade(base, 0.6); context.fillRect(x * colWidth + offsetX, y * rowHeight + rowHeight - 2, colWidth, 2);
      }
      break;
    }
    case 'stein': {
      context.fillStyle = shade(base, 0.6); context.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 40; i++) {
        const centerX = random() * SIZE, centerY = random() * SIZE, rad = 18 + random() * 22; context.fillStyle = shade(base, 0.8 + random() * 0.4); context.beginPath();
        for (let corner = 0; corner < 7; corner++) { const ang = corner / 7 * Math.PI * 2, cornerRadius = rad * (0.75 + random() * 0.3); const pointX = centerX + Math.cos(ang) * cornerRadius, pointY = centerY + Math.sin(ang) * cornerRadius; if (corner) context.lineTo(pointX, pointY); else context.moveTo(pointX, pointY); }
        context.closePath(); context.fill();
      }
      noise(0.2, 2000, 1.5);
      break;
    }
    case 'gras': {
      noise(0.35, 9000, 2);
      for (let i = 0; i < 1500; i++) { context.strokeStyle = shade(base, 0.7 + random() * 0.6); context.lineWidth = 1; const x = random() * SIZE, y = random() * SIZE; context.beginPath(); context.moveTo(x, y); context.lineTo(x + (random() - 0.5) * 4, y - 3 - random() * 6); context.stroke(); }
      break;
    }
    case 'beton': noise(0.18, 12000, 1.5); for (let i = 0; i < 30; i++) { context.fillStyle = shade(base, 0.8); context.beginPath(); context.arc(random() * SIZE, random() * SIZE, 1 + random() * 2, 0, 7); context.fill(); } break;
    case 'metall': for (let y = 0; y < SIZE; y++) { context.fillStyle = shade(base, 0.9 + random() * 0.2); context.fillRect(0, y, SIZE, 1); } break;
    case 'stoff': for (let i = 0; i < SIZE; i += 4) { context.fillStyle = shade(base, 0.85); context.fillRect(i, 0, 2, SIZE); context.fillStyle = shade(base, 1.1); context.fillRect(0, i, SIZE, 2); } break;
    case 'wasser': for (let k = 0; k < 40; k++) { context.strokeStyle = shade(base, 1.1 + random() * 0.3); context.lineWidth = 1.5; context.beginPath(); const y = random() * SIZE; for (let x = 0; x <= SIZE; x += 8) context.lineTo(x, y + Math.sin(x / 18 + k) * 4); context.stroke(); } break;
    case 'marmor': noise(0.06, 4000, 2); for (let k = 0; k < 9; k++) { context.strokeStyle = shade(base, 0.6 + random() * 0.2); context.lineWidth = 0.8 + random() * 1.6; context.beginPath(); let x = random() * SIZE, y = 0; context.moveTo(x, y); while (y < SIZE) { x += (random() - 0.5) * 30; y += 10 + random() * 20; context.lineTo(x, y); } context.stroke(); } break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
};
