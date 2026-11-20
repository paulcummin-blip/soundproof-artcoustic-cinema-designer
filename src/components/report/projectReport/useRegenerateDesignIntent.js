/**
 * useRegenerateDesignIntent.js
 * ----------------------------
 * The deliberate Regenerate Design Intent flow for a saved Project Report.
 *
 * Opening a report reuses its saved narrative and never calls the writer. This
 * hook powers the explicit action beside the Design Intent heading: it asks the
 * production writer for a NEW narrative using the report's existing frozen
 * evidence, WITHOUT saving it, so the designer can compare the new wording
 * against the existing one. Only after the designer chooses "Use New Version" is
 * the reviewed narrative committed to the snapshot — and only the Design Intent
 * field is touched.
 *
 *   generate()      → calls generateReportDesignIntent with generate_only: true
 *                     (the writer runs against the report's frozen evidence, the
 *                     snapshot is NOT written). On success the hook holds the new
 *                     text + record for review.
 *   keepExisting()  → discards the new narrative; the report is unchanged.
 *   commit()        → calls commitReportDesignIntent with the reviewed record.
 *                     On success it dispatches the shared update event so the
 *                     report reloads its saved Design Intent immediately.
 *
 * A generation or validation failure retains the existing narrative and surfaces
 * the reason; a commit failure retains the new text for review so the designer can
 * retry without regenerating.
 */
import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { isCompleteDesignIntentText } from './designIntentAuthority';
import { useDesignContextReview } from '@/components/adi/designContext/useDesignContextReview';

/** The shared event that tells the report to reload its saved Design Intent. */
const INTENT_UPDATED_EVENT = 'adi-design-intent-updated';

/** Hook status — the single source of truth for the control's UI. */
export const REGENERATE_STATUS = Object.freeze({
  IDLE: 'idle',
  GENERATING: 'generating',
  REVIEWING: 'reviewing',
  COMMITTING: 'committing',
  ERROR: 'error',
});

const EMPTY = { status: REGENERATE_STATUS.IDLE, newText: null, newRecord: null, error: null };

export function useRegenerateDesignIntent({ projectId = null, versionId = null, hasAcceptedNarrative = false } = {}) {
  const [state, setState] = useState(EMPTY);

  // The pre-generation context review step. Before generating a new Design
  // Intent, ADI asks the designer about design decisions whose reasons the
  // engineering evidence does not establish. The designer's answers are saved
  // per version and fed into the writer alongside the existing evidence.
  const contextReview = useDesignContextReview({ projectId, versionId });

  const generate = useCallback(async () => {
    if (!projectId || !versionId) return;
    // Run the context review first. If the designer cancels, abort.
    const proceed = await contextReview.review();
    if (!proceed) return;
    setState({ status: REGENERATE_STATUS.GENERATING, newText: null, newRecord: null, error: null });
    try {
      const response = await base44.functions.invoke('generateReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
        generate_only: true,
      });
      const data = response?.data || {};
      if (data.ok === true && data.generate_only === true) {
        const text = typeof data.text === 'string' ? data.text : '';
        const record = data.record || null;
        if (!record || !isCompleteDesignIntentText(text)) {
          setState({
            status: REGENERATE_STATUS.ERROR,
            newText: null,
            newRecord: null,
            error: 'The new narrative came back incomplete. The existing Design Intent is unchanged.',
          });
          return;
        }
        setState({ status: REGENERATE_STATUS.REVIEWING, newText: text, newRecord: record, error: null });
      } else {
        setState({
          status: REGENERATE_STATUS.ERROR,
          newText: null,
          newRecord: null,
          error: data.reason || data.error || 'The writer could not produce a new narrative. The existing Design Intent is unchanged.',
        });
      }
    } catch (err) {
      setState({
        status: REGENERATE_STATUS.ERROR,
        newText: null,
        newRecord: null,
        error: err?.message || 'The new narrative could not be generated. The existing Design Intent is unchanged.',
      });
    }
  }, [projectId, versionId]);

  const keepExisting = useCallback(() => {
    setState(EMPTY);
  }, []);

  const commit = useCallback(async () => {
    if (!projectId || !versionId) return;
    const record = state.newRecord;
    if (!record) return;
    setState((prev) => ({ ...prev, status: REGENERATE_STATUS.COMMITTING, error: null }));
    try {
      const response = await base44.functions.invoke('commitReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
        narrative_record: record,
      });
      const data = response?.data || {};
      if (data.ok === true) {
        setState(EMPTY);
        // Tell the report to reload its saved Design Intent so the new text is
        // displayed immediately, from the same authority every read uses.
        window.dispatchEvent(new Event(INTENT_UPDATED_EVENT));
      } else {
        setState((prev) => ({
          ...prev,
          status: REGENERATE_STATUS.REVIEWING,
          error: data.reason || data.error || 'The new narrative could not be saved. The existing Design Intent is unchanged.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: REGENERATE_STATUS.REVIEWING,
        error: err?.message || 'The new narrative could not be saved. The existing Design Intent is unchanged.',
      }));
    }
  }, [projectId, versionId, state.newRecord]);

  const dismissError = useCallback(() => {
    setState(EMPTY);
  }, []);

  return {
    ...state,
    hasAcceptedNarrative,
    canRegenerate: hasAcceptedNarrative,
    isBusy: state.status === REGENERATE_STATUS.GENERATING || state.status === REGENERATE_STATUS.COMMITTING,
    isReviewing: state.status === REGENERATE_STATUS.REVIEWING || state.status === REGENERATE_STATUS.COMMITTING,
    generate,
    keepExisting,
    commit,
    dismissError,
    // The pre-generation context review dialog. The page renders this so the
    // designer can answer the context questions before the writer is called.
    ContextDialog: contextReview.Dialog,
  };
}

export default useRegenerateDesignIntent;