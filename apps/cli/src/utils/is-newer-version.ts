export const isNewerVersion = (latest: string, current: string): boolean => {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if ((latestParts[index] ?? 0) > (currentParts[index] ?? 0)) return true;
    if ((latestParts[index] ?? 0) < (currentParts[index] ?? 0)) return false;
  }
  return false;
};
