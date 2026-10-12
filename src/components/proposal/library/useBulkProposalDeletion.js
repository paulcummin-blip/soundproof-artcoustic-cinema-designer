/**
 * useBulkProposalDeletion
 * -----------------------
 * Selection and deletion for the Proposal Library.
 *
 * Selection is held as stable proposal IDs and is scoped to what is on screen:
 * it starts from the proposals currently listed under the chosen project and
 * view, and a proposal that leaves them leaves the selection with it. A deletion
 * therefore can only ever reach a proposal the designer can see.
 *
 * Nothing is decided here. The server is asked first (a dry run that changes
 * nothing) and reports exactly which proposals would be deleted and which would
 * be kept, with the reason; the confirmation shows that answer, and only then is
 * the deletion issued. A selection larger than one request is issued as several
 * requests, so how many proposals may be selected is never capped. A partial
 * result is reported as it happened: deleted proposals are removed from the list,
 * anything not deleted stays selected and is named, and the outcome is reported
 * whether it was a clean sweep or not.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  MAX_PROPOSALS_PER_DELETION_REQUEST,
  chunkSelection,
  mergeDeletionPlan,
  mergeDeletionResults,
  retainVisibleSelection,
  selectionIds,
  toggleSelection,
} from './proposalSelectionAuthority';

/** Ask the deletion function about exactly these IDs. It decides everything. */
async function askDeleteProposals(proposalIds, { dryRun }) {
  const response = await base44.functions.invoke('deleteProposals', {
    proposal_ids: proposalIds,
    dry_run: dryRun,
  });
  const data = response?.data || {};
  if (data.error) throw new Error(data.error);
  return data;
}

/** Every request stays inside the function's per-request bound. */
async function runDeletionBatches(proposalIds, dryRun) {
  const results = [];
  for (const batch of chunkSelection(proposalIds, MAX_PROPOSALS_PER_DELETION_REQUEST)) {
    results.push(await askDeleteProposals(batch, { dryRun }));
  }
  return results;
}

export function useBulkProposalDeletion({ visibleProposalIds = [], onDeleted } = {}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The server's answer to the dry run: what would be deleted, what is kept.
  const [plan, setPlan] = useState(null);
  // What actually happened, when the deletion completed.
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSelectedIds((previous) => retainVisibleSelection(previous, visibleProposalIds));
  }, [visibleProposalIds]);

  const isSelected = useCallback((proposalId) => selectedIds.has(proposalId), [selectedIds]);

  /**
   * Toggle one proposal. The card may pass the record or its id — both resolve
   * to the same stable ID, so the selection stays one set of IDs.
   */
  const toggle = useCallback((proposalOrId) => {
    setSelectedIds((previous) => toggleSelection(previous, proposalOrId));
  }, []);

  /** Select every proposal currently displayed, and only those. */
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(selectionIds(visibleProposalIds)));
  }, [visibleProposalIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setPlan(null);
    setOutcome(null);
    setError(null);
  }, []);

  /** Ask the server what a deletion of the selection would do. Nothing changes. */
  const requestDelete = useCallback(async () => {
    const proposalIds = selectionIds([...selectedIds]);
    if (proposalIds.length === 0) return;

    setChecking(true);
    setError(null);
    setOutcome(null);
    try {
      const results = await runDeletionBatches(proposalIds, true);
      setPlan(mergeDeletionPlan(results));
      setDialogOpen(true);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message
        || 'The selected proposals could not be checked. Please try again.');
    } finally {
      setChecking(false);
    }
  }, [selectedIds]);

  /** Delete what the confirmation is showing. */
  const confirmDelete = useCallback(async () => {
    const proposalIds = selectionIds((plan?.deletable || []).map((entry) => entry.id));
    if (proposalIds.length === 0) {
      setDialogOpen(false);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const results = await runDeletionBatches(proposalIds, false);
      const { deleted, notDeleted } = mergeDeletionResults(results);
      const deletedIds = selectionIds(deleted);

      // The cards go at once, and the library's own counts follow the list.
      if (deletedIds.length > 0 && typeof onDeleted === 'function') onDeleted(deletedIds);
      setSelectedIds((previous) => {
        const next = new Set(previous);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      // The real outcome is always reported: what was deleted, and what was kept
      // and why. Only a clean sweep also clears the selection.
      setOutcome({ deleted, notDeleted });
      if (notDeleted.length === 0) {
        setSelectedIds(new Set());
        setPlan(null);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message
        || 'The deletion could not be completed. Nothing was removed.');
    } finally {
      setDeleting(false);
    }
  }, [plan, onDeleted]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setPlan(null);
    setOutcome(null);
    setError(null);
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    toggle,
    selectAllVisible,
    clearSelection,
    requestDelete,
    confirmDelete,
    closeDialog,
    dialogOpen,
    checking,
    deleting,
    plan,
    outcome,
    error,
  };
}

export default useBulkProposalDeletion;