/**
 * useProposalLibrary
 * ------------------
 * The Proposal Library data layer: the saved proposals for the dealer's
 * account (optionally one project), grouped by project, with the version names
 * each proposal was built from and its source state (Current / Source changed /
 * Missing source).
 *
 * Every read is a server-side query — no whole-collection scan and no client
 * side filtering of a loaded list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  groupProposalsByProject,
  proposalVersionIds,
  resolveProposalSourceState,
} from './proposalSourceState';

const REPORT_TYPES = ['visual', 'technical'];

function asItems(result) {
  if (Array.isArray(result)) return result;
  return result?.items || [];
}

export function useProposalLibrary({ projectFilter = null } = {}) {
  const [proposals, setProposals] = useState([]);
  const [projectsById, setProjectsById] = useState(new Map());
  const [versionsById, setVersionsById] = useState(new Map());
  const [sourceById, setSourceById] = useState({});
  const [sectionCounts, setSectionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const proposalPage = await base44.entities.Proposal.filter(
        projectFilter ? { project_id: projectFilter } : {},
        { sort: '-updated_date', limit: 100 },
      );
      const proposalList = asItems(proposalPage);

      const projectIds = [...new Set([
        ...proposalList.map((proposal) => proposal.project_id).filter(Boolean),
        ...(projectFilter ? [projectFilter] : []),
      ])];
      const proposalIds = proposalList.map((proposal) => proposal.id).filter(Boolean);

      const [projectRecords, versionRecords, sectionRecords] = await Promise.all([
        projectIds.length > 0
          ? base44.entities.Project.filter({ id: { $in: projectIds } })
          : Promise.resolve([]),
        projectIds.length > 0
          ? base44.entities.ProjectVersion.filter({ project_id: { $in: projectIds } })
          : Promise.resolve([]),
        proposalIds.length > 0
          ? base44.entities.ProposalSection.filter(
            { proposal_id: { $in: proposalIds } },
            { fields: ['proposal_id'], limit: 1000 },
          )
          : Promise.resolve([]),
      ]);

      const nextProjectsById = new Map(asItems(projectRecords).map((project) => [project.id, project]));
      const nextVersionsById = new Map(asItems(versionRecords).map((version) => [version.id, version]));

      // The saved reports behind each selected version decide the source state.
      const versionIds = [...new Set(proposalList.flatMap((proposal) => proposalVersionIds(proposal)))];
      const snapshotPage = versionIds.length > 0
        ? await base44.entities.ReportSnapshot.filter(
          { version_id: { $in: versionIds } },
          { sort: '-generated_at', limit: 1000 },
        )
        : [];

      const savedReportsByVersionId = new Map();
      asItems(snapshotPage).forEach((row) => {
        if (!REPORT_TYPES.includes(row.report_type)) return;
        const entry = savedReportsByVersionId.get(row.version_id) || {};
        if (!entry[row.report_type]) entry[row.report_type] = row;
        savedReportsByVersionId.set(row.version_id, entry);
      });

      const nextSourceById = {};
      proposalList.forEach((proposal) => {
        nextSourceById[proposal.id] = resolveProposalSourceState({
          proposal,
          versionsById: nextVersionsById,
          savedReportsByVersionId,
        });
      });

      const counts = {};
      asItems(sectionRecords).forEach((section) => {
        if (section.proposal_id) counts[section.proposal_id] = (counts[section.proposal_id] || 0) + 1;
      });

      setProposals(proposalList);
      setProjectsById(nextProjectsById);
      setVersionsById(nextVersionsById);
      setSourceById(nextSourceById);
      setSectionCounts(counts);
    } catch (loadError) {
      console.error('[useProposalLibrary] Failed to load proposals:', loadError);
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => { load(); }, [load]);

  /**
   * The version names a proposal was built from, in selection order — the exact
   * saved names the version selector shows, with no slot suffix added. A version
   * with no saved name falls back to its slot number.
   */
  const versionNamesFor = useCallback((proposal) => proposalVersionIds(proposal).map((versionId, index) => {
    const version = versionsById.get(versionId) || null;
    const number = version?.version_number ?? index + 1;
    const savedName = typeof version?.version_name === 'string' ? version.version_name.trim() : '';
    return savedName || `Version ${number}`;
  }), [versionsById]);

  /** Proposals grouped by project, most recently updated group first. */
  const groups = useMemo(
    () => groupProposalsByProject(proposals, projectsById),
    [proposals, projectsById],
  );

  return {
    proposals,
    groups,
    projectsById,
    versionsById,
    sourceById,
    sectionCounts,
    versionNamesFor,
    loading,
    error,
    reload: load,
  };
}

export default useProposalLibrary;