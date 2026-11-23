/**
 * useEditDesignIntent.js
 * ----------------------
 * The Edit Design Intent flow for a saved Project Report.
 *
 * Replaces the former Regenerate Design Intent action. The designer opens the
 * currently accepted Design Intent in an editable text field and saves the
 * edited wording directly against the correct Project Report and design
 * version. No provider is called: this is a manual edit, not an ADI
 * regeneration.
 *
 * On Save:
 *   - the edited text is persisted against the exact Project Report snapshot
 *     and design version (only payload.design_intent is overwritten);
 *   - the report refreshes immediately via the shared update event;
 *   - all engineering evidence, RP22 results, drawings and other report
 *     sections are preserved (the commit write touches only the Design Intent
 *     field);
 *   - the original generated text is retained on the record for recovery;
 *   - subsequent PDF exports use the approved edited text;
 *   - existing PDF files are never modified.
 *
 * A failed save retains the designer's entries and surfaces the reason.
 */
import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { isCompleteDesignIntentText } from './designIntentAuthority';

/** The shared event that tells the report to reload its saved Design Intent. */
const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

/** Hook status — the single source of truth for the control's UI. */
export const EDIT_STATUS = Object.freeze({
  IDLE: 'idle',
  EDITING: 'editing',
  SAVING: 'saving',
  ERROR: 'error',
});

const EMPTY = { status: EDIT_STATUS.IDLE, draft: '', error: null };

/** The minimum length a finished Design Intent paragraph must carry. */
const MIN_TEXT_LENGTH = 120;

/**
 * Build the manual-edit narrative record from the existing accepted record.
 *
 * The edited text becomes the record's `text`; the original generated text is
 * retained on the record as `original_generated_text` for recovery (set once,
 * from the first generated text, and never overwritten by a later edit). Every
 * evidence fingerprint, the geometry and visual identity, the provider
 * metadata and the generation identity are carried across unchanged, so the
 * edited narrative is pinned to exactly the report the narrative it replaces
 * was pinned to. `edit_source: 'manual'` marks that this wording was set by the
 * designer, not by ADI.
 */
function buildManualEditRecord(existingRecord, editedText, { editedBy = null, now = null } = {}) {
  const base = (existingRecord && typeof existingRecord === 'object' && !Array.isArray(existingRecord))
    ? existingRecord : {};
  const originalGenerated = typeof base.original_generated_text === 'string' && base.original_generated_text.trim()
    ? base.original_generated_text
    : (typeof base.text === 'string' ? base.text : null);
  return {
    ...base,
    status: 'accepted',
    text: String(editedText || '').trim(),
    // Retain the original generated text for recovery. Set once from the first
    // generated text and preserved across later manual edits.
    original_generated_text: originalGenerated,
    edit_source: 'manual',
    edited_at: now,
    edited_by: editedBy || null,
  };
}

export function useEditDesignIntent({ projectId = null, versionId = null, savedDesignIntentRecord = null, hasAcceptedNarrative = false } = {}) {
  const [state, setState] = useState(EMPTY);

  const open = useCallback(() => {
    if (!projectId || !versionId || !hasAcceptedNarrative) return;
    const existingText = typeof savedDesignIntentRecord?.text === 'string'
      ? savedDesignIntentRecord.text
      : '';
    setState({ status: EDIT_STATUS.EDITING, draft: existingText, error: null });
  }, [projectId, versionId, hasAcceptedNarrative, savedDesignIntentRecord]);

  const setDraft = useCallback((draft) => {
    setState((prev) => (prev.status === EDIT_STATUS.IDLE ? prev : { ...prev, draft }));
  }, []);

  const cancel = useCallback(() => {
    setState(EMPTY);
  }, []);

  const save = useCallback(async () => {
    if (!projectId || !versionId) return;
    const editedText = String(state.draft || '').trim();
    if (editedText.length < MIN_TEXT_LENGTH) {
      setState((prev) => ({ ...prev, status: EDIT_STATUS.EDITING, error: 'The Design Intent needs at least a short paragraph. Add a little more before saving.' }));
      return;
    }
    setState((prev) => ({ ...prev, status: EDIT_STATUS.SAVING, error: null }));
    try {
      let editedBy = null;
      try {
        const me = await base44.auth.me();
        editedBy = me?.full_name || me?.email || null;
      } catch { /* edited_by is best-effort */ }
      const record = buildManualEditRecord(savedDesignIntentRecord, editedText, {
        editedBy,
        now: new Date().toISOString(),
      });
      const response = await base44.functions.invoke('commitReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
        narrative_record: record,
      });
      const data = response?.data || {};
      if (data.ok === true) {
        setState(EMPTY);
        // Tell the report to reload its saved Design Intent so the edited text
        // is displayed immediately, from the same authority every read uses.
        window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
      } else {
        setState((prev) => ({
          ...prev,
          status: EDIT_STATUS.EDITING,
          error: data.error || data.reason || 'The edited Design Intent could not be saved. Your text is unchanged here; please retry.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: EDIT_STATUS.EDITING,
        error: err?.message || 'The edited Design Intent could not be saved. Your text is unchanged here; please retry.',
      }));
    }
  }, [projectId, versionId, state.draft, savedDesignIntentRecord]);

  const dismissError = useCallback(() => {
    setState((prev) => (prev.status === EDIT_STATUS.ERROR ? EMPTY : prev));
  }, []);

  return {
    ...state,
    hasAcceptedNarrative,
    canEdit: hasAcceptedNarrative,
    isBusy: state.status === EDIT_STATUS.SAVING,
    isEditing: state.status === EDIT_STATUS.EDITING || state.status === EDIT_STATUS.SAVING,
    open,
    setDraft,
    save,
    cancel,
    dismissError,
  };
}

export default useEditDesignIntent;