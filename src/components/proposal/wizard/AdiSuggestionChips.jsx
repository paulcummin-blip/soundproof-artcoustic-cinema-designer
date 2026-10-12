import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lightbulb, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import log from '@/components/utils/logger';
import { toggleChipSelection } from '@/components/proposal/wizard/clientBriefChips';
import { SUGGESTION_TIMEOUT_MS, settleWithin } from '@/components/proposal/wizard/suggestionRequestBounding';
import {
  buildEvidenceSuggestions,
  mergeSuggestions,
  pruneSelection,
  COMPARISON_GENERAL_EXAMPLES,
  FAILED_NOTE,
  GENERAL_EXAMPLES,
  GENERAL_NOTICE,
  REFINING_NOTE,
  TIMEOUT_NOTE,
} from '@/components/proposal/wizard/adiEvidenceSuggestions';

/**
 * ADI narrative focus suggestions for the Client Brief step.
 *
 * The examples are ALWAYS on screen. Two sets are shown, in this order of value:
 *
 *   1. Project-specific examples, built in code from this project's frozen
 *      Engineering Snapshot by adiEvidenceSuggestions.js — no request, no model,
 *      no waiting. They appear the moment the snapshot is readable, and they say
 *      "Explain the 9.1.6 system layout" rather than a generic prompt.
 *   2. General examples, shown from the instant the step opens and for as long as
 *      project-specific ones are not yet readable. They are labelled as general,
 *      so they are never read as this design's facts.
 *
 * The ADI function then REFINES the list in the background. It can only add
 * examples: a refinement that fails, times out or returns nothing leaves the
 * examples already on screen exactly as they are. Nothing about the suggestion
 * area — its visibility, its usability or the examples it shows — depends on
 * that request, and there is no loading state that can hide the examples.
 *
 * The examples guide the wording and emphasis of the client report only. They
 * never change an engineering result, RP22 value, Design Index, table value or
 * recommendation.
 *
 * Chips are multi-select and purely local: clicking one only marks it selected —
 * nothing is written to the Client Brief until the user presses "Add selected to
 * brief". A late refinement never clears a selection the designer has made: only
 * a chip that is no longer offered is dropped. Leaving the step, or changing the
 * project or version, abandons whatever is in flight, so a stale response can
 * never update another version.
 */
export default function AdiSuggestionChips({
  projectId,
  selectedVersionIds = [],
  proposalType,
  engineeringSnapshot,
  versionSnapshots = [],
  snapshotLoading = false,
  versionsLoading = false,
  // The brief being written: it carries the designer's explicit requests, so an
  // assumed or administrative parameter (P8, P15, P21) is only ever offered as
  // an example when the designer has actually asked for it.
  clientBrief = '',
  // The questions already answered or passed in this preparation. They are sent so
  // ADI never asks the same question twice; the answers themselves are collected on
  // the Clarifications step and never written into the brief.
  existingClarifications = [],
  onAddSelected,
  onClarifications,
}) {
  // The refined examples ADI adds. Never the reason an example is on screen.
  const [refined, setRefined] = useState([]);
  const [refining, setRefining] = useState(false);
  // 'idle' | 'refining' | 'timedOut' | 'failed' — how the refinement ended. The
  // examples on screen are unaffected by every one of these.
  const [refinement, setRefinement] = useState('idle');
  // Local, unconfirmed chip selection: cleared when the examples themselves
  // change, and handed to the brief only when the user confirms.
  const [selected, setSelected] = useState([]);
  const [duplicateNotice, setDuplicateNotice] = useState(null);
  const requestRef = useRef(0);
  const stepOpenedAtRef = useRef(Date.now());
  const evidenceReadLoggedRef = useRef(false);
  // The latest props as this render sees them, read by the examples build and by
  // the request through refs: neither is re-created (and so neither can re-fire)
  // merely because a parent re-rendered with a new object.
  const snapshotRef = useRef(engineeringSnapshot);
  snapshotRef.current = engineeringSnapshot;
  const versionSnapshotsRef = useRef(versionSnapshots);
  versionSnapshotsRef.current = versionSnapshots;
  const shownCountRef = useRef(0);
  const onClarificationsRef = useRef(onClarifications);
  onClarificationsRef.current = onClarifications;

  // ── The identity of the frozen evidence behind these examples ────────────
  // A different version, a different selection, or a publication that has moved
  // on is a different set of evidence, and so a different set of examples.
  const selectedCount = Math.max(
    (selectedVersionIds || []).length,
    (versionSnapshots || []).length,
  );
  const comparisonSelected = selectedCount > 1 || proposalType === 'comparison';
  const availableVersionEntries = (versionSnapshots || [])
    .filter((entry) => entry?.snapshot?.available === true);
  const comparisonReady = availableVersionEntries.length > 1
    && availableVersionEntries.length >= selectedCount;
  // A refinement is only worth asking for once a calculated result exists for
  // every selected version: without one there is nothing for ADI to read, and the
  // examples already on screen cover the step.
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

  // ── The project-specific examples, built here and now ────────────────────
  // Synchronous: read from the frozen snapshot already in hand. Nothing is
  // calculated and nothing is fetched, so the examples are on screen in the same
  // render that the evidence becomes readable. Keyed on the evidence identity, so
  // this runs once per selection rather than once per re-render.
  const evidence = useMemo(() => {
    const startedAt = Date.now();
    const built = buildEvidenceSuggestions({
      snapshot: snapshotRef.current,
      versionSnapshots: versionSnapshotsRef.current,
      proposalType,
    });
    log.debug(`[AdiSuggestionChips] deterministic examples built in ${Date.now() - startedAt} ms`, {
      evidenceBacked: built.evidenceBacked,
      count: built.suggestions.length,
    });
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceKey, proposalType]);

  const generalChips = comparisonSelected ? COMPARISON_GENERAL_EXAMPLES : GENERAL_EXAMPLES;

  // What is offered: the project-specific examples when the frozen evidence is
  // readable, the general examples otherwise, plus anything ADI has added. A
  // refinement only ever adds to this list.
  const baseChips = evidence.evidenceBacked
    ? evidence.suggestions
    : generalChips.map((label) => ({ label, reason: '', area: 'general' }));
  const chips = useMemo(
    () => mergeSuggestions({ base: baseChips, refined }),
    [baseChips, refined],
  );
  const chipsKey = chips.map((entry) => entry.label).join('|');
  shownCountRef.current = chips.length;

  // The request reads its payload from refs, so it is never re-created (and never
  // re-fired) merely because a parent re-rendered with a new object.
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
    setRefining(true);
    setRefinement('refining');
    const startedAt = Date.now();
    // The wait is bounded, so a slow refinement can never leave the area waiting
    // on it. A response arriving after the wait is discarded by the bounding
    // promise: it is never delivered, so it can neither remove an example nor
    // touch the brief.
    const result = await settleWithin(Promise.resolve().then(() => base44.functions.invoke('generateAdiNarrativeSuggestions', payloadRef.current)));

    // A request superseded by a newer one, or left behind by the step being
    // closed, never writes anything.
    if (requestRef.current !== token) return;

    const elapsed = Date.now() - startedAt;
    if (result.status === 'timeout') {
      console.warn(`[AdiSuggestionChips] refinement did not settle within ${SUGGESTION_TIMEOUT_MS / 1000}s; examples retained.`);
      setRefinement('timedOut');
      setRefining(false);
      return;
    }
    if (result.status === 'failed') {
      console.error('[AdiSuggestionChips] refinement failed; examples retained:', result.error);
      setRefinement('failed');
      setRefining(false);
      return;
    }

    const data = result.response?.data || {};
    const list = Array.isArray(data.suggestions) ? data.suggestions : [];
    // Added to what is already on screen, never a replacement for it.
    setRefined(list.map((item) => ({ label: item?.label, reason: item?.reason })));
    setRefinement('idle');
    setRefining(false);
    // The questions ADI cannot answer itself belong to the Clarifications step,
    // which collects a real answer: they are never offered as brief text.
    onClarificationsRef.current?.(data.clarifications || []);
    // The measured stages, so the request can be judged on numbers rather than
    // assumed to be the slow part: the frozen evidence wait, the deterministic
    // build and the refinement are reported separately, and the server reports
    // its own stages alongside them.
    log.debug('[AdiSuggestionChips] refinement stages', {
      refinementMs: elapsed,
      refinementStatus: 'settled',
      serverTimings: data.timings || null,
      added: list.length,
      shown: shownCountRef.current,
    });
  }, [hasResults]);

  // One run per evidence identity. Changing project or version discards anything
  // the previous selection had produced, including a response still in flight.
  useEffect(() => {
    requestRef.current += 1;
    setRefined([]);
    setRefinement('idle');
    setRefining(false);
    onClarificationsRef.current?.([]);
    if (!hasResults) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceKey, hasResults, load]);

  // Leaving the step abandons whatever is still in flight: a late response can
  // never reach a suggestion area that is no longer on screen.
  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  // The frozen evidence became readable: record how long that took, once, so the
  // wait for project-specific examples is a measured number rather than a guess.
  useEffect(() => {
    if (!hasResults || evidenceReadLoggedRef.current) return;
    evidenceReadLoggedRef.current = true;
    log.debug(`[AdiSuggestionChips] frozen evidence readable after ${Date.now() - stepOpenedAtRef.current} ms`, {
      evidenceBacked: evidence.evidenceBacked,
      snapshotLoading,
      versionsLoading,
    });
  }, [hasResults, evidence.evidenceBacked, snapshotLoading, versionsLoading]);

  // A selection survives a refinement: only a chip that is no longer offered is
  // dropped, so a late response never resets what the designer has chosen.
  useEffect(() => {
    setSelected((current) => {
      const next = pruneSelection(current, chips);
      return next.length === current.length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipsKey]);

  const toggleChip = (label) => {
    setDuplicateNotice(null);
    setSelected((current) => toggleChipSelection(current, label));
  };

  const clearSelection = () => {
    setSelected([]);
    setDuplicateNotice(null);
  };

  const confirmSelection = () => {
    if (selected.length === 0) return;
    const result = onAddSelected?.(selected) || {};
    const duplicates = result.duplicates || [];
    setDuplicateNotice(
      duplicates.length === 0
        ? null
        : duplicates.length === 1
          ? `Already in the brief: ${duplicates[0]}`
          : `Already in the brief: ${duplicates.slice(0, 2).join(', ')}${duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ''}`,
    );
    setSelected([]);
  };

  // One chip, rendered the same way wherever it is offered.
  const renderChip = (entry) => {
    const isSelected = selected.includes(entry.label);
    return (
      <button
        key={entry.label}
        type="button"
        title={entry.reason || undefined}
        aria-pressed={isSelected}
        onClick={() => toggleChip(entry.label)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 focus-visible:ring-offset-1 ${
          isSelected
            ? 'bg-[#213428] text-white border-[#213428] font-semibold'
            : 'text-[#3E4349] bg-[#F5F4F0] border-[#E5E1D8] hover:bg-[#213428] hover:text-white hover:border-[#213428]'
        }`}
      >
        {isSelected && <Check className="w-3 h-3" />}
        {entry.label}
      </button>
    );
  };

  // The only status text this area ever shows: quiet, below the examples, and
  // never a reason for the examples to be missing.
  const statusNote = refining && refinement === 'refining'
    ? REFINING_NOTE
    : refinement === 'timedOut'
      ? TIMEOUT_NOTE
      : refinement === 'failed'
        ? FAILED_NOTE
        : null;
  const showGeneralNotice = !evidence.evidenceBacked && refined.length === 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#A79E8C]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">
            {'Examples, powered by Artcoustic Design Intelligence'}
          </span>
        </div>
        {hasResults && !refining && (
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {'Refresh examples'}
          </button>
        )}
      </div>

      {showGeneralNotice && (
        <p className="text-[11px] text-[#8A8477] mb-3">{GENERAL_NOTICE}</p>
      )}

      {/* The examples are always here: never hidden, never empty, never waiting. */}
      <div className="flex flex-wrap gap-2">{chips.map(renderChip)}</div>

      {statusNote && (
        <p className="mt-2 text-[11px] text-[#8A8477]">
          {statusNote}
          {refinement === 'timedOut' && (
            <button
              type="button"
              onClick={load}
              className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {'Retry'}
            </button>
          )}
        </p>
      )}

      {/* Where an important design decision has no recorded reasoning, ADI asks a
          short question about it — on the Clarifications step, which collects a real
          answer. Nothing is added to the brief here, no question is ever published as
          designer intent, and nothing has to be answered before generating. */}

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-[#625143]">
            {selected.length} selected
          </span>
          <button
            type="button"
            onClick={confirmSelection}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#213428] rounded-md hover:bg-[#2C4436] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 focus-visible:ring-offset-1"
          >
            Add selected to brief
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[#625143] underline underline-offset-2 hover:text-[#213428] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]/40 rounded"
          >
            Clear selection
          </button>
        </div>
      )}

      {duplicateNotice && (
        <p className="mt-2 text-[11px] text-[#8A5A2B]">{duplicateNotice}</p>
      )}
    </div>
  );
}