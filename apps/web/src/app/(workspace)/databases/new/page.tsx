'use client';

import { useSearchParams } from 'next/navigation';
import { DatabaseEditor } from '../DatabaseEditor';

export default function NewDatabasePage() {
  return <DatabaseEditor projectId={useSearchParams().get('projectId')} />;
}
