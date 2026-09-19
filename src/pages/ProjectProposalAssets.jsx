import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useActiveProjectId } from '@/components/state/project-session';
import ProposalAssetsPanel from '@/components/proposal/ProposalAssetsPanel';

/**
 * Project-scoped Proposal Assets page.
 * Shows the active project's proposal assets (renders, views, gallery).
 * Accessed from the sidebar while a project is active.
 */
export default function ProjectProposalAssets() {
  const { user } = useAuth();
  const activeProjectId = useActiveProjectId();
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  return (
    <div className="min-h-screen bg-[#F5F4F0] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1
            className="text-2xl font-bold text-[#1B1A1A]"
            style={{ fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Project Images
          </h1>
          <p className="text-sm text-[#625143] mt-1">
            Upload fixed project images and manage the Project Gallery — the Proposal Engine will use these automatically.
          </p>
        </div>
        <ProposalAssetsPanel projectId={activeProjectId} accountId={accountId} />
      </div>
    </div>
  );
}