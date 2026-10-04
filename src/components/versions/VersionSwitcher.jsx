// src/components/versions/VersionSwitcher.jsx
//
// The Room Designer version switcher: every saved version of the open project,
// listed with its own status, so another version can be opened without going
// back to the Projects page.
//
// Each row shows the version name, when it was last updated, whether it is the
// current version, and its own report and proposal status. Actions:
//   Open    — open that version in Room Designer
//   Rename  — rename that version in place
//   New Design Option… — duplicate the current version into a free slot
//
// Opening another version never blends two designs: the newly active version is
// written to the project, then the page performs a full load, so the designer,
// reports, bass authority and pricing all rebuild from the one selected version.
// Nothing from the previous version is carried across or overwritten.

import React, { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Edit2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setActiveProjectId } from '@/components/state/project-session';
import {
  NEW_VERSION_DEFAULT_NAME,
  VERSION_NAME_MAX_LENGTH,
  findNextEmptySlot,
  sanitiseVersionName,
} from '@/lib/versionAuthority';
import { formatLibraryDate } from '@/components/library/libraryFormat';
import {
  hasUnsavedVersionChanges,
  isSameVersion,
} from '@/components/versions/versionSwitchSafety';
import { useVersionDocumentStatus } from '@/components/versions/useVersionDocumentStatus';
import UnsavedVersionChangeDialog from '@/components/versions/UnsavedVersionChangeDialog';

const BRAND = {
  text: '#1B1A1A',
  subtext: '#625143',
  border: '#DCDBD6',
  green: '#213428',
  active: '#E8E6E0',
  pill: '#E9EFE9',
  pillBorder: '#C9D6CB',
  danger: '#B23A3A',
  dangerBg: '#FDF5F5',
};

const MAX_VERSIONS_MESSAGE = 'This project already contains the maximum of five design options.';

/**
 * Drop this project's pending autosave timers — the same bucket, and the same
 * cancellation, the project switch already performs. Used by "Open without
 * saving" so a late autosave cannot commit the work the designer chose to
 * discard. No data is written or cleared here; only the queued timers stop.
 */
function cancelPendingAutosave(projectId) {
  if (!projectId || typeof globalThis === 'undefined') return;
  const refs = globalThis[`__rdAutosaveRefs_${projectId}`];
  if (!refs) return;
  if (refs.debounceId) {
    clearTimeout(refs.debounceId);
    refs.debounceId = null;
  }
  if (refs.intervalId) {
    clearInterval(refs.intervalId);
    refs.intervalId = null;
  }
}

export default function VersionSwitcher({
  projectId,
  versionApi,
  autosaveStatus = 'idle',
  onSaveProject = null,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingVersion, setPendingVersion] = useState(null);

  const versions = versionApi?.versions || [];
  const activeVersionId = versionApi?.activeVersionId || null;
  const activeVersion = versionApi?.activeVersion || null;
  const nextEmptySlot = findNextEmptySlot(versions);
  const canCreateVersion = nextEmptySlot !== null;

  // Reports and proposals are read only while the menu is open.
  const { loading: statusLoading, statusByVersionId } = useVersionDocumentStatus({
    projectId,
    enabled: open,
  });

  const openVersion = async (version, { saveFirst }) => {
    if (!version) return;
    setBusy(true);
    setError(null);

    try {
      if (saveFirst) {
        if (typeof onSaveProject !== 'function') {
          setError('The design could not be saved.');
          setBusy(false);
          return;
        }
        const result = await onSaveProject();
        if (result && result.success === false) {
          setError(result.error || 'The design could not be saved.');
          setBusy(false);
          return;
        }
      } else {
        cancelPendingAutosave(projectId);
      }

      if (!isSameVersion(activeVersionId, version.id)) {
        await versionApi.switchVersion(version.id);
      }
      setActiveProjectId(projectId);
      // A full load is the only switch that cannot blend two versions: the page
      // re-mounts and re-hydrates the newly active version, so the header,
      // reports, bass authority and pricing all rebuild from that one version.
      window.location.assign(`/RoomDesigner?project=${encodeURIComponent(projectId)}`);
    } catch (switchError) {
      console.error('[VersionSwitcher] Version switch failed:', switchError);
      setError(switchError?.message || 'The version could not be opened.');
      setBusy(false);
    }
  };

  const handleOpenRequest = (version) => {
    if (busy || disabled) return;
    if (isSameVersion(activeVersionId, version.id)) {
      setOpen(false);
      return;
    }
    if (hasUnsavedVersionChanges(autosaveStatus)) {
      setOpen(false);
      setError(null);
      setPendingVersion(version);
      return;
    }
    void openVersion(version, { saveFirst: false });
  };

  const handleCreateVersion = async () => {
    if (busy || disabled) return;
    if (!canCreateVersion) {
      setError(MAX_VERSIONS_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await versionApi.createVersion(nextEmptySlot, NEW_VERSION_DEFAULT_NAME);
      setActiveProjectId(projectId);
      // renameVersion=1 is read by the version bar after the load, so the new
      // option's name can be typed straight away.
      window.location.assign(`/RoomDesigner?project=${encodeURIComponent(projectId)}&renameVersion=1`);
    } catch (createError) {
      console.error('[VersionSwitcher] Create version failed:', createError);
      setError(createError?.message || 'Failed to create design option.');
      setBusy(false);
    }
  };

  const commitRename = async (version) => {
    const next = sanitiseVersionName(renameValue);
    setRenamingId(null);
    if (!next || next === version.version_name) return;
    try {
      await versionApi.renameVersion(version.id, next);
      setError(null);
    } catch (renameError) {
      console.error('[VersionSwitcher] Rename failed:', renameError);
      setError(renameError?.message || 'The version could not be renamed.');
    }
  };

  const statusLineFor = (version) => {
    if (statusLoading) return 'Checking reports and proposals…';
    const status = statusByVersionId.get(version.id);
    const parts = [status?.reportsLabel || 'No reports yet'];
    if (status?.proposalLabel) parts.push(`Proposal: ${status.proposalLabel}`);
    return parts.join(' · ');
  };

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (next) setError(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="whitespace-nowrap font-semibold border-[#213428] text-[#213428]"
            disabled={disabled || busy || !projectId}
            title="See every version of this project and open another"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            Open Version
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[400px] p-0">
          <DropdownMenuLabel>Versions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {error && !pendingVersion && (
            <div
              className="flex items-start gap-2 px-3 py-2 text-xs"
              style={{ background: BRAND.dangerBg, color: BRAND.danger }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {versions.length === 0 && (
            <div className="px-3 py-2 text-xs" style={{ color: BRAND.subtext }}>
              {versionApi?.loading ? 'Loading versions…' : 'No saved versions yet.'}
            </div>
          )}

          {versions.map((version) => {
            const isActive = isSameVersion(activeVersionId, version.id);
            const updated = formatLibraryDate(version.updated_date || version.created_date);
            const isRenaming = renamingId === version.id;

            return (
              <div
                key={version.id}
                className="px-3 py-2.5"
                style={{
                  borderBottom: `1px solid ${BRAND.border}`,
                  background: isActive ? BRAND.active : '#FFFFFF',
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        maxLength={VERSION_NAME_MAX_LENGTH}
                        onChange={(event) => setRenameValue(event.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
                        onBlur={() => commitRename(version)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename(version);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setRenamingId(null);
                          }
                        }}
                        className="w-full rounded px-2 py-1 text-sm outline-none"
                        style={{
                          border: `1px solid ${BRAND.green}`,
                          color: BRAND.text,
                          fontFamily: 'Didact Gothic, sans-serif',
                          background: '#FFFFFF',
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm"
                          title={version.version_name}
                          style={{
                            color: isActive ? BRAND.green : BRAND.text,
                            fontWeight: isActive ? 700 : 500,
                            fontFamily: 'Didact Gothic, sans-serif',
                          }}
                        >
                          {version.version_name || 'Untitled version'}
                        </span>
                        {isActive && (
                          <span
                            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
                            style={{
                              background: BRAND.pill,
                              border: `1px solid ${BRAND.pillBorder}`,
                              color: BRAND.green,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Current
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-0.5 text-[11px]" style={{ color: BRAND.subtext }}>
                      {updated ? `Updated ${updated} · ` : ''}
                      {statusLineFor(version)}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenRequest(version)}
                      disabled={busy || disabled || isActive || isRenaming}
                      className="rounded px-2 py-1 text-xs font-semibold transition-opacity disabled:opacity-40"
                      style={{
                        background: isActive ? 'transparent' : BRAND.green,
                        color: isActive ? BRAND.subtext : '#FFFFFF',
                        fontFamily: 'Didact Gothic, sans-serif',
                      }}
                    >
                      {busy && !isActive ? 'Opening…' : 'Open'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(version.id);
                        setRenameValue(version.version_name || '');
                      }}
                      disabled={busy || disabled}
                      className="rounded p-1 transition-colors hover:bg-black/5 disabled:opacity-40"
                      title="Rename this version"
                    >
                      <Edit2 className="h-3.5 w-3.5" style={{ color: BRAND.subtext }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <DropdownMenuSeparator />

          <button
            type="button"
            onClick={handleCreateVersion}
            disabled={busy || disabled || !canCreateVersion}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: BRAND.green, fontFamily: 'Didact Gothic, sans-serif' }}
            title={canCreateVersion
              ? 'Duplicate the current version into a new design option'
              : MAX_VERSIONS_MESSAGE}
          >
            <Plus className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">New Design Option…</span>
            {!canCreateVersion && (
              <span className="text-[11px] italic" style={{ color: BRAND.subtext }}>
                Full
              </span>
            )}
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      <UnsavedVersionChangeDialog
        open={Boolean(pendingVersion)}
        versionName={activeVersion?.version_name || null}
        busy={busy}
        error={error}
        onCancel={() => {
          setPendingVersion(null);
          setError(null);
        }}
        onSaveAndOpen={() => openVersion(pendingVersion, { saveFirst: true })}
        onOpenWithoutSaving={() => openVersion(pendingVersion, { saveFirst: false })}
      />
    </>
  );
}