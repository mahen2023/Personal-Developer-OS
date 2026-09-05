/**
 * Turning text into a vector (§35).
 *
 * Two providers, one shape. The default runs here with no account, no key and
 * no network — because an application that stops working when a third party
 * changes its pricing is not self-hosted. The optional provider produces
 * genuinely semantic vectors for anyone who wants them.
 *
 * Both emit DIMENSIONS numbers, so the `vector(384)` column fits either. That
 * is not a coincidence: OpenAI's v3 models can be asked to reduce to a given
 * width, and the local provider is built to match. Changing DIMENSIONS means a
 * migration and a full re-index.
 */

export const DIMENSIONS = 384;

/** Honest names. The model that produced a vector is stored next to it. */
export const LOCAL_MODEL = 'local-lexical-v1';

export interface Embedder {
  readonly model: string;
  /** Human-facing description of what this actually does. */
  readonly kind: 'lexical' | 'semantic';
  embed(texts: string[]): Promise<number[][]>;
}

/* ── tokenisation ─────────────────────────────────────────────────────────── */

/**
 * Words that appear in nearly every chunk carry no signal but do collide with
 * real terms, so they are dropped before hashing. Deliberately short: an
 * aggressive stop list starts eating domain words like "no", "not" and "off"
 * that matter a great deal in a configuration note.
 */
const STOP = new Set(
  (
    'the a an and or of to in for on at is are was were be been it its this that these those' +
    ' with as by from we i you they he she but if then than so such can could would should' +
    ' will do does did have has had my your our their there here what which who how when'
  ).split(' '),
);

/**
 * Light suffix stripping, so "deploying", "deployed", "deploys" and
 * "deployment" all land in the same bucket. Not a real stemmer — Porter would
 * be another dependency and several hundred lines to save a handful of misses
 * on a personal corpus.
 *
 * Applied repeatedly until it stops changing, which is what keeps it
 * *consistent*: one pass would turn "documents" into "document" and
 * "document" into "docu", and those two would then never match each other.
 * Consistency matters more here than linguistic correctness.
 */
const SUFFIXES = ['ation', 'ment', 'ing', 'edly', 'ure', 'ed', 'es', 's'];

function stem(word: string): string {
  let result = word;
  for (let stripped = true; stripped;) {
    stripped = false;
    for (const suffix of SUFFIXES) {
      if (result.length > suffix.length + 3 && result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length);
        stripped = true;
        break;
      }
    }
  }
  return result;
}

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((word) => word.length > 1 && word.length < 40 && !STOP.has(word));
  return words.map(stem);
}

/* ── the local provider ───────────────────────────────────────────────────── */

/** FNV-1a. Fast, well-spread, and short enough to read. */
function hash(value: string, seed: number): number {
  let result = 0x811c9dc5 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/**
 * The hashing trick with signed buckets: each term lands in one dimension and
 * adds or subtracts. The sign matters — without it, two unrelated terms that
 * collide always reinforce each other, and similarity drifts upward for every
 * pair of long documents.
 *
 * Character 4-grams go in alongside whole words at a lower weight, which is
 * what makes `TypeError` match `typeerror` and `kubectl` match `kubectrl`.
 */
function lexicalVector(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const words = tokenize(text);

  const add = (term: string, weight: number): void => {
    const digest = hash(term, 0);
    const bucket = digest % DIMENSIONS;
    const sign = (hash(term, 0x9e3779b9) & 1) === 0 ? 1 : -1;
    vector[bucket] += sign * weight;
  };

  for (const word of words) {
    add(word, 1);
    for (let index = 0; index + 4 <= word.length; index += 1) {
      add(`#${word.slice(index, index + 4)}`, 0.35);
    }
  }

  // Adjacent pairs give a little word order, so "database migration" is not
  // identical to "migration database".
  for (let index = 0; index + 1 < words.length; index += 1) {
    add(`${words[index]}~${words[index + 1]}`, 0.5);
  }

  return normalise(vector);
}

/**
 * Unit length, so cosine similarity is a plain dot product and a long note
 * cannot outscore a short one purely by having more words in it.
 */
export function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  if (length === 0) return vector;
  return vector.map((value) => value / length);
}

export const localEmbedder: Embedder = {
  model: LOCAL_MODEL,
  kind: 'lexical',
  embed: (texts) => Promise.resolve(texts.map(lexicalVector)),
};

/* ── the optional provider ────────────────────────────────────────────────── */

/**
 * OpenAI's embedding endpoint, reached with `fetch` rather than the SDK — it is
 * one POST, and a dependency that exists to build one POST is a dependency that
 * will need updating for no benefit.
 *
 * `dimensions` is what lets a 1536-wide model fill a 384-wide column: v3 models
 * are trained so a truncated vector stays useful.
 */
export function openAiEmbedder(apiKey: string, model: string): Embedder {
  return {
    model: `${model}@${DIMENSIONS}`,
    kind: 'semantic',
    async embed(texts) {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts, dimensions: DIMENSIONS }),
      });
      if (!response.ok) {
        // The key is in the request, never in the message.
        throw new Error(`The embedding provider returned ${response.status}.`);
      }
      const body = (await response.json()) as { data: { index: number; embedding: number[] }[] };
      const ordered = new Array<number[]>(texts.length);
      for (const item of body.data) ordered[item.index] = item.embedding;
      return ordered;
    },
  };
}

/** pgvector's own literal syntax. Prisma has no type for it, so we format it. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}
