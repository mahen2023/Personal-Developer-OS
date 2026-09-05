import { WorkspaceProvider } from '@/components/system/WorkspaceProvider';
import { VaultProvider } from '@/components/system/VaultProvider';
import { NotificationProvider } from '@/components/system/NotificationProvider';
import { ShortcutLayer, ShortcutsHelp } from '@/components/system/ShortcutLayer';
import { CommandPalette } from '@/components/command/CommandPalette';
import { NavigationRail } from '@/components/shell/NavigationRail';
import { TopBar } from '@/components/shell/TopBar';
import { StatusBar } from '@/components/shell/StatusBar';
import { ContextPanel, ContextSlotProvider } from '@/components/shell/ContextPanel';

/**
 * The application shell (§6): command bar on top, navigation on the left, a
 * collapsible context panel on the right, a machine-state rule underneath.
 * Only the centre workspace scrolls — the chrome is fixed, like a desktop app.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider initialUser={null}>
      <VaultProvider>
        <NotificationProvider>
          <ContextSlotProvider>
            <div className="flex h-screen flex-col overflow-hidden">
              <TopBar />
              <div className="flex min-h-0 flex-1">
                <NavigationRail />
                <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--surface-base)]">
                  {children}
                </main>
                <ContextPanel />
              </div>
              <StatusBar />
            </div>

            <CommandPalette />
            <ShortcutsHelp />
            <ShortcutLayer />
          </ContextSlotProvider>
        </NotificationProvider>
      </VaultProvider>
    </WorkspaceProvider>
  );
}

/**
 * Every page behind the shell is per-user and auth-gated, so there is nothing
 * to prerender. Rendering dynamically also lets list pages read their filters
 * from useSearchParams during SSR — statically prerendering them would bail
 * out to a client-side skeleton and lose the server-rendered HTML entirely.
 */
export const dynamic = 'force-dynamic';
