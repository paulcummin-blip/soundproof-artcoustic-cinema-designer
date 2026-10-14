import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import log from '@/components/utils/logger';
import NarrativeSteerChip from '@/components/proposal/wizard/NarrativeSteerChip';
import { SUGGESTION_TIMEOUT_MS, settleWithin } from '@/components/proposal/wizard/suggestionRequestBounding';
import {
  STEER_HELPER,
  STEER_STATE,
  STEER_STATE_LABEL,
  STEER_STATE_MEANING,
  STEER_STATE_ORDER,
  STEER_TITLE,
  cycleTopicState,
  presentSteerTopics,
  steerStateOf,
} from '@/components/proposal/wizard/narrativeSteer';
import {
  buildEvidenceSuggestions,
  mergeSuggestions,
  COMPARISON_GENERAL_EXAMPLES,
  FAILED_NOTE,
  GENERAL_EXAMPLES,
  GENERAL_NOTICE,
  REFINING_NOTE,
  TIMEOUT_NOTE,
} from '@/components/proposal/wizard/adiEvidenceSuggestions';

/**
 * NARRATIVE STEER — the topics the designer wants ADI to weigh, in three states.
 *
 * The evidence examples are ALWAYS on screen, in this order of value:
 *
 *   1. Project-specific examples, built in code from this project's frozen
 *      Engineering Snapshot by adiEvidenceSuggestions.js — no request, no model,
 *      no waiting. They appear the moment the snapshot is readable.
 *   2. General examples, shown from the instant the step opens and for as long as
 *      project-specific ones are not yet readable. They are labelled as general,
 *      so they are never read as this design's facts.
 *
 * The ADI function then REFINES the list in the background. It can only add
 * examples: a refinement that fails, times out or returns nothing leaves the
 * examples already on screen exactly as they are.
 *
 * WHAT THE DESIGNER SEES, though, is not an example and not an instruction: it is
 * the TOPIC each example belongs to, as a neutral subject ("Bass extension",
 * '100" TV', "Seating arrangement"), with three states — neutral, prefer, do not
 * discuss. The example's own wording and figure stay in the chip's description,
 * so nothing is lost, and the state supplies the instruction. A selected topic is
 * never written into the Client Brief: the brief carries the designer's own words,
 * and the steer travels beside it as a preference.
 *
 * Presentation only: none of this changes an engineering result, an RP22 value, a
 * Design Index, a table value or a recommendation. "Do not discuss" steers the
 * client-facing narrative alone.
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
  // The narrative steer: { topic_key: { state, label } }. Read here and written
  // through onSteerChange — never into the brief.
  steer = {},
  onSteerChange,
  onClarifications,
}) {
  // The refined examples ADI adds. Never the reason a topic is on screen.
  const [refined, setRefined] = useState([]);
  const [refining, setRefining] = useState(false);
  // 'idle' | 'refining' | 'timedOut' | 'failed' — how the refinement ended. The
  // topics on screen are unaffected by every one of these.
  const [refinement, setRefinement] = useState('idle');
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
  // on is a different set of evidence, and so a different set of topics.
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
  // every selected version: without one there is nothing for ADI to read.
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
  // calculated and nothing is fetched, so the topics are on screen in the same
  // render that the evidence becomes readable.
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

  // ── The topics the designer actually steers ──────────────────────────────
  // Each example is mapped to the topic it belongs to, so the chip reads as a
  // subject and the example's own wording moves into its description. Topics ADI
  // suggests are suggested because their own result is strong: a weak result is
  // offered without being promoted.
  const topics = useMemo(
    () => presentSteerTopics({ chips }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chipsKey],
  );

  const cycleTopic = useCallback((topic) => {
    onSteerChange?.(cycleTopicState(steer, topic.topic_key, topic.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steer, onSteerChange]);

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
    // promise: it is never delivered, so it can neither remove a topic nor touch
    // a steer the designer has already set.
    const result = await settleWithin(Promise.resolve().then(() => base44.functions.invoke('generateAdiNarrativeSuggestions', payloadRef.current)));

    // A request superseded by a newer one, or left behind by the step being
    // closed, never writes anything.
    if (requestRef.current !== token) return;

    const elapsed = Date.now() - startedAt;
    if (result.status === 'timeout') {
      console.warn(`[AdiSuggestionChips] refinement did not settle within ${SUGGESTION_TIMEOUT_MS / 1000}s; topics retained.`);
      setRefinement('timedOut');
      setRefining(false);
      return;
    }
    if (result.status === 'failed') {
      console.error('[AdiSuggestionChips] refinement failed; topics retained:', result.error);
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
    log.debug('[AdiSuggestionChips] refinement stages', {
      refinementMs: elapsed,
      refinementStatus: 'settled',
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
  // never reach a steer area that is no longer on screen.
  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  // The frozen evidence became readable: record how long that took, once, so the
  // wait for project-specific topics is a measured number rather than a guess.
  useEffect(() => {
    if (!hasResults || evidenceReadLoggedRef.current) return;
    evidenceReadLoggedRef.current = true;
    log.debug(`[AdiSuggestionChips] frozen evidence readable after ${Date.now() - stepOpenedAtRef.current} ms`, {
      evidenceBacked: evidence.evidenceBacked,
      snapshotLoading,
      versionsLoading,
    });
  }, [hasResults, evidence.evidenceBacked, snapshotLoading, versionsLoading]);

  // The only status text this area ever shows: quiet, below the topics, and never
  // a reason for the topics to be missing.
  const statusNote = refining && refinement === 'refining'
    ? REFINING_NOTE
    : refinement === 'timedOut'
      ? TIMEOUT_NOTE
      : refinement === 'failed'
        ? FAILED_NOTE
        : null;
  const showGeneralNotice = !evidence.evidenceBacked && refined.length === 0;
  const steeredCount = STEER_STATE_ORDER
    .filter((state) => state !== STEER_STATE.NEUTRAL)
    .reduce((total, state) => (
      total + topics.filter((topic) => steerStateOf(steer, topic.topic_key) === state).length
    ), 0);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#A79E8C]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">
            {`${STEER_TITLE}, powered by Artcoustic Design Intelligence`}
          </span>
        </div>
        {hasResults && !refining && (
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {'Refresh suggestions'}
          </button>
        )}
      </div>

      <p className="text-[11px] text-[#625143] leading-relaxed mb-3">{STEER_HELPER}</p>

      {showGeneralNotice && (
        <p className="text-[11px] text-[#8A8477] mb-3">{GENERAL_NOTICE}</p>
      )}

      {/* The topics are always here: never hidden, never empty, never waiting.
          One click moves a topic to its next state, so the state carries the
          instruction and the topic name stays a subject. */}
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <NarrativeSteerChip
            key={topic.topic_key}
            label={topic.label}
            state={steerStateOf(steer, topic.topic_key)}
            reason={topic.reason}
            suggested={topic.suggested}
            onCycle={() => cycleTopic(topic)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {STEER_STATE_ORDER.map((state) => (
          <span key={state} className="text-[11px] text-[#8A8477]">
            <span className="font-semibold text-[#625143]">{STEER_STATE_LABEL[state]}</span>
            {` — ${STEER_STATE_MEANING[state]}`}
          </span>
        ))}
      </div>

      {steeredCount > 0 && (
        <p className="mt-2 text-[11px] text-[#625143]">
          {`${steeredCount} topic${steeredCount === 1 ? '' : 's'} steered. These guide the wording; they are not required sections.`}
        </p>
      )}

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
    </div>
  );
}