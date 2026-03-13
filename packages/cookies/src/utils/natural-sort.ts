export const naturalCompare = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true });
