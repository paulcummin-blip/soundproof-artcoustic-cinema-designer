/**
 * useProposalPreparation
 * ----------------------
 * The moment BEFORE a proposal: what Sound Proof is doing about a version that is
 * not yet proposal-ready, the ONE action it asks the designer for, and the
 * designer's own progress kept while they step away to their design.
 *
 * It owns no engineering. The readiness rows the wizard already holds decide
 * everything here (proposalPreparationAuthority), and the wizard keeps ownership
 * of the proposal itself. This hook exists so the wizard does not carry the
 * preparation, the resume and the draft as well as the flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PREPARATION_LINE,
  PREPARATION_STATE,
  resolvePreparation,
} from '@/components/proposal/preparation/proposalPreparationAuthority';
import { readWizardDraft, writeWizardDraft } from '@/components/proposal/wizard/proposalWizardDraft';

export function useProposalPreparation({
  enabled = true,
  projectId = null,
  proposalType = null,
  selectedVersionIds = [],
  clientBrief = '',
  // The designer's narrative steer: the topics they prefer and the topics they
  // have asked to keep out of the client-facing narrative. Kept with the draft
  // exactly as the brief is, so a resume returns it unchanged.
  steer = {},
  clarificationAnswers = {},
  step = 0,
  finalStep = 0,
  readinessRows = [],
  readinessLoading = false,
  snapshotLoading = false,
  readinessError = null,
  readinessReady = false,
  proposalDataReady = false,
  generating = false,
  runGenerate = null,
} = {}) {
  const [preparing, setPreparing] = useState(false);
  const pendingGenerateRef = useRef(readWizardDraft()?.pendingGenerate === true);
  const autoResumeRef = useRef(false);

  const preparation = useMemo(() => resolvePreparation({
    rows: readinessRows,
    loading: readinessLoading || snapshotLoading,
    error: readinessError,
    projectId,
  }), [readinessRows, readinessLoading, snapshotLoading, readinessError, projectId]);

  // The panel: while Sound Proof is finishing the groundwork the designer sees the
  // preparation line; the internal reason never leaves Engineer details.
  const panelPreparation = readinessReady
    ? { state: PREPARATION_STATE.PREPARING, line: PREPARATION_LINE, detail: null }
    : preparation;

  const buildDraft = useCallback((pendingGenerate) => ({
    projectId,
    proposalType,
    selectedVersionIds,
    clientBrief,
    narrativeSteer: steer,
    clarificationAnswers,
    step,
    pendingGenerate,
  }), [projectId, proposalType, selectedVersionIds, clientBrief, steer, clarificationAnswers, step]);

  // The designer's progress is kept for the moment they step away to their design.
  // Never written without a project, and never for a regeneration.
  useEffect(() => {
    if (!enabled || !projectId) return;
    writeWizardDraft(buildDraft(pendingGenerateRef.current));
  }, [enabled, projectId, buildDraft]);

  // Returning from the design or the report: the proposal the designer already
  // asked for continues by itself once the readiness gate is satisfied. It runs
  // once, and only for a draft that a Generate press created.
  useEffect(() => {
    if (!enabled || autoResumeRef.current || generating) return;
    if (!pendingGenerateRef.current) return;
    if (step !== finalStep || !readinessReady || !proposalDataReady) return;
    if (readinessLoading || snapshotLoading) return;
    autoResumeRef.current = true;
    runGenerate?.current?.();
  }, [
    enabled, generating, step, finalStep, readinessReady, proposalDataReady,
    readinessLoading, snapshotLoading, runGenerate,
  ]);

  // A Generate that is still blocked returns to the preparation panel rather than
  // to the technical readiness table, so the designer never reads a message about
  // publications, pointers or fingerprints.
  useEffect(() => {
    if (!enabled || generating || preparing) return;
    if (!pendingGenerateRef.current) return;
    if (readinessLoading || snapshotLoading || readinessReady) return;
    setPreparing(true);
  }, [enabled, generating, preparing, readinessLoading, snapshotLoading, readinessReady]);

  /** The designer pressed Generate and Sound Proof has work to do first. */
  const beginPreparation = useCallback(() => {
    pendingGenerateRef.current = true;
    if (enabled) writeWizardDraft(buildDraft(true));
    setPreparing(true);
  }, [enabled, buildDraft]);

  /** Generation has been honoured: progress is kept, and nothing asks again. */
  const markGenerationStarted = useCallback(() => {
    pendingGenerateRef.current = false;
    if (enabled) writeWizardDraft(buildDraft(false));
    setPreparing(false);
  }, [enabled, buildDraft]);

  return { preparing, preparation, panelPreparation, pendingGenerateRef, beginPreparation, markGenerationStarted };
}

export default useProposalPreparation;