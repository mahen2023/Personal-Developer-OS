'use client';

import { useSearchParams } from 'next/navigation';
import { DomainEditor } from '../DomainEditor';

export default function NewDomainPage() {
  return <DomainEditor projectId={useSearchParams().get('projectId')} />;
}
