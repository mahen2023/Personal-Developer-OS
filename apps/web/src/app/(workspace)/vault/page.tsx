'use client';

import { VaultGate } from './VaultGate';
import { VaultList } from './VaultList';

export default function VaultPage() {
  return (
    <VaultGate>
      <VaultList />
    </VaultGate>
  );
}
