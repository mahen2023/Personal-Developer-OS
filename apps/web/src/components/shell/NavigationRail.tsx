'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAVIGATION, type NavItem, ALL_NAV_ITEMS } from '@/lib/navigation';
import { cx } from '@/lib/format';
import type { DashboardCounts } from '@/lib/types';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { KeyHint } from '@/components/primitives';

const RECENT_KEY = 'devos.recent';
const RECENT_LIMIT = 4;

/** Remembers where you have been so 28 destinations stay navigable. */
function useRecentRoutes(pathname: string): NavItem[] {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const stored: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    const next = [pathname, ...stored.filter((href) => href !== pathname)].slice(
      0,
      RECENT_LIMIT + 1,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    // The current route is excluded from its own "recent" list.
    setRecent(next.filter((href) => href !== pathname).slice(0, RECENT_LIMIT));
  }, [pathname]);

  return recent
    .map((href) => ALL_NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
}

export function NavigationRail() {
  const pathname = usePathname();
  const { railCollapsed, toggleRail, summary } = useWorkspace();
  const recent = useRecentRoutes(pathname);

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 flex-col overflow-hidden border-r border-line bg-[var(--surface-sunken)] transition-[width] duration-[var(--base)] ease-[var(--ease)]"
      style={{ width: railCollapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)' }}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {recent.length > 0 && !railCollapsed && (
          <Section label="Recent">
            {recent.map((item) => (
              <RailLink
                key={`recent-${item.href}`}
                item={item}
                pathname={pathname}
                collapsed={false}
                muted
              />
            ))}
          </Section>
        )}

        {NAVIGATION.map((section) => (
          <Section key={section.label} label={section.label} collapsed={railCollapsed}>
            {section.items.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={railCollapsed}
                counts={summary?.counts}
              />
            ))}
          </Section>
        ))}
      </div>

      <button
        onClick={toggleRail}
        aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-[18px] text-[var(--text-faint)] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        {railCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        {!railCollapsed && <span className="text-[12px]">Collapse</span>}
      </button>
    </nav>
  );
}

function Section({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[10px]">
      {collapsed ? (
        // A hairline stands in for the section heading when collapsed, keeping
        // the grouping legible without a label to read.
        <div className="mx-[14px] mb-[6px] h-px bg-[var(--line)]" />
      ) : (
        <div className="label flex items-center gap-2 px-[18px] pb-[5px] pt-[6px]">
          {label}
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>
      )}
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function RailLink({
  item,
  pathname,
  collapsed,
  counts,
  muted = false,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  counts?: DashboardCounts;
  muted?: boolean;
}) {
  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  const count = item.counter ? counts?.[item.counter as keyof DashboardCounts] : undefined;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-[27px] items-center gap-[10px] pl-[18px] pr-[12px] transition-colors duration-[var(--fast)]',
        active
          ? 'bg-[var(--surface-active)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
        muted && !active && 'text-[var(--text-faint)]',
      )}
    >
      {/* Active marker is a rule, not a pill — the IDE idiom. */}
      <span
        aria-hidden
        className={cx(
          'absolute left-0 top-0 h-full w-[2px] transition-opacity duration-[var(--fast)]',
          active ? 'bg-[var(--accent)] opacity-100' : 'opacity-0',
        )}
      />
      <Icon
        size={14}
        strokeWidth={active ? 2 : 1.7}
        className={cx('shrink-0', active && 'text-[var(--accent)]')}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[12.5px]">{item.label}</span>
          {typeof count === 'number' && count > 0 && (
            <span className="num text-[11px] text-[var(--text-faint)]">{count}</span>
          )}
          {item.chord && (
            <span className="hidden group-hover:inline">
              <KeyHint keys={['g', item.chord]} />
            </span>
          )}
        </>
      )}
    </Link>
  );
}
