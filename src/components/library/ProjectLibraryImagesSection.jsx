/**
 * ProjectLibraryImagesSection
 * ---------------------------
 * The Library's Images section: the project's images, filtered by scope.
 *
 * All images       — the project-wide gallery and every version's gallery
 * Project-wide     — the images that apply to the whole project
 * Current version  — the images that apply only to the version now open
 *
 * The upload scope above the grid is the authority for every new image: the
 * designer chooses Project-wide or the version that is open, each empty slot
 * states the scope it will write to, and every filled card carries its own scope
 * label and scope choice. The filter below only decides what is listed — it
 * never decides where an upload goes.
 */

import React, { useMemo } from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import ProposalAssetsPanel from '@/components/proposal/ProposalAssetsPanel';
import ImageUploadScopeControl from './ImageUploadScopeControl';
import { IMAGE_SCOPE, IMAGE_SCOPE_FILTER } from './imageScopeAuthority';

const FILTERS = [
  { key: IMAGE_SCOPE_FILTER.ALL, label: 'All images' },
  { key: IMAGE_SCOPE_FILTER.PROJECT, label: 'Project-wide' },
  { key: IMAGE_SCOPE_FILTER.VERSION, label: 'Current version' },
];

export default function ProjectLibraryImagesSection({
  projectId,
  accountId,
  activeVersionId = null,
  versionNameById = new Map(),
  versions = [],
}) {
  // The upload scope decides where a NEW image is written. It is deliberately
  // separate from the filter below, which only decides what is listed — so an
  // image is never uploaded to a scope the designer did not choose.
  const [uploadScope, setUploadScope] = React.useState(IMAGE_SCOPE.PROJECT);
  const [filter, setFilter] = React.useState(IMAGE_SCOPE_FILTER.PROJECT);

  const activeVersionName = activeVersionId ? (versionNameById.get(activeVersionId) || null) : null;

  const versionOptions = useMemo(
    () => versions.map((version) => ({
      id: version.id,
      name: version.version_name || `Version ${version.version_number}`,
    })),
    [versions],
  );

  return (
    <div className="space-y-6">
      {/* Where new uploads are used — the authority for every upload below. */}
      <ImageUploadScopeControl
        value={uploadScope}
        onChange={setUploadScope}
        activeVersionId={activeVersionId}
        activeVersionName={activeVersionName}
      />

      {/* What is listed. A filter only: it never changes where an upload goes. */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-xs uppercase tracking-[0.14em] text-[#625143] shrink-0"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          Filter images
        </span>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F5F4F0] border border-[#E5E1D8]">
          {FILTERS.map(({ key, label }) => {
            const disabled = key === IMAGE_SCOPE_FILTER.VERSION && !activeVersionId;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === key ? 'bg-white text-[#213428] shadow-sm' : 'text-[#8A8477] hover:text-[#1B1A1A]'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ fontFamily: REPORT_FONT_BODY }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ProposalAssetsPanel
        projectId={projectId}
        accountId={accountId}
        activeVersionId={activeVersionId}
        uploadScope={uploadScope}
        scopeFilter={filter}
        versionNameById={versionNameById}
        versionOptions={versionOptions}
      />
    </div>
  );
}