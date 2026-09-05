'use client';

import { useSearchParams } from 'next/navigation';
import { IdeaEditor } from '../IdeaEditor';

export default function NewIdeaPage() {
  return <IdeaEditor projectId={useSearchParams().get('projectId')} />;
}
