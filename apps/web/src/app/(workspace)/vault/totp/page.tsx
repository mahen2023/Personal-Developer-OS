'use client';

import { VaultGate } from '../VaultGate';
import { VaultList } from '../VaultList';

export default function TotpPage() {
  return (
    <VaultGate>
      <VaultList
        fixedType="TOTP"
        title="TOTP"
        subtitle="Two-factor codes, generated in this browser from a secret only it can read."
      />
    </VaultGate>
  );
}
