'use client';

import { useSearchParams } from 'next/navigation';
import { MeetingEditor } from '../MeetingEditor';

export default function NewMeetingPage() {
  return <MeetingEditor projectId={useSearchParams().get('projectId')} />;
}
