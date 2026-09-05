'use client';

import { useSearchParams } from 'next/navigation';
import { DeploymentEditor } from '../DeploymentEditor';

export default function NewDeploymentPage() {
  return <DeploymentEditor projectId={useSearchParams().get('projectId')} />;
}
