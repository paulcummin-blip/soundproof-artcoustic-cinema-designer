import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, FileText, Plus, RefreshCw } from 'lucide-react';
import ProposalCard from './ProposalCard';
import { isArchived, getRestoreStatus } from './proposalLifecycle';

/**
 * Proposal History tab — queries persisted Proposal and ProposalSection records
 * and renders a responsive card grid with Active/Archived views.
 *
 * Props:
 * - onCreateProposal: () => void  (opens the wizard)
 */
export default function ProposalHistoryTab({ onCreateProposal }) {
  const [proposals, setProposals] = useState([]);
  const [projectMap, setProjectMap] = useState({});
  const [versionMap, setVersionMap] = useState({});
  const [sectionCounts, setSectionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [view, setView] = useState('active'); // 'active' | 'archived'

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Query 1: Proposals (RLS auto-filters by account)
      const proposalResults = await base44.entities.Proposal.list('-updated_date', 50);
      const proposalList = Array.isArray(proposalResults) ? proposalResults : [];

      // Query 2: ProposalSections (RLS auto-filters by account) — for counts
      const sectionResults = await base44.entities.ProposalSection.list('-created_date', 2000);
      const sectionList = Array.isArray(sectionResults) ? sectionResults : [];

      // Build section count map
      const counts = {};
      sectionList.forEach((s) => {
        if (s.proposal_id) {
          counts[s.proposal_id] = (counts[s.proposal_id] || 0) + 1;
        }
      });

      // Query 3: Projects (RLS auto-filters) — for project names
      const projectResults = await base44.entities.Project.list('-created_date', 200);
      const projectList = Array.isArray(projectResults) ? projectResults : [];
      const pMap = {};
      projectList.forEach((p) => { pMap[p.id] = p; });

      // Query 4: ProjectVersions (RLS auto-filters) — for version labels
      const versionResults = await base44.entities.ProjectVersion.list('-created_date', 500);
      const versionList = Array.isArray(versionResults) ? versionResults : [];
      const vMap = {};
      versionList.forEach((v) => { vMap[v.id] = v; });

      setProposals(proposalList);
      setProjectMap(pMap);
      setVersionMap(vMap);
      setSectionCounts(counts);
    } catch (err) {
      console.error('[ProposalHistoryTab] Failed to load proposals:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Resolve version label for a proposal ──
  const resolveVersionLabel = useCallback((proposal) => {
    if (!proposal) return null;
    // Use proposal's own version_label if set (future proposal versioning)
    if (proposal.version_label) return proposal.version_label;
    // Otherwise resolve from the first selected ProjectVersion
    const versionIds = proposal.selected_version_ids || (proposal.version_id ? [proposal.version_id] : []);
    if (versionIds.length === 0) return null;
    const firstVersion = versionMap[versionIds[0]];
    if (firstVersion) {
      const name = firstVersion.version_name || `V${firstVersion.version_number}`;
      return versionIds.length > 1 ? `${name} +${versionIds.length - 1} more` : name;
    }
    return null;
  }, [versionMap]);

  // ── Duplicate a proposal ──
  const handleDuplicate = useCallback(async (proposal) => {
    setActionLoading(`dup-${proposal.id}`);
    try {
      // Create a copy of the proposal
      const newProposal = await base44.entities.Proposal.create({
        project_id: proposal.project_id,
        account_id: proposal.account_id,
        proposal_type: proposal.proposal_type,
        selected_version_ids: proposal.selected_version_ids || [],
        version_id: proposal.version_id || null,
        title: `Copy of ${proposal.title || 'Untitled Proposal'}`,
        status: 'draft',
        client_brief: proposal.client_brief || null,
        narrative_goal: proposal.narrative_goal || 'luxury_cinema',
        version_label: null,
        is_current_version: true,
        parent_proposal_id: proposal.id,
        engineering_snapshot: proposal.engineering_snapshot || null,
        metadata: proposal.metadata || null,
      });

      // Copy all sections from the original proposal
      const sections = await base44.entities.ProposalSection.filter({
        proposal_id: proposal.id,
      });

      if (Array.isArray(sections) && sections.length > 0 && newProposal?.id) {
        const sectionCopies = sections
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
          .map((s) => ({
            proposal_id: newProposal.id,
            account_id: proposal.account_id,
            section_type: s.section_type,
            section_key: s.section_key,
            title: s.title,
            body: s.body || '',
            dealer_notes: s.dealer_notes || '',
            order_index: s.order_index || 0,
            is_enabled: s.is_enabled !== false,
            locked: false,
            metadata: s.metadata || {},
          }));
        await base44.entities.ProposalSection.bulkCreate(sectionCopies);
      }

      // Reload to show the new proposal
      await load();
    } catch (err) {
      console.error('[ProposalHistoryTab] Duplicate failed:', err);
      alert('Failed to duplicate proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  // ── Archive a proposal (server-authoritative transition) ──
  const handleArchive = useCallback(async (proposal) => {
    const confirmed = window.confirm(
      `Archive "${proposal.title || 'this proposal'}"? Archived proposals are hidden from the active list but can be restored.`
    );
    if (!confirmed) return;

    setActionLoading(`arch-${proposal.id}`);
    try {
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: proposal.id,
        target_status: 'archived',
      });
      if (response?.data?.error) {
        alert(response.data.error);
      } else {
        await load();
      }
    } catch (err) {
      console.error('[ProposalHistoryTab] Archive failed:', err);
      alert('Failed to archive proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  // ── Restore an archived proposal (server-authoritative transition) ──
  const handleRestore = useCallback(async (proposal) => {
    setActionLoading(`restore-${proposal.id}`);
    try {
      const restoreStatus = getRestoreStatus(proposal.status, proposal.previous_status, true);
      const response = await base44.functions.invoke('transitionProposalStatus', {
        proposal_id: proposal.id,
        target_status: restoreStatus || 'edited',
      });
      if (response?.data?.error) {
        alert(response.data.error);
      } else {
        await load();
      }
    } catch (err) {
      console.error('[ProposalHistoryTab] Restore failed:', err);
      alert('Failed to restore proposal. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }, [load]);

  // ── Render: Loading ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin mb-4" />
        <p className="text-sm text-[#8A8477]">Loading proposals…</p>
      </div>
    );
  }

  // ── Render: Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <p className="text-sm text-[#8A8477] mb-4">Failed to load proposals.</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white"
          style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  // ── Render: Empty ──
  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
        <FileText className="w-10 h-10 text-[#DCDBD6] mb-4" />
        <h3
          className="text-lg font-normal text-[#1B1A1A] tracking-tight mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          No proposals yet
        </h3>
        <p className="text-sm text-[#8A8477] mb-6 text-center max-w-md leading-relaxed">
          Create your first proposal to see it appear here with its status, linked project, and version details.
        </p>
        <button
          onClick={onCreateProposal}
          className="flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Create Proposal
        </button>
      </div>
    );
  }

  // ── Filter by view ──
  const activeProposals = proposals.filter((p) => !isArchived(p.status));
  const archivedProposals = proposals.filter((p) => isArchived(p.status));
  const visibleProposals = view === 'archived' ? archivedProposals : activeProposals;

  // ── Render: Card grid ──
  return (
    <div className="border-t border-[#E5E1D8] pt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {/* Active / Archived view toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F5F4F0] border border-[#E5E1D8]">
            <button
              onClick={() => setView('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'active'
                  ? 'bg-white text-[#213428] shadow-sm'
                  : 'text-[#8A8477] hover:text-[#1B1A1A]'
              }`}
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Active
              <span className="ml-1.5 text-[10px] text-[#A79E8C]">{activeProposals.length}</span>
            </button>
            <button
              onClick={() => setView('archived')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'archived'
                  ? 'bg-white text-[#213428] shadow-sm'
                  : 'text-[#8A8477] hover:text-[#1B1A1A]'
              }`}
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Archived
              <span className="ml-1.5 text-[10px] text-[#A79E8C]">{archivedProposals.length}</span>
            </button>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-[#8A8477] hover:text-[#213428] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {visibleProposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="w-8 h-8 text-[#DCDBD6] mb-3" />
          <p className="text-sm text-[#8A8477]">
            {view === 'archived' ? 'No archived proposals.' : 'No active proposals.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProposals.map((proposal) => {
            const project = projectMap[proposal.project_id];
            return (
              <div key={proposal.id} className={actionLoading ? 'relative' : ''}>
                {actionLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded-lg">
                    <Loader2 className="w-5 h-5 text-[#625143] animate-spin" />
                  </div>
                )}
                <ProposalCard
                  proposal={proposal}
                  projectName={project?.name || null}
                  versionLabel={resolveVersionLabel(proposal)}
                  sectionCount={sectionCounts[proposal.id] || 0}
                  onDuplicate={handleDuplicate}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}