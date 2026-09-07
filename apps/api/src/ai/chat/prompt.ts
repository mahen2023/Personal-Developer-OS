import { AiMode, AiRole } from '@prisma/client';
import type { ChatTurn } from '../providers/ai-provider.interface';
import { GROUND, MODES, WITH_KNOWLEDGE } from './modes';

/**
 * Building the request sent to the model (§41).
 *
 * Pure functions, no injection, no database. That is deliberate: prompt
 * construction is the part most worth testing and the part most often buried
 * somewhere it cannot be. Everything here is decided from its arguments.
 *
 * The order is fixed and meaningful:
 *
 *   system instructions + mode
 *   project context
 *   attached records          — chosen by hand, always sent
 *   retrieved knowledge       — chosen per question
 *   conversation history      — trimmed
 *   the question
 *
 * Attached records come before retrieved ones because the developer picked
 * them; when the window is tight, retrieval is what gets cut.
 */

export interface PromptSource {
  index: number;
  entityType: string;
  entityId: string;
  title: string;
  content: string;
  href: string;
  score: number;
  /** True when the developer attached this by hand rather than retrieval. */
  pinned: boolean;
}

export interface PromptContext {
  mode: AiMode;
  /** Prose describing the attached project. Empty when none is attached. */
  project: string | null;
  sources: PromptSource[];
  history: { role: AiRole; content: string }[];
  question: string;
  /** Extra instructions from a model profile, appended to the mode's own. */
  systemPrompt?: string | null;
}

/**
 * How much conversation to carry forward, in characters (§59).
 *
 * Characters rather than tokens because the count has to be right without
 * asking the model: a tokeniser per model family would be a dependency and a
 * lookup table that goes stale, and the failure it prevents — a request too
 * large — is one Ollama reports plainly anyway.
 *
 * ponytail: fixed budget, oldest turns dropped with a marker. A summarising
 * pass over the dropped turns is the upgrade if long threads start losing the
 * thread; it costs a second model call per send, which is why it is not here.
 */
export const HISTORY_BUDGET = 12_000;
export const SOURCE_BUDGET = 9_000;

export function buildPrompt(context: PromptContext): ChatTurn[] {
  const definition = MODES[context.mode];

  // Whether this conversation has been opened to the workspace at all. With it
  // shut there is no mention of sources, citations or a knowledge base anywhere
  // in the prompt — a model told to cite what it was never given spends its
  // first sentence apologising for finding nothing.
  const knowledge = context.sources.length > 0 || Boolean(context.project);

  const system = [GROUND];
  if (knowledge) system.push(WITH_KNOWLEDGE);
  system.push(definition.system);

  if (context.project) system.push(`PROJECT\n${context.project}`);
  if (context.systemPrompt?.trim()) system.push(context.systemPrompt.trim());

  const sources = renderSources(context.sources);
  if (sources) {
    system.push(sources);
  } else if (knowledge) {
    // Said out loud, because a model handed no sources will otherwise cite
    // sources that do not exist rather than admit the shelf was empty. Only
    // when retrieval was asked for at all — otherwise there is no shelf.
    system.push(
      "SOURCES\nNothing in the developer's workspace matched this question. Say so before answering from general knowledge.",
    );
  }

  return [
    { role: 'system', content: system.join('\n\n') },
    ...trimHistory(context.history),
    { role: 'user', content: context.question },
  ];
}

/**
 * Numbered sources, in the order the citations use.
 *
 * Truncation is per passage rather than by dropping whole passages: five
 * shortened sources cite better than two complete ones, and a passage cut in
 * the middle still shows what it is about.
 */
export function renderSources(sources: PromptSource[]): string | null {
  if (sources.length === 0) return null;

  const share = Math.max(400, Math.floor(SOURCE_BUDGET / sources.length));
  const blocks = sources.map((source) => {
    const body =
      source.content.length > share ? `${source.content.slice(0, share)}…` : source.content;
    const kind = source.pinned ? 'attached' : source.entityType.toLowerCase();
    return `[${source.index}] ${source.title} (${kind})\n${body}`;
  });

  return `SOURCES\n${blocks.join('\n\n')}`;
}

/**
 * The tail of the conversation that fits the budget.
 *
 * Kept from the end backwards, so the most recent exchange always survives,
 * and cut on a whole turn — half a reply is worse than no reply. When anything
 * is dropped the model is told, so it does not treat the thread as complete.
 */
export function trimHistory(history: { role: AiRole; content: string }[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  let used = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    const role = toChatRole(turn.role);
    if (!role) continue;
    if (used + turn.content.length > HISTORY_BUDGET) {
      kept.unshift({
        role: 'system',
        content: `[Earlier turns in this conversation were dropped to fit the context window. ${index + 1} of ${history.length} messages are not shown.]`,
      });
      break;
    }
    used += turn.content.length;
    kept.unshift({ role, content: turn.content });
  }

  return kept;
}

/** TOOL turns are transcript furniture, not something a model should answer. */
function toChatRole(role: AiRole): ChatTurn['role'] | null {
  if (role === AiRole.USER) return 'user';
  if (role === AiRole.ASSISTANT) return 'assistant';
  if (role === AiRole.SYSTEM) return 'system';
  return null;
}

/**
 * A conversation title from the first exchange (§10).
 *
 * Derived rather than generated: a second model call to name a thread costs a
 * cold model load and several seconds, which is a lot to spend on a label the
 * user can rename in one click. The first line of the question is almost
 * always what they would have typed anyway.
 */
export function deriveTitle(question: string): string {
  const firstLine = question.trim().split('\n')[0] ?? '';
  const cleaned = firstLine
    .replace(/^[#>\s*-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[?.!,:;]+$/, '')
    .trim();
  if (!cleaned) return 'New conversation';

  const title = cleaned.length > 60 ? `${cleaned.slice(0, 57).trimEnd()}…` : cleaned;
  return title.charAt(0).toUpperCase() + title.slice(1);
}
