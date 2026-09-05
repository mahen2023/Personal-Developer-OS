'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
import { findNavItem } from '@/lib/navigation';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { StatusIndicator } from '@/components/primitives';

type Slot = { title: string; node: React.ReactNode } | null;

const ContextSlotContext = createContext<{ slot: Slot; setSlot: (slot: Slot) => void } | null>(
  null,
);

export function ContextSlotProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<Slot>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return <ContextSlotContext.Provider value={value}>{children}</ContextSlotContext.Provider>;
}

/**
 * Lets a page own the right panel (§49) — an entity page pushes its related
 * records here instead of forcing navigation to find them. The slot clears on
 * unmount so the panel never shows a stale entity.
 */
export function useContextPanel(title: string, node: React.ReactNode, deps: unknown[] = []): void {
  const context = useContext(ContextSlotContext);
  useEffect(() => {
    context?.setSlot({ title, node });
    return () => context?.setSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function ContextPanel() {
  const pathname = usePathname();
  const { contextOpen, summary } = useWorkspace();
  const slot = useContext(ContextSlotContext)?.slot ?? null;
  const location = findNavItem(pathname);

  if (!contextOpen) return null;

  return (
    <aside
      aria-label="Context"
      className="hidden shrink-0 flex-col overflow-hidden border-l border-line bg-[var(--surface-sunken)] xl:flex"
      style={{ width: 'var(--context-w)' }}
    >
      <div className="label flex h-8 shrink-0 items-center border-b border-line px-4">
        {slot?.title ?? 'Context'}
      </div>

      <div className="flex-1 overflow-y-auto">
        {slot ? (
          <div key={pathname} className="anim-enter">
            {slot.node}
          </div>
        ) : (
          <DefaultContext
            section={location?.section.label}
            label={location?.item.label}
            attention={summary?.attention.length ?? 0}
          />
        )}
      </div>
    </aside>
  );
}

/** Shown when no page has claimed the panel — orientation rather than filler. */
function DefaultContext({
  section,
  label,
  attention,
}: {
  section?: string;
  label?: string;
  attention: number;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="label mb-[6px]">Location</div>
        <div className="mono text-[12px] text-[var(--text-muted)]">
          {section?.toLowerCase() ?? 'workspace'} / {label?.toLowerCase() ?? 'home'}
        </div>
      </div>

      <div className="h-px bg-[var(--line)]" />

      <div>
        <div className="label mb-[6px]">Attention</div>
        <StatusIndicator
          signal={attention > 0 ? 'warning' : 'success'}
          label={attention > 0 ? `${attention} items need review` : 'Nothing needs review'}
        />
      </div>

      <div className="h-px bg-[var(--line)]" />

      <div className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--text-faint)]">
        <CircleHelp size={13} className="mt-[2px] shrink-0" />
        <p>
          Open any project, server or note and this panel fills with what it is connected to —
          environments, deployments, secrets, related solutions.
        </p>
      </div>
    </div>
  );
}
