import { PDFParse } from 'pdf-parse';
import { extractRawText } from 'mammoth';
import { Workbook, type CellValue } from 'exceljs';

/**
 * Getting plain text out of an uploaded file (§35).
 *
 * Only what can be read as prose is handled. Images and spreadsheets return
 * null rather than something invented — a document nobody can quote from is
 * better left out of the index than represented by a guess.
 */

export interface Extraction {
  text: string | null;
  /** Why there is no text, when there is none. Shown to the user as-is. */
  reason?: string;
}

const TEXT_LIKE = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/svg+xml',
]);

export async function extractText(mimeType: string, data: Buffer): Promise<Extraction> {
  if (TEXT_LIKE.has(mimeType)) {
    return { text: data.toString('utf8') };
  }

  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      const text = result.text.trim();
      return text
        ? { text }
        : { text: null, reason: 'This PDF has no text layer — it is probably a scan.' };
    } catch {
      // A corrupt or password-protected file is a normal thing to be handed.
      return { text: null, reason: 'This PDF could not be read.' };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  if (mimeType.includes('wordprocessingml')) {
    try {
      const result = await extractRawText({ buffer: data });
      return { text: result.value.trim() || null, reason: 'This document is empty.' };
    } catch {
      return { text: null, reason: 'This document could not be read.' };
    }
  }

  if (mimeType.startsWith('image/')) {
    return { text: null, reason: 'Images are not read — there is no OCR in this build.' };
  }
  if (mimeType.includes('spreadsheetml')) {
    return readSheets(data);
  }

  // The OLE2 formats (.doc, .xls) are a different file format that happens to
  // share a name with the XML ones. Neither mammoth nor exceljs reads them,
  // and the libraries that do are unmaintained. They upload and download
  // intact; they just cannot be shown.
  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
    return {
      text: null,
      reason: 'The pre-2007 binary Office format cannot be read. Save it as .docx or .xlsx.',
    };
  }
  return { text: null, reason: `${mimeType} files are not indexed.` };
}

/**
 * A spreadsheet as Markdown tables, one per sheet.
 *
 * Markdown because the document page already renders it and the index already
 * quotes from it — a CSV blob would need a parser at both ends to become a
 * table again.
 */
async function readSheets(data: Buffer): Promise<Extraction> {
  const workbook = new Workbook();
  try {
    // ponytail: whole file in memory, same as every other reader here; stream
    // with `xlsx.read` if a sheet ever arrives that does not fit.
    await workbook.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return { text: null, reason: 'This workbook could not be read.' };
  }

  const out: string[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    // ponytail: 1000 rows a sheet. Past that a table is not a preview any more;
    // raise it if search starts missing things in the tail of a big export.
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
      if (number > 1000) return;
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((value) => md(value as CellValue)));
    });
    if (rows.length === 0) continue;

    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row: string[]): string =>
      `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
    const [header, ...body] = rows;

    out.push(`## ${sheet.name}\n`);
    out.push(pad(header));
    out.push(`|${' --- |'.repeat(width)}`);
    out.push(...body.map(pad));
    if (sheet.rowCount > 1000) out.push(`\n_Showing the first 1000 of ${sheet.rowCount} rows._`);
    out.push('');
  }

  return out.length > 0
    ? { text: out.join('\n') }
    : { text: null, reason: 'Every sheet in this workbook is empty.' };
}

/** One cell as text. Formulas keep their result, not their formula. */
function md(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return md(value.result as CellValue);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return String(value.error);
    return '';
  }
  // A pipe would end the column early, and a newline would end the table.
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
