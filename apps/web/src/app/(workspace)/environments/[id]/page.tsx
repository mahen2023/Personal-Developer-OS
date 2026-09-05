'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { humanise } from '@/lib/domain';
import type { Environment, EnvVariable } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CopyButton, Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { Field, FormError, TextInput, VaultItemSelect } from '@/components/patterns/Form';
import { EnvironmentEditor } from '../EnvironmentEditor';

export default function EnvironmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: environment, loading, set } = useRecord<Environment>(`/environments/${id}`);

  useContextPanel(
    'Environment',
    environment ? <EnvironmentContext environment={environment} /> : null,
    [environment?.id, environment?.updatedAt, environment?.variables?.length],
  );

  if (loading && !environment) return <LoadingLine message="Loading environment…" />;
  if (!environment) return null;

  if (editing) {
    return (
      <EnvironmentEditor
        environment={environment}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <DetailShell
      title={environment.name}
      eyebrow={`Environment · ${humanise(environment.type)}`}
      onEdit={() => setEditing(true)}
      deletePath={`/environments/${id}`}
      deleteBackTo="/environments"
      deleteConfirm={`Delete "${environment.name}"? Servers and databases in it are kept and become unassigned.`}
      actions={
        <a href={`/api/environments/${id}/template`} target="_blank" rel="noreferrer">
          <Button title="A .env skeleton with secrets left as vault references">
            <Download size={13} /> .env template
          </Button>
        </a>
      }
      meta={
        <>
          <Badge>{environment.type}</Badge>
          {environment.baseUrl && (
            <a
              href={environment.baseUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-[4px] hover:text-[var(--accent)]"
            >
              {environment.baseUrl} <ExternalLink size={10} />
            </a>
          )}
          {environment.project && (
            <Link
              href={`/projects/${environment.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {environment.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Variables environmentId={id} variables={environment.variables ?? []} onChanged={set} />
        {environment.notes && <Markdown>{environment.notes}</Markdown>}
      </div>
    </DetailShell>
  );
}

/**
 * The variables table (§18).
 *
 * A secret row shows its key and the vault item it points at — never a value,
 * not even masked. There is nothing here to reveal, which is the point: this
 * screen is safe to have open while someone is looking over your shoulder.
 */
function Variables({
  environmentId,
  variables,
  onChanged,
}: {
  environmentId: string;
  variables: EnvVariable[];
  onChanged: (environment: Environment) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ key: '', value: '', vaultItemId: null as string | null });
  const [mode, setMode] = useState<'literal' | 'secret'>('literal');

  const save = useAction((body: Record<string, unknown>) =>
    api<Environment>(`/environments/${environmentId}/variables`, { method: 'PUT', body }),
  );
  const remove = useAction((variableId: string) =>
    api<Environment>(`/environments/${environmentId}/variables/${variableId}`, {
      method: 'DELETE',
    }),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      key: draft.key,
      ...(mode === 'secret' ? { vaultItemId: draft.vaultItemId } : { value: draft.value }),
    });
    if (saved) {
      onChanged(saved);
      setDraft({ key: '', value: '', vaultItemId: null });
      setAdding(false);
    }
  }

  return (
    <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="flex h-8 items-center gap-2 border-b border-line px-4">
        <span className="label flex-1">Environment variables · {variables.length}</span>
        <Button variant="ghost" onClick={() => setAdding((open) => !open)}>
          <Plus size={12} /> Add
        </Button>
      </div>

      {adding && (
        <form onSubmit={submit} className="anim-enter flex flex-col gap-3 border-b border-line p-4">
          <FormError error={save.error} />

          <div className="flex gap-1">
            <ModeTab active={mode === 'literal'} onClick={() => setMode('literal')}>
              Literal value
            </ModeTab>
            <ModeTab active={mode === 'secret'} onClick={() => setMode('secret')}>
              Vault reference
            </ModeTab>
          </div>

          <Field label="Key">
            <TextInput
              autoFocus
              required
              value={draft.key}
              onChange={(event) => setDraft({ ...draft, key: event.target.value.toUpperCase() })}
              placeholder="MONGO_URI"
              className="mono"
            />
          </Field>

          {mode === 'literal' ? (
            <Field label="Value" hint="Non-secrets only. Anything sensitive belongs in the vault.">
              <TextInput
                required
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                placeholder="debug"
                className="mono"
              />
            </Field>
          ) : (
            <Field
              label="Vault item"
              hint="The value is fetched from the vault, never stored here."
            >
              <VaultItemSelect
                value={draft.vaultItemId}
                onChange={(vaultItemId) => setDraft({ ...draft, vaultItemId })}
                noneLabel="Choose a vault item"
              />
            </Field>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={
                save.busy ||
                !draft.key.trim() ||
                (mode === 'literal' ? !draft.value.trim() : !draft.vaultItemId)
              }
            >
              {save.busy ? 'Saving…' : 'Set variable'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {variables.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-[var(--text-faint)]">
          No variables yet. Non-secrets are stored here; secrets point at the vault, so this screen
          never has a value worth stealing on it.
        </p>
      ) : (
        <ul>
          {variables.map((variable) => (
            <li
              key={variable.id}
              className="flex items-center gap-3 border-b border-line px-4 py-[8px] last:border-b-0"
            >
              <code className="mono w-[190px] shrink-0 truncate text-[12px]">{variable.key}</code>

              {variable.isSecret ? (
                <span className="flex min-w-0 flex-1 items-center gap-[6px] text-[12px] text-[var(--security)]">
                  <Lock size={11} className="shrink-0" />
                  <span className="mono truncate">
                    vault: {variable.vaultItem?.name ?? 'linked item'}
                  </span>
                </span>
              ) : (
                <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                  {variable.value}
                </code>
              )}

              <span className="flex shrink-0 items-center gap-1">
                {variable.isSecret ? (
                  variable.vaultItemId && (
                    <Link
                      href={`/vault/${variable.vaultItemId}`}
                      title="Open in the vault"
                      className="text-[var(--text-faint)] hover:text-[var(--security)]"
                    >
                      <KeyRound size={12} />
                    </Link>
                  )
                ) : (
                  <CopyButton value={variable.value ?? ''} label="" />
                )}
                <button
                  title="Remove"
                  disabled={remove.busy}
                  onClick={async () => {
                    const saved = await remove.run(variable.id);
                    if (saved) onChanged(saved);
                  }}
                  className="text-[var(--text-faint)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded border px-[9px] py-[4px] text-[12px] transition-colors duration-[var(--fast)]',
        active
          ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
          : 'border-line text-[var(--text-muted)] hover:border-[var(--line-strong)]',
      )}
    >
      {children}
    </button>
  );
}

function EnvironmentContext({ environment }: { environment: Environment }) {
  const counts = environment.counts;
  const secrets = (environment.variables ?? []).filter((variable) => variable.isSecret).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={environment.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Contains">
        <DefinitionList
          rows={[
            ['Servers', String(counts?.servers ?? 0)],
            ['Databases', String(counts?.databases ?? 0)],
            ['Domains', String(counts?.domains ?? 0)],
            ['Deployments', String(counts?.deployments ?? 0)],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Configuration">
        <DefinitionList
          rows={[
            ['Variables', String(environment.variables?.length ?? 0)],
            [
              'Secrets',
              secrets > 0 ? (
                <span className="flex items-center gap-[5px] text-[var(--security)]">
                  <Lock size={10} /> {secrets} by reference
                </span>
              ) : (
                'None'
              ),
            ],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={environment.tags} href={(slug) => `/environments?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={environment.createdAt} updated={environment.updatedAt} />
    </div>
  );
}
