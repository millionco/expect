const escapeCsvCell = (value: string | number | boolean | null) => {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);

  if (/[",\n]/.test(stringValue) === false) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
};

export const toCsv = (
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>,
) =>
  [headers.join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))].join("\n");
