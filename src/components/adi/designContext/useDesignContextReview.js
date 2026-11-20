/**
 * useDesignContextReview.js
 * --------------------------
 * The hook that coordinates the pre-generation context review step.
 *
 * It discovers questions, shows the dialog, saves the designer's answers, and
 * resolves when the designer is done. It is used by the regenerate and
 * auto-generation flows to insert the context review BEFORE the writer is called.
 *
 * The hook returns:
 *   - dialogState: { open, isDiscovering, isSaving, questions, savedItems }
 *   - review(): discovers questions and opens the dialog
 *   - proceed(rows): saves the designer's answers and resolves the pending promise
 *   - cancel(): closes the dialog and resolves the pending promise with null
 *   - DesignContextDialog: the dialog component, pre-wired to the hook's state
 *
 * Usage:
 *   const contextReview = useDesignContextReview({ projectId, versionId });
 *   // Before generating:
 *   const proceed = await contextReview.review();
 *   if (!proceed) return; // designer cancelled
 *   // ... proceed with generation
 *   // Render the dialog in the component:
 *   <contextReview.Dialog />
 */
import React, { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import DesignContextDialog from './DesignContextDialog';

const STATUS = Object.freeze({
  IDLE: 'idle',
  DISCOVERING: 'discovering',
  REVIEWING: 'reviewing',
  SAVING: 'saving',
});

export function useDesignContextReview({ projectId = null, versionId = null } = {}) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [questions, setQuestions] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const resolverRef = React.useRef(null);

  const review = useCallback(async () => {
    if (!projectId || !versionId) return true; // No review needed; proceed.
    setStatus(STATUS.DISCOVERING);
    setQuestions([]);
    setSavedItems([]);
    try {
      const response = await base44.functions.invoke('discoverDesignContextQuestions', {
        project_id: projectId,
        version_id: versionId,
      });
      const data = response?.data || {};
      if (data.ok !== true) {
        // Discovery failed: proceed without context. The writer will use
        // its default behaviour (describe the arrangement without inventing
        // a motivation).
        setStatus(STATUS.IDLE);
        return true;
      }
      setQuestions(data.questions || []);
      setSavedItems(data.saved_items || []);
      // If there are no questions and no saved items, skip the dialog.
      if (!(data.questions || []).length && !(data.saved_items || []).length) {
        setStatus(STATUS.IDLE);
        return true;
      }
      setStatus(STATUS.REVIEWING);
      // Wait for the designer to proceed or cancel.
      return new Promise((resolve) => {
        resolverRef.current = resolve;
      });
    } catch {
      // Discovery failed: proceed without context.
      setStatus(STATUS.IDLE);
      return true;
    }
  }, [projectId, versionId]);

  const proceed = useCallback(async (rows) => {
    setStatus(STATUS.SAVING);
    try {
      // Build the items to save: only answered and no_reason items.
      // Skipped items are not persisted.
      const itemsToSave = (Array.isArray(rows) ? rows : [])
        .filter((row) => row.status === 'answered' || row.status === 'no_reason')
        .map((row) => ({
          question_id: row.question_id,
          question: row.question,
          area: row.area,
          status: row.status,
          answer: row.status === 'answered' ? (row.answer || '').trim() : null,
          decision_fingerprint: row.decision_fingerprint,
        }));

      if (itemsToSave.length > 0) {
        await base44.functions.invoke('saveDesignContext', {
          project_id: projectId,
          version_id: versionId,
          context_items: itemsToSave,
        });
      }
    } catch {
      // Save failed: proceed anyway. The generation can still run; the
      // context just won't be persisted for reuse.
    }
    setStatus(STATUS.IDLE);
    setQuestions([]);
    setSavedItems([]);
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, [projectId, versionId]);

  const cancel = useCallback(() => {
    setStatus(STATUS.IDLE);
    setQuestions([]);
    setSavedItems([]);
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  const Dialog = React.useMemo(() => function DesignContextDialogBound() {
    return React.createElement(DesignContextDialog, {
      open: status === STATUS.REVIEWING || status === STATUS.SAVING || status === STATUS.DISCOVERING,
      isDiscovering: status === STATUS.DISCOVERING,
      isSaving: status === STATUS.SAVING,
      questions,
      savedItems,
      onProceed: proceed,
      onCancel: cancel,
    });
  }, [status, questions, savedItems, proceed, cancel]);

  return {
    review,
    proceed,
    cancel,
    Dialog,
    isReviewing: status === STATUS.REVIEWING || status === STATUS.DISCOVERING || status === STATUS.SAVING,
  };
}

export default useDesignContextReview;