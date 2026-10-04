/**
 * ProposalLibraryTab
 * ------------------
 * The Proposal Library — every saved proposal for the dealer's account,
 * grouped by project, with the versions each proposal was built from, its
 * revision relationship and its source state (Current / Source changed /
 * Missing source).
 *
 * A proposal is never silently rewritten when the project moves on. The library
 * marks it Source changed and offers Open, Duplicate and Regenerate from latest
 * source — regeneration creates a NEW linked revision and leaves the original
 * untouched.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, FileText, Plus, RefreshCw } from 'lucide-react';
import ProposalLibraryGroup from './ProposalLibraryGroup';
import ProposalRenameDialog from './ProposalRenameDialog';
import { getProposalTypeLabel } from '@/components/proposal/proposalTypes';
import { isArchived, getRestoreStatus } from '@/components/proposal/proposalLifecycle';
import { useProposalLibrary } from './useProposalLibrary';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

function createRequestId(prefix) {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ProposalLibraryTab({ onCreateProposal, onRegenerate }) {
  const navigate = useNavigate();
  const canonical = useCanonicalProject();
  const focusedProjectId = canonical?.projectId || null;

  const [projectFilter, setProjectFilter] = useState('all');
  const [filterTouched, setFilterTouched] = useState(false);
  const [view, setView] = useState('active');
  const [projects, setProjects] = useState([]);
  const [renaming, setRenaming] = useState(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // The currently selected project is the default focus of the library.
  useEffect(() => {
    if (!filterTouched && focusedProjectId) setProjectFilter(focusedProjectId);
  }, [filterTouched, focusedProjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await base44.entities.Project.list('-updated_date', 200);
        if (!cancelled) setProjects(Array.isArray(records) ? records : []);
      } catch (loadError) {
        console.warn('[ProposalLibraryTab] project list read failed:', loadError?.message || loadError);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const library = useProposalLibrary({ projectFilter: projectFilter === 'all' ? null : projectFilter });
  const { reload } = library;

  const handleOpen = useCallback((proposal) => {
    navigate(`/ProposalEditor?proposalId=${proposal.id}`);
  }, [navigate]);

  const handleDuplicate = useCallback(async (proposal) => {
    setActionLoading(`dup-${proposal.id}`);
    try {
      const response = await base44.functions.invoke('duplicateProposal', {
        source_proposal_id: proposal.id,
        request_id: createRequestId('duplicate'),
      });
      const data = response?.data ?? response;
      if (data?.error || !data?.proposal?.id) throw new Error(data?.error || 'No duplicate proposal was returned.');
      await reload();
    } catch (duplicateError) {
      console.error('[ProposalLibraryTab] Duplicate failed:', duplicateError);
      alert(duplicateError?.response?.data?.error || duplicateError?.message || 'Failed to duplicate proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [reload]);

  const handleArchive = useCallback(async (proposal) => {
    const confirmed = window.confirm(
      `Archive "${proposal.title || 'this proposal'}"? Archived proposals are hidden from the active list but can be restored.`,
    );
    if (!confirmed) return;

    setActionLoading(`arch-${proposal.id}`);
    try {
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: proposal.id,
        target_status: 'archived',
      });
      const data = response?.data ?? response;
      if (data?.error) alert(data.error);
      else await reload();
    } catch (archiveError) {
      console.error('[ProposalLibraryTab] Archive failed:', archiveError);
      alert('Failed to archive proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [reload]);

  const handleRestore = useCallback(async (proposal) => {
    setActionLoading(`restore-${proposal.id}`);
    try {
      const restoreStatus = getRestoreStatus(proposal.status, proposal.previous_status, true);
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: proposal.id,
        target_status: restoreStatus || 'edited',
      });
      const data = response?.data ?? response;
      if (data?.error) alert(data.error);
      else await reload();
    } catch (restoreError) {
      console.error('[ProposalLibraryTab] Restore failed:', restoreError);
      alert('Failed to restore proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [reload]);

  const handleRenameSubmit = useCallback(async (title) => {
    if (!renaming?.id) return;
    setRenameSaving(true);
    try {
      await base44.entities.Proposal.update(renaming.id, { title });
      setRenaming(null);
      await reload();
    } catch (renameError) {
      console.error('[ProposalLibraryTab] Rename failed:', renameError);
      alert('Failed to rename proposal. Please try again.');
    } finally {
      setRenameSaving(false);
    }
  }, [renaming, reload]);

  const visibleGroups = useMemo(() => library.groups
    .map((group) => ({
      ...group,
      proposals: group.proposals.filter((proposal) => (view === 'archived'
        ? isArchived(proposal.status)
        : !isArchived(proposal.status))),
    }))
    .filter((group) => group.proposals.length > 0), [library.groups, view]);

  const counts = useMemo(() => library.proposals.reduce((accumulator, proposal) => {
    const archived = isArchived(proposal.status);
    return {
      active: accumulator.active + (archived ? 0 : 1),
      archived: accumulator.archived + (archived ? 1 : 0),
    };
  }, { active: 0, archived: 0 }), [library.proposals]);

  const actions = {
    onOpen: handleOpen,
    onRename: setRenaming,
    onDuplicate: handleDuplicate,
    onRegenerate,
    onExport: handleOpen,
    onArchive: handleArchive,
    onRestore: handleRestore,
  };

  if (library.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin mb-4" />
        <p className="text-sm text-[#8A8477]">Loading proposals…</p>
      </div>
    );
  }

  if (library.error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <p className="text-sm text-[#8A8477] mb-4">Failed to load proposals.</p>
        <button
          onClick={reload}
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (library.proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <FileText className="w-10 h-10 text-[#DCDBD6] mb-4" />
        <h3
          className="text-lg font-normal text-[#1B1A1A] tracking-tight mb-2"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          No proposals yet
        </h3>
        <p className="text-sm text-[#8A8477] mb-6 text-center max-w-md leading-relaxed">
          Create your first proposal to see it appear here with its versions, revision and source state.
        </p>
        <button
          onClick={onCreateProposal}
          className="flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          <Plus className="w-3.5 h-3.5" />
          Create Proposal
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[#E5E1D8] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F5F4F0] border border-[#E5E1D8]">
            <button
              onClick={() => setView('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'active' ? 'bg-white text-[#213428] shadow-sm' : 'text-[#8A8477] hover:text-[#1B1A1A]'
              }`}
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              Active
              <span className="ml-1.5 text-[10px] text-[#A79E8C]">{counts.active}</span>
            </button>
            <button
              onClick={() => setView('archived')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'archived' ? 'bg-white text-[#213428] shadow-sm' : 'text-[#8A8477] hover:text-[#1B1A1A]'
              }`}
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              Archived
              <span className="ml-1.5 text-[10px] text-[#A79E8C]">{counts.archived}</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
            Project
            <select
              value={projectFilter}
              onChange={(event) => {
                setFilterTouched(true);
                setProjectFilter(event.target.value);
              }}
              className="border border-[#DCDBD6] bg-white px-2 py-1.5 text-sm text-[#1B1A1A]"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name || 'Untitled project'}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={reload}
          className="flex items-center gap-1.5 text-xs text-[#8A8477] hover:text-[#213428] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="w-8 h-8 text-[#DCDBD6] mb-3" />
          <p className="text-sm text-[#8A8477]">
            {view === 'archived' ? 'No archived proposals.' : 'No active proposals.'}
          </p>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <ProposalLibraryGroup
            key={group.projectId}
            group={group}
            sourceById={library.sourceById}
            versionNamesFor={library.versionNamesFor}
            sectionCounts={library.sectionCounts}
            actionLoading={actionLoading}
            {...actions}
          />
        ))
      )}

      <ProposalRenameDialog
        open={!!renaming}
        proposal={renaming}
        saving={renameSaving}
        onCancel={() => setRenaming(null)}
        onSubmit={handleRenameSubmit}
      />
    </div>
  );
}