'use client';

import { useSearchParams } from 'next/navigation';
import { CertificateEditor } from '../CertificateEditor';

export default function NewCertificatePage() {
  return <CertificateEditor projectId={useSearchParams().get('projectId')} />;
}
