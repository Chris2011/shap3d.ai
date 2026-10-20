import type { Units } from './document';
import { formatDecimal, unitSymbol, normalizeNumberInput } from '../i18n';

const FACT: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, '"': 0.0254, ft: 0.3048, "'": 0.3048 };

/** Parse a length like "2.5m", "250cm", "3'6\"", "1200" (model units). Returns meters. */
export const parseLength = (str: string, units: Units = 'm'): number | null => {
  const text = normalizeNumberInput(String(str)).trim().toLowerCase().replace(',', '.');
  if (!text) {
    return null;
  }
  // feet + inches: 3'6"
  const feetInches = text.match(/^([-+]?\d*\.?\d+)\s*'\s*(\d*\.?\d+)\s*"?$/);
  if (feetInches) {
    return parseFloat(feetInches[1]) * FACT.ft + parseFloat(feetInches[2]) * FACT.in;
  }
  const match = text.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(mm|cm|m|km|in|ft|"|')?$/);
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1]);
  const unit = match[2] ?? units;
  return value * (FACT[unit] ?? 1);
};

/** Splits VCB input "3m;4m" or "3m,4m" or "3m x 4m". */
export const parseLengthList = (str: string, units: Units = 'm'): (number | null)[] => {
  const text = str.trim();
  let parts = text.split(/;|\s*[x×]\s*/i);
  // "3m,4m" or "3, 4": comma as separator (a comma followed by a space or preceded by a unit)
  if (parts.length === 1 && /(\s|[a-z"'])\s*,|,\s+/i.test(text)) {
    parts = text.split(/\s*,\s*/);
  }
  if (parts.length === 1 && (text.match(/,/g) ?? []).length >= 2) {
    parts = text.split(',');
  }
  return parts.map((part) => (part.trim() === '' ? null : parseLength(part, units)));
};

/** Array syntax after move/copy/rotate: "5x", "x5", "*5" (multiply) or "/5" (divide). */
export const parseArray = (str: string): { kind: 'multiply' | 'divide'; count: number } | null => {
  const text = str.trim().toLowerCase();
  let match = text.match(/^(?:x|\*)\s*(\d+)$/) || text.match(/^(\d+)\s*(?:x|\*)$/);
  if (match) {
    return { kind: 'multiply', count: parseInt(match[1]) };
  }
  match = text.match(/^\/\s*(\d+)$/) || text.match(/^(\d+)\s*\/$/);
  if (match) {
    return { kind: 'divide', count: parseInt(match[1]) };
  }
  return null;
};

/**
 * Lengths, areas and angles in the format of the current language: its decimal separator
 * ("2,5 m" in German, French, Spanish; "2.5 m" in English and Arabic) and its unit symbols
 * (Arabic "م", "سم", "مم"). No thousands grouping – the text can be typed back into the measurements box.
 */
export const formatLength = (value: number, units: Units = 'm', precision = 2): string => {
  if (!isFinite(value)) {
    return '';
  }
  switch (units) {
    case 'mm':
      return `${formatDecimal(value * 1000, precision - 2)} ${unitSymbol('mm')}`;
    case 'cm':
      return `${formatDecimal(value * 100, precision - 1)} ${unitSymbol('cm')}`;
    case 'in':
      return `${formatDecimal(value / 0.0254, precision)}"`;
    case 'ft': {
      const tot = value / 0.0254;
      const feet = Math.trunc(tot / 12);
      const inch = tot - feet * 12;
      return `${feet}' ${formatDecimal(inch, precision - 1)}"`;
    }
    default:
      return `${formatDecimal(value, precision + 1, true)} ${unitSymbol('m')}`;
  }
};

export const formatArea = (value: number, units: Units = 'm', precision = 2): string => {
  switch (units) {
    case 'mm':
      return `${formatDecimal(value * 1e6, 0)} ${unitSymbol('mm')}²`;
    case 'cm':
      return `${formatDecimal(value * 1e4, precision - 1)} ${unitSymbol('cm')}²`;
    case 'in':
      return `${formatDecimal(value / 0.00064516, precision)} in²`;
    case 'ft':
      return `${formatDecimal(value / 0.09290304, precision)} ft²`;
    default:
      return `${formatDecimal(value, precision + 1)} ${unitSymbol('m')}²`;
  }
};

/** Volume in m³ / cm³ / mm³ (depending on the model unit) in the format of the language. */
export const formatVolume = (value: number, units: Units = 'm'): string =>
  units === 'mm'
    ? `${formatDecimal(value * 1e9, 0)} ${unitSymbol('mm')}³`
    : units === 'cm'
      ? `${formatDecimal(value * 1e6, 1)} ${unitSymbol('cm')}³`
      : `${formatDecimal(value, 3)} ${unitSymbol('m')}³`;

export const formatAngle = (rad: number): string => {
  return `${formatDecimal((rad * 180) / Math.PI, 1)}°`;
};

/** Parse an angle in degrees (optionally slope "1:2"). Returns radians. */
export const parseAngle = (str: string): number | null => {
  const text = normalizeNumberInput(str).trim().replace(',', '.');
  const slope = text.match(/^([-+]?\d*\.?\d+)\s*:\s*(\d*\.?\d+)$/);
  if (slope) {
    return Math.atan2(parseFloat(slope[1]), parseFloat(slope[2]));
  }
  const match = text.match(/^([-+]?\d*\.?\d+)\s*°?$/);
  return match ? (parseFloat(match[1]) * Math.PI) / 180 : null;
};
