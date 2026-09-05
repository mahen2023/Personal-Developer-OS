'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { VAULT_ITEM_TYPES, enumOptions } from '@/lib/domain';
import { type SecretPayload, secretFromOtpauth } from '@/lib/vault-crypto';
import { useAction } from '@/hooks/useResource';
import { useVault } from '@/components/system/VaultProvider';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  Select,
  TextArea,
  TextInput,
} from '@/components/patterns/Form';
import { PasswordGenerator } from './PasswordGenerator';
import type { VaultRow } from './VaultList';

/**
 * Creating and updating a secret.
 *
 * The secret fields are encrypted before submit and never appear in the
 * request body in the clear — which is why there is no "password" property
 * anywhere in what gets sent.
 */
export function VaultItemEditor({
  item,
  initialType,
  projectId,
  onDone,
  onCancel,
}: {
  item?: VaultRow;
  initialType?: string;
  projectId?: string | null;
  onDone?: (item: VaultRow) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { sealSecret, authHeader } = useVault();
  const editing = Boolean(item);

  const [form, setForm] = useState({
    name: item?.name ?? '',
    type: item?.type ?? initialType ?? 'PASSWORD',
    username: item?.username ?? '',
    url: item?.url ?? '',
    notes: item?.notes ?? '',
    rotateEveryD: item?.rotateEveryD?.toString() ?? '',
    projectId: item?.projectId ?? projectId ?? null,
  });

  // Secret fields live only in this component's state, and only until submit.
  const [secret, setSecret] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');

  const save = useAction(async (body: Record<string, unknown>) =>
    editing
      ? api<VaultRow>(`/vault/items/${item?.id}`, { method: 'PATCH', body, headers: authHeader() })
      : api<VaultRow>('/vault/items', { method: 'POST', body, headers: authHeader() }),
  );

  const isTotp = form.type === 'TOTP';
  const isSshKey = form.type === 'SSH_KEY';
  const changingSecret = Boolean(secret || totpSecret || privateKey || passphrase);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: SecretPayload = {
      ...(secret ? { secret } : {}),
      ...(totpSecret ? { totpSecret: totpSecret.replace(/\s/g, '') } : {}),
      ...(privateKey ? { privateKey } : {}),
      ...(passphrase ? { passphrase } : {}),
    };

    const metadata = {
      name: form.name,
      type: form.type,
      username: form.username || undefined,
      url: form.url || undefined,
      notes: form.notes || undefined,
      rotateEveryD: form.rotateEveryD ? Number(form.rotateEveryD) : undefined,
      projectId: form.projectId,
    };

    // On update, the ciphertext is only sent when the secret actually changed —
    // otherwise a metadata edit would reset the rotation clock.
    const sealed = !editing || changingSecret ? await sealSecret(payload) : null;
    const saved = await save.run({ ...metadata, ...(sealed ?? {}) });

    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/vault/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={Lock}
          title="Add a secret"
          subtitle="Encrypted in this browser before anything is sent."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <FormPanel
          title={editing ? 'Edit secret' : 'Secret'}
          onSubmit={onSubmit}
          footer={
            <>
              <Button
                type="submit"
                variant="primary"
                disabled={save.busy || !form.name.trim() || (!editing && !changingSecret)}
              >
                {save.busy ? 'Encrypting…' : editing ? 'Save changes' : 'Add to vault'}
              </Button>
              {onCancel ? (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              ) : (
                <Link href="/vault">
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Link>
              )}
            </>
          }
        >
          <FormError error={save.error} />

          <Field label="Name">
            <TextInput
              autoFocus
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Production database"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
                options={enumOptions(VAULT_ITEM_TYPES)}
              />
            </Field>
            <Field label="Project">
              <ProjectSelect
                value={form.projectId}
                onChange={(value) => setForm({ ...form, projectId: value })}
              />
            </Field>
          </div>

          <Field label="Username" hint="Stored in the clear so items stay findable while locked.">
            <TextInput
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              className="mono"
            />
          </Field>

          {isTotp ? (
            <Field
              label="TOTP secret"
              hint="The base32 secret, or the whole otpauth:// URI from a QR code."
            >
              <TextInput
                required={!editing}
                value={totpSecret}
                onChange={(event) => {
                  const value = event.target.value;
                  setTotpSecret(secretFromOtpauth(value) ?? value);
                }}
                placeholder="JBSWY3DPEHPK3PXP"
                className="mono"
                autoComplete="off"
              />
            </Field>
          ) : isSshKey ? (
            <>
              <Field label="Private key" wide>
                <TextArea
                  required={!editing}
                  mono
                  rows={8}
                  value={privateKey}
                  onChange={(event) => setPrivateKey(event.target.value)}
                  placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----'}
                  autoComplete="off"
                />
              </Field>
              <Field label="Key passphrase">
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  className="mono"
                  autoComplete="off"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Secret"
              hint={editing ? 'Leave blank to keep the current one.' : undefined}
            >
              <TextInput
                required={!editing}
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className="mono"
                autoComplete="off"
              />
            </Field>
          )}

          <Field label="URL">
            <TextInput
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
              placeholder="https://console.example.com"
              className="mono"
            />
          </Field>

          <Field label="Rotate every" hint="Days. Leave blank for no rotation reminder.">
            <TextInput
              type="number"
              min={1}
              max={3650}
              value={form.rotateEveryD}
              onChange={(event) => setForm({ ...form, rotateEveryD: event.target.value })}
              placeholder="90"
            />
          </Field>

          <Field label="Notes" hint="Not encrypted — keep secrets out of this field." wide>
            <TextArea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>

          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
            <ShieldCheck size={12} className="mt-[2px] shrink-0 text-[var(--security)]" />
            The secret fields are encrypted here before submit. The request carries ciphertext, and
            the server has no way to read it.
          </p>
        </FormPanel>

        {!isTotp && !isSshKey && <PasswordGenerator onUse={setSecret} className="h-fit" />}
      </div>
    </div>
  );
}
