import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type Cell = string | number | boolean | null | undefined;

const escape = (c: Cell) => {
  const s = c === null || c === undefined ? '' : String(c);
  // Cells that start with = + - @ would run as formulas in a spreadsheet; keep them as text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(escape).join(',')).join('\r\n');

/** Saves the rows as a CSV file and opens the share sheet (on the web it downloads the file). */
export async function shareCsv(fileName: string, rows: Cell[][]): Promise<void> {
  const text = `﻿${toCsv(rows)}`; // the byte order mark makes Excel read UTF-8 names correctly
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
}
