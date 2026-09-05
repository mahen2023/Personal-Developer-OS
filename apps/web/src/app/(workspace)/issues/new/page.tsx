'use client';

import { useSearchParams } from 'next/navigation';
import { IssueEditor } from '../IssueEditor';

export default function NewIssuePage() {
  return <IssueEditor projectId={useSearchParams().get('projectId')} />;
}
