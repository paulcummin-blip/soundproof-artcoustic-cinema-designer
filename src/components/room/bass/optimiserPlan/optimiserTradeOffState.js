// optimiserTradeOffState.js
// ---------------------------------------------------------------------------
// THE TRADE-OFF DECISION STATE — presentation only.
//
// A COMPLETED run whose best change improves the overall result but worsens a
// PROTECTED primary seat (or materially damages the other protected objective)
// has found a TRADE-OFF. That is a designer decision, never an optimiser
// success: "Improvement Found" may only be stated where the change is genuinely
// actionable under the normal protection rules.
//
// This module answers three questions, and nothing else:
//
//   IS THIS A TRADE-OFF   the decision the run itself recorded held a real
//                         improvement that worsens something protected
//   WHICH SEAT / METRIC   the exact seat and the approximate amount, read from
//                         the decision's own recorded evidence
//   WHAT IT COMPARES      the current vs proposed rows the designer reviews —
//                         overall P20, overall P19 and the per-seat rows the
//                         run retained
//
// It reads the run's own recorded decision and the values already saved with it.
// It calculates no optimisation, re-ranks nothing, re-applies no threshold,
// changes no P19/P20 grade and touches no apply logic. Where the evidence is not
// recorded, it states less rather than inventing a value — it never fabricates a
// seat, a delta or a proposed result.
// ---------------------------------------------------------------------------

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { getScopedSeatIds } from "@/components/utils/seatScopeAuthority";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { floorP19P20Deviation } from "@/components/utils/rp22/resolveRp22DesignValue";
import { deltaText, deviationText, levelText, wholeDbImprovement } from "./optimiserWholeNumberDb.js";

/** The one headline a trade-off states. */
export const TRADE_OFF_HEADLINE =
  "ADI found a change that improves overall bass consistency, but one primary seat would get worse.";

/** The one action per role in this state. */
export const TRADE_OFF_ACTIONS = Object.freeze({
  REVIEW: "Review Trade-off",
  KEEP: "Keep Current Design",
  APPLY: "Apply Change",
});

/** Why the trade-off was not taken: stated once, and nothing was written. */
export const TRADE_OFF_KEPT_SENTENCE =
  "The trade-off was not taken. Nothing has been applied and the current design is unchanged.";

/** The protected metric that worsens when no single seat is named. */
export const TRADE_OFF_METRIC_NOTE =
  "The change improves one protected measure and worsens another.";

/** Stated when the candidate's own per-seat results were not retained. */
export const TRADE_OFF_SCOPE_NOTE =
  "The run retained the affected seat's own result; the remaining seats' proposed values were not saved with it.";

/** Whether the change is better than, the same as, or worse than the current design. */
export const TRADE_OFF_DIRECTION = Object.freeze({
  IMPROVES: "improves",
  UNCHANGED: "unchanged",
  WORSENS: "worsens",
});

/** The sentence stated beside the deliberate Apply of a trade-off. */
export function tradeOffApplySentence(seatLabel) {
  return seatLabel
    ? `This change improves overall consistency but worsens ${seatLabel}.`
    : "This change improves overall consistency but worsens a protected measure.";
}

/**
 * The reasons that state a trade-off: the run's own decision held a real
 * improvement because something protected got worse.
 */
const TRADE_OFF_REASONS = Object.freeze([
  CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION,
  CALIBRATION_APPLY_REASON.P19_DAMAGED,
  CALIBRATION_APPLY_REASON.P20_DAMAGED,
  CALIBRATION_APPLY_REASON.TRADEOFF_REVIEW_REQUIRED,
]);

/**
 * The seat regression as the decision authority writes it into its own recorded
 * sentence ("… candidate regresses P20 at seat-r1-c2 by 1.2 dB …"). Read only
 * when a saved record predates the structured evidence — the template is this
 * codebase's own, so the read is exact rather than guessed.
 */
const REGRESSION_IN_STATEMENT = /regresses\s+(P\d+)\s+at\s+([A-Za-z0-9_-]+)(?:\s+by\s+([\d.]+)\s+dB)?/i;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function round1(value) {
  const number = finite(value);
  return number == null ? null : Math.round(number * 10) / 10;
}

/**
 * The seat the change would worsen: the structured regression when the record
 * carries one, otherwise the decision's own recorded statement.
 */
export function readRecordedSeatRegression(decision) {
  const structured = decision?.regression;
  if (structured?.seatId) {
    return {
      seatId: String(structured.seatId),
      parameter: structured.parameter || "P20",
      rawDeltaDb: round1(structured.rawDeltaDb),
      levelBefore: levelText(structured.currentLevel),
      levelAfter: levelText(structured.candidateLevel),
    };
  }
  const match = String(decision?.statement || "").match(REGRESSION_IN_STATEMENT);
  if (!match) return null;
  return {
    seatId: match[2],
    parameter: match[1].toUpperCase(),
    rawDeltaDb: match[3] ? round1(match[3]) : null,
    levelBefore: null,
    levelAfter: null,
  };
}

/** "±9 dB · L1" — the displayed form of one P19/P20 value. */
function valueText(db, level) {
  const deviation = deviationText(db);
  if (!deviation) return null;
  const label = levelText(level);
  return label ? `${deviation} · ${label}` : deviation;
}

/**
 * Which way a value moved, from the displayed whole-dB results — the same
 * convention every surface prints, so a stated direction always matches the two
 * values beside it.
 */
function directionFor(beforeDb, afterDb) {
  const before = floorP19P20Deviation(beforeDb);
  const after = floorP19P20Deviation(afterDb);
  if (before == null || after == null) return null;
  if (before === after) return TRADE_OFF_DIRECTION.UNCHANGED;
  return wholeDbImprovement(beforeDb, afterDb) != null
    ? TRADE_OFF_DIRECTION.IMPROVES
    : TRADE_OFF_DIRECTION.WORSENS;
}

/** "1 dB worse" / "1 dB better" / "no meaningful change". */
function deltaPhrase(direction, delta) {
  const text = deltaText(delta);
  if (!text) return null;
  if (text === "no meaningful change") return text;
  if (direction === TRADE_OFF_DIRECTION.WORSENS) return `${text} worse`;
  if (direction === TRADE_OFF_DIRECTION.IMPROVES) return `${text} better`;
  return text;
}

/** One comparison row of the review. */
function row({ key, group, label, before, after, direction, delta }) {
  if (!before && !after) return null;
  return {
    key,
    group,
    label,
    before: before || "—",
    after: after || "—",
    direction: direction || TRADE_OFF_DIRECTION.UNCHANGED,
    delta: deltaPhrase(direction, delta),
  };
}

/** The overall P20 and P19 rows, from the pair the decision was decided on. */
function overallRows(decision) {
  const before = decision?.before || null;
  const after = decision?.after || null;
  const improvement = decision?.improvement || null;
  const damage = decision?.damage || null;

  const p20Direction = directionFor(before?.p20?.deviationDb, after?.p20?.deviationDb);
  const p19Direction = directionFor(before?.p19?.deviationDb, after?.p19?.deviationDb);

  return [
    row({
      key: "p20",
      group: "Overall",
      label: "Bass consistency (P20 variation)",
      before: valueText(before?.p20?.deviationDb, before?.p20?.level),
      after: valueText(after?.p20?.deviationDb, after?.p20?.level),
      direction: p20Direction,
      delta: finite(improvement?.p20DeltaDb) ?? finite(damage?.p20WorseDb),
    }),
    row({
      key: "p19",
      group: "Overall",
      label: "Seat-to-seat level consistency (P19)",
      before: valueText(before?.p19?.deviationDb, before?.p19?.level),
      after: valueText(after?.p19?.deviationDb, after?.p19?.level),
      direction: p19Direction,
      delta: finite(improvement?.p19DeltaDb) ?? finite(damage?.p19WorseDb),
    }),
  ].filter(Boolean);
}

/** Current per-seat P20 by seat id, from the run's own recorded baseline. */
function baselineSeats(planView) {
  const rows = Array.isArray(planView?.baseline?.seats) ? planView.baseline.seats : [];
  const map = new Map();
  rows.forEach((seat) => {
    const id = String(seat?.seatId || "");
    const db = finite(seat?.p20VariationDb);
    if (id && db != null) map.set(id, { db, level: seat?.p20Level ?? null });
  });
  return map;
}

/** The candidate's own retained per-seat P20 rows, when the run kept them. */
function candidateSeats(planView, decision) {
  const levers = planView?.calibrationEvidence?.levers || {};
  const wanted = String(decision?.candidateId || "");
  const rows = [];
  Object.values(levers).forEach((lever) => {
    const candidate = lever?.bestCandidate || null;
    if (!Array.isArray(candidate?.perSeatP20)) return;
    if (wanted && candidate.candidateId && String(candidate.candidateId) !== wanted) return;
    candidate.perSeatP20.forEach((seat) => {
      const id = String(seat?.seatId || "");
      const db = finite(seat?.variationDbRaw);
      if (id && db != null) rows.push({ seatId: id, db, level: seat?.level ?? null, isPrimary: seat?.isPrimary === true });
    });
  });
  return rows;
}

/**
 * The per-seat rows the designer reviews: the seats the run retained, plus the
 * affected seat itself (whose proposed value is the recorded regression).
 */
function seatRows({ planView, decision, regression, seatingPositions }) {
  const current = baselineSeats(planView);
  const proposed = candidateSeats(planView, decision);
  const proposedById = new Map(proposed.map((seat) => [seat.seatId, seat]));

  const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(seatingPositions);
  const scoped = primarySeatIds.length + secondarySeatIds.length > 0;
  const groupFor = (seatId, fallbackPrimary) => {
    if (scoped) return primarySeatIds.includes(seatId) ? "Primary seats" : "Secondary seats";
    return fallbackPrimary ? "Primary seats" : "Secondary seats";
  };

  const ids = new Set([...proposed.map((seat) => seat.seatId), regression?.seatId].filter(Boolean));
  const seats = [];
  ids.forEach((seatId) => {
    const before = current.get(seatId) || null;
    const afterRow = proposedById.get(seatId) || null;
    // The affected seat's own proposed value is the recorded regression applied
    // to its recorded current value when the run did not retain its own row.
    const derivedAfter = !afterRow && regression?.seatId === seatId
      && before && regression.rawDeltaDb != null
      ? before.db + regression.rawDeltaDb
      : null;
    const afterDb = afterRow ? afterRow.db : derivedAfter;
    const direction = directionFor(before?.db, afterDb);
    seats.push(row({
      key: `seat:${seatId}`,
      group: groupFor(seatId, afterRow?.isPrimary === true || regression?.seatId === seatId),
      label: formatSeatLabel(seatId),
      before: valueText(before?.db, before?.level),
      after: valueText(afterDb, afterRow?.level ?? null),
      direction,
      delta: afterDb != null && before ? afterDb - before.db : null,
    }));
  });

  return seats.filter(Boolean);
}

/**
 * Resolve the trade-off state for the open design version.
 *
 * @param {object} params
 * @param {object|null} params.planView - the resolved plan / run evidence view
 * @param {object|null} params.decision - the run's calibration decision
 * @param {Array} [params.seatingPositions] - live seating positions (Primary /
 *   Secondary scope, the one shared authority)
 * @returns {object|null} the trade-off the designer must decide, or null
 */
export function resolveTradeOffState({ planView = null, decision = null, seatingPositions = [] } = {}) {
  const record = decision && typeof decision === "object" ? decision : null;
  if (!record || record.decision !== CALIBRATION_APPLY_DECISION.HOLD) return null;
  if (!TRADE_OFF_REASONS.includes(record.reason)) return null;

  // A trade-off is only ever stated where the run recorded a real improvement:
  // a change that improves nothing is not a decision, it is a rejection.
  const improvement = record.improvement || null;
  const improved = improvement?.p19Improved === true
    || improvement?.p20Improved === true
    || (finite(improvement?.p20DeltaDb) ?? 0) > 0
    || (finite(improvement?.p19DeltaDb) ?? 0) > 0;
  if (!improved) return null;

  const regression = readRecordedSeatRegression(record);
  const seats = seatRows({ planView, decision: record, regression, seatingPositions });
  const overall = overallRows(record);
  const protectedRow = seats.find((seat) => seat.key === `seat:${regression?.seatId}`) || null;

  const seatLabel = regression?.seatId ? formatSeatLabel(regression.seatId) : null;
  const seat = regression?.seatId
    ? {
      seatId: regression.seatId,
      label: seatLabel,
      parameter: regression.parameter,
      before: protectedRow?.before || null,
      after: protectedRow?.after || null,
      delta: protectedRow?.delta || null,
      direction: TRADE_OFF_DIRECTION.WORSENS,
    }
    : null;

  // The one impact line stated on the main panel, below the headline: WHICH
  // protected measure moves and by approximately how much.
  const worsenedMetric = overall.find((line) => line.direction === TRADE_OFF_DIRECTION.WORSENS) || null;
  const impact = seat
    ? `Primary seat ${seat.label}: ${seat.parameter} ${seat.before || "—"} → ${seat.after || "—"}${protectedRow?.delta ? ` (${protectedRow.delta})` : ""}`
    : (worsenedMetric
      ? `${worsenedMetric.label}: ${worsenedMetric.before} → ${worsenedMetric.after}${worsenedMetric.delta ? ` (${worsenedMetric.delta})` : ""}`
      : TRADE_OFF_METRIC_NOTE);

  return {
    isTradeOff: true,
    headline: TRADE_OFF_HEADLINE,
    adjustment: null,
    seat,
    impact,
    overall,
    rows: [...overall, ...seats],
    // The change this decision held is the change the designer may deliberately
    // apply — named by the decision's own lever, never guessed from the plan.
    leverKey: typeof record.lever === "string" && record.lever ? record.lever : null,
    candidateId: record.candidateId || null,
    scopeNote: seats.length > 1 ? null : TRADE_OFF_SCOPE_NOTE,
  };
}