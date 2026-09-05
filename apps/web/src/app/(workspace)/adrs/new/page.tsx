'use client';

import { useSearchParams } from 'next/navigation';
import { AdrEditor } from '../AdrEditor';

export default function NewAdrPage() {
  return <AdrEditor projectId={useSearchParams().get('projectId')} />;
}
