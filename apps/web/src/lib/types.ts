/** Shapes returned by the API. Kept narrow — only what the UI actually reads. */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AttentionItem {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  daysLeft: number | null;
  entityType: string;
  entityId: string;
}

export interface DashboardCounts {
  activeProjects: number;
  totalProjects: number;
  repositories: number;
  servers: number;
  databases: number;
  domains: number;
  openTasks: number;
  overdueTasks: number;
  solutions: number;
  notes: number;
  vaultItems: number;
  deployments: number;
}

export interface DashboardSummary {
  counts: DashboardCounts;
  attention: AttentionItem[];
  recent: {
    projects: {
      id: string;
      name: string;
      slug: string;
      status: string;
      color: string | null;
      updatedAt: string;
    }[];
    notes: { id: string; title: string; type: string; updatedAt: string }[];
    solutions: { id: string; title: string; updatedAt: string }[];
    deployments: { id: string; version: string | null; status: string; deployedAt: string }[];
  };
}

export interface ActivityEntry {
  id: string;
  action: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  project: { id: string; name: string; slug: string; color: string | null } | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Readiness {
  status: string;
  version: string;
  checks: Record<string, string>;
}

/* ── shared ───────────────────────────────────────────────────────────────── */

export interface TagRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface TagWithCount extends TagRef {
  count: number;
}

export interface ProjectRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  status: string;
}

export interface EntityRef {
  type: string;
  id: string;
  label: string;
  detail?: string;
  href: string;
}

/** Fields every user-owned record carries. */
interface Owned {
  id: string;
  projectId: string | null;
  project?: ProjectRef | null;
  createdAt: string;
  updatedAt: string;
  tags?: TagRef[];
}

/* ── projects ─────────────────────────────────────────────────────────────── */

export interface ProjectCounts {
  repositories: number;
  environments: number;
  servers: number;
  databases: number;
  domains: number;
  certificates: number;
  deployments: number;
  notes: number;
  tasks: number;
  issues: number;
  solutions: number;
  snippets: number;
  commands: number;
  adrs: number;
  meetings: number;
  documents: number;
  bookmarks: number;
  vaultItems: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  priority: string;
  client: string | null;
  color: string | null;
  startDate: string | null;
  targetDate: string | null;
  techStack: string[];
  progress: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  counts: ProjectCounts;
  tags: TagRef[];
}

export interface ProjectWorkspace {
  project: Project;
  health: Record<string, string>;
  infrastructure: {
    repositories: Repository[];
    environments: Environment[];
    servers: Server[];
    databases: DatabaseInstance[];
    domains: Domain[];
    certificates: SslCertificate[];
  };
  work: {
    tasks: Task[];
    notes: NoteRow[];
    solutions: Solution[];
    documents: DocumentRecord[];
    adrs: Adr[];
  };
  deployments: Deployment[];
  activities: ActivityEntry[];
}

export interface ProjectGraph {
  nodes: { id: string; type: string; label: string; detail?: string }[];
  edges: { from: string; to: string; kind: string }[];
}

/* ── work ─────────────────────────────────────────────────────────────────── */

export interface Note extends Owned {
  title: string;
  content: string;
  type: string;
  isPinned: boolean;
  tags: TagRef[];
  links: EntityRef[];
}

export type NoteRow = Omit<Note, 'content' | 'links'> & { preview: string };

export interface Task extends Owned {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: string | null;
  orderKey: number;
  completedAt: string | null;
  meeting?: { id: string; title: string } | null;
  links?: EntityRef[];
}

export interface Board {
  columns: { status: string; items: Task[]; total: number }[];
}

export interface TaskTimeline {
  days: { date: string; tasks: Task[] }[];
}

export interface Issue extends Owned {
  title: string;
  description: string | null;
  errorMessage: string | null;
  status: string;
  priority: string;
  solutionId: string | null;
  solution?: { id: string; title: string; useCount: number } | null;
  resolvedAt: string | null;
}

export interface Solution extends Owned {
  title: string;
  problem: string;
  errorMessage: string | null;
  environment: string | null;
  rootCause: string | null;
  solution: string;
  commands: string[];
  links: string[];
  useCount: number;
  related?: SolutionMatch[];
}

export interface SolutionMatch {
  id: string;
  title: string;
  score: number;
  reason: string;
}

export interface Adr extends Owned {
  number: number;
  title: string;
  status: string;
  context: string;
  decision: string;
  alternatives: string | null;
  consequences: string | null;
  supersededBy: string | null;
  decidedAt: string | null;
}

export interface Meeting extends Owned {
  title: string;
  meetingDate: string;
  participants: string[];
  discussion: string | null;
  decisions: string | null;
  actionItems?: Task[];
}

export interface Idea extends Owned {
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
}

/* ── developer ────────────────────────────────────────────────────────────── */

export interface Repository extends Owned {
  name: string;
  provider: string;
  url: string;
  localPath: string | null;
  defaultBranch: string;
  language: string | null;
  description: string | null;
  isPrivate: boolean;
  lastSyncedAt: string | null;
  deployments?: Deployment[];
}

export interface Snippet extends Owned {
  title: string;
  language: string;
  code: string;
  description: string | null;
  useCount: number;
}

export interface CommandRecord extends Owned {
  title: string;
  command: string;
  description: string | null;
  category: string | null;
  platform: string;
  dangerLevel: string;
  useCount: number;
}

/* ── knowledge ────────────────────────────────────────────────────────────── */

export interface DocumentRecord extends Owned {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  checksum: string | null;
  ownerType: string;
  ownerId: string | null;
  extractedText: string | null;
  links?: EntityRef[];
}

export interface Bookmark extends Owned {
  title: string;
  url: string;
  description: string | null;
  category: string;
  favicon: string | null;
}

export interface LearningItem extends Owned {
  title: string;
  technology: string | null;
  kind: string;
  url: string | null;
  status: string;
  progress: number;
  notes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/* ── infrastructure ───────────────────────────────────────────────────────── */

export interface EnvironmentRef {
  id: string;
  name: string;
  type: string;
}

export interface EnvVariable {
  id: string;
  environmentId: string;
  key: string;
  value: string | null;
  vaultItemId: string | null;
  isSecret: boolean;
  description: string | null;
  vaultItem?: { id: string; name: string; type: string } | null;
}

export interface Environment extends Owned {
  name: string;
  type: string;
  baseUrl: string | null;
  notes: string | null;
  variables?: EnvVariable[];
  counts?: { servers: number; databases: number; domains: number; deployments: number };
}

export interface Server extends Owned {
  name: string;
  provider: string;
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  cpuCores: number | null;
  ramGb: number | null;
  diskGb: number | null;
  region: string | null;
  sshUsername: string | null;
  sshPort: number | null;
  sshKeyId: string | null;
  services: string[];
  status: string;
  notes: string | null;
  environmentId: string | null;
  environment?: EnvironmentRef | null;
  sshKey?: { id: string; name: string; type: string } | null;
  databases?: { id: string; name: string; type: string }[];
}

export interface DatabaseInstance extends Owned {
  name: string;
  type: string;
  host: string | null;
  port: number | null;
  databaseName: string | null;
  username: string | null;
  credentialId: string | null;
  credential?: { id: string; name: string; type: string } | null;
  /** ok | stale | never | none — derived from the schedule and last backup. */
  backupStatus: string;
  /** A connection string with the password left as a placeholder. */
  connectionHint: string | null;
  version: string | null;
  sizeMb: number | null;
  backupSchedule: string | null;
  lastBackupAt: string | null;
  notes: string | null;
  environmentId: string | null;
  environment?: EnvironmentRef | null;
  serverId: string | null;
  server?: { id: string; name: string; status: string } | null;
}

/** Computed on read by the API, never stored — see domains.service.ts. */
export type ExpiryState = 'valid' | 'warning' | 'critical' | 'expired' | 'unknown';

export interface Domain extends Owned {
  name: string;
  registrar: string | null;
  dnsProvider: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  notes: string | null;
  environmentId: string | null;
  environment?: EnvironmentRef | null;
  daysLeft: number | null;
  state: ExpiryState;
  certificates?: SslCertificate[];
}

export interface SslCertificate extends Owned {
  commonName: string;
  issuer: string | null;
  issuedAt: string | null;
  expiresAt: string;
  autoRenew: boolean;
  notes: string | null;
  domainId: string | null;
  domain?: { id: string; name: string } | null;
  environmentId: string | null;
  environment?: EnvironmentRef | null;
  daysLeft: number | null;
  state: ExpiryState;
}

export interface Deployment extends Owned {
  version: string | null;
  commitSha: string | null;
  status: string;
  deployedBy: string | null;
  deployedAt: string;
  durationSec: number | null;
  notes: string | null;
  repositoryId: string | null;
  repository?: { id: string; name: string; url?: string; defaultBranch?: string } | null;
  environmentId: string | null;
  environment?: EnvironmentRef | null;
  serverId: string | null;
  server?: { id: string; name: string; status?: string } | null;
}

export interface DeploymentTimeline {
  days: { date: string; deployments: Deployment[] }[];
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    rolledBack: number;
    successRate: number | null;
  };
}

/* ── search ───────────────────────────────────────────────────────────────── */

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  snippet?: string;
  detail?: string;
  href: string;
  projectId: string | null;
  updatedAt: string;
  score: number;
}

export interface SearchResults {
  term: string;
  total: number;
  groups: { type: string; hits: SearchHit[] }[];
}
