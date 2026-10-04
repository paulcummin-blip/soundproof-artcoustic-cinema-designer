// src/components/versions/RoomDesignerVersionBar.jsx
//
// The version identity bar at the top of Room Designer. It answers, at a
// glance: which project is open, which design version is being edited, whether
// that version is the current one, and how to open another version.
//
// Left: the project identity (project, client, reference) from the same
//       authority every other surface uses.
// Right: the version being edited, in a prominent card with a Current /
//        Viewing saved version badge, plus the version switcher.
//
// Composition only — the version data and operations come from the one
// useProjectVersions instance the header owns, so no version is read twice.

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ProjectIdentityLine from '@/components/projects/ProjectIdentityLine';
import ActiveVersionCard from '@/components/versions/ActiveVersionCard';
import VersionSwitcher from '@/components/versions/VersionSwitcher';
import { formatLibraryDate } from '@/components/library/libraryFormat';
import { isSameVersion } from '@/components/versions/versionSwitchSafety';

const BRAND = {
  border: '#DCDBD6',
  card: '#FBFAF8',
};

export default function RoomDesignerVersionBar({
  projectId = null,
  projectName = null,
  clientName = null,
  projectReference = null,
  loadedVersionId = null,
  versionApi = null,
  autosaveStatus = 'idle',
  onSaveProject = null,
  disabled = false,
}) {
  const location = useLocation();
  const [autoEdit, setAutoEdit] = useState(false);

  const activeVersion = versionApi?.activeVersion || null;
  const activeVersionId = versionApi?.activeVersionId || null;
  const versionsLoading = versionApi?.loading === true;

  // "Current" means the design being edited IS the project's active version.
  // When the project's active version has moved on since this design was
  // loaded, the version being edited is a saved version, stated as such.
  const isCurrent = loadedVersionId
    ? isSameVersion(loadedVersionId, activeVersionId)
    : true;

  // A rename can be requested across a version load (a new design option) or
  // from the Projects page. Both ask for the name field directly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = location.state?.renameVersion === true || params.get('renameVersion') === '1';
    if (!requested || !activeVersionId) return;

    if (params.get('renameVersion') === '1') {
      params.delete('renameVersion');
      const query = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }
    setAutoEdit(true);
  }, [location.state, activeVersionId]);

  return (
    <div className="mt-3 flex flex-wrap items-stretch gap-3">
      <div
        className="min-w-[220px] flex-1 rounded-lg px-3 py-2.5"
        style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
      >
        <ProjectIdentityLine
          showProject
          orientation="stacked"
          projectName={projectName}
          client={clientName}
          reference={projectReference}
          color="#3E4349"
          fontSize={13}
        />
      </div>

      <div className="min-w-[280px] flex-1">
        <ActiveVersionCard
          versionName={activeVersion?.version_name || null}
          updatedAt={formatLibraryDate(activeVersion?.updated_date || activeVersion?.created_date)}
          isCurrent={isCurrent}
          loading={versionsLoading || !activeVersionId}
          disabled={disabled}
          autoEdit={autoEdit}
          onAutoEditHandled={() => setAutoEdit(false)}
          onRename={(name) => versionApi?.renameVersion?.(activeVersionId, name)}
        />
      </div>

      <div className="flex items-start">
        <VersionSwitcher
          projectId={projectId}
          versionApi={versionApi}
          autosaveStatus={autosaveStatus}
          onSaveProject={onSaveProject}
          disabled={disabled}
        />
      </div>
    </div>
  );
}