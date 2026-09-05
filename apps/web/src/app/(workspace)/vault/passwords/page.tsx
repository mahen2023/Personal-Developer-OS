'use client';

import { VaultGate } from '../VaultGate';
import { VaultList } from '../VaultList';

export default function PasswordsPage() {
  return (
    <VaultGate>
      <VaultList
        fixedType="PASSWORD"
        title="Passwords"
        subtitle="Site and service logins, with a generator that beats anything you would invent."
      />
    </VaultGate>
  );
}
