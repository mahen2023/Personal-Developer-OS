'use client';

import { useSearchParams } from 'next/navigation';
import { SnippetEditor } from '../SnippetEditor';

export default function NewSnippetPage() {
  return <SnippetEditor projectId={useSearchParams().get('projectId')} />;
}
