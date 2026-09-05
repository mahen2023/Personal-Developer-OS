'use client';

import { useSearchParams } from 'next/navigation';
import { BookmarkEditor } from '../BookmarkEditor';

export default function NewBookmarkPage() {
  return <BookmarkEditor projectId={useSearchParams().get('projectId')} />;
}
