'use client';

import { useSearchParams } from 'next/navigation';
import { LearningEditor } from '../LearningEditor';

export default function NewLearningPage() {
  return <LearningEditor projectId={useSearchParams().get('projectId')} />;
}
