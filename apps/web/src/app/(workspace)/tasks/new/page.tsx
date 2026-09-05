'use client';

import { useSearchParams } from 'next/navigation';
import { TaskEditor } from '../TaskEditor';

export default function NewTaskPage() {
  return <TaskEditor projectId={useSearchParams().get('projectId')} />;
}
