/**
 * The selected index of a list after a navigation key: ↑/↓ wrap around, Page Up/Down jump 8 rows.
 * Returns undefined for any other key.
 */
export const moveSelection = (key: string, index: number, count: number): number | undefined => {
  if (key === 'ArrowDown') {
    return count ? (index + 1) % count : 0;
  }
  if (key === 'ArrowUp') {
    return count ? (index - 1 + count) % count : 0;
  }
  if (key === 'PageDown') {
    return Math.min(count - 1, index + 8);
  }
  if (key === 'PageUp') {
    return Math.max(0, index - 8);
  }
  return undefined;
};
