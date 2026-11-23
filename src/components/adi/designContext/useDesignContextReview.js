import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import DesignContextDialog from './DesignContextDialog';
import { saveAndVerifyDesignContext } from './saveAndVerifyDesignContext';

/** One review promise: it resolves true only after save acknowledgement AND read-back. */
export function useDesignContextReview({ projectId = null, versionId = null } = {}) {
  const [status, setStatus] = useState('idle');
  const [questions, setQuestions] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [draftRows, setDraftRows] = useState(null);
  const [error, setError] = useState(null);
  const resolverRef = useRef(null);
  const pendingRef = useRef(null);
  const savingRef = useRef(false);
  const discoveredRef = useRef(false);
  const discoverRef = useRef(null);
  const skippedQuestionIdsRef = useRef([]);
  const confirmedRevisionRef = useRef(null);
  const draftKey = 'soundproof-design-context-draft:' + projectId + ':' + versionId;
  const readDraft = () => { try { return JSON.parse(window.sessionStorage.getItem(draftKey) || 'null'); } catch { return null; } };
  const rememberDraft = rows => { try { window.sessionStorage.setItem(draftKey, JSON.stringify(rows)); } catch { /* answers remain in the open dialog */ } };
  const clearDraft = () => { try { window.sessionStorage.removeItem(draftKey); } catch { /* no authority lives here */ } };
  const finish = value => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    pendingRef.current = null;
    if (resolve) resolve(value);
  };

  const review = useCallback(() => {
    if (pendingRef.current) return pendingRef.current;
    if (!projectId || !versionId) return Promise.resolve(false);
    confirmedRevisionRef.current = null;
    skippedQuestionIdsRef.current = [];
    setError(null);
    setDraftRows(readDraft());
    setStatus('discovering');
    const pending = new Promise(resolve => { resolverRef.current = resolve; });
    pendingRef.current = pending;
    discoveredRef.current = false;
    const discover = async () => {
      setStatus('discovering');
      try {
        const response = await base44.functions.invoke('discoverDesignContextQuestions', {
          project_id: projectId, version_id: versionId,
        });
        if (!resolverRef.current) return;
        const data = response?.data;
        if (data?.ok !== true) throw new Error('Design Context could not be loaded. Please retry.');
        discoveredRef.current = true;
        setQuestions(data.questions || []);
        setSavedItems(data.saved_items || []);
        if (!(data.questions || []).length && !(data.saved_items || []).length) {
          const revision = await saveAndVerifyDesignContext({ base44, projectId, versionId });
          if (!resolverRef.current) return;
          confirmedRevisionRef.current = revision;
          setStatus('idle');
          finish({ contextRevision: revision, skippedQuestionIds: [] });
          return;
        }
        setStatus('reviewing');
      } catch (err) {
        // No successful review is manufactured after a read or save failure.
        setError(err?.message || 'Design Context could not be loaded. Please retry.');
        setStatus('reviewing');
      }
    };
    discoverRef.current = discover;
    void discover();
    return pending;
  }, [projectId, versionId]);

  const proceed = useCallback(async rows => {
    if (savingRef.current || !resolverRef.current) return;
    if (!discoveredRef.current) { void discoverRef.current?.(); return; }
    savingRef.current = true;
    setStatus('saving');
    setError(null);
    rememberDraft(rows);
    const skippedIds = (rows || []).filter(row => row.status === 'skipped' || row.status === 'unanswered').map(row => row.question_id).filter(Boolean);
    const items = (rows || []).filter(row => row.status === 'answered' || row.status === 'no_reason')
      .map(row => ({ question_id: row.question_id, question: row.question, area: row.area,
        status: row.status, answer: row.status === 'answered' ? (row.answer || '').trim() : null,
        decision_fingerprint: row.decision_fingerprint }));
    try {
      const revision = await saveAndVerifyDesignContext({ base44, projectId, versionId, items });
      if (!resolverRef.current) return;
      confirmedRevisionRef.current = revision;
      skippedQuestionIdsRef.current = skippedIds;
      clearDraft();
      setStatus('idle');
      finish({ contextRevision: revision, skippedQuestionIds: skippedIds });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Your answers could not be saved. Please retry saving.');
      setStatus('reviewing');
      // Keep both the dialog instance and its current answer rows intact.
    } finally {
      savingRef.current = false;
    }
  }, [projectId, versionId]);

  const cancel = useCallback(() => {
    if (savingRef.current) return;
    setStatus('idle');
    skippedQuestionIdsRef.current = [];
    confirmedRevisionRef.current = null;
    finish(false);
  }, []);

  useEffect(() => () => { finish(false); }, [projectId, versionId]);

  // Stable component identity: a saving/error transition must not remount the
  // textareas and replace unsaved edits with the previously stored answers.
  const dialogPropsRef = useRef(null);
  dialogPropsRef.current = {
    open: status !== 'idle', isDiscovering: status === 'discovering', isSaving: status === 'saving',
    questions, savedItems, draftRows, error, onProceed: proceed, onCancel: cancel,
  };
  const Dialog = React.useMemo(() => function DesignContextDialogBound() {
    return React.createElement(DesignContextDialog, dialogPropsRef.current);
  }, []);
  const getSkippedQuestionIds = useCallback(() => [...skippedQuestionIdsRef.current], []);
  const getConfirmedRevision = useCallback(() => confirmedRevisionRef.current, []);
  return { review, proceed, cancel, Dialog, error, getSkippedQuestionIds, getConfirmedRevision,
    isReviewing: status !== 'idle' };
}
export default useDesignContextReview;
