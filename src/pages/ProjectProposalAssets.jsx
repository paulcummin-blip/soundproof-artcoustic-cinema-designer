import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import ProjectVersionIdentityLine from '@/components/projects/ProjectVersionIdentityLine';
import ProjectLibraryTabs, { PROJECT_LIBRARY_TAB } from '@/components/library/ProjectLibraryTabs';
import ProjectLibraryImagesSection from '@/components/library/ProjectLibraryImagesSection';
import ProjectLibraryReportsSection from '@/components/library/ProjectLibraryReportsSection';
import ProjectLibraryProposalsSection from '@/components/library/ProjectLibraryProposalsSection';
import useProjectLibraryAssets from '@/components/library/useProjectLibraryAssets';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

/**
 * Project Library — the active project's own library.
 *
 * Holds the project's images, the reports it currently holds, and the PDFs that
 * were exported and issued. It is scoped to the project that is open: images
 * upload straight into it, and reports and proposals are still created, edited
 * and regenerated where they live. The Library keeps the fixed documents.
 */
export default function ProjectProposalAssets() {
  const { user } = useAuth();
  const canonical = useCanonicalProject();
  const projectId = canonical.projectId;
  const activeVersionId = canonical.identity?.activeVersionId || null;
  const accountId = user?.access_context?.account?.id || user?.account_id || null;

  const [activeTab, setActiveTab] = useState(PROJECT_LIBRARY_TAB.IMAGES);
  const library = useProjectLibraryAssets({ projectId });

  return (
    <div className="min-h-screen bg-[#F5F4F0] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1
            className="text-2xl font-bold text-[#1B1A1A]"
            style={{ fontFamily: REPORT_FONT_BODY }}
          >
            Project Library
          </h1>
          <p className="text-sm text-[#625143] mt-1">
            Every project-facing asset in one place: images, the reports this version holds, and the PDFs that have
            been exported and issued.
          </p>
          {/* Confirms which project and version these assets belong to. */}
          <ProjectVersionIdentityLine className="mt-3" />
        </div>

        <ProjectLibraryTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === PROJECT_LIBRARY_TAB.IMAGES && (
          <ProjectLibraryImagesSection
            projectId={projectId}
            accountId={accountId}
            activeVersionId={activeVersionId}
            versionNameById={library.versionNameById}
            versions={library.versions}
          />
        )}

        {activeTab === PROJECT_LIBRARY_TAB.REPORTS && (
          library.loading ? (
            <p className="text-sm text-[#8A8477] py-16 text-center" style={{ fontFamily: REPORT_FONT_BODY }}>
              Loading saved reports…
            </p>
          ) : (
            <ProjectLibraryReportsSection
              projectId={projectId}
              versions={library.versions}
              versionById={library.versionById}
              versionNameById={library.versionNameById}
              liveReports={library.liveReports}
              reportExports={library.reportExports}
            />
          )
        )}

        {activeTab === PROJECT_LIBRARY_TAB.PROPOSALS && (
          library.loading ? (
            <p className="text-sm text-[#8A8477] py-16 text-center" style={{ fontFamily: REPORT_FONT_BODY }}>
              Loading issued proposals…
            </p>
          ) : (
            <ProjectLibraryProposalsSection
              proposalExports={library.proposalExports}
              versionById={library.versionById}
              versionNameById={library.versionNameById}
            />
          )
        )}
      </div>
    </div>
  );
}