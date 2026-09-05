import { IntegrationProvider, RepoProvider } from '@prisma/client';

/**
 * The outside services this build can talk to (§8 of the phase list).
 *
 * Every one of them is plain REST over `fetch`. No vendor SDK is installed,
 * for a reason worth stating: an SDK is a large dependency, a release cadence
 * and a surface area, bought here to save perhaps thirty lines of request
 * building. If a provider ever needs request signing — AWS does — that
 * calculation changes and an SDK becomes the right answer.
 *
 * A provider appears in this file when its client exists and has been run
 * against the real API. The screen lists exactly these, so it can never offer
 * a connection that does nothing.
 */

export interface Identity {
  /** Who the token belongs to, as the provider reports it. */
  account: string;
  /** What the provider says the token may do. Empty when it will not say. */
  scopes: string[];
}

export interface RepoFacts {
  name: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  isPrivate: boolean;
  /** Canonical URL, so a renamed repository corrects its own record. */
  url: string;
}

export interface ZoneFacts {
  name: string;
  status: string;
  nameServers: string[];
}

export interface Provider {
  id: IntegrationProvider;
  label: string;
  /** What connecting actually gets you, in one sentence, no marketing. */
  does: string;
  /** Where to create the token, so nobody has to go looking. */
  tokenUrl: string;
  /** The narrowest scope that works. Shown before the token is pasted. */
  scopeHint: string;
  /** Verifies the token and reports who it belongs to. */
  identify(token: string): Promise<Identity>;
}

/* ── shared plumbing ──────────────────────────────────────────────────────── */

class ProviderError extends Error {
  constructor(provider: string, status: number) {
    // Status and provider only. A provider's error body can echo the request,
    // and the request contains the token (§43).
    super(
      status === 401 || status === 403
        ? `${provider} rejected that token. Check it has not expired and has the scope listed above.`
        : `${provider} returned ${status}.`,
    );
  }
}

async function get<T>(
  provider: string,
  url: string,
  headers: Record<string, string>,
): Promise<{ body: T; headers: Headers }> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'developer-os', ...headers },
    // A hung provider must not hold a request open until the proxy gives up.
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new ProviderError(provider, response.status);
  return { body: (await response.json()) as T, headers: response.headers };
}

/* ── GitHub ───────────────────────────────────────────────────────────────── */

const githubHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
});

export const github: Provider = {
  id: IntegrationProvider.GITHUB,
  label: 'GitHub',
  does: 'Keeps repository descriptions, languages and default branches in step with the remote.',
  tokenUrl: 'https://github.com/settings/tokens',
  scopeHint: 'A fine-grained token with read-only "Metadata" access is enough.',
  async identify(token) {
    const { body, headers } = await get<{ login: string }>(
      'GitHub',
      'https://api.github.com/user',
      githubHeaders(token),
    );
    return {
      account: body.login,
      // Classic tokens report scopes in a header; fine-grained ones do not, and
      // an empty list is the honest answer rather than a guess.
      scopes: (headers.get('x-oauth-scopes') ?? '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
    };
  },
};

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  private: boolean;
  html_url: string;
}

export async function githubRepo(token: string, owner: string, repo: string): Promise<RepoFacts> {
  const { body } = await get<GitHubRepo>(
    'GitHub',
    `https://api.github.com/repos/${owner}/${repo}`,
    // Public repositories answer without a token at all, which is what makes
    // this verifiable without an account.
    token ? githubHeaders(token) : {},
  );
  return {
    name: body.name,
    description: body.description,
    defaultBranch: body.default_branch,
    language: body.language,
    isPrivate: body.private,
    url: body.html_url,
  };
}

/* ── GitLab ───────────────────────────────────────────────────────────────── */

export const gitlab: Provider = {
  id: IntegrationProvider.GITLAB,
  label: 'GitLab',
  does: 'Same as GitHub, for projects hosted on gitlab.com.',
  tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  scopeHint: 'A personal access token with the "read_api" scope.',
  async identify(token) {
    const { body } = await get<{ username: string }>('GitLab', 'https://gitlab.com/api/v4/user', {
      'private-token': token,
    });
    return { account: body.username, scopes: ['read_api'] };
  },
};

interface GitLabProject {
  name: string;
  description: string | null;
  default_branch: string | null;
  visibility: string;
  web_url: string;
}

export async function gitlabProject(token: string, path: string): Promise<RepoFacts> {
  const { body } = await get<GitLabProject>(
    'GitLab',
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`,
    token ? { 'private-token': token } : {},
  );
  return {
    name: body.name,
    description: body.description,
    defaultBranch: body.default_branch ?? 'main',
    // GitLab has no language field on the project record; leaving it null is
    // better than a second request per repository to compute one.
    language: null,
    isPrivate: body.visibility !== 'public',
    url: body.web_url,
  };
}

/* ── Cloudflare ───────────────────────────────────────────────────────────── */

export const cloudflare: Provider = {
  id: IntegrationProvider.CLOUDFLARE,
  label: 'Cloudflare',
  does: 'Lists the zones on your account so domains can be recorded without typing them.',
  tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  scopeHint: 'A token with Zone → Zone → Read. Nothing needs write access.',
  async identify(token) {
    const { body } = await get<{ result: { id: string; status: string } }>(
      'Cloudflare',
      'https://api.cloudflare.com/client/v4/user/tokens/verify',
      { authorization: `Bearer ${token}` },
    );
    // Cloudflare answers 200 with `success: false` for a token that parses but
    // is not active, so the status is checked rather than the HTTP code.
    if (body.result?.status !== 'active') {
      throw new Error('That Cloudflare token is not active.');
    }
    return { account: `token ${body.result.id.slice(0, 8)}`, scopes: ['zone:read'] };
  },
};

export async function cloudflareZones(token: string): Promise<ZoneFacts[]> {
  const { body } = await get<{
    result: { name: string; status: string; name_servers?: string[] }[];
  }>('Cloudflare', 'https://api.cloudflare.com/client/v4/zones?per_page=100', {
    authorization: `Bearer ${token}`,
  });
  return (body.result ?? []).map((zone) => ({
    name: zone.name,
    status: zone.status,
    nameServers: zone.name_servers ?? [],
  }));
}

/* ── registry ─────────────────────────────────────────────────────────────── */

export const PROVIDERS: Record<IntegrationProvider, Provider> = {
  [IntegrationProvider.GITHUB]: github,
  [IntegrationProvider.GITLAB]: gitlab,
  [IntegrationProvider.CLOUDFLARE]: cloudflare,
};

/**
 * Pulls `owner/repo` out of a clone URL, whichever form it was pasted in.
 * Returns null rather than guessing when the host is not one we can call.
 */
export function repoRef(
  url: string,
  provider: RepoProvider,
): { host: IntegrationProvider; path: string } | null {
  const cleaned = url
    .trim()
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!path.includes('/')) return null;

  if (parsed.hostname === 'github.com' || provider === RepoProvider.GITHUB) {
    return parsed.hostname === 'github.com' ? { host: IntegrationProvider.GITHUB, path } : null;
  }
  if (parsed.hostname === 'gitlab.com') return { host: IntegrationProvider.GITLAB, path };
  // Self-hosted GitLab, Bitbucket and Azure DevOps all end up here. Saying so
  // is better than half-working against an API this has never been run on.
  return null;
}
