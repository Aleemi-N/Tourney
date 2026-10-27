export type Cell = string | number | boolean | null | undefined;

const escape = (c: Cell) => {
  const s = c === null || c === undefined ? '' : String(c);
  // Cells that start with = + - @ would run as formulas in a spreadsheet; keep them as text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(escape).join(',')).join('\r\n');

/** Downloads the rows as a CSV file (a byte order mark makes Excel read UTF-8 names correctly). */
export function downloadCsv(fileName: string, rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
