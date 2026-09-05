'use client';

import { use, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { DANGER_LEVEL, humanise } from '@/lib/domain';
import type { CommandRecord } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { CommandEditor } from '../CommandEditor';
import { DangerCopyButton } from '../DangerCopyButton';

export default function CommandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: command, loading, set, reload } = useRecord<CommandRecord>(`/commands/${id}`);

  useContextPanel('Command', command ? <CommandContext command={command} /> : null, [
    command?.id,
    command?.updatedAt,
    command?.useCount,
  ]);

  if (loading && !command) return <LoadingLine message="Loading command…" />;
  if (!command) return null;

  if (editing) {
    return (
      <CommandEditor
        command={command}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  const dangerous = command.dangerLevel === 'DESTRUCTIVE' || command.dangerLevel === 'HIGH';

  return (
    <DetailShell
      title={command.title}
      eyebrow="Command"
      onEdit={() => setEditing(true)}
      deletePath={`/commands/${id}`}
      deleteBackTo="/commands"
      deleteConfirm={`Delete "${command.title}"?`}
      actions={<DangerCopyButton command={command} onCopied={reload} label="Copy" />}
      meta={
        <>
          <Badge signal={DANGER_LEVEL[command.dangerLevel]}>{command.dangerLevel}</Badge>
          <span>{humanise(command.platform)}</span>
          {command.category && <span>{command.category}</span>}
          <span>copied {command.useCount}×</span>
          <span>updated {timeAgo(command.updatedAt)}</span>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {dangerous && (
          <p className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12.5px]">
            <TriangleAlert size={13} className="mt-[2px] shrink-0 text-[var(--danger)]" />
            This command is destructive and cannot be undone once it runs. Copying it asks for
            confirmation first. It is never executed by this application.
          </p>
        )}

        <pre
          className={
            dangerous
              ? 'mono overflow-x-auto rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed text-[var(--danger)]'
              : 'mono overflow-x-auto rounded border border-line bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed'
          }
        >
          {command.command}
        </pre>

        {command.description && <Markdown>{command.description}</Markdown>}
      </div>
    </DetailShell>
  );
}

function CommandContext({ command }: { command: CommandRecord }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={command.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Platform', humanise(command.platform)],
            ['Category', command.category ?? '—'],
            ['Danger', humanise(command.dangerLevel)],
            ['Copied', `${command.useCount}×`],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={command.tags} href={(slug) => `/commands?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={command.createdAt} updated={command.updatedAt} />
    </div>
  );
}
