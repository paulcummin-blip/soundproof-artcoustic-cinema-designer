/**
 * useDesignContextClarifications
 * --------------------------------
 * Fetches ADI's clarification questions for the Design Context step.
 *
 * The clarification questions — up to three optional questions ADI asks about
 * design decisions no reason is recorded for — come from the same
 * generateAdiNarrativeSuggestions call the suggestion chips used. The chip UI is
 * gone, but the questions are preserved: they are collected on the Clarify step
 * that follows, and a passed question is never treated as answered.
 *
 * This hook carries NO narrative-steering preferences. It reads the frozen
 * engineering evidence and the designer's brief only to supply the questions,
 * exactly as the suggestion chips did before the controls were removed.
 */
import { useCallback, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { SUGGESTION_TIMEOUT_MS, settleWithin } from '@/components/proposal/wizard/suggestionRequestBounding';

export function useDesignContextClarifications({
  projectId,
  selectedVersionIds = [],
  proposalType,
  engineeringSnapshot,
  versionSnapshots = [],
  snapshotLoading = false,
  versionsLoading = false,
  clientBrief = '',
  existingClarifications = [],
  onClarifications,
} = {}) {
  const requestRef = useRef(0);
  const onClarificationsRef = useRef(onClarifications);
  onClarificationsRef.current = onClarifications;

  const selectedCount = Math.max(
    (selectedVersionIds || []).length,
    (versionSnapshots || []).length,
  );
  const comparisonSelected = selectedCount > 1 || proposalType === 'comparison';
  const availableVersionEntries = (versionSnapshots || [])
    .filter((entry) => entry?.snapshot?.available === true);
  const comparisonReady = availableVersionEntries.length > 1
    && availableVersionEntries.length >= selectedCount;
  const hasResults = comparisonSelected
    ? comparisonReady
    : engineeringSnapshot?.available === true;

  const evidenceKey = [
    projectId || '',
    (selectedVersionIds || []).join(','),
    engineeringSnapshot?.identity?.engineeringFingerprint
      || engineeringSnapshot?.calculationFingerprint
      || (engineeringSnapshot?.available === true ? 'available' : 'none'),
    (versionSnapshots || [])
      .map((entry) => `${entry?.version_id || ''}:${entry?.snapshot?.available === true ? 1 : 0}`)
      .join(','),
  ].join('|');

  // The request reads its payload from a ref, so it is never re-created (and
  // never re-fired) merely because a parent re-rendered with a new object.
  const payloadRef = useRef(null);
  payloadRef.current = {
    project_id: projectId,
    proposal_type: proposalType,
    selected_version_ids: selectedVersionIds,
    engineering_snapshot: engineeringSnapshot,
    client_brief: clientBrief || '',
    existing_clarifications: (Array.isArray(existingClarifications) ? existingClarifications : [])
      .map((entry) => ({ question_id: entry?.question_id, status: entry?.status }))
      .filter((entry) => entry.question_id),
    version_snapshots: comparisonSelected
      ? (versionSnapshots || [])
        .filter((entry) => entry?.snapshot?.available === true)
        .map((entry) => ({
          version_id: entry.version_id,
          version_name: entry.version_name || null,
          snapshot: entry.snapshot,
        }))
      : [],
  };

  const load = useCallback(async () => {
    if (!hasResults) return;
    const token = requestRef.current + 1;
    requestRef.current = token;
    // The wait is bounded, so a slow response can never leave the step waiting
    // on it. A response arriving after the wait is discarded by the bounding
    // promise and never delivered.
    const result = await settleWithin(Promise.resolve().then(() =>
      base44.functions.invoke('generateAdiNarrativeSuggestions', payloadRef.current)));

    // A request superseded by a newer one, or left behind by the step being
    // closed, never writes anything.
    if (requestRef.current !== token) return;

    if (result.status === 'timeout' || result.status === 'failed') {
      onClarificationsRef.current?.([]);
      return;
    }

    const data = result.response?.data || {};
    // Only the clarifications are consumed here. The refined suggestions the
    // same call returns were for the chip UI that no longer exists, so they are
    // not used.
    onClarificationsRef.current?.(data.clarifications || []);
  }, [hasResults]);

  // One run per evidence identity. Changing project or version discards
  // anything the previous selection had produced, including a response still in
  // flight.
  useEffect(() => {
    requestRef.current += 1;
    onClarificationsRef.current?.([]);
    if (!hasResults) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceKey, hasResults, load]);

  // Leaving the step abandons whatever is still in flight: a late response can
  // never reach questions that are no longer on screen.
  useEffect(() => () => {
    requestRef.current += 1;
  }, []);
}

export default useDesignContextClarifications;