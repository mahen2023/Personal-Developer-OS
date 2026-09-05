'use client';

import { VaultGate } from '../VaultGate';
import { VaultList } from '../VaultList';

export default function ApiKeysPage() {
  return (
    <VaultGate>
      <VaultList
        fixedType="API_KEY"
        title="API keys"
        subtitle="Provider keys and tokens, with a rotation age so stale ones surface."
      />
    </VaultGate>
  );
}
