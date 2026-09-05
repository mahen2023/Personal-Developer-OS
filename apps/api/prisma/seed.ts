/**
 * Optional demo data (§68).
 *
 *   npm run db:seed              seed the first user's workspace
 *   npm run db:seed -- --clear   remove every demo record, leave yours alone
 *
 * Every row uses a deterministic id from the `demo()` helper, so clearing is
 * exact: it deletes the ids this file creates and nothing else. Re-running the
 * seed is safe — it upserts.
 *
 * There are no vault items here. A demo secret is still a secret-shaped row,
 * and shipping fake credentials teaches the wrong habit.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Deterministic, obviously-fake UUIDs: deadbeef-0000-4000-8000-<table><counter>.
 * The `deadbeef` prefix makes demo rows recognisable at a glance in psql, and
 * makes `--clear` exact rather than heuristic.
 */
const counters = new Map<string, number>();
const tableIndex = new Map<string, number>();

function demo(table: string): string {
  if (!tableIndex.has(table)) tableIndex.set(table, tableIndex.size + 1);
  const next = (counters.get(table) ?? 0) + 1;
  counters.set(table, next);
  const slot = tableIndex.get(table)!.toString(16).padStart(4, '0');
  return `deadbeef-0000-4000-8000-${slot}${next.toString(16).padStart(8, '0')}`;
}

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main(): Promise<void> {
  const clear = process.argv.includes('--clear');

  const owner = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!owner) {
    console.error('No account yet. Register in the app first, then run the seed.');
    process.exitCode = 1;
    return;
  }
  const userId = owner.id;

  // ── projects ──────────────────────────────────────────────────────────────
  const projects = [
    {
      id: demo('proj'),
      name: 'Basuki Automaton',
      slug: 'basuki-automaton',
      description: 'Warehouse automation platform. Node API, Next dashboard, MongoDB replica set.',
      status: 'ACTIVE' as const,
      priority: 'HIGH' as const,
      client: 'Internal',
      color: '#e0a458',
      startDate: days(-140),
      targetDate: days(38),
      techStack: ['TypeScript', 'NestJS', 'Next.js', 'MongoDB', 'Docker'],
      progress: 72,
      isFavorite: true,
    },
    {
      id: demo('proj'),
      name: 'Ledger Reconciler',
      slug: 'ledger-reconciler',
      description: 'Nightly reconciliation between the payment gateway and the accounting ledger.',
      status: 'ACTIVE' as const,
      priority: 'MEDIUM' as const,
      client: 'Finance',
      color: '#5b93d6',
      startDate: days(-62),
      targetDate: days(12),
      techStack: ['Python', 'PostgreSQL', 'Airflow'],
      progress: 45,
    },
    {
      id: demo('proj'),
      name: 'Atlas Docs',
      slug: 'atlas-docs',
      description: 'Static documentation site for the internal platform APIs.',
      status: 'ON_HOLD' as const,
      priority: 'LOW' as const,
      color: '#4fa85f',
      startDate: days(-210),
      techStack: ['Astro', 'MDX'],
      progress: 90,
    },
  ];
  const [basuki, ledger, atlas] = projects.map((project) => project.id);

  // ── infrastructure ────────────────────────────────────────────────────────
  const environments = [
    {
      id: demo('env'),
      projectId: basuki,
      name: 'Production',
      type: 'PRODUCTION' as const,
      baseUrl: 'https://api.basuki.example.com',
    },
    {
      id: demo('env'),
      projectId: basuki,
      name: 'Staging',
      type: 'STAGING' as const,
      baseUrl: 'https://staging.basuki.example.com',
    },
    { id: demo('env'), projectId: ledger, name: 'Production', type: 'PRODUCTION' as const },
  ];
  const [basukiProd, basukiStaging, ledgerProd] = environments.map((environment) => environment.id);

  const servers = [
    {
      id: demo('srv'),
      projectId: basuki,
      environmentId: basukiProd,
      name: 'Production API',
      provider: 'GCP' as const,
      ipAddress: '34.101.14.22',
      hostname: 'basuki-api-prod',
      os: 'Ubuntu 24.04 LTS',
      cpuCores: 8,
      ramGb: 32,
      diskGb: 520,
      region: 'asia-southeast2',
      sshUsername: 'deploy',
      services: ['Docker', 'MongoDB', 'Redis', 'Nginx'],
      status: 'ONLINE' as const,
    },
    {
      id: demo('srv'),
      projectId: basuki,
      environmentId: basukiStaging,
      name: 'Staging',
      provider: 'HETZNER' as const,
      ipAddress: '128.140.7.91',
      hostname: 'basuki-staging',
      os: 'Debian 12',
      cpuCores: 4,
      ramGb: 8,
      diskGb: 160,
      region: 'nbg1',
      sshUsername: 'deploy',
      services: ['Docker', 'MongoDB'],
      status: 'ONLINE' as const,
    },
    {
      id: demo('srv'),
      projectId: ledger,
      environmentId: ledgerProd,
      name: 'Reconciler Worker',
      provider: 'AWS' as const,
      ipAddress: '54.169.8.4',
      hostname: 'ledger-worker-1',
      os: 'Amazon Linux 2023',
      cpuCores: 2,
      ramGb: 4,
      diskGb: 80,
      region: 'ap-southeast-1',
      sshUsername: 'ec2-user',
      services: ['Airflow', 'PostgreSQL client'],
      status: 'DEGRADED' as const,
      notes: 'Disk usage climbing since the retention change.',
    },
  ];

  const databases = [
    {
      id: demo('db'),
      projectId: basuki,
      environmentId: basukiProd,
      serverId: servers[0].id,
      name: 'basuki-primary',
      type: 'MONGODB' as const,
      host: '10.184.0.3',
      port: 27017,
      databaseName: 'basuki',
      username: 'basuki_app',
      version: '7.0',
      sizeMb: 14200,
      backupSchedule: 'daily 02:00',
      lastBackupAt: days(-1),
    },
    {
      id: demo('db'),
      projectId: basuki,
      environmentId: basukiProd,
      serverId: servers[0].id,
      name: 'basuki-cache',
      type: 'REDIS' as const,
      host: '10.184.0.4',
      port: 6379,
      version: '7.2',
    },
    {
      id: demo('db'),
      projectId: ledger,
      environmentId: ledgerProd,
      name: 'ledger',
      type: 'POSTGRESQL' as const,
      host: 'ledger.cluster.ap-southeast-1.rds.amazonaws.com',
      port: 5432,
      databaseName: 'ledger',
      username: 'ledger_ro',
      version: '16.3',
      sizeMb: 88000,
      backupSchedule: 'hourly WAL',
      lastBackupAt: days(-0.02),
    },
  ];

  const domains = [
    {
      id: demo('dom'),
      projectId: basuki,
      environmentId: basukiProd,
      name: 'basuki.example.com',
      registrar: 'Cloudflare',
      dnsProvider: 'Cloudflare',
      expiresAt: days(211),
      autoRenew: true,
    },
    {
      id: demo('dom'),
      projectId: basuki,
      environmentId: basukiProd,
      name: 'api.basuki.example.com',
      registrar: 'Cloudflare',
      dnsProvider: 'Cloudflare',
      expiresAt: days(211),
      autoRenew: true,
    },
    {
      id: demo('dom'),
      projectId: atlas,
      name: 'atlas-docs.example.com',
      registrar: 'Namecheap',
      dnsProvider: 'Route 53',
      expiresAt: days(19),
      autoRenew: false,
      notes: 'Decide whether Atlas is still worth renewing.',
    },
  ];

  const certificates = [
    {
      id: demo('ssl'),
      projectId: basuki,
      environmentId: basukiProd,
      domainId: domains[1].id,
      commonName: 'api.basuki.example.com',
      issuer: "Let's Encrypt R11",
      issuedAt: days(-27),
      expiresAt: days(63),
      autoRenew: true,
    },
    {
      id: demo('ssl'),
      projectId: basuki,
      environmentId: basukiStaging,
      commonName: 'staging.basuki.example.com',
      issuer: "Let's Encrypt R11",
      issuedAt: days(-78),
      expiresAt: days(12),
      autoRenew: true,
    },
    {
      id: demo('ssl'),
      projectId: atlas,
      domainId: domains[2].id,
      commonName: 'atlas-docs.example.com',
      issuer: 'ZeroSSL',
      issuedAt: days(-88),
      expiresAt: days(2),
      autoRenew: false,
      notes: 'Renewal hook broke when the box was rebuilt.',
    },
  ];

  const repositories = [
    {
      id: demo('repo'),
      projectId: basuki,
      name: 'basuki-api',
      provider: 'GITHUB' as const,
      url: 'https://github.com/example/basuki-api',
      localPath: 'E:/Projects/basuki-api',
      defaultBranch: 'main',
      language: 'TypeScript',
      description: 'NestJS service and background workers.',
    },
    {
      id: demo('repo'),
      projectId: basuki,
      name: 'basuki-web',
      provider: 'GITHUB' as const,
      url: 'https://github.com/example/basuki-web',
      defaultBranch: 'main',
      language: 'TypeScript',
      description: 'Operator dashboard.',
    },
    {
      id: demo('repo'),
      projectId: ledger,
      name: 'ledger-reconciler',
      provider: 'GITLAB' as const,
      url: 'https://gitlab.com/example/ledger-reconciler',
      defaultBranch: 'develop',
      language: 'Python',
    },
  ];

  const deployments = [
    {
      id: demo('dep'),
      projectId: basuki,
      repositoryId: repositories[0].id,
      environmentId: basukiProd,
      serverId: servers[0].id,
      version: 'v2.14.0',
      commitSha: '9f3c1ab',
      status: 'SUCCESS' as const,
      deployedBy: owner.name,
      deployedAt: days(-0.3),
      durationSec: 184,
    },
    {
      id: demo('dep'),
      projectId: basuki,
      repositoryId: repositories[0].id,
      environmentId: basukiProd,
      serverId: servers[0].id,
      version: 'v2.13.4',
      commitSha: '4d90e7c',
      status: 'ROLLED_BACK' as const,
      deployedBy: owner.name,
      deployedAt: days(-2.1),
      durationSec: 96,
      notes: 'Rolled back — replica set election storm under load.',
    },
    {
      id: demo('dep'),
      projectId: ledger,
      repositoryId: repositories[2].id,
      environmentId: ledgerProd,
      serverId: servers[2].id,
      version: '2026.08.3',
      commitSha: 'c17ab55',
      status: 'FAILED' as const,
      deployedBy: owner.name,
      deployedAt: days(-5.4),
      durationSec: 41,
      notes: 'Airflow DAG import error.',
    },
  ];

  // ── knowledge and work ────────────────────────────────────────────────────
  const notes = [
    {
      id: demo('note'),
      projectId: basuki,
      title: 'MongoDB transaction notes',
      type: 'TECHNICAL' as const,
      content:
        '# Transactions\n\nMulti-document transactions need a replica set, even single-node.\n\n```bash\nmongosh --eval "rs.initiate()"\n```\n\nSee the related solution for the Docker setup.',
    },
    {
      id: demo('note'),
      projectId: basuki,
      title: 'Docker infrastructure',
      type: 'DOCUMENTATION' as const,
      content:
        'Compose stack: api, worker, mongo (rs0), redis, nginx.\n\nnginx terminates TLS; certs renew via the deploy user cron.',
    },
    {
      id: demo('note'),
      projectId: ledger,
      title: 'Reconciliation edge cases',
      type: 'RESEARCH' as const,
      content:
        'Refunds settled across a month boundary land in the wrong period.\n\nCandidate fix: key on settlement date, not transaction date.',
    },
    {
      id: demo('note'),
      projectId: null,
      title: 'Server rebuild checklist',
      type: 'DOCUMENTATION' as const,
      content:
        '1. SSH keys\n2. Docker + compose\n3. Restore volumes\n4. Re-issue certificates\n5. Verify cron jobs (the one everyone forgets)',
      isPinned: true,
    },
    {
      id: demo('note'),
      projectId: null,
      title: 'Things to try next quarter',
      type: 'IDEA' as const,
      content:
        'pgvector for note search. Tailscale instead of the bastion. Drop the staging box and use ephemeral envs.',
    },
  ];

  const solutions = [
    {
      id: demo('sol'),
      projectId: basuki,
      title: 'MongoDB replica set configuration',
      problem: 'Writes using a transaction failed immediately on a fresh Docker environment.',
      errorMessage: 'Transaction numbers are only allowed on a replica set member or mongos',
      environment: 'Docker · MongoDB 7.0 · single node',
      rootCause:
        'MongoDB was running as a standalone instance. Transactions require a replica set, even one with a single member.',
      solution:
        'Start mongod with --replSet rs0 and initiate the set once. Point the connection string at the set with directConnection=true.',
      commands: [
        'docker compose exec mongo mongosh --eval "rs.initiate()"',
        'mongosh "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true"',
      ],
      useCount: 4,
    },
    {
      id: demo('sol'),
      projectId: basuki,
      title: 'Nginx 502 after container restart',
      problem:
        'Nginx kept returning 502 after the API container was recreated, until nginx itself was restarted.',
      errorMessage: 'connect() failed (111: Connection refused) while connecting to upstream',
      environment: 'Docker Compose · nginx 1.27',
      rootCause:
        'Nginx resolves upstream hostnames once at startup and caches the old container IP.',
      solution:
        'Use a variable for the upstream host so nginx re-resolves per request, with the Docker DNS resolver configured.',
      commands: ['resolver 127.0.0.11 valid=10s;', 'set $upstream http://api:4000;'],
      useCount: 7,
    },
    {
      id: demo('sol'),
      projectId: ledger,
      title: 'Airflow DAG import error after dependency bump',
      problem: 'Every DAG vanished from the UI after a deploy.',
      errorMessage: "ModuleNotFoundError: No module named 'airflow.providers.postgres'",
      environment: 'Airflow 2.9 · Amazon Linux 2023',
      rootCause: 'The provider package is no longer bundled and was not in requirements.txt.',
      solution: 'Pin apache-airflow-providers-postgres explicitly and rebuild the image.',
      commands: ['pip install "apache-airflow-providers-postgres==5.11.1"'],
      useCount: 1,
    },
  ];

  const tasks = [
    {
      id: demo('task'),
      projectId: atlas,
      title: 'Renew atlas-docs.example.com certificate',
      status: 'TODO' as const,
      priority: 'URGENT' as const,
      dueDate: days(1),
    },
    {
      id: demo('task'),
      projectId: basuki,
      title: 'Investigate replica set election storm',
      description: 'Happened during the v2.13.4 rollout under peak load.',
      status: 'IN_PROGRESS' as const,
      priority: 'HIGH' as const,
      dueDate: days(3),
    },
    {
      id: demo('task'),
      projectId: ledger,
      title: 'Fix month-boundary refund reconciliation',
      status: 'BLOCKED' as const,
      priority: 'HIGH' as const,
      dueDate: days(-2),
    },
    {
      id: demo('task'),
      projectId: basuki,
      title: 'Move staging off the Hetzner box',
      status: 'TODO' as const,
      priority: 'LOW' as const,
      dueDate: days(28),
    },
    {
      id: demo('task'),
      projectId: null,
      title: 'Rotate the deploy SSH key',
      status: 'DONE' as const,
      priority: 'MEDIUM' as const,
      completedAt: days(-9),
    },
  ];

  const commands = [
    {
      id: demo('cmd'),
      title: 'Docker cleanup',
      command: 'docker system prune -a --volumes',
      description: 'Removes every unused image, network and volume.',
      category: 'Docker',
      platform: 'LINUX' as const,
      dangerLevel: 'DESTRUCTIVE' as const,
    },
    {
      id: demo('cmd'),
      projectId: basuki,
      title: 'MongoDB replica set init',
      command: 'docker compose exec mongo mongosh --eval "rs.initiate()"',
      category: 'MongoDB',
      platform: 'DOCKER' as const,
      dangerLevel: 'CAUTION' as const,
    },
    {
      id: demo('cmd'),
      title: 'Certificate expiry check',
      command:
        'echo | openssl s_client -servername $1 -connect $1:443 2>/dev/null | openssl x509 -noout -enddate',
      description: 'Prints the expiry date of a live certificate.',
      category: 'TLS',
      platform: 'LINUX' as const,
    },
    {
      id: demo('cmd'),
      title: 'Postgres logical dump',
      command: 'pg_dump -Fc -d "$DATABASE_URL" -f backup.dump',
      category: 'PostgreSQL',
      platform: 'ANY' as const,
    },
    {
      id: demo('cmd'),
      title: 'Find the largest directories',
      command: 'du -h --max-depth=1 / | sort -hr | head -20',
      description: 'First thing to run when a disk fills up.',
      category: 'Linux',
      platform: 'LINUX' as const,
    },
  ];

  const snippets = [
    {
      id: demo('snip'),
      projectId: basuki,
      title: 'Mongo transaction wrapper',
      language: 'typescript',
      code: 'export async function inTransaction<T>(client: MongoClient, work: (session: ClientSession) => Promise<T>): Promise<T> {\n  const session = client.startSession();\n  try {\n    return await session.withTransaction(() => work(session));\n  } finally {\n    await session.endSession();\n  }\n}',
      description: 'Always ends the session, even when the body throws.',
    },
    {
      id: demo('snip'),
      title: 'Wait for a healthy port',
      language: 'bash',
      code: 'until nc -z "$1" "$2"; do sleep 0.5; done',
      description: 'Entrypoint guard so a container waits for its dependency.',
    },
    {
      id: demo('snip'),
      projectId: ledger,
      title: 'Chunked iterator',
      language: 'python',
      code: 'def chunked(rows, size):\n    batch = []\n    for row in rows:\n        batch.append(row)\n        if len(batch) == size:\n            yield batch\n            batch = []\n    if batch:\n        yield batch',
    },
  ];

  const adrs = [
    {
      id: demo('adr'),
      projectId: basuki,
      number: 1,
      title: 'Run MongoDB as a single-node replica set',
      status: 'ACCEPTED' as const,
      context:
        'The domain model needs multi-document transactions, which standalone MongoDB does not support.',
      decision:
        'Run a single-member replica set in every environment, including local development.',
      alternatives: 'Drop transactions and compensate in application code. Move to PostgreSQL.',
      consequences:
        'Local setup needs one extra init step. Environments now match production semantics.',
      decidedAt: days(-118),
    },
    {
      id: demo('adr'),
      projectId: ledger,
      number: 2,
      title: 'Reconcile on settlement date',
      status: 'PROPOSED' as const,
      context: 'Refunds crossing a month boundary are attributed to the wrong period.',
      decision: 'Key reconciliation on settlement date rather than transaction date.',
      alternatives: 'Special-case boundary refunds. Re-run the previous period nightly.',
      consequences: 'Historical reports shift slightly and need a one-off backfill.',
    },
  ];

  const meetings = [
    {
      id: demo('meet'),
      projectId: basuki,
      title: 'Post-mortem: v2.13.4 rollback',
      meetingDate: days(-2),
      participants: [owner.name, 'Platform on-call'],
      discussion: 'Election storm under peak write load during a rolling restart.',
      decisions: 'Stagger restarts and raise the election timeout before the next release.',
    },
  ];

  const ideas = [
    {
      id: demo('idea'),
      projectId: basuki,
      title: 'Ephemeral preview environments per pull request',
      description:
        'Spin an environment up per PR and tear it down on merge, replacing the shared staging box.',
      category: 'Infrastructure',
      priority: 'MEDIUM' as const,
      status: 'RESEARCHING' as const,
    },
    {
      id: demo('idea'),
      title: 'Semantic search over my own solutions',
      description: 'Ask "have I hit this error before" and get the record back, not a web result.',
      category: 'Knowledge',
      priority: 'HIGH' as const,
      status: 'PLANNED' as const,
    },
  ];

  const bookmarks = [
    {
      id: demo('bmk'),
      title: 'MongoDB transactions',
      url: 'https://www.mongodb.com/docs/manual/core/transactions/',
      category: 'DOCUMENTATION' as const,
      projectId: basuki,
    },
    {
      id: demo('bmk'),
      title: 'nginx resolver directive',
      url: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#resolver',
      category: 'REFERENCE' as const,
    },
    {
      id: demo('bmk'),
      title: 'OWASP password storage cheat sheet',
      url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
      category: 'SECURITY' as const,
    },
  ];

  const learning = [
    {
      id: demo('learn'),
      title: 'Designing Data-Intensive Applications',
      technology: 'Distributed systems',
      kind: 'BOOK' as const,
      status: 'LEARNING' as const,
      progress: 40,
      startedAt: days(-70),
    },
    {
      id: demo('learn'),
      title: 'pgvector in production',
      technology: 'PostgreSQL',
      kind: 'ARTICLE' as const,
      status: 'WANT_TO_LEARN' as const,
    },
  ];

  const tables = [
    ['project', projects],
    ['environment', environments],
    ['repository', repositories],
    ['server', servers],
    ['databaseInstance', databases],
    ['domain', domains],
    ['sslCertificate', certificates],
    ['deployment', deployments],
    ['note', notes],
    ['solution', solutions],
    ['task', tasks],
    ['command', commands],
    ['snippet', snippets],
    ['adr', adrs],
    ['meeting', meetings],
    ['idea', ideas],
    ['bookmark', bookmarks],
    ['learningItem', learning],
  ] as const;

  if (clear) {
    // Reverse order so children go before the rows they point at.
    for (const [table, rows] of [...tables].reverse()) {
      if (rows.length === 0) continue;
      const model = prisma[table] as { deleteMany: (args: unknown) => Promise<{ count: number }> };
      const { count } = await model.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      if (count > 0) console.warn(`  removed ${count} from ${table}`);
    }
    await prisma.activity.deleteMany({ where: { userId, action: { startsWith: 'demo.' } } });
    console.warn('Demo data removed.');
    return;
  }

  for (const [table, rows] of tables) {
    if (rows.length === 0) continue;
    const model = prisma[table] as {
      upsert: (args: unknown) => Promise<unknown>;
    };
    for (const row of rows) {
      const data = { ...row, userId };
      await model.upsert({ where: { id: row.id }, create: data, update: data });
    }
    console.warn(`  ${rows.length.toString().padStart(2)} ${table}`);
  }

  // A believable feed, so the dashboard timeline is not the one empty panel.
  const feed: [string, string, number][] = [
    ['demo.deployment.created', 'Deployed basuki-api v2.14.0 to Production', -0.3],
    ['demo.solution.created', 'Solved: Nginx 502 after container restart', -0.5],
    ['demo.deployment.rolled_back', 'Rolled back basuki-api v2.13.4', -2.1],
    ['demo.meeting.created', 'Recorded post-mortem for the v2.13.4 rollback', -2.0],
    ['demo.server.created', 'Added Reconciler Worker on AWS', -5.4],
    ['demo.adr.created', 'Created ADR-001 — single-node replica set', -118],
  ];
  await prisma.activity.deleteMany({ where: { userId, action: { startsWith: 'demo.' } } });
  await prisma.activity.createMany({
    data: feed.map(([action, summary, offset]) => ({
      userId,
      projectId: basuki,
      action,
      summary,
      createdAt: days(offset),
    })),
  });

  console.warn(`\nDemo data seeded for ${owner.email}. Remove it with: npm run db:seed -- --clear`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
