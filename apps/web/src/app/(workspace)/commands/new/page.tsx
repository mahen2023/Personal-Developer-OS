'use client';

import { useSearchParams } from 'next/navigation';
import { CommandEditor } from '../CommandEditor';

export default function NewCommandPage() {
  return <CommandEditor projectId={useSearchParams().get('projectId')} />;
}
