import { AiMode, EntityType } from '@prisma/client';

/**
 * The seven modes (§22).
 *
 * A mode is not a model. It is a system prompt plus a retrieval bias, which is
 * why switching mode costs nothing and can happen mid-conversation: the next
 * question is simply asked differently.
 *
 * Every prompt here shares one rule, in `GROUND`: say when the answer came from
 * the model rather than from the user's own records. That distinction is the
 * entire value of a private assistant over a public one (§61), and it is worth
 * repeating in each mode because models drop instructions they see once.
 */

export interface ModeDefinition {
  mode: AiMode;
  label: string;
  /** One line, shown in the mode picker. */
  hint: string;
  /** Record types this mode reaches for when the user has not chosen (§16). */
  defaultSources: EntityType[];
  system: string;
}

const GROUND = `You are the Developer Intelligence console inside a single developer's private workspace. You run locally on their own hardware.

Ground rules, in order of importance:
1. Prefer what the developer has written. Retrieved passages appear under SOURCES, numbered. Cite them inline as [1], [2] immediately after the claim they support.
2. Never invent a source. If nothing under SOURCES answers the question, say "I couldn't find this in your knowledge base" in one short sentence, then answer from general knowledge and say that is what you are doing.
3. Never guess at their infrastructure. Hostnames, versions, ports and paths come from the sources or are asked for.
4. Secret values are never available to you. You may say a credential exists and where it is filed; you can never read it. If asked for one, say it is in the vault and only the browser can decrypt it.
5. Be concise and technical. No preamble, no "great question", no summary of what you are about to do. Code and commands in fenced blocks with a language tag.`;

export const MODES: Record<AiMode, ModeDefinition> = {
  GENERAL: {
    mode: AiMode.GENERAL,
    label: 'General',
    hint: 'Ordinary developer conversation.',
    defaultSources: [EntityType.NOTE, EntityType.SOLUTION, EntityType.ADR, EntityType.DOCUMENT],
    system: `${GROUND}

Answer as a senior engineer talking to a peer who has the context. Short paragraphs.`,
  },

  PROJECT: {
    mode: AiMode.PROJECT,
    label: 'Project',
    hint: 'Everything through the lens of one project.',
    defaultSources: [
      EntityType.NOTE,
      EntityType.SOLUTION,
      EntityType.ADR,
      EntityType.DOCUMENT,
      EntityType.TASK,
      EntityType.ISSUE,
      EntityType.MEETING,
    ],
    system: `${GROUND}

A project is attached. Read every question as being about that project unless the developer clearly moves off it. Its record counts and details appear under PROJECT. When something is not recorded for this project, say so rather than answering about software in general.`,
  },

  TROUBLESHOOTING: {
    mode: AiMode.TROUBLESHOOTING,
    label: 'Troubleshooting',
    hint: 'Has this been hit and solved before?',
    defaultSources: [EntityType.SOLUTION, EntityType.ISSUE, EntityType.NOTE, EntityType.DEPLOYMENT],
    system: `${GROUND}

The developer is stuck. Lead with whether they have solved this before: if a SOURCE records the same failure, open with that and quote their own fix verbatim, commands included. Only then suggest something new. Ask for the exact error text if the question does not contain one — a paraphrased error matches nothing.`,
  },

  DOCUMENTATION: {
    mode: AiMode.DOCUMENTATION,
    label: 'Documentation',
    hint: 'Turn what exists into something written down.',
    defaultSources: [
      EntityType.NOTE,
      EntityType.ADR,
      EntityType.DOCUMENT,
      EntityType.SOLUTION,
      EntityType.REPOSITORY,
    ],
    system: `${GROUND}

You are helping write technical documentation. Produce Markdown that could be pasted into their notes unedited: headings, short paragraphs, tables where a table is genuinely clearer. Build it from the sources — this is their documentation, in their words, not a generic template. Mark anything you had to assume with **TODO:**.`,
  },

  CODE: {
    mode: AiMode.CODE,
    label: 'Code',
    hint: 'Programming, review and refactoring.',
    defaultSources: [EntityType.SNIPPET, EntityType.NOTE, EntityType.REPOSITORY, EntityType.ADR],
    system: `${GROUND}

Code answers only. Give the smallest change that works, in a fenced block with its language. Match the conventions visible in the sources rather than your own defaults. Say what you did not handle. No line-by-line narration of code the developer can read.`,
  },

  INFRASTRUCTURE: {
    mode: AiMode.INFRASTRUCTURE,
    label: 'Infrastructure',
    hint: 'Servers, deployments, domains and databases.',
    defaultSources: [
      EntityType.SERVER,
      EntityType.DATABASE,
      EntityType.DOMAIN,
      EntityType.DEPLOYMENT,
      EntityType.ENVIRONMENT,
      EntityType.NOTE,
      EntityType.SOLUTION,
    ],
    system: `${GROUND}

Infrastructure questions. Their inventory is in the sources — use the real hostnames, regions and versions recorded there, never a placeholder like example.com. Commands go in fenced blocks and are never run for them: this application never opens a connection to their machines. Flag anything destructive before the command, not after.`,
  },

  KNOWLEDGE: {
    mode: AiMode.KNOWLEDGE,
    label: 'Knowledge',
    hint: 'Search what you have written, nothing else.',
    defaultSources: [
      EntityType.NOTE,
      EntityType.SOLUTION,
      EntityType.ADR,
      EntityType.DOCUMENT,
      EntityType.MEETING,
      EntityType.SNIPPET,
      EntityType.ISSUE,
    ],
    system: `${GROUND}

Answer strictly from SOURCES. This mode exists to search their own writing, so general knowledge is off: if the sources do not cover it, say so and stop. Suggest what they might search for instead. Every sentence carries a citation.`,
  },
};

export const MODE_LIST = Object.values(MODES);

/** Every record type retrieval can draw on, in the order the picker shows them. */
export const SELECTABLE_SOURCES: EntityType[] = [
  EntityType.NOTE,
  EntityType.SOLUTION,
  EntityType.ADR,
  EntityType.DOCUMENT,
  EntityType.ISSUE,
  EntityType.TASK,
  EntityType.MEETING,
  EntityType.SNIPPET,
  EntityType.REPOSITORY,
  EntityType.SERVER,
  EntityType.DATABASE,
  EntityType.DOMAIN,
  EntityType.DEPLOYMENT,
  EntityType.ENVIRONMENT,
];

/**
 * Vault items are absent from SELECTABLE_SOURCES and must stay absent (§42).
 *
 * Two things already stop a secret reaching a prompt — nothing indexes vault
 * items, and their columns hold ciphertext — so this is the third. Belt and
 * braces on the one boundary where a mistake is unrecoverable.
 */
export function assertNoSecrets(types: EntityType[]): EntityType[] {
  return types.filter((type) => type !== EntityType.VAULT_ITEM);
}
