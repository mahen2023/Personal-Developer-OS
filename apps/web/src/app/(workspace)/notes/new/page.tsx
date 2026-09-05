'use client';

import { useSearchParams } from 'next/navigation';
import { NoteEditor } from '../NoteEditor';

export default function NewNotePage() {
  // The palette and the project workspace both link here with ?projectId=,
  // so a note created from a project lands in that project.
  return <NoteEditor projectId={useSearchParams().get('projectId')} />;
}
