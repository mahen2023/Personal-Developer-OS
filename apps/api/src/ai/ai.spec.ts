import { DIMENSIONS, localEmbedder, normalise, tokenize } from './embedding';
import { chunk, compose } from './chunking';
import { routeStructured } from './structured';
import { Workbook } from 'exceljs';
import { extractText } from './extract';

/** Cosine similarity. Both vectors are already unit length, so this is a dot. */
const similarity = (a: number[], b: number[]): number =>
  a.reduce((sum, value, index) => sum + value * b[index], 0);

const embed = async (text: string): Promise<number[]> => (await localEmbedder.embed([text]))[0];

describe('tokenize', () => {
  it('drops filler and folds word endings together', () => {
    expect(tokenize('The service is deploying to the cluster')).toEqual([
      'service',
      'deploy',
      'cluster',
    ]);
  });

  it('keeps the shapes developers actually search for', () => {
    expect(tokenize('run kubectl get pods -n prod-api')).toContain('kubectl');
    expect(tokenize('set DATABASE_URL in .env.local')).toContain('database_url');
  });
});

describe('the local embedder', () => {
  it('produces unit vectors of the column width', async () => {
    const vector = await embed('nginx reverse proxy timeout');
    expect(vector).toHaveLength(DIMENSIONS);
    expect(similarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('ranks a related passage above an unrelated one', async () => {
    const query = await embed('postgres connection pool exhausted');
    const related = await embed(
      'The Postgres connection pool was exhausted because pgbouncer had a max_client_conn of 20.',
    );
    const unrelated = await embed('Meeting notes: agreed the new brand colours with the designer.');

    expect(similarity(query, related)).toBeGreaterThan(similarity(query, unrelated));
    expect(similarity(query, related)).toBeGreaterThan(0.28); // the retrieval floor
  });

  it('survives a word ending it has never seen', async () => {
    const a = await embed('the deployment failed');
    const b = await embed('deploying failure');
    expect(similarity(a, b)).toBeGreaterThan(0.2);
  });

  it('gives an empty string a zero vector rather than throwing', async () => {
    expect(await embed('')).toHaveLength(DIMENSIONS);
  });

  it('normalises nothing to nothing', () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('chunk', () => {
  it('leaves a short record whole', () => {
    expect(chunk('One paragraph, nothing more.')).toEqual(['One paragraph, nothing more.']);
  });

  it('splits long text and overlaps the seam', () => {
    const paragraph = `${'Some prose about the incident. '.repeat(20)}\n\n`;
    const chunks = chunk(paragraph.repeat(6));

    expect(chunks.length).toBeGreaterThan(1);
    for (const piece of chunks) expect(piece.length).toBeLessThanOrEqual(1_600);
    // The tail of one chunk reappears at the head of the next, so a sentence
    // cut in half is still complete somewhere.
    expect(chunks[1].slice(0, 30)).not.toEqual('');
  });

  it('cuts text that offers no boundary at all', () => {
    const chunks = chunk('x'.repeat(5_000));
    expect(chunks.length).toBeGreaterThan(2);
    for (const piece of chunks) expect(piece.length).toBeLessThanOrEqual(1_600);
  });

  it('has nothing to say about empty input', () => {
    expect(chunk('   \n\n  ')).toEqual([]);
  });
});

describe('compose', () => {
  it('labels fields and drops the empty ones', () => {
    expect(
      compose([
        ['', 'Redis keeps evicting'],
        ['Root cause', null],
        ['Solution', 'maxmemory-policy was allkeys-lru'],
        ['Notes', '   '],
      ]),
    ).toBe('Redis keeps evicting\n\nSolution: maxmemory-policy was allkeys-lru');
  });
});

describe('routeStructured', () => {
  it('sends countable questions to a query', () => {
    expect(routeStructured('what certificates expire soon?')?.name).toBe('expiring');
    expect(routeStructured('how many open issues are there')?.name).toBe('open-issues');
    expect(routeStructured('what did I deploy recently')?.name).toBe('recent-deployments');
  });

  it('leaves knowledge questions to retrieval', () => {
    // Contains "certificate", but is asking what was written down about it.
    expect(routeStructured('how did I set up certificate pinning on android')).toBeNull();
    expect(routeStructured('why did we choose kafka over rabbitmq')).toBeNull();
    expect(routeStructured('what does the nginx 502 error mean')).toBeNull();
  });
});

describe('extractText, on a workbook', () => {
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async function workbookOf(rows: unknown[][], name = 'Sheet1'): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(name);
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('becomes a Markdown table the document page can render', async () => {
    const { text } = await extractText(
      XLSX,
      await workbookOf([
        ['Host', 'Region'],
        ['edge-01', 'fra1'],
      ]),
    );

    expect(text).toContain('## Sheet1');
    expect(text).toContain('| Host | Region |');
    expect(text).toContain('| --- | --- |');
    expect(text).toContain('| edge-01 | fra1 |');
  });

  // A stray pipe would close the column early and shear the rest of the row
  // into the wrong headings.
  it('escapes a cell that would otherwise break the table', async () => {
    const { text } = await extractText(XLSX, await workbookOf([['a | b'], ['plain']]));
    expect(text).toContain('| a \\| b |');
  });

  it('pads short rows so every row has the same number of columns', async () => {
    const { text } = await extractText(XLSX, await workbookOf([['a', 'b', 'c'], ['only']]));
    expect(text).toContain('| only |  |  |');
  });

  it('says so rather than throwing when the bytes are not a workbook', async () => {
    const result = await extractText(XLSX, Buffer.from('not a zip at all'));
    expect(result.text).toBeNull();
    expect(result.reason).toMatch(/could not be read/);
  });

  it('names the binary format for a pre-2007 file instead of staying silent', async () => {
    const result = await extractText('application/vnd.ms-excel', Buffer.from('\xd0\xcf\x11\xe0'));
    expect(result.text).toBeNull();
    expect(result.reason).toMatch(/pre-2007/);
  });
});
