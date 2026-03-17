import type { SnapshotDiff } from "./types";

interface DiffEdit {
  type: "equal" | "insert" | "delete";
  line: string;
}

const buildEditScript = (
  trace: Int32Array[],
  before: string[],
  after: string[],
  offset: number,
): DiffEdit[] => {
  const edits: DiffEdit[] = [];
  let currentX = before.length;
  let currentY = after.length;

  for (let depth = trace.length - 1; depth > 0; depth--) {
    const snapshot = trace[depth];
    const diagonal = currentX - currentY;
    const diagonalIndex = diagonal + offset;

    const previousDiagonal =
      diagonal === -depth ||
      (diagonal !== depth && snapshot[diagonalIndex - 1] < snapshot[diagonalIndex + 1])
        ? diagonal + 1
        : diagonal - 1;

    const previousX = snapshot[previousDiagonal + offset];
    let previousY = previousX - previousDiagonal;

    while (currentX > previousX && currentY > previousY) {
      currentX--;
      currentY--;
      edits.push({ type: "equal", line: before[currentX] });
    }

    if (currentX === previousX) {
      currentY--;
      edits.push({ type: "insert", line: after[currentY] });
    } else {
      currentX--;
      edits.push({ type: "delete", line: before[currentX] });
    }
  }

  while (currentX > 0 && currentY > 0) {
    currentX--;
    currentY--;
    edits.push({ type: "equal", line: before[currentX] });
  }

  edits.reverse();
  return edits;
};

const myersDiff = (before: string[], after: string[]): DiffEdit[] => {
  const beforeLength = before.length;
  const afterLength = after.length;
  const maxEdits = beforeLength + afterLength;

  if (maxEdits === 0) return [];

  if (beforeLength === afterLength) {
    let identical = true;
    for (let index = 0; index < beforeLength; index++) {
      if (before[index] !== after[index]) {
        identical = false;
        break;
      }
    }
    if (identical) return before.map((line) => ({ type: "equal" as const, line }));
  }

  const vectorSize = 2 * maxEdits + 1;
  const vector = new Int32Array(vectorSize);
  vector.fill(-1);
  const trace: Int32Array[] = [];

  vector[maxEdits + 1] = 0;

  for (let depth = 0; depth <= maxEdits; depth++) {
    trace.push(new Int32Array(vector));

    for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
      const index = diagonal + maxEdits;
      let currentX: number;

      if (diagonal === -depth || (diagonal !== depth && vector[index - 1] < vector[index + 1])) {
        currentX = vector[index + 1];
      } else {
        currentX = vector[index - 1] + 1;
      }

      let currentY = currentX - diagonal;

      while (
        currentX < beforeLength &&
        currentY < afterLength &&
        before[currentX] === after[currentY]
      ) {
        currentX++;
        currentY++;
      }

      vector[index] = currentX;

      if (currentX >= beforeLength && currentY >= afterLength) {
        return buildEditScript(trace, before, after, maxEdits);
      }
    }
  }

  return buildEditScript(trace, before, after, maxEdits);
};

export const diffSnapshots = (before: string, after: string): SnapshotDiff => {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const edits = myersDiff(beforeLines, afterLines);

  let additions = 0;
  let removals = 0;
  let unchanged = 0;
  const diffLines: string[] = [];

  for (const edit of edits) {
    switch (edit.type) {
      case "equal":
        unchanged++;
        diffLines.push(`  ${edit.line}`);
        break;
      case "insert":
        additions++;
        diffLines.push(`+ ${edit.line}`);
        break;
      case "delete":
        removals++;
        diffLines.push(`- ${edit.line}`);
        break;
    }
  }

  return {
    diff: diffLines.join("\n"),
    additions,
    removals,
    unchanged,
    changed: additions > 0 || removals > 0,
  };
};
