// optimiserRunProgressAuthority.js
// ---------------------------------------------------------------------------
// WHERE A RUNNING BASS OPTIMISATION RUN ACTUALLY IS — read, never invented.
//
// Everything here is read from the engine's own published progress store
// (improveBassV2Store), which the engine writes through onProgress(phase,
// label, current, total) while it works:
//
//   phase / phaseLabel   which search is running right now
//   progressCurrent      jobs completed in that search
//   progressTotal        jobs that search will run
//   lastProgressAt       when the engine last reported anything
//   startedAtMs          when the engine run began
//   stageVerdicts        which searches have finished, and how
//   confirmedChallengers candidates confirmed canonically (never proxies)
//
// …and from the run lifecycle authority (optimiserRunAuthority): the run id and
// the moment the designer pressed the control.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO:
//   • it never invents a job count, a percentage or a stage
//   • it never reads elapsed time as failure: a run is only STALLED when the
//     engine has stopped reporting progress, which is measured from
//     lastProgressAt — not from how long the run has been going
//   • it calculates nothing: which stage is active is read from the engine's
//     own stage mapping (improveBassV2StageMapping), and this module only
//     states that stage in plain language
//
// PURE: no React, no store writes, no optimiser maths.
// ---------------------------------------------------------------------------

import { buildStageDisplay } from "../improveBassV2/improveBassV2StageMapping.js";
import { resolveRunPublicationPhase } from "./optimiserRunTimings.js";

/** The wording of the control while the run is in flight. */
export const ADI_OPTIMISER_RUNNING_LABEL = "OPTIMISING BASS…";

/** The running card's own heading and one-line statement. */
export const OPTIMISER_RUNNING_TITLE = "OPTIMISATION RUNNING";
export const OPTIMISER_RUNNING_SENTENCE = "ADI is evaluating the current design.";

/**
 * How long the engine may report nothing before the run is called STALLED.
 *
 * A stall is NOT "this is taking a while": it is the engine having stopped
 * publishing progress. Elapsed time alone never marks a run stalled.
 */
export const OPTIMISER_STALL_AFTER_MS = 120000;

export const OPTIMISER_STALL_TITLE = "OPTIMISATION IS TAKING LONGER THAN EXPECTED";
export const OPTIMISER_STALL_CHECK_LABEL = "CHECK STATUS";
export const OPTIMISER_STALL_CANCEL_LABEL = "CANCEL RUN";

/** Live store statuses that end the run for presentation purposes. */
export const OPTIMISER_LIVE_TERMINAL_STATUS = Object.freeze(["cancelled", "error", "stale"]);

/**
 * The plain-language stage labels. The engine's own stage mapping decides WHICH
 * stage is active (improveBassV2StageMapping); this states it for the designer.
 */
export const OPTIMISER_STAGE_LABEL = Object.freeze({
  baseline: "Preparing current design",
  delay: "Testing timing",
  phase: "Testing phase alignment",
  polarity: "Testing polarity",
  gain: "Testing level balance",
  placement: "Testing subwoofer placement",
  layout: "Testing layout options",
  seating: "Testing seating options",
  combined: "Comparing combined adjustments",
  final: "Checking the best result",
  persistence: "Saving optimisation result",
});

/** Engine stage key → plain-language stage key. */
const ENGINE_STAGE_KEY = Object.freeze({
  delays: "delay",
  phase_polarity: "phase",
  gain: "gain",
  sub_positions: "placement",
  seating_positions: "seating",
  combining_best: "combined",
  confirming_finalists: "final",
  preparing: "final",
});

const seconds = (value) => {
  // A missing figure stays missing: it must never read as zero seconds, zero
  // jobs or a zero count of anything.
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
};

/**
 * "42 seconds" · "1 minute 20 seconds" — the run's own elapsed time, in words.
 */
export function formatOptimiserElapsed(secondsValue) {
  const total = seconds(secondsValue);
  if (total == null) return null;
  if (total < 60) return `${total} second${total === 1 ? "" : "s"}`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const minuteText = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (rest === 0) return minuteText;
  return `${minuteText} ${rest} second${rest === 1 ? "" : "s"}`;
}

/**
 * Which stage the engine is in right now, in plain language.
 *
 * The engine's own stage mapping supplies the active stage; the engine's own
 * phase and phase label refine it where the engine distinguishes two searches
 * inside one stage (polarity inside the phase search, an alternative layout
 * inside the placement pool) or has finished searching and is settling the
 * result.
 *
 * @returns {{ key: string, label: string, engineStageKey: string|null }}
 */
export function resolveOptimiserRunningStage({ state = null, running = true } = {}) {
  const phase = String(state?.phase || "idle");
  const phaseLabel = String(state?.phaseLabel || "");
  const display = buildStageDisplay({ ...(state || {}), phase, status: state?.status || "idle" });
  const engineStageKey = display.activeStageKey || null;

  const labelled = (key) => ({
    key,
    label: OPTIMISER_STAGE_LABEL[key],
    engineStageKey,
  });

  // The engine has finished searching; the result is being settled and saved.
  // (Only while the run is still in flight — a completed run is terminal.)
  if (running && state?.status === "complete") return labelled("persistence");

  // A second search inside one stage: the engine says so in its own phase label.
  if (phase === "calibrating" && /polarity/i.test(phaseLabel)) return labelled("polarity");
  if (engineStageKey === "sub_positions" && /layout|alternative/i.test(phaseLabel)) return labelled("layout");

  // The seating search runs inside the engine's finalising and combining
  // phases, and says so in its own phase label: it is named for what it tests,
  // never as the final check.
  if (/seating/i.test(phaseLabel)) return labelled("seating");

  // The final evaluation: the engine's own phase tokens for it.
  if (phase === "finalising") return labelled("final");

  // The engine is still preparing — no search is active yet.
  if (!engineStageKey || engineStageKey === "comparing") {
    return labelled(phase === "idle" || phase === "reviewing" ? "baseline" : "final");
  }

  return labelled(ENGINE_STAGE_KEY[engineStageKey] || "baseline");
}

/**
 * The whole running picture: stage, real job counts, elapsed time and whether
 * the engine has stopped reporting.
 *
 * @param {object} params
 * @param {object|null} params.live - improveBassV2 store state
 * @param {object|null} params.run - the latest run (runId, startedAt)
 * @param {string} params.runStatus - "idle" | "running" | "complete" | "failed"
 * @param {number} params.nowMs - the clock this read is made against
 */
export function buildOptimiserRunProgress({
  live = null,
  run = null,
  runStatus = "idle",
  nowMs = Date.now(),
  runTimings = null,
} = {}) {
  const running = runStatus === "running";
  const liveStatus = live?.status || "idle";
  const liveTerminal = OPTIMISER_LIVE_TERMINAL_STATUS.includes(liveStatus)
    || liveStatus === "complete";
  const terminal = !running || runStatus === "failed" || liveTerminal;

  // ── THE CURRENT RUN'S OWN CLOCK, AND NOTHING ELSE ──
  // The run's own start is the authority whenever it has one. The engine's
  // progress store is a SEPARATE authority that a new run does not reset, so its
  // timestamps may only be read when they belong to THIS run: anything reported
  // before this run started belongs to the run it replaced.
  const runStartedAtMs = Date.parse(run?.startedAt || "") || null;
  const engineStartedAtMs = Number.isFinite(Number(live?.startedAtMs)) ? Number(live.startedAtMs) : null;
  const startedAtMs = runStartedAtMs ?? engineStartedAtMs;
  const elapsedSeconds = startedAtMs == null || !running || runStatus === "failed"
    ? null
    : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

  const stage = resolveOptimiserRunningStage({ state: live, running });

  // ── THE HANDOFF PHASE ──────────────────────────────────────────────────
  // The acoustic search has ended and what remains is saving the result and
  // then publishing it. EVALUATION COUNTS BELONG ONLY TO ACOUSTIC EVALUATION
  // STAGES: during the handoff no job counter is shown at all, however many the
  // engine published for its last search. A publication that is separately
  // observable states itself instead.
  const isHandoff = stage.key === "persistence";
  const publication = isHandoff ? resolveRunPublicationPhase(runTimings) : null;
  const handoffPhase = isHandoff ? (publication?.key || "saving") : null;

  const jobsCompleted = seconds(live?.progressCurrent) ?? 0;
  const jobsTotal = seconds(live?.progressTotal) ?? 0;
  // A job count is stated ONLY when the engine has published one for the
  // search in flight. No published count = no count, never an estimate.
  const hasJobProgress = running && jobsTotal > 0 && !isHandoff;
  const jobLine = hasJobProgress
    ? `${jobsCompleted} of ${jobsTotal} evaluation jobs complete`
    : null;

  // A run that has not reported progress yet has been waiting since IT started —
  // never since the previous run's last report. A fresh run therefore reads
  // "0 seconds", not the age of the run it replaced.
  const engineProgressAtMs = Number.isFinite(Number(live?.lastProgressAt)) ? Number(live.lastProgressAt) : null;
  const lastProgressAtMs = runStartedAtMs != null && engineProgressAtMs != null
    ? Math.max(engineProgressAtMs, runStartedAtMs)
    : (engineProgressAtMs ?? startedAtMs);
  const secondsSinceProgress = lastProgressAtMs != null && running
    ? Math.max(0, Math.floor((nowMs - lastProgressAtMs) / 1000))
    : null;

  // STALLED = the engine has stopped reporting, for a meaningful period. It is
  // never derived from elapsed time alone.
  const stalled = running
    && runStatus !== "failed"
    && !liveTerminal
    && secondsSinceProgress != null
    && secondsSinceProgress * 1000 >= OPTIMISER_STALL_AFTER_MS;

  return {
    running,
    terminal,
    liveStatus,
    runId: run?.runId || null,
    startedAtMs,
    elapsedSeconds,
    elapsedText: formatOptimiserElapsed(elapsedSeconds),
    stageKey: stage.key,
    stageLabel: stage.label,
    engineStageKey: stage.engineStageKey,
    // During the handoff the line states the real phase — saving, or publishing
    // when the publication is separately observable — and never a job count.
    handoffPhase,
    stageLine: publication?.label || `${stage.label}…`,
    jobsCompleted,
    jobsTotal,
    hasJobProgress,
    jobLine,
    jobCountVisible: hasJobProgress,
    progressLine: publication?.label
      || (jobLine ? `${stage.label}… ${jobLine}` : `${stage.label}…`),
    lastProgressAtMs,
    secondsSinceProgress,
    sinceProgressText: formatOptimiserElapsed(secondsSinceProgress),
    stalled,
    stallSentence: stalled
      ? `ADI has not reported new progress for ${formatOptimiserElapsed(secondsSinceProgress)}.`
      : null,
    cancelRequested: live?.cancelRequested === true,
    stageVerdicts: live?.stageVerdicts || {},
    // Confirmed canonically by the engine — a proxy is never counted here.
    confirmedCandidates: Array.isArray(live?.confirmedChallengers)
      ? live.confirmedChallengers.length
      : 0,
  };
}

/**
 * What CHECK STATUS found. It re-reads the two live authorities and states the
 * facts: whether the engine has reported anything new, and where it is now.
 * It never launches, restarts or re-runs anything.
 *
 * @param {object} params
 * @param {object|null} params.live - a FRESH read of the engine's progress store
 * @param {object|null} params.run - the run the card is describing
 * @param {number|null} params.previousLastProgressAt - the last report the card had
 * @param {number} params.nowMs
 * @returns {{ advanced: boolean, sentence: string }}
 */
export function describeOptimiserStatusCheck({
  live = null,
  run = null,
  previousLastProgressAt = null,
  nowMs = Date.now(),
} = {}) {
  const status = live?.status || "idle";
  if (status === "cancelled") {
    return { advanced: true, sentence: "Status checked: the run was cancelled." };
  }
  if (status === "error" || status === "stale") {
    return { advanced: true, sentence: "Status checked: the run has stopped. The card states the result." };
  }
  if (status === "complete") {
    return { advanced: true, sentence: "Status checked: the search has finished and the result is being settled." };
  }
  if (!live || status === "idle") {
    return {
      advanced: false,
      sentence: "Status checked: no run is reporting progress. The card states the next action.",
    };
  }

  // The same rule as the card: progress that predates this run belongs to the run
  // it replaced, so the check never reports an earlier run's inactivity.
  const runStartedAtMs = Date.parse(run?.startedAt || "") || null;
  const reported = Number.isFinite(Number(live?.lastProgressAt)) ? Number(live.lastProgressAt) : null;
  const current = runStartedAtMs != null && reported != null
    ? Math.max(reported, runStartedAtMs)
    : (reported ?? (Number.isFinite(Number(live?.startedAtMs)) ? Number(live.startedAtMs) : null));
  const newProgress = current != null
    && (previousLastProgressAt == null || current > previousLastProgressAt);
  const stage = resolveOptimiserRunningStage({ state: live, running: true });
  const since = current != null ? Math.max(0, Math.floor((nowMs - current) / 1000)) : null;
  const sinceText = formatOptimiserElapsed(since);

  if (newProgress) {
    return {
      advanced: true,
      sentence: `Status checked: ADI has reported new progress. ${stage.label}${sinceText ? `, last report ${sinceText} ago` : ""}.`,
    };
  }

  return {
    advanced: false,
    sentence: `Status checked: still ${stage.label.charAt(0).toLowerCase()}${stage.label.slice(1)}${sinceText ? `, with no new progress for ${sinceText}` : ""}. The run is still active.`,
  };
}