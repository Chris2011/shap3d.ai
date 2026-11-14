/** Decimal hours as a 24-hour clock, e.g. `13.75` → `"13:45"`. */
export const formatClock = (decimalHours: number) => {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Month 1–12 as a word in `locale`, e.g. `3, 'de'` → `"März"`. */
export const monthName = (month: number, locale: string) => new Date(2000, month - 1, 1).toLocaleString(locale, { month: 'long' });
