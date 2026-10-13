// adiCalibrationAutoApplyAuthority.js
// ---------------------------------------------------------------------------
// The ONE decision authority for automatic calibration application.
//
// ADI separates two kinds of change:
//
//   CALIBRATION  processor / amplifier settings an installer adjusts on site —
//                subwoofer delay, front/rear group delay, rear-sub acoustic
//                delay offset, gain trim, polarity, all-pass phase.
//   PHYSICAL     design decisions — moving subwoofers, moving seats, changing
//                seating layout, room dimensions, speaker positions, models,
//                subwoofer count, screen position, construction assumptions.
//
// ADI MAY apply a calibration change on its own — from CONFIRMED canonical
// results only — when it improves one objective (P19 or P20) without materially
// worsening the other, or is the best balanced candidate and improves the
// overall result.
//
// ADI MAY NOT apply: a physical change (this module never returns coordinates
// or seating), a candidate that materially worsens P19 or P20, an immaterial or
// ambiguous result, or an overwrite of calibration a human set by hand.
//
// Nothing here calculates an acoustic result, changes a scoring threshold,
// invents a capability, or rounds an improvement into existence. It reads the
// canonical before/after values the optimiser already confirmed and states what
// they prove — and where nothing improves, it says so.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { MATERIALITY_RULE, isMaterialImprovement, hasPrimarySeatRegression } from "../improveBassV2/materialityGate.js";
import {
  DELAY_ALIGNMENT_TOLERANCE_DB,
  OBJECTIVE_ROLE_LABELS,
  formatDelayMs,
  objectiveRoleFor,
  resolveSignedRearOffsetMs,
} from "../improveBassV2/acousticDelayAlignment.js";
import { readRspP19 } from "../improveBassV2/p19Authority.js";
import { BALANCED_DAMAGE_THRESHOLD_DB } from "../improveBassV2/canonicalObjectiveSelection.js";
import { isCalibrationApplied } from "../improveBassV2/improveBassV2ApplyCalibration.js";
import {
  APPLIED_CALIBRATION_SOURCE,
  APPLIED_CALIBRATION_STATUS,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority.js";
import { normalisePhaseControlDeg } from "../../../../bass/core/subwooferPhaseControl";
import {
  CALIBRATION_TRADEOFF_DECISION,
  assessCalibrationTradeOff,
  describeTradeOffAutoApply,
  describeTradeOffRejected,
  describeTradeOffReview,
} from "./adiCalibrationTradeOffRule.js";

// ── Decisions ────────────────────────────────────────────────────────────

export const CALIBRATION_APPLY_DECISION = Object.freeze({
  APPLIED: "applied",
  HOLD: "hold",
  NONE: "none",
});

export const CALIBRATION_APPLY_REASON = Object.freeze({
  IMPROVES_ONE_WITHOUT_DAMAGE: "improves-one-objective-without-damaging-the-other",
  BEST_BALANCED: "best-balanced-candidate-improves-the-overall-result",
  // A confirmed calibration improvement that a STRONGER confirmed calibration
  // candidate superseded: the rule that blocks it is stated, never left implicit.
  STRONGER_CANDIDATE_SELECTED: "stronger-calibration-candidate-selected",
  // The 3:1 trade-off rule (adiCalibrationTradeOffRule.js).
  TRADEOFF_WITHIN_RATIO: "trade-off-improvement-at-least-three-times-the-damage",
  TRADEOFF_REVIEW_REQUIRED: "trade-off-useful-but-under-the-three-times-rule",
  TRADEOFF_DAMAGE_EXCEEDS_BENEFIT: "trade-off-larger-than-the-improvement",
  P19_DAMAGED: "p19-materially-worsened",
  P20_DAMAGED: "p20-materially-worsened",
  PRIMARY_SEAT_REGRESSION: "primary-seat-regressed",
  NOT_MATERIAL: "calibration-improvement-not-material",
  AMBIGUOUS_EVIDENCE: "calibration-evidence-could-not-be-confirmed",
  ALREADY_APPLIED: "calibration-already-applied",
  HUMAN_CALIBRATION: "calibration-was-set-by-hand",
  NO_CANDIDATE: "no-confirmed-calibration-candidate",
});

export const CALIBRATION_SETTING = Object.freeze({
  DELAY: "delay",
  GAIN: "gain",
  POLARITY: "polarity",
  PHASE: "phase",
});

// ── Fixed copy ───────────────────────────────────────────────────────────

export const ADI_APPLIED_CALIBRATION_TITLE = "ADI Applied Bass Calibration";
export const ADI_DESIGN_CHANGE_TITLE = "Recommended design changes";
export const ADI_DESIGN_CHANGE_SUBTITLE = "These require your approval — ADI has not applied them.";
export const IN_ROOM_CONFIRMATION_NOTE =
  "Predicted calibration starting point — confirm in-room after installation.";
export const NO_USEFUL_CALIBRATION_IMPROVEMENT = "No useful calibration improvement found.";

/** The calibration levers, named as the designer reads them on the panel. */
export const CALIBRATION_LEVER_LABEL = Object.freeze({
  delay: "delay",
  gain: "gain",
  polarity: "polarity",
  phase: "phase",
  combined: "combined",
});

/**
 * A calibration improvement that was NOT applied is never stated without the
 * rule that held it. These are that rule, in one sentence each.
 *
 * @param {string|null} reason - one of CALIBRATION_APPLY_REASON
 * @param {{lever?: string|null, selectedLever?: string|null}} [context]
 * @returns {string|null} the sentence, or null when the reason has no sentence
 */
export function describeCalibrationNotApplied(reason, { selectedLever = null } = {}) {
  const selected = CALIBRATION_LEVER_LABEL[selectedLever] || "selected";
  switch (reason) {
    // The stronger confirmed calibration candidate was applied instead — the
    // case a weaker lever (typically gain behind delay) must state.
    case CALIBRATION_APPLY_REASON.STRONGER_CANDIDATE_SELECTED:
    case CALIBRATION_APPLY_REASON.BEST_BALANCED:
      return `Not applied because the ${selected} candidate gives the stronger calibration improvement.`;
    case CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED:
      return "Not applied automatically because the trade-off is useful but under the 3:1 rule — review required.";
    case CALIBRATION_APPLY_REASON.TRADEOFF_DAMAGE_EXCEEDS_BENEFIT:
      return "Not applied because the trade-off is larger than the improvement.";
    case CALIBRATION_APPLY_REASON.P19_DAMAGED:
      return "Not applied because it worsens P19 materially — a trade-off for you to approve.";
    case CALIBRATION_APPLY_REASON.P20_DAMAGED:
      return "Not applied because it worsens P20 materially — a trade-off for you to approve.";
    case CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION:
      return "Not applied because a primary seat would regress.";
    case CALIBRATION_APPLY_REASON.AMBIGUOUS_EVIDENCE:
      return "Not applied because its P19/P20 evidence could not be confirmed.";
    case CALIBRATION_APPLY_REASON.HUMAN_CALIBRATION:
      return "Not applied because the current calibration was set by hand and is not overwritten automatically.";
    case CALIBRATION_APPLY_REASON.ALREADY_APPLIED:
      return "Not applied because this calibration is already applied to the design.";
    case CALIBRATION_APPLY_REASON.NOT_MATERIAL:
      // Deliberately no fixed sentence: whether this was "under 1 dB" or held by
      // the seat-level rule depends on the exact values, which only the decision
      // has. The decision's own statement carries them, so this reason resolves
      // to that statement rather than to a threshold it may not have applied.
      return null;
    default:
      return null;
  }
}

/**
 * The user-facing line for a calibration improvement that was not applied. It
 * states the RULE that held the change and carries no figures: the exact
 * measurements are the detail view's job, so the summary can never imply an
 * improvement the decision did not measure.
 *
 * The adjustment "improved the overall bass result but did not sufficiently
 * improve the limiting seat" describes the seat-level criterion the materiality
 * rule actually applies — never the 1 dB overall action threshold, which this
 * change clears.
 */
export const NOT_APPLIED_SEAT_SUMMARY =
  "Not applied. The adjustment improved the overall bass result but did not sufficiently improve the limiting seat.";
export const NOT_APPLIED_THRESHOLD_SUMMARY =
  "Not applied. The adjustment did not clear the 1 dB action threshold.";
export const NOT_APPLIED_FAIL_COUNT_SUMMARY =
  "Not applied. The adjustment leaves more seats failing P19 or P20 than the current design.";
export const NOT_APPLIED_FAIL_MOVED_SUMMARY =
  "Not applied. The adjustment moves the failure to a different seat rather than removing it.";
export const NOT_APPLIED_UNCONFIRMED_SUMMARY =
  "Not applied. No material calibration improvement was confirmed.";
/**
 * The refusal stated when a seat-level criterion CANNOT be verified: the run kept
 * no candidate-level seat results, so the seat's own before and after are not
 * available. This is the honest alternative to claiming that the limiting seat
 * failed to improve — a claim that needs the seat's own measured values.
 */
export const NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY =
  "Not applied. The required seat-level improvement could not be verified from the available results.";

/**
 * WHY an immaterial calibration improvement was not applied, taken from the exact
 * evidence the materiality rule read, and split into the two things a designer
 * needs separately:
 *
 *   summary  the rule that held the change, in one line, with no figures
 *   detail   the same rule with the exact measurements behind it, for Engineer details
 *
 * The one thing neither sentence may do is name the 1 dB action threshold when
 * the improvement clears it. When the exact improvement really is under the
 * threshold, that is stated; when it is not, the rule that actually held the
 * change — the seat-level criterion, named with its own measurement — is stated
 * instead. A "no seat" claim is made only when EVERY seat the rule read was
 * confirmed to stay inside it; otherwise the sentence states the worst seat it
 * measured and never claims the whole seat set was checked.
 *
 * @param {object} params
 * @param {object|null} [params.improvement] - the decision's exact improvement
 *   ({ p20DeltaDb, p19DeltaDb, p20LevelGain, p19LevelGain })
 * @param {object|null} [params.materiality] - the materiality assessment that refused it
 * @returns {{ summary: string, detail: string }}
 */
export function describeNotMaterialCalibration({ improvement = null, materiality = null, before = null, after = null } = {}) {
  const p20 = finite(improvement?.p20DeltaDb);
  const p19 = finite(improvement?.p19DeltaDb);
  // The decision's own improvement is stated in tenths of a dB, which rounds a
  // sub-0.1 dB change away. The before → after pair it was measured from is read
  // instead when it is available, so the measurement is never flattened to zero.
  const p20Raw = finite(before?.p20?.deviationDb);
  const p20RawAfter = finite(after?.p20?.deviationDb);
  const precise = p20Raw != null && p20RawAfter != null && p20Raw > p20RawAfter
    ? p20Raw - p20RawAfter
    : null;
  const exact = precise != null ? precise : (p20 != null ? p20 : p19);
  const metric = p20 != null ? "P20" : "P19";
  // The exact figure, in the designer's units. A real change that one decimal
  // would round away is stated as "under 0.1 dB" — never as a flat "0 dB".
  const measured = exact == null
    ? null
    : exact > 0 && exact < 0.1 ? "under 0.1 dB" : `${round1(exact)} dB`;
  const details = materiality?.details || null;
  const rule = materiality?.rule || null;
  const aggregate = measured != null && exact != null && exact > 0
    ? `, while the overall ${metric} figure improves by ${measured}`
    : "";

  // ── The exact improvement is genuinely under the action threshold ──
  // The only case that may say so.
  if (exact != null && exact < 1) {
    return {
      summary: NOT_APPLIED_THRESHOLD_SUMMARY,
      detail: `Not applied because the improvement is ${measured}, below the 1 dB action threshold.`,
    };
  }

  // ── The failing-seat rules: never described as a threshold or a seat-level miss ──
  if (rule === "fail-count-increased") {
    return {
      summary: NOT_APPLIED_FAIL_COUNT_SUMMARY,
      detail: `Not applied because the number of failing seats increases from ${finite(details?.currentFails) ?? "the current count"} to ${finite(details?.candidateFails) ?? "a higher count"}.`,
    };
  }
  if (rule === "failing-seat-moved") {
    return {
      summary: NOT_APPLIED_FAIL_MOVED_SUMMARY,
      detail: "Not applied because a seat that passed before now fails, so the failing-seat count does not improve.",
    };
  }

  // ── The seat-level criterion: the rule that actually held this change ──
  // Only reached when the overall figure clears the action threshold, so if any
  // rule held this change it was the seat-level one — but that may only be stated
  // as a seat that failed to improve when the decision kept the seat measurement
  // it read. A run that retained no candidate-level seat results is reported as
  // unverifiable instead, with figures from the record and nothing invented.
  if (exact != null && exact > 0) {
    const seatScopeLabel = details?.seatScope === "primary" ? "primary seat" : "seat";
    const worstSeat = details?.worstSeatId ? seatPhrase(details.worstSeatId) : null;
    const seatImprovement = finite(details?.worstSeatImprovementDb);
    const verified = rule === MATERIALITY_RULE.SEAT_LEVEL_NOT_CLEARED && seatImprovement != null;
    if (!verified) {
      return describeUnverifiedSeatLevelRefusal({ improvement, before, after });
    }
    const seatMeasured = seatImprovement > 0 && seatImprovement < 0.1 ? "under 0.1 dB" : `${round1(seatImprovement)} dB`;
    const seatPhraseText = [worstSeat, seatMeasured ? `improves by ${seatMeasured}` : null]
      .filter(Boolean).join(" ");
    // "No seat clears the rule" only when every seat in scope was read AND none
    // of them clears it. Otherwise the sentence names what it measured.
    const everyChecked = details?.everySeatInScopeChecked === true;
    const noneClear = finite(details?.seatsClearingThreshold) === 0;
    const detail = everyChecked && noneClear
      ? `Not applied because no ${seatScopeLabel} clears the 1 dB seat-level rule: ${
        seatPhraseText ? `the limiting ${seatScopeLabel} ${seatPhraseText}` : "the limiting seat does not improve enough"
      }${aggregate}.`
      : `Not applied because the seat-level improvement does not clear the 1 dB seat-level rule${
        seatPhraseText ? `: the limiting ${seatScopeLabel} ${seatPhraseText}` : ""
      }${aggregate}.`;
    return { summary: NOT_APPLIED_SEAT_SUMMARY, detail };
  }

  return { summary: NOT_APPLIED_UNCONFIRMED_SUMMARY, detail: NOT_APPLIED_UNCONFIRMED_SUMMARY };
}

/**
 * The stated reason when a seat-level criterion cannot be verified: the run kept
 * no candidate-level seat results, so the seat's own before and after do not
 * exist to be read. What the record does hold is stated; no seat failure is
 * claimed on evidence that is not there, and no figure is invented.
 */
export function describeUnverifiedSeatLevelRefusal({ improvement = null, before = null, after = null } = {}) {
  const p20 = finite(improvement?.p20DeltaDb);
  const p19 = finite(improvement?.p19DeltaDb);
  const rawBefore = finite(before?.p20?.deviationDb);
  const rawAfter = finite(after?.p20?.deviationDb);
  const precise = rawBefore != null && rawAfter != null && rawBefore > rawAfter
    ? rawBefore - rawAfter
    : null;
  const exact = precise != null ? precise : (p20 != null ? p20 : p19);
  const metric = p20 != null ? "P20" : "P19";
  const measured = exact == null
    ? null
    : exact > 0 && exact < 0.1 ? "under 0.1 dB" : `${round1(exact)} dB`;
  return {
    summary: NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY,
    detail: `Not applied because the run retained no candidate-level seat results, so the required seat-level improvement could not be verified from the available results${
      measured ? `. The run's own ${metric} figures show an improvement of ${measured}` : ""
    }.`,
  };
}

/**
 * The stated reason for an improvement the saved record held without recording a
 * decision — the honest answer for evidence saved before a decision was recorded.
 */
export const CALIBRATION_NO_DECISION_RECORDED_REASON =
  "Not applied because no automatic calibration decision was recorded for this run.";

/** A safe candidate the run confirmed but did not write (evidence-only run). */
export const CALIBRATION_READY_TO_APPLY_REASON =
  "Ready to apply — this run evaluated the options without changing the design.";

/** The canonical balanced damage threshold: a 1.0 dB material worsening. */
export const MATERIAL_DAMAGE_DB = BALANCED_DAMAGE_THRESHOLD_DB;

const TOLERANCE_MS = 0.1;
const TOLERANCE_DB = 0.1;
const TOLERANCE_DEG = 0.1;

// ── Small helpers ────────────────────────────────────────────────────────

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function levelOf(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

function round1(value) {
  return value == null ? null : Math.round(Number(value) * 10) / 10;
}

/**
 * "Row 1 · Seat 2" from a seat id, so a stated limiting seat reads as the
 * designer's own seat. An id that does not carry row/column numbers is stated
 * exactly as it is — never guessed at, and never invented.
 */
function seatPhrase(seatId) {
  const id = String(seatId || "").trim();
  if (!id) return null;
  const match = id.match(/^seat-r(\d+)-c(\d+)$/i);
  return match ? `Row ${match[1]} · Seat ${match[2]}` : id;
}

function changed(from, to, tolerance) {
  const a = finite(from);
  const b = finite(to);
  if (a == null || b == null) return a !== b;
  return Math.abs(b - a) > tolerance;
}

function polarityOf(value) {
  const n = Number(value) || 0;
  return (n < 0 || n === 180) ? -1 : 1;
}

function polarityLabel(value) {
  return polarityOf(value) < 0 ? "Inverted" : "Normal";
}

function groupOf(instance) {
  const group = String(instance?.legacyGroup || instance?.group || "").toLowerCase();
  return group === "front" || group === "rear" ? group : null;
}

/** "L2" or null. */
function levelText(level) {
  return level == null ? null : `L${level}`;
}

/** "L2 / 4.6 dB", "L2", "4.6 dB", or "unavailable". One decimal, always. */
export function formatLevelValue(level, deviationDb) {
  const l = levelText(level);
  const d = finite(deviationDb);
  const db = d == null ? null : `${d.toFixed(1)} dB`;
  if (l && db) return `${l} / ${db}`;
  if (l) return l;
  return db || "unavailable";
}

/** The canonical P19 (aggregate RSP) and P20 values of a confirmed result. */
export function canonicalCalibrationPair(result) {
  const p19 = readRspP19(result || null);
  return {
    p19: { level: p19.level, deviationDb: p19.deviationDb },
    p20: {
      level: levelOf(result?.achievedP20Level),
      deviationDb: finite(result?.achievedP20VariationDb),
    },
  };
}

/** The tuning a candidate carries. Positions and seating are never read here. */
export function calibrationTuningOf(candidate) {
  const tuning = candidate?.appliedTuning || candidate?.tuning;
  return Array.isArray(tuning) ? tuning.filter(Boolean) : [];
}

/**
 * Calibration a human set deliberately — manual entry, a user modification, or
 * a designer's Keep decision. ADI never overwrites it on its own.
 */
export function isHumanCalibration(appliedCalibration) {
  if (!appliedCalibration) return false;
  const source = String(appliedCalibration.source || "");
  const status = String(appliedCalibration.status || "");
  return source === APPLIED_CALIBRATION_SOURCE.MANUAL
    || status === APPLIED_CALIBRATION_STATUS.USER_MODIFIED
    || status === APPLIED_CALIBRATION_STATUS.USER_ACCEPTED
    || status === APPLIED_CALIBRATION_STATUS.MANUAL;
}

// ── Damage assessment ────────────────────────────────────────────────────

/**
 * Did the candidate materially worsen an objective?
 *
 * A material worsening is a level drop, or more than the canonical balanced
 * damage threshold (1.0 dB) more deviation. A value either side does not carry
 * is never treated as damage.
 */
export function assessCalibrationDamage(before, after) {
  const p19WorseDb = (before?.p19?.deviationDb != null && after?.p19?.deviationDb != null)
    ? round1(after.p19.deviationDb - before.p19.deviationDb)
    : null;
  const p20WorseDb = (before?.p20?.deviationDb != null && after?.p20?.deviationDb != null)
    ? round1(after.p20.deviationDb - before.p20.deviationDb)
    : null;
  const p19LevelDrop = before?.p19?.level != null && after?.p19?.level != null
    && after.p19.level < before.p19.level;
  const p20LevelDrop = before?.p20?.level != null && after?.p20?.level != null
    && after.p20.level < before.p20.level;
  const p19Damaged = p19LevelDrop || (p19WorseDb != null && p19WorseDb > MATERIAL_DAMAGE_DB);
  const p20Damaged = p20LevelDrop || (p20WorseDb != null && p20WorseDb > MATERIAL_DAMAGE_DB);
  return {
    p19WorseDb, p20WorseDb, p19LevelDrop, p20LevelDrop,
    p19Damaged, p20Damaged, any: p19Damaged || p20Damaged,
  };
}

/** Did the candidate improve an objective, by the canonical values? */
function assessImprovement(before, after) {
  const p19DeltaDb = (before?.p19?.deviationDb != null && after?.p19?.deviationDb != null)
    ? round1(before.p19.deviationDb - after.p19.deviationDb)
    : null;
  const p20DeltaDb = (before?.p20?.deviationDb != null && after?.p20?.deviationDb != null)
    ? round1(before.p20.deviationDb - after.p20.deviationDb)
    : null;
  const p19LevelGain = before?.p19?.level != null && after?.p19?.level != null
    && after.p19.level > before.p19.level;
  const p20LevelGain = before?.p20?.level != null && after?.p20?.level != null
    && after.p20.level > before.p20.level;
  const p19Improved = p19LevelGain || (p19DeltaDb != null && p19DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB);
  const p20Improved = p20LevelGain || (p20DeltaDb != null && p20DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB);
  return { p19DeltaDb, p20DeltaDb, p19LevelGain, p20LevelGain, p19Improved, p20Improved };
}

// ── Settings, stated as previous → new ───────────────────────────────────

/**
 * The calibration settings a tuning changes, one row per changed setting, with
 * the previous and the new value. Positions, models and counts are never read.
 */
export function buildCalibrationSettings(instances, tuning) {
  const active = (Array.isArray(instances) ? instances : []).filter((s) => s?.enabled !== false);
  const byId = new Map(active.map((s) => [String(s.id), s]));
  const rows = [];

  (Array.isArray(tuning) ? tuning : []).forEach((t, index) => {
    const instance = byId.get(String(t?.sourceId)) || active[index] || null;
    if (!instance) return;
    const group = groupOf(instance);
    const label = `Sub ${index + 1}${group ? ` (${group})` : ""}`;
    const row = (key, setting, from, to) => {
      rows.push({ key: `${key}:${instance.id}`, setting, label, from, to, group, sourceId: String(instance.id) });
    };

    if (changed(instance.delayMs, t.delayMs, TOLERANCE_MS)) {
      row(CALIBRATION_SETTING.DELAY, "Delay",
        `${formatDelayMs(finite(instance.delayMs) ?? 0)} ms`,
        `${formatDelayMs(finite(t.delayMs) ?? 0)} ms`);
    }
    if (changed(instance.gainDb, t.gainDb, TOLERANCE_DB)) {
      row(CALIBRATION_SETTING.GAIN, "Gain trim",
        `${((finite(instance.gainDb) ?? 0) > 0 ? "+" : "")}${round1(finite(instance.gainDb) ?? 0)} dB`,
        `${((finite(t.gainDb) ?? 0) > 0 ? "+" : "")}${round1(finite(t.gainDb) ?? 0)} dB`);
    }
    const currentPhase = normalisePhaseControlDeg(instance.phaseControlDeg ?? instance.phaseAdjust);
    const nextPhase = normalisePhaseControlDeg(t.phaseControlDeg ?? t.phaseAdjust);
    if (Math.abs(nextPhase - currentPhase) > TOLERANCE_DEG) {
      row(CALIBRATION_SETTING.PHASE, "All-pass phase",
        `${Math.round(currentPhase)}° at 80 Hz`, `${Math.round(nextPhase)}° at 80 Hz`);
    }
    if (polarityOf(instance.polarity) !== polarityOf(t.polarity)) {
      row(CALIBRATION_SETTING.POLARITY, "Polarity",
        polarityLabel(instance.polarity), polarityLabel(t.polarity));
    }
  });

  return rows;
}

/**
 * The signed rear-group delay offset the applied delay rows imply, in one
 * sentence — or null when the group order is not recorded (never guessed).
 */
export function describeRearGroupOffset(settings) {
  const delayRows = (Array.isArray(settings) ? settings : [])
    .filter((row) => row.key.startsWith(`${CALIBRATION_SETTING.DELAY}:`));
  if (!delayRows.length) return null;

  const changes = delayRows.map((row) => ({
    group: row.group,
    fromMs: parseFloat(row.from),
    toMs: parseFloat(row.to),
  }));
  const signed = resolveSignedRearOffsetMs({ changes });
  if (signed == null) {
    return "The delay change is applied to the adjusted group; the physical group order is not recorded, so no signed rear offset is claimed.";
  }
  if (signed === 0) return "No delay offset was needed — the current alignment is kept.";
  const magnitude = formatDelayMs(Math.abs(signed));
  return signed > 0
    ? `Rear subwoofer group delay offset +${magnitude} ms — rear group later than the front group.`
    : `Rear subwoofer group delay offset −${magnitude} ms — rear group earlier than the front group.`;
}

// ── The decision ─────────────────────────────────────────────────────────

function objectiveLabelFor(objective) {
  const label = OBJECTIVE_ROLE_LABELS[objective] || null;
  if (objective === "balanced") return "balanced acoustic-delay";
  if (objective === "best-p19") return "best P19";
  if (objective === "best-p20") return "best P20";
  if (objective === "both") return "best P19 and best P20";
  return label || "practical";
}

function outcome(decision, reason, statement, extra = {}) {
  return {
    decision,
    reason,
    statement,
    objective: extra.objective || null,
    objectiveLabel: extra.objectiveLabel || null,
    candidateId: String(extra.candidateId || ""),
    tuning: Array.isArray(extra.tuning) ? extra.tuning : [],
    before: extra.before || null,
    after: extra.after || null,
    improvement: extra.improvement || null,
    damage: extra.damage || null,
    // The materiality assessment the held reason was built from, with the exact
    // measurements it read — so the reason stated to the designer is traceable.
    materiality: extra.materiality || null,
    // The same reason with the exact measurements behind it, for Engineer
    // details. The summary sentence the designer reads stays figure-free.
    detailStatement: extra.detailStatement || null,
    // The 3:1 trade-off this candidate carried, when it carried one: the ratio,
    // the improvement, the damage and the rule's decision.
    tradeOff: extra.tradeOff || null,
    tradeOffDecision: extra.tradeOff?.decision || null,
    settings: Array.isArray(extra.settings) ? extra.settings : [],
    offsetStatement: extra.offsetStatement || null,
    limitingSeat: extra.limitingSeat || null,
    humanCalibration: extra.humanCalibration === true,
    inRoomNote: decision === CALIBRATION_APPLY_DECISION.APPLIED ? IN_ROOM_CONFIRMATION_NOTE : null,
  };
}

function changeSentence(before, after) {
  const parts = [];
  const p19Before = formatLevelValue(before?.p19?.level, before?.p19?.deviationDb);
  const p19After = formatLevelValue(after?.p19?.level, after?.p19?.deviationDb);
  const p20Before = formatLevelValue(before?.p20?.level, before?.p20?.deviationDb);
  const p20After = formatLevelValue(after?.p20?.level, after?.p20?.deviationDb);
  if (p19Before !== p19After) parts.push(`P19 from ${p19Before} to ${p19After}`);
  if (p20Before !== p20After) parts.push(`P20 from ${p20Before} to ${p20After}`);
  return parts.join(", and ");
}

/**
 * Decide whether ADI may apply a calibration candidate on its own.
 *
 * @param {object} params
 * @param {object|null} params.baseline - the current design's confirmed result
 * @param {object|null} params.candidate - the confirmed candidate to consider
 * @param {object|null} params.objectives - canonical objective winners of the run
 * @param {Array} params.instances - current subwoofer instances (previous values)
 * @param {object|null} params.appliedCalibration - persisted Applied Calibration
 */
export function resolveCalibrationAutoApply({
  baseline = null,
  candidate = null,
  objectives = null,
  instances = [],
  appliedCalibration = null,
} = {}) {
  const tuning = calibrationTuningOf(candidate);
  const candidateId = String(candidate?.candidateId || candidate?.id || "");

  if (!baseline || !candidate || !tuning.length) {
    return outcome(CALIBRATION_APPLY_DECISION.NONE, CALIBRATION_APPLY_REASON.NO_CANDIDATE,
      NO_USEFUL_CALIBRATION_IMPROVEMENT, { candidateId });
  }
  if (isCalibrationApplied(instances, tuning)) {
    return outcome(CALIBRATION_APPLY_DECISION.NONE, CALIBRATION_APPLY_REASON.ALREADY_APPLIED,
      "The applied calibration already matches the best confirmed candidate — nothing to change.",
      { candidateId, tuning });
  }

  const before = canonicalCalibrationPair(baseline);
  const after = canonicalCalibrationPair(candidate);
  const improvement = assessImprovement(before, after);
  const damage = assessCalibrationDamage(before, after);
  const objective = objectiveRoleFor(candidate, objectives);
  const objectiveLabel = objectiveLabelFor(objective);
  const human = isHumanCalibration(appliedCalibration);
  const settings = buildCalibrationSettings(instances, tuning);
  const offsetStatement = describeRearGroupOffset(settings);
  const limitingSeat = {
    before: baseline?.worstSeatId || null,
    after: candidate?.worstSeatId || null,
  };
  const context = {
    objective, objectiveLabel, candidateId, tuning, before, after, improvement,
    damage, settings, offsetStatement, limitingSeat, humanCalibration: human,
  };

  // The materiality authority owns "is this worth doing at all" and "could this
  // be confirmed" — an improvement that cannot be confirmed from the canonical
  // seat data is ambiguous, and an ambiguous result is never auto-applied.
  const materiality = isMaterialImprovement(baseline, candidate);
  if (materiality?.valid === false) {
    return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.AMBIGUOUS_EVIDENCE,
      `A calibration change was evaluated but its canonical P19/P20 evidence could not be confirmed (${materiality.reason}). Nothing has been applied — your approval is required.`,
      context);
  }

  // ── A trade-off is a JUDGEMENT, decided by the 3:1 rule ────────────────
  // A candidate that buys an improvement with a worsening of the other objective
  // is a TRADE-OFF. It is decided BEFORE materiality, so a trade-off is always
  // stated and never reported as "nothing found". Whether ADI may apply it on its
  // own is the 3:1 rule's decision (adiCalibrationTradeOffRule.js):
  //
  //   improvement ≥ 3 × damage        → applied automatically
  //   improvement > damage, under 3:1 → useful, held for approval (review required)
  //   damage ≥ improvement            → never applied
  //
  // A level drop, a primary-seat regression or a hand-set calibration still block
  // an automatic application whatever the ratio says.
  const regression = hasPrimarySeatRegression(baseline, candidate);
  const levelDrop = damage.p19LevelDrop || damage.p20LevelDrop;
  const tradeOff = assessCalibrationTradeOff({ before, after });
  let tradeOffAppliedNote = null;

  if (tradeOff && (improvement.p19Improved || improvement.p20Improved)) {
    const tradeOffContext = { ...context, tradeOff };

    // A primary seat that regresses is a real seat losing performance: a good
    // ratio never overrules it.
    if (regression?.regressed) {
      return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
        `The ${objectiveLabel} candidate regresses ${regression.parameter} at ${regression.seatId}${regression.rawDeltaDb ? ` by ${round1(regression.rawDeltaDb)} dB` : ""}. This is a trade-off, so it has not been applied — your approval is required.`,
        tradeOffContext);
    }

    // A displayed level that drops is a hard failure, not a ratio to trade.
    if (levelDrop) {
      const dropped = damage.p19LevelDrop
        ? [before.p19, after.p19, "P19"]
        : [before.p20, after.p20, "P20"];
      return outcome(CALIBRATION_APPLY_DECISION.HOLD,
        damage.p19LevelDrop ? CALIBRATION_APPLY_REASON.P19_DAMAGED : CALIBRATION_APPLY_REASON.P20_DAMAGED,
        `The ${objectiveLabel} candidate drops the ${dropped[2]} level from ${formatLevelValue(dropped[0]?.level, dropped[0]?.deviationDb)} to ${formatLevelValue(dropped[1]?.level, dropped[1]?.deviationDb)}. This is a trade-off, so it has not been applied — your approval is required.`,
        tradeOffContext);
    }

    if (tradeOff.decision === CALIBRATION_TRADEOFF_DECISION.REVIEW_REQUIRED) {
      return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED,
        describeTradeOffReview(tradeOff), tradeOffContext);
    }
    if (tradeOff.decision === CALIBRATION_TRADEOFF_DECISION.REJECTED) {
      return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.TRADEOFF_DAMAGE_EXCEEDS_BENEFIT,
        describeTradeOffRejected(tradeOff), tradeOffContext);
    }

    // At or above the 3:1 rule with every hard guard passed: applied, with the
    // ratio stated as the reason it was.
    tradeOffAppliedNote = describeTradeOffAutoApply(tradeOff);
  }

  if (!materiality?.material) {
    // The reason the designer reads is built from the exact values the rule read,
    // so it can never name a threshold the improvement actually clears. The
    // summary carries the rule; the detail carries the measurements.
    const held = describeNotMaterialCalibration({ improvement, materiality, before, after });
    return outcome(CALIBRATION_APPLY_DECISION.NONE, CALIBRATION_APPLY_REASON.NOT_MATERIAL,
      held.summary,
      { ...context, materiality, detailStatement: held.detail });
  }

  // A primary seat that regresses is a real seat losing performance: never
  // applied silently, whatever the aggregate improves. (Already assessed above,
  // so no ratio can carry it through.)
  if (regression?.regressed) {
    return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
      `The ${objectiveLabel} candidate regresses ${regression.parameter} at ${regression.seatId}${regression.rawDeltaDb ? ` by ${round1(regression.rawDeltaDb)} dB` : ""}. This is a trade-off, so it has not been applied — your approval is required.`,
      context);
  }

  // Calibration a human set by hand is the designer's own work: ADI states the
  // candidate and leaves the decision to them.
  if (human) {
    return outcome(CALIBRATION_APPLY_DECISION.HOLD, CALIBRATION_APPLY_REASON.HUMAN_CALIBRATION,
      `A better calibration was confirmed (${changeSentence(before, after) || "see values"}), but the current calibration was set by hand. It has not been applied — your approval is required.`,
      context);
  }

  const bestP19 = String(objectives?.bestCanonicalP19?.candidateId || "") === candidateId;
  const bestP20 = String(objectives?.bestCanonicalP20?.candidateId || "") === candidateId;
  const reason = tradeOffAppliedNote
    // The improvement is at least three times the trade-off it carries.
    ? CALIBRATION_APPLY_REASON.TRADEOFF_WITHIN_RATIO
    : bestP19 && bestP20
      ? CALIBRATION_APPLY_REASON.IMPROVES_ONE_WITHOUT_DAMAGE
      : objective === "balanced"
        ? CALIBRATION_APPLY_REASON.BEST_BALANCED
        : CALIBRATION_APPLY_REASON.IMPROVES_ONE_WITHOUT_DAMAGE;

  const sentence = [
    `ADI applied the ${objectiveLabel} candidate.`,
    offsetStatement,
    // Why it was allowed to apply a change that carries a trade-off.
    tradeOffAppliedNote,
    changeSentence(before, after) ? `Predicted ${changeSentence(before, after)}.` : null,
  ].filter(Boolean).join(" ");

  return outcome(CALIBRATION_APPLY_DECISION.APPLIED, reason, sentence, { ...context, tradeOff });
}

// ── Physical design changes: never applied, always stated ────────────────

/**
 * The physical changes ADI found but must not apply. Each states the canonical
 * before/after it was confirmed against and that it awaits the designer.
 *
 * @param {object} params
 * @param {object|null} params.baseline - the current design's confirmed result
 * @param {object|null} params.subPositionResult - confirmed sub-position candidate
 * @param {object|null} params.seatingResult - confirmed seating candidate
 */
export function buildDesignChangeRecommendations({
  baseline = null,
  subPositionResult = null,
  seatingResult = null,
} = {}) {
  const build = (key, label, result) => {
    if (!result) return null;
    const before = canonicalCalibrationPair(baseline);
    const after = canonicalCalibrationPair(result);
    const change = changeSentence(before, after);
    const improvement = assessImprovement(before, after);
    return {
      key,
      label,
      applied: false,
      statement: `${label}${change ? `: ${change}` : ""}. This requires a design change, so it has not been applied.`,
      p19Improved: improvement.p19Improved,
      p20Improved: improvement.p20Improved,
      before,
      after,
      candidateId: String(result?.candidateId || result?.id || ""),
    };
  };

  return [
    build("subwoofers", "Move the subwoofers", subPositionResult),
    build("seating", "Move the seating", seatingResult),
  ].filter(Boolean);
}