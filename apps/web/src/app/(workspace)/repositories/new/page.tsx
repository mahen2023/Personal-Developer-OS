'use client';

import { useSearchParams } from 'next/navigation';
import { RepositoryEditor } from '../RepositoryEditor';

export default function NewRepositoryPage() {
  return <RepositoryEditor projectId={useSearchParams().get('projectId')} />;
}
