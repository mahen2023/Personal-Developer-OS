/**
 * Splitting a record into retrievable pieces (§35).
 *
 * The unit of retrieval is the unit of citation: a chunk has to be small enough
 * that quoting it is useful, and large enough that it still makes sense on its
 * own. Paragraph boundaries are preferred over a fixed character count because
 * a chunk that starts mid-sentence reads like a bug in the answer.
 */

const TARGET = 1_100;
const MAX = 1_600;
/** Carried from the end of one chunk into the next, so a fact split across a
 *  boundary is still complete in at least one of them. */
const OVERLAP = 180;

export function chunk(text: string): string[] {
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!clean) return [];
  if (clean.length <= MAX) return [clean];

  const blocks = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = trimmed.length > OVERLAP ? `${tailOf(trimmed)}\n\n` : '';
  };

  for (const block of blocks) {
    // A single block over the limit — a long code fence or a wall of prose —
    // gets cut on sentence ends, then bluntly if it has none.
    for (const piece of block.length > MAX ? split(block) : [block]) {
      if (current.length + piece.length > TARGET && current.trim()) flush();
      current += `${piece}\n\n`;
    }
  }
  flush();

  return chunks.filter((value) => value.length > 20);
}

/** The last whole sentence or so, used as the overlap into the next chunk. */
function tailOf(text: string): string {
  const tail = text.slice(-OVERLAP);
  const boundary = tail.search(/[.!?]\s/);
  return boundary === -1 ? tail : tail.slice(boundary + 2);
}

function split(block: string): string[] {
  const sentences = block.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [block];
  const pieces: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    // Nothing to break on: a minified bundle or a base64 blob. Cut it evenly.
    if (sentence.length > MAX) {
      if (buffer) (pieces.push(buffer), (buffer = ''));
      for (let index = 0; index < sentence.length; index += TARGET) {
        pieces.push(sentence.slice(index, index + TARGET));
      }
      continue;
    }
    if (buffer.length + sentence.length > TARGET) {
      pieces.push(buffer);
      buffer = '';
    }
    buffer += sentence;
  }
  if (buffer.trim()) pieces.push(buffer);
  return pieces;
}

/**
 * Joins a record's fields into the text that gets indexed, dropping empties.
 * Field labels are kept: "Root cause: …" is a much better retrieval target
 * than the same sentence floating free.
 */
export function compose(parts: (readonly [string, string | null | undefined])[]): string {
  return parts
    .filter((part): part is readonly [string, string] => Boolean(part[1]?.trim()))
    .map(([label, value]) => (label ? `${label}: ${value.trim()}` : value.trim()))
    .join('\n\n');
}
