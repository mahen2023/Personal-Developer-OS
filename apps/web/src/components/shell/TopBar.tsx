'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, Lock, LogOut, Monitor, Moon, PanelRight, Search, Sun, Unlock } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { findNavItem } from '@/lib/navigation';
import { useTheme } from '@/components/system/ThemeProvider';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { useVault } from '@/components/system/VaultProvider';
import { useNotifications } from '@/components/system/NotificationProvider';
import { KeyHint } from '@/components/primitives';

const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const;

/**
 * The command bar (§6). Its centre is the search trigger rather than a logo,
 * because ⌘K is how this app is meant to be driven.
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setPaletteOpen, contextOpen, toggleContext, user, summary } = useWorkspace();
  const { preference, cycle } = useTheme();
  const { unlocked, locksIn, lock } = useVault();
  const { unread } = useNotifications();
  const [signingOut, setSigningOut] = useState(false);

  const location = findNavItem(pathname);
  const ThemeIcon = THEME_ICON[preference];
  // Two different things: `unread` is what the scan raised and you have not
  // seen; `attention` is what the dashboard computes live. The bell counts the
  // first, because that is the one with an unread state to clear.
  const attention = summary?.attention.length ?? 0;

  async function signOut() {
    setSigningOut(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b border-line bg-[var(--surface-sunken)] px-3"
      style={{ height: 'var(--topbar-h)' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="mono flex h-[22px] w-[22px] items-center justify-center rounded-sm border border-[var(--accent-line)] bg-[var(--accent-dim)] text-[11px] font-bold text-[var(--accent)]"
        >
          /
        </span>
        <div className="hidden min-w-0 items-baseline gap-2 sm:flex">
          <span className="truncate text-[12.5px] font-medium">Developer OS</span>
          {location && (
            <>
              <span className="text-[var(--text-faint)]">/</span>
              <span className="truncate text-[12.5px] text-[var(--text-muted)]">
                {location.item.label}
              </span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="group mx-auto flex h-[27px] w-full max-w-[460px] items-center gap-2 rounded border border-line bg-[var(--surface-base)] px-[9px] text-left transition-colors duration-[var(--fast)] hover:border-[var(--line-strong)]"
      >
        <Search size={13} className="shrink-0 text-[var(--text-faint)]" />
        <span className="flex-1 truncate text-[12px] text-[var(--text-faint)]">
          Search everything, or run a command…
        </span>
        <KeyHint keys={['⌘', 'K']} />
      </button>

      <div className="flex shrink-0 items-center gap-[2px]">
        <IconButton
          label={
            unread > 0
              ? `${unread} unread ${unread === 1 ? 'notification' : 'notifications'}`
              : attention > 0
                ? `Nothing unread — ${attention} things need attention`
                : 'Nothing needs attention'
          }
          onClick={() => router.push('/notifications')}
        >
          <Bell size={14} />
          {(unread > 0 || attention > 0) && (
            <span
              className="absolute right-[6px] top-[6px] h-[5px] w-[5px] rounded-full"
              style={{ background: unread > 0 ? 'var(--danger)' : 'var(--warning)' }}
            />
          )}
        </IconButton>

        {/* The vault's state is always visible in the chrome — being unlocked
            without noticing is the failure this prevents. */}
        <IconButton
          label={
            unlocked
              ? `Vault unlocked — locks in ${Math.floor((locksIn ?? 0) / 60)}m. Click to lock now.`
              : 'Vault is locked'
          }
          onClick={() => (unlocked ? lock() : router.push('/vault'))}
          active={unlocked}
        >
          {unlocked ? (
            <Unlock size={14} className="text-[var(--security)]" />
          ) : (
            <Lock size={14} className="text-[var(--text-muted)]" />
          )}
          {unlocked && (
            <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-[var(--security)]" />
          )}
        </IconButton>

        <IconButton label={`Theme: ${preference}`} onClick={cycle}>
          <ThemeIcon size={14} />
        </IconButton>

        <IconButton
          label={contextOpen ? 'Hide context panel' : 'Show context panel'}
          onClick={toggleContext}
          active={contextOpen}
        >
          <PanelRight size={14} />
        </IconButton>

        <span className="mx-1 h-4 w-px bg-[var(--line)]" />

        <button
          onClick={signOut}
          disabled={signingOut}
          title={user ? `Signed in as ${user.email}` : 'Sign out'}
          className="flex h-[27px] items-center gap-2 rounded px-[7px] text-[12px] text-[var(--text-muted)] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <span className="mono flex h-[19px] w-[19px] items-center justify-center rounded-sm border border-line bg-[var(--surface-raised)] text-[10px] uppercase">
            {user?.name?.slice(0, 2) ?? '··'}
          </span>
          <LogOut size={13} className="hidden sm:block" />
        </button>
      </div>
    </header>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx(
        'relative flex h-[27px] w-[27px] items-center justify-center rounded transition-colors duration-[var(--fast)]',
        active
          ? 'bg-[var(--surface-active)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  );
}
