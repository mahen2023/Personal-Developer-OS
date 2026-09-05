'use client';

import { useSearchParams } from 'next/navigation';
import { EnvironmentEditor } from '../EnvironmentEditor';

export default function NewEnvironmentPage() {
  return <EnvironmentEditor projectId={useSearchParams().get('projectId')} />;
}
