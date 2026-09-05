'use client';

import { useSearchParams } from 'next/navigation';
import { ServerEditor } from '../ServerEditor';

export default function NewServerPage() {
  return <ServerEditor projectId={useSearchParams().get('projectId')} />;
}
