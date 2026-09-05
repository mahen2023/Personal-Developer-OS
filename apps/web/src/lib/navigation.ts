import {
  Activity,
  Archive,
  Bell,
  BookMarked,
  Boxes,
  Braces,
  CalendarClock,
  ChevronsLeftRight,
  CircuitBoard,
  Cloud,
  Database,
  FileText,
  FolderGit2,
  Globe,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Lock,
  type LucideIcon,
  Notebook,
  Plug,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Telescope,
  Terminal,
  TriangleAlert,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** `g` chord suffix, e.g. 'p' means "g then p". */
  chord?: string;
  /** Which dashboard counter fills the badge, if any. */
  counter?: string;
  /** Not yet implemented — rendered dimmed with a phase hint. */
  phase?: number;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * The single source of truth for navigation, the `g`-chord shortcuts and the
 * command palette's "go to" entries. Adding a module means adding one row.
 */
export const NAVIGATION: NavSection[] = [
  {
    label: 'Home',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, chord: 'd' },
      { label: 'Global Search', href: '/search', icon: Search, chord: '/' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      {
        label: 'Projects',
        href: '/projects',
        icon: Boxes,
        chord: 'p',
        counter: 'totalProjects',
        phase: 2,
      },
      { label: 'Notes', href: '/notes', icon: Notebook, chord: 'n', counter: 'notes', phase: 2 },
      {
        label: 'Tasks',
        href: '/tasks',
        icon: ListChecks,
        chord: 't',
        counter: 'openTasks',
        phase: 2,
      },
      { label: 'Issues', href: '/issues', icon: TriangleAlert, chord: 'i', phase: 3 },
      { label: 'Ideas', href: '/ideas', icon: Lightbulb, phase: 3 },
      { label: 'Meetings', href: '/meetings', icon: CalendarClock, phase: 3 },
    ],
  },
  {
    label: 'Developer',
    items: [
      {
        label: 'Repositories',
        href: '/repositories',
        icon: FolderGit2,
        chord: 'r',
        counter: 'repositories',
        phase: 3,
      },
      { label: 'Code Snippets', href: '/snippets', icon: Braces, phase: 3 },
      { label: 'Commands', href: '/commands', icon: Terminal, chord: 'c', phase: 3 },
      {
        label: 'Solutions',
        href: '/solutions',
        icon: CircuitBoard,
        counter: 'solutions',
        phase: 3,
      },
      { label: 'ADRs', href: '/adrs', icon: ScrollText, phase: 3 },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        label: 'Servers',
        href: '/servers',
        icon: Server,
        chord: 's',
        counter: 'servers',
        phase: 4,
      },
      { label: 'Databases', href: '/databases', icon: Database, counter: 'databases', phase: 4 },
      { label: 'Environments', href: '/environments', icon: Cloud, chord: 'e', phase: 4 },
      { label: 'Domains', href: '/domains', icon: Globe, counter: 'domains', phase: 4 },
      { label: 'SSL Certificates', href: '/certificates', icon: ShieldCheck, phase: 4 },
      {
        label: 'Deployments',
        href: '/deployments',
        icon: Rocket,
        counter: 'deployments',
        phase: 4,
      },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { label: 'Documents', href: '/documents', icon: FileText, phase: 2 },
      { label: 'Bookmarks', href: '/bookmarks', icon: BookMarked, phase: 3 },
      { label: 'Learning', href: '/learning', icon: GraduationCap, phase: 3 },
    ],
  },
  {
    label: 'Security',
    items: [
      { label: 'Vault', href: '/vault', icon: Lock, chord: 'v', counter: 'vaultItems', phase: 5 },
      { label: 'Passwords', href: '/vault/passwords', icon: KeyRound, phase: 5 },
      { label: 'API Keys', href: '/vault/api-keys', icon: Sparkles, phase: 5 },
      { label: 'SSH Keys', href: '/vault/ssh-keys', icon: SquareTerminal, phase: 5 },
      { label: 'TOTP', href: '/vault/totp', icon: ChevronsLeftRight, phase: 5 },
    ],
  },
  {
    label: 'Intelligence',
    // Not "AI Assistant", and not a robot icon (§76). What it does is look
    // through records you already have, so it is named and drawn for that.
    items: [{ label: 'Console', href: '/intelligence', icon: Telescope, chord: 'a' }],
  },
  {
    label: 'System',
    items: [
      { label: 'Attention', href: '/notifications', icon: Bell, chord: 'b' },
      { label: 'Activity', href: '/activity', icon: Activity },
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Automation', href: '/settings/automation', icon: RefreshCw },
      { label: 'Integrations', href: '/settings/integrations', icon: Plug },
      { label: 'Security', href: '/settings/security', icon: ShieldCheck },
      { label: 'Diagnostics', href: '/settings/diagnostics', icon: Archive },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items);

export function findNavItem(pathname: string): { section: NavSection; item: NavItem } | undefined {
  let best: { section: NavSection; item: NavItem } | undefined;
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      const matches = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
      // Longest matching href wins, so /vault/totp beats /vault.
      if (matches && (!best || item.href.length > best.item.href.length)) {
        best = { section, item };
      }
    }
  }
  return best;
}
