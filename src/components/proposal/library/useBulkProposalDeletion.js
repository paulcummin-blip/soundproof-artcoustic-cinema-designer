/**
 * useBulkProposalDeletion
 * -----------------------
 * Selection and deletion for the Proposal Library.
 *
 * Selection is scoped to what is on screen: it starts from the proposals
 * currently listed under the chosen project and view, and a proposal that leaves
 * them leaves the selection with it. A deletion therefore can only ever reach a
 * proposal the designer can see.
 *
 * Nothing is decided here. The server is asked first (a dry run that changes
 * nothing) and reports exactly which proposals would be deleted and which would
 * be kept, with the reason; the confirmation shows that answer, and only then is
 * the deletion issued. A partial result is reported as it happened: deleted
 * proposals are removed from the list, anything not deleted stays selected and is
 * named.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

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
    setSelectedIds((previous) => {
      const visible = new Set(visibleProposalIds);
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [visibleProposalIds]);

  const isSelected = useCallback((proposalId) => selectedIds.has(proposalId), [selectedIds]);

  const toggle = useCallback((proposalId) => {
    if (!proposalId) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(proposalId)) next.delete(proposalId);
      else next.add(proposalId);
      return next;
    });
  }, []);

  /** Select every proposal currently displayed, and only those. */
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visibleProposalIds));
  }, [visibleProposalIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setPlan(null);
    setOutcome(null);
    setError(null);
  }, []);

  /** Ask the server what a deletion of the selection would do. Nothing changes. */
  const requestDelete = useCallback(async () => {
    const proposalIds = [...selectedIds];
    if (proposalIds.length === 0) return;

    setChecking(true);
    setError(null);
    setOutcome(null);
    try {
      const response = await base44.functions.invoke('deleteProposals', {
        proposal_ids: proposalIds,
        dry_run: true,
      });
      const data = response?.data || {};
      if (data.error) throw new Error(data.error);
      setPlan({ deletable: data.deletable || [], refused: data.refused || [] });
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
    const proposalIds = (plan?.deletable || []).map((entry) => entry.id).filter(Boolean);
    if (proposalIds.length === 0) {
      setDialogOpen(false);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('deleteProposals', {
        proposal_ids: proposalIds,
        dry_run: false,
      });
      const data = response?.data || {};
      if (data.error) throw new Error(data.error);

      const deleted = data.deleted || [];
      const notDeleted = data.not_deleted || [];
      const deletedIds = deleted.map((entry) => entry.id).filter(Boolean);

      // The cards go at once, and the library's own counts follow the list.
      if (deletedIds.length > 0 && typeof onDeleted === 'function') onDeleted(deletedIds);
      setSelectedIds((previous) => {
        const next = new Set(previous);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });

      if (notDeleted.length === 0) {
        // Everything asked for was deleted: the count and the list have already
        // moved on, and the selection is cleared.
        setDialogOpen(false);
        setPlan(null);
        setOutcome(null);
        setSelectedIds(new Set());
      } else {
        // Never reported as a plain success: what was kept, and why, stays on
        // screen until the designer closes it.
        setOutcome({ deleted, notDeleted });
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