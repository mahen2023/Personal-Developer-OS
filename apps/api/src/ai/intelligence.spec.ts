import { AiMode, AiRole, EntityType } from '@prisma/client';
import {
  HISTORY_BUDGET,
  buildPrompt,
  deriveTitle,
  renderSources,
  trimHistory,
} from './chat/prompt';
import { MODES, SELECTABLE_SOURCES, assertNoSecrets } from './chat/modes';
import { classify, watchdog } from './providers/ollama.provider';
import type { PromptSource } from './chat/prompt';

function source(overrides: Partial<PromptSource> = {}): PromptSource {
  return {
    index: 1,
    entityType: 'SOLUTION',
    entityId: '0f8d0000-0000-4000-8000-000000000001',
    title: 'MongoDB replica set',
    content: 'Transactions need a replica set, even a single-node one.',
    href: '/solutions/0f8d0000-0000-4000-8000-000000000001',
    score: 0.81,
    pinned: false,
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('puts the question last, where the model looks first', () => {
    const turns = buildPrompt({
      mode: AiMode.GENERAL,
      project: null,
      sources: [source()],
      history: [],
      question: 'How do I enable transactions?',
    });

    expect(turns.at(-1)).toEqual({ role: 'user', content: 'How do I enable transactions?' });
    expect(turns[0].role).toBe('system');
  });

  // Without this the model invents a citation rather than admitting the shelf
  // was empty, which is the one failure that makes the whole console untrustworthy.
  it('says so out loud when retrieval found nothing', () => {
    const [system] = buildPrompt({
      mode: AiMode.GENERAL,
      project: null,
      sources: [],
      history: [],
      question: 'anything',
    });
    expect(system.content).toContain('Nothing in the developer');
  });

  it('carries the project brief and a profile prompt into the system turn', () => {
    const [system] = buildPrompt({
      mode: AiMode.PROJECT,
      project: 'Name: Basuki Automaton',
      sources: [],
      history: [],
      question: 'status?',
      systemPrompt: 'Always answer in British English.',
    });

    expect(system.content).toContain('PROJECT\nName: Basuki Automaton');
    expect(system.content).toContain('British English');
  });

  it('drops TOOL turns, which are transcript furniture rather than dialogue', () => {
    const turns = buildPrompt({
      mode: AiMode.GENERAL,
      project: null,
      sources: [],
      history: [
        { role: AiRole.USER, content: 'first' },
        { role: AiRole.TOOL, content: 'retrieved 4 passages' },
        { role: AiRole.ASSISTANT, content: 'second' },
      ],
      question: 'third',
    });

    expect(turns.map((turn) => turn.content)).not.toContain('retrieved 4 passages');
    expect(turns).toHaveLength(4);
  });
});

describe('renderSources', () => {
  it('numbers sources so the citations in the answer line up', () => {
    const rendered = renderSources([
      source({ index: 1, title: 'First' }),
      source({ index: 2, title: 'Second' }),
    ]);
    expect(rendered).toContain('[1] First');
    expect(rendered).toContain('[2] Second');
  });

  it('shortens every passage rather than dropping whole ones', () => {
    const long = source({ content: 'x'.repeat(50_000) });
    const rendered = renderSources([long, source({ index: 2, content: 'y'.repeat(50_000) })]) ?? '';
    expect(rendered).toContain('[1]');
    expect(rendered).toContain('[2]');
    expect(rendered.length).toBeLessThan(20_000);
  });

  it('marks an attached record as attached, not as its type', () => {
    expect(renderSources([source({ pinned: true })])).toContain('(attached)');
  });

  it('is null rather than an empty heading when there is nothing', () => {
    expect(renderSources([])).toBeNull();
  });
});

describe('trimHistory', () => {
  it('keeps the most recent exchange when the budget is blown', () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? AiRole.USER : AiRole.ASSISTANT,
      content: 'z'.repeat(1_000),
    }));
    history.push({ role: AiRole.USER, content: 'the newest question' });

    const kept = trimHistory(history);
    expect(kept.at(-1)?.content).toBe('the newest question');
    expect(kept.reduce((sum, turn) => sum + turn.content.length, 0)).toBeLessThan(
      HISTORY_BUDGET + 500,
    );
  });

  // A model handed a truncated thread with no warning treats it as the whole
  // conversation and contradicts what it said earlier.
  it('tells the model when earlier turns were dropped', () => {
    const history = Array.from({ length: 30 }, () => ({
      role: AiRole.USER,
      content: 'q'.repeat(2_000),
    }));
    expect(trimHistory(history)[0].content).toMatch(/dropped to fit the context window/);
  });

  it('leaves a short conversation alone', () => {
    const history = [
      { role: AiRole.USER, content: 'hello' },
      { role: AiRole.ASSISTANT, content: 'hi' },
    ];
    expect(trimHistory(history)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });
});

describe('deriveTitle', () => {
  it.each([
    ['How do I configure MongoDB transactions?', 'How do I configure MongoDB transactions'],
    ['  ## Deploy checklist  ', 'Deploy checklist'],
    ['first line\nsecond line', 'First line'],
  ])('names a conversation from %p', (question, expected) => {
    expect(deriveTitle(question)).toBe(expected);
  });

  it('caps the length, because the rail is narrow', () => {
    expect(deriveTitle('word '.repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it('falls back rather than producing an empty title', () => {
    expect(deriveTitle('   ')).toBe('New conversation');
  });
});

describe('the secret boundary', () => {
  // The one boundary where a mistake cannot be walked back: a secret sent to a
  // model has been sent. Three independent things stop it, and this is the third.
  it('never offers vault items as a retrieval source', () => {
    expect(SELECTABLE_SOURCES).not.toContain(EntityType.VAULT_ITEM);
  });

  it('drops vault items even when a stored conversation asks for them', () => {
    const asked = [EntityType.NOTE, EntityType.VAULT_ITEM, EntityType.SOLUTION];
    expect(assertNoSecrets(asked)).toEqual([EntityType.NOTE, EntityType.SOLUTION]);
  });

  it('tells every mode that secret values are unavailable to it', () => {
    for (const definition of Object.values(MODES)) {
      expect(definition.system).toMatch(/Secret values are never available/);
    }
  });

  it('never puts a vault item in a mode default', () => {
    for (const definition of Object.values(MODES)) {
      expect(definition.defaultSources).not.toContain(EntityType.VAULT_ITEM);
    }
  });
});

describe('classify', () => {
  it('turns a missing model into advice, not a stack trace', () => {
    const error = classify('model "qwen3:14b" not found, try pulling it first', 'qwen3:14b');
    expect(error.reason).toBe('MODEL_MISSING');
    expect(error.message).toContain('qwen3:14b');
  });

  it('recognises an out-of-memory failure, which needs a different answer', () => {
    expect(classify('cudaMalloc failed: out of memory', 'llama3.1:70b').reason).toBe(
      'OUT_OF_MEMORY',
    );
  });

  it('keeps an unrecognised message rather than swallowing it', () => {
    const error = classify('something new went wrong');
    expect(error.reason).toBe('SERVER');
    expect(error.message).toBe('something new went wrong');
  });

  it('reads a 404 as a missing model even when the body says nothing', () => {
    expect(classify('Ollama returned 404.', 'codellama:13b', 404).reason).toBe('MODEL_MISSING');
  });
});

describe('watchdog', () => {
  const tick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('does not fire while something keeps arriving', async () => {
    const watch = watchdog(60);
    for (let index = 0; index < 5; index += 1) {
      await tick(20);
      watch.touch();
    }
    expect(watch.signal.aborted).toBe(false);
    expect(watch.timedOut).toBe(false);
    watch.done();
  });

  // The bug this replaces: an absolute deadline cut a healthy answer off
  // mid-sentence, which from the browser is a dropped connection.
  it('fires once nothing has arrived for the whole window', async () => {
    const watch = watchdog(40);
    await tick(90);
    expect(watch.signal.aborted).toBe(true);
    expect(watch.timedOut).toBe(true);
  });

  it('stops when the caller stops, and does not call that a timeout', async () => {
    const controller = new AbortController();
    const watch = watchdog(10_000, controller.signal);
    controller.abort();
    await tick(5);
    expect(watch.signal.aborted).toBe(true);
    // The difference between "you stopped this" and "the model went quiet".
    expect(watch.timedOut).toBe(false);
  });

  it('goes quiet after done(), so a finished stream cannot abort a later one', async () => {
    const watch = watchdog(30);
    watch.done();
    await tick(70);
    expect(watch.signal.aborted).toBe(false);
  });
});
