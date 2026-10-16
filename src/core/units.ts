import type { Units } from './document';

const FACT: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, '"': 0.0254, ft: 0.3048, "'": 0.3048 };

/** Parse a length like "2.5m", "250cm", "3'6\"", "1200" (model units). Returns meters. */
export function parseLength(str: string, units: Units = 'm'): number | null {
  let s = String(str).trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  // feet + inches: 3'6"
  const fi = s.match(/^([-+]?\d*\.?\d+)\s*'\s*(\d*\.?\d+)\s*"?$/);
  if (fi) return parseFloat(fi[1]) * FACT.ft + parseFloat(fi[2]) * FACT.in;
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(mm|cm|m|km|in|ft|"|')?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = m[2] ?? units;
  return v * (FACT[u] ?? 1);
}

/** Splits VCB input "3m;4m" or "3m,4m" or "3m x 4m". */
export function parseLengthList(str: string, units: Units = 'm'): (number | null)[] {
  const s = str.trim();
  let parts = s.split(/;|\s*[x×]\s*/i);
  // "3m,4m" or "3, 4": comma as separator (a comma followed by a space or preceded by a unit)
  if (parts.length === 1 && /(\s|[a-z"'])\s*,|,\s+/i.test(s)) parts = s.split(/\s*,\s*/);
  if (parts.length === 1 && (s.match(/,/g) ?? []).length >= 2) parts = s.split(',');
  return parts.map(p => (p.trim() === '' ? null : parseLength(p, units)));
}

/** Array syntax after move/copy/rotate: "5x", "x5", "*5" (multiply) or "/5" (divide). */
export function parseArray(str: string): { kind: 'multiply' | 'divide'; n: number } | null {
  const s = str.trim().toLowerCase();
  let m = s.match(/^(?:x|\*)\s*(\d+)$/) || s.match(/^(\d+)\s*(?:x|\*)$/);
  if (m) return { kind: 'multiply', n: parseInt(m[1]) };
  m = s.match(/^\/\s*(\d+)$/) || s.match(/^(\d+)\s*\/$/);
  if (m) return { kind: 'divide', n: parseInt(m[1]) };
  return null;
}

export function formatLength(v: number, units: Units = 'm', precision = 2): string {
  if (!isFinite(v)) return '';
  switch (units) {
    case 'mm': return `${(v * 1000).toFixed(Math.max(0, precision - 2))} mm`.replace('.', ',');
    case 'cm': return `${(v * 100).toFixed(Math.max(0, precision - 1))} cm`.replace('.', ',');
    case 'in': return `${(v / 0.0254).toFixed(precision)}"`;
    case 'ft': { const tot = v / 0.0254; const ft = Math.trunc(tot / 12); const inch = tot - ft * 12; return `${ft}' ${inch.toFixed(Math.max(0, precision - 1))}"`; }
    default: return `${v.toFixed(precision + 1).replace(/0+$/, '').replace(/\.$/, '')} m`.replace('.', ',');
  }
}

export function formatArea(v: number, units: Units = 'm', precision = 2): string {
  switch (units) {
    case 'mm': return `${(v * 1e6).toFixed(0)} mm²`;
    case 'cm': return `${(v * 1e4).toFixed(precision - 1 < 0 ? 0 : precision - 1)} cm²`.replace('.', ',');
    case 'in': return `${(v / 0.00064516).toFixed(precision)} in²`;
    case 'ft': return `${(v / 0.09290304).toFixed(precision)} ft²`;
    default: return `${v.toFixed(precision + 1)} m²`.replace('.', ',');
  }
}

export function formatAngle(rad: number): string { return `${(rad * 180 / Math.PI).toFixed(1).replace('.', ',')}°`; }

/** Parse an angle in degrees (optionally slope "1:2"). Returns radians. */
export function parseAngle(str: string): number | null {
  const s = str.trim().replace(',', '.');
  const slope = s.match(/^([-+]?\d*\.?\d+)\s*:\s*(\d*\.?\d+)$/);
  if (slope) return Math.atan2(parseFloat(slope[1]), parseFloat(slope[2]));
  const m = s.match(/^([-+]?\d*\.?\d+)\s*°?$/);
  return m ? parseFloat(m[1]) * Math.PI / 180 : null;
}
