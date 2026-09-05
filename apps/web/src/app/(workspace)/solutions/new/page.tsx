'use client';

import { useSearchParams } from 'next/navigation';
import { SolutionEditor } from '../SolutionEditor';

export default function NewSolutionPage() {
  return <SolutionEditor projectId={useSearchParams().get('projectId')} />;
}
