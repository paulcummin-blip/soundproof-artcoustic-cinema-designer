/**
 * useProposalEditLayer
 * --------------------
 * Reads a proposal's generated copy layer, and saves edits through the one
 * append-only backend path.
 *
 * The browser holds no rules of its own: which copy there is to show, whether it
 * may be issued, what may be edited and how a block reads are all resolved on the
 * server from the shared Phase 3 and Phase 4 modules. This hook fetches that model
 * and re-reads it after every save, so a new edit appears alongside every earlier
 * one instead of replacing it.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function useProposalEditLayer({ proposalId = null, draftProposalId = null } = {}) {
  const [layer, setLayer] = useState(null);
  const [loading, setLoading] = useState(Boolean(proposalId || draftProposalId));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState(null);

  const hasTarget = Boolean(proposalId || draftProposalId);

  const load = useCallback(async () => {
    if (!proposalId && !draftProposalId) {
      setLayer(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await base44.functions.invoke('readProposalEditLayer', {
        proposal_id: proposalId || null,
        draft_proposal_id: draftProposalId || null,
      });
      const data = response?.data || {};
      if (data.error) {
        setError(data.error);
        setLayer(null);
      } else {
        setLayer(data.layer || null);
        setError(null);
      }
    } catch (readError) {
      setError(readError?.response?.data?.error || readError?.message || 'The proposal copy history could not be read.');
      setLayer(null);
    } finally {
      setLoading(false);
    }
  }, [proposalId, draftProposalId]);

  useEffect(() => {
    if (!hasTarget) {
      setLayer(null);
      setLoading(false);
      return;
    }
    load();
  }, [hasTarget, load]);

  const append = useCallback(async (payload) => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('appendProposalEdit', payload);
      const data = response?.data || {};
      if (data.error) {
        setLastSave({ ok: false, message: data.error });
        return { ok: false, message: data.error };
      }
      setLastSave({
        ok: true,
        valid: data.valid === true,
        status: data.validation_status,
        issues: data.validation_errors || [],
        editNumber: data.edit_number ?? null,
      });
      await load();
      return { ok: true, ...data };
    } catch (invokeError) {
      const message = invokeError?.response?.data?.error
        || invokeError?.message
        || 'The edit could not be saved.';
      setLastSave({ ok: false, message });
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }, [load]);

  /** Save the designer's own wording. Only wording is submitted. */
  const saveDrafts = useCallback(
    (drafts) => append({
      generation_id: layer?.generation?.generation_id || null,
      drafts,
      edit_source: 'manual',
    }),
    [append, layer],
  );

  /** Restore the original generated copy, or a stored valid edit. */
  const revertToCopy = useCallback(
    (toEditId = null) => append({
      generation_id: layer?.generation?.generation_id || null,
      edit_source: 'revert',
      to_edit_id: toEditId,
    }),
    [append, layer],
  );

  return {
    layer,
    loading,
    error,
    saving,
    lastSave,
    saveDrafts,
    revertToCopy,
    clearLastSave: () => setLastSave(null),
  };
}