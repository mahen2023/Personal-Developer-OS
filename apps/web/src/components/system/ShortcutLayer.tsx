'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { NAVIGATION } from '@/lib/navigation';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { KeyHint } from '@/components/primitives';

/** How long a `g` chord stays armed before it is forgotten. */
const CHORD_WINDOW_MS = 1200;

const CHORDS = NAVIGATION.flatMap((section) => section.items)
  .filter((item) => item.chord)
  .map((item) => [item.chord as string, item.href] as const);

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

/**
 * Global keyboard layer (§48). Bindings are read from the navigation model, so
 * a new module gets its `g` chord for free.
 */
export function ShortcutLayer() {
  const router = useRouter();
  const { setPaletteOpen, setShortcutsOpen, paletteOpen, toggleRail, toggleContext } =
    useWorkspace();
  const chordArmedAt = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }

      // Everything below is a bare key, so never steal it mid-typing.
      if (isTypingTarget(event.target) || event.altKey || modifier) return;

      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        toggleRail();
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        toggleContext();
        return;
      }

      if (event.key === 'g') {
        chordArmedAt.current = Date.now();
        return;
      }

      if (Date.now() - chordArmedAt.current < CHORD_WINDOW_MS) {
        const match = CHORDS.find(([key]) => key === event.key);
        chordArmedAt.current = 0;
        if (match) {
          event.preventDefault();
          router.push(match[1]);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, setPaletteOpen, setShortcutsOpen, paletteOpen, toggleRail, toggleContext]);

  return null;
}

export function ShortcutsHelp() {
  const { shortcutsOpen, setShortcutsOpen } = useWorkspace();

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setShortcutsOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcutsOpen, setShortcutsOpen]);

  if (!shortcutsOpen) return null;

  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0/0.55)] p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && setShortcutsOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="anim-palette max-h-[80vh] w-full max-w-[540px] overflow-y-auto rounded-lg bg-[var(--surface-overlay)] p-5"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
      >
        <h2 className="label mb-4">Keyboard shortcuts</h2>

        <Group title="Global">
          <Row keys={['⌘', 'K']} description="Command palette and global search" />
          <Row keys={['?']} description="This list" />
          <Row keys={['[']} description="Collapse or expand navigation" />
          <Row keys={[']']} description="Toggle the context panel" />
          <Row keys={['esc']} description="Close whatever is open" />
        </Group>

        <Group title="Go to">
          {NAVIGATION.flatMap((section) => section.items)
            .filter((item) => item.chord)
            .map((item) => (
              <Row key={item.href} keys={['g', item.chord as string]} description={item.label} />
            ))}
        </Group>

        <p className="mt-4 border-t border-line pt-3 text-[12px] text-[var(--text-faint)]">
          Inside the palette: <span className="mono">↑ ↓</span> to move,{' '}
          <span className="mono">↵</span> to open, <span className="mono">&gt;</span> to filter to
          actions.
        </p>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="label mb-2 flex items-center gap-2">
        {title}
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <div className="flex flex-col gap-[3px]">{children}</div>
    </div>
  );
}

function Row({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center gap-3 text-[12.5px]">
      <span className="w-[70px] shrink-0">
        <KeyHint keys={keys} />
      </span>
      <span className="text-[var(--text-muted)]">{description}</span>
    </div>
  );
}
