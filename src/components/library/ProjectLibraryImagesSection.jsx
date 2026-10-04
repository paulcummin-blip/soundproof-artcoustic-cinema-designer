/**
 * ProjectLibraryImagesSection
 * ---------------------------
 * The Library's Images section: the project's images, organised by scope.
 *
 * One control carries the structure, and every scope is named exactly as it is
 * saved (Project-wide, Level 1 version, Level 4 version):
 *
 *   All images        — every gallery, each labelled with its own scope
 *   Project-wide      — the images that apply to the whole project
 *   <version name>    — the images that apply only to that version
 *
 * The scope shown is the destination for new uploads in its slots, and every
 * card states that scope, so an image can never be written somewhere invisible.
 * Version-specific images are added without switching the project's active
 * design version.
 */

import React from 'react';
import ProposalAssetsPanel from '@/components/proposal/ProposalAssetsPanel';
import ImageUploadScopeControl from './ImageUploadScopeControl';
import { IMAGE_SCOPE_FILTER } from './imageScopeAuthority';

export default function ProjectLibraryImagesSection({
  projectId,
  accountId,
  activeVersionId = null,
  versionNameById = new Map(),
  versions = [],
}) {
  const [scopeKey, setScopeKey] = React.useState(IMAGE_SCOPE_FILTER.ALL);

  return (
    <div className="space-y-6">
      <ImageUploadScopeControl
        value={scopeKey}
        onChange={setScopeKey}
        versions={versions}
        activeVersionId={activeVersionId}
      />

      <ProposalAssetsPanel
        projectId={projectId}
        accountId={accountId}
        activeVersionId={activeVersionId}
        scopeFilter={scopeKey}
        versions={versions}
        versionNameById={versionNameById}
      />
    </div>
  );
}