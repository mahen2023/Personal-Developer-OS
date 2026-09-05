'use client';

import { VaultGate } from '../VaultGate';
import { VaultList } from '../VaultList';

export default function SshKeysPage() {
  return (
    <VaultGate>
      <VaultList
        fixedType="SSH_KEY"
        title="SSH keys"
        subtitle="Private keys, linked to the servers that use them."
      />
    </VaultGate>
  );
}
