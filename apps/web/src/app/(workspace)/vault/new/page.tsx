'use client';

import { useSearchParams } from 'next/navigation';
import { VaultGate } from '../VaultGate';
import { VaultItemEditor } from '../VaultItemEditor';

export default function NewVaultItemPage() {
  const params = useSearchParams();
  return (
    <VaultGate>
      <VaultItemEditor
        initialType={params.get('type') ?? undefined}
        projectId={params.get('projectId')}
      />
    </VaultGate>
  );
}
