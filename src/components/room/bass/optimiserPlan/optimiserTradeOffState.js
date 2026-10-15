// optimiserTradeOffState.js
// ---------------------------------------------------------------------------
// THE TRADE-OFF DECISION STATE — presentation only.
//
// A COMPLETED run whose best change improves the overall result but worsens a
// PROTECTED primary seat has found a TRADE-OFF. That is a designer decision,
// never an optimiser success: "Improvement Found" may only be stated where the
// change is genuinely actionable under the normal protection rules.
//
// This module answers three questions, and nothing else:
//
//   IS THIS A TRADE-OFF   the decision the run itself recorded held a real
//                         improvement that worsens something protected
//   WHICH SEAT / METRIC   the exact seat, its own current and proposed result
//                         where the run retained them, and the exact amount it
//                         worsens by — read from the decision's own recorded
//                         evidence, never re-derived from copy, never invented
//   WHAT IT COMPARES      the current vs proposed rows the designer reviews:
//                         overall P20, overall P19 and every seat the run kept
//
// It calculates no optimisation, re-ranks nothing, re-applies no threshold,
// changes no P19/P20 grade and touches no apply logic. Where the evidence is not
// recorded it states less rather than inventing a value — it never fabricates a
// seat, a delta or a proposed result.
//
// The recorded evidence is durable: it is written on the decision the run saved
// with the plan, so a refresh or a project reopen recreates this exact state —
// the same candidate, the same seat and the same values.
// ---------------------------------------------------------------------------

import {
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { floorP19P20Deviation } from "@/components/utils/rp22/resolveRp22DesignValue";
import { deltaText, deviationText, levelText, wholeDbImprovement } from "./optimiserWholeNumberDb.js";
import {
  displayDeltaDb,
  displayDeltaPhrase,
  displayImprovementText,
} from "./optimiserDisplayDelta.js";

/** The one headline a trade-off states. */
export const TRADE_OFF_HEADLINE =
  "ADI found a change that improves overall bass consistency, but one primary seat would get worse.";

/** The one word the review is headed with. */
export const TRADE_OFF_TITLE = "Trade-off";

/**
 * The one action per role in this state. The Apply names the DECISION it is — a
 * change with a known downside — never the neutral "Apply change".
 */
export const TRADE_OFF_ACTIONS = Object.freeze({
  REVIEW: "Review Trade-off",
  KEEP: "Keep Current Design",
  APPLY: "Apply Trade-off",
});

/**
 * WHAT EACH METRIC IS. P20 is the seat-to-seat level consistency parameter, and
 * it is the measure the trade-off is stated on. P19 is response quality: it is
 * stated separately and lightly, and never as a second competing benefit or cost.
 */
export const TRADE_OFF_METRIC = Object.freeze({
  P20_LABEL: "Seat-to-seat level consistency (P20)",
  P19_LABEL: "Response quality (P19)",
  P19_PROTECTED: "P19 response quality",
});

/** The terminal state of a trade-off the designer did not take. */
export const TRADE_OFF_KEPT_LABEL = "Current Design Kept";
export const TRADE_OFF_KEPT_SENTENCE =
  "The trade-off was not taken. Nothing has been applied, and the current design, its published bass result and its saved calibration are unchanged.";

/** The protected metric that worsens when no single seat is named. */
export const TRADE_OFF_METRIC_NOTE =
  "The change improves one protected measure and worsens another.";

/** Stated when the run's own per-seat rows were not retained. */
export const TRADE_OFF_SCOPE_NOTE =
  "The run retained the affected seat's own result; the remaining seats' proposed values were not saved with it.";

/**
 * Stated when the run retained the affected seat and the amount it loses, but
 * not that seat's own before/after values — the older evidence shape.
 */
export const TRADE_OFF_AFFECTED_VALUES_NOTE =
  "This earlier optimiser run retained the affected seat and deterioration amount, but not the full per-seat before/after values.";

/** Whether the change is better than, the same as, or worse than the current design. */
export const TRADE_OFF_DIRECTION = Object.freeze({
  IMPROVES: "improves",
  UNCHANGED: "unchanged",
  WORSENS: "worsens",
});

/**
 * The sentence stated beside the deliberate Apply of a trade-off: it names the
 * change's own gain, the exact seat it costs and the exact amount that seat
 * loses, so the approval is never given to a neutral "Apply".
 */
export function tradeOffApplySentence(seatLabel, amountText = null) {
  if (!seatLabel) {
    return "This change improves overall bass consistency, but makes a protected measure worse.";
  }
  return amountText
    ? `This change improves overall bass consistency, but makes ${seatLabel} worse by ${amountText}.`
    : `This change improves overall bass consistency, but makes ${seatLabel} worse.`;
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
 * sentence — read only when a saved record predates the structured evidence.
 * The template is this codebase's own, so the read is exact rather than guessed.
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

/** "1.2 dB" — the exact amount the run recorded, never rounded away. */
function recordedAmountText(value) {
  const number = round1(value);
  return number == null ? null : `${number} dB`;
}

/** "L2" → 2, so a displayed level can be compared with the one before it. */
function levelNumber(level) {
  const label = levelText(level);
  return label ? Number(label.slice(1)) : null;
}

/**
 * The seat the change would worsen: the structured regression recorded on the
 * decision, otherwise the decision's own recorded statement.
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

/**
 * The displayed whole-dB value inside a formatted P19/P20 string
 * ("±15 dB · L1" → 15). Produced by this module's own display authority, so the
 * read is exact rather than guessed.
 */
function displayedDbOf(text) {
  const match = /\u00b1(\d+)\s*dB/.exec(String(text ?? ""));
  return match ? Number(match[1]) : null;
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

/**
 * One comparison row of the review.
 *
 * THE DISPLAYED DELTA: the change stated beside a before → after pair is the
 * difference between the two DISPLAYED endpoints, so the two always add up
 * (±15 dB → ±12 dB reads "3 dB better"). A row that carries its own recorded
 * amount — an affected seat's retained regression evidence ("1.2 dB") — keeps
 * that figure exactly as recorded.
 */
function row({ key, group, label, before, after, pair = null, levelBefore = null, levelAfter = null, direction, delta, deltaLabel, force = false, pairKnown = true }) {
  if (!before && !after && !force) return null;
  const displayedDelta = displayDeltaPhrase(displayedDbOf(before), displayedDbOf(after));
  const resolvedDelta = deltaLabel != null ? deltaLabel : (displayedDelta || deltaPhrase(direction, delta));
  return {
    key,
    group,
    label,
    // The two deviations alone ("±15 dB → ±12 dB") and the two levels alone
    // ("L1"), so the decision's plain-language blocks state the same evidence
    // the detail table shows, without re-reading its display text.
    pair,
    levelBefore,
    levelAfter,
    // A row whose pair the run never retained states NO values at all: an absent
    // pair is never printed as two placeholder dashes.
    before: pairKnown ? (before || "—") : null,
    after: pairKnown ? (after || "—") : null,
    pairKnown,
    direction: direction || TRADE_OFF_DIRECTION.UNCHANGED,
    delta: resolvedDelta,
  };
}

/** "±15 dB → ±12 dB" — the two deviations alone, with no level suffix. */
function deviationPair(beforeDb, afterDb) {
  const from = deviationText(beforeDb);
  const to = deviationText(afterDb);
  return from && to ? `${from} → ${to}` : null;
}

/** The overall P20 and P19 rows, from the pair the decision was decided on. */
function overallRows(decision) {
  const before = decision?.before || null;
  const after = decision?.after || null;
  const improvement = decision?.improvement || null;
  const damage = decision?.damage || null;

  return [
    row({
      key: "p20",
      group: "Overall",
      label: TRADE_OFF_METRIC.P20_LABEL,
      before: valueText(before?.p20?.deviationDb, before?.p20?.level),
      after: valueText(after?.p20?.deviationDb, after?.p20?.level),
      pair: deviationPair(before?.p20?.deviationDb, after?.p20?.deviationDb),
      levelBefore: levelText(before?.p20?.level),
      levelAfter: levelText(after?.p20?.level),
      direction: directionFor(before?.p20?.deviationDb, after?.p20?.deviationDb),
      // THE DISPLAYED DELTA: the two displayed endpoints themselves, so the
      // change stated beside the pair always equals A − B (±15 dB → ±12 dB reads
      // "3 dB better"). The full-precision delta behind them is never printed
      // beside rounded endpoints.
      delta: displayDeltaDb(before?.p20?.deviationDb, after?.p20?.deviationDb),
      deltaLabel: displayDeltaPhrase(before?.p20?.deviationDb, after?.p20?.deviationDb),
    }),
    row({
      key: "p19",
      group: "Overall",
      label: TRADE_OFF_METRIC.P19_LABEL,
      before: valueText(before?.p19?.deviationDb, before?.p19?.level),
      after: valueText(after?.p19?.deviationDb, after?.p19?.level),
      pair: deviationPair(before?.p19?.deviationDb, after?.p19?.deviationDb),
      levelBefore: levelText(before?.p19?.level),
      levelAfter: levelText(after?.p19?.level),
      direction: directionFor(before?.p19?.deviationDb, after?.p19?.deviationDb),
      delta: finite(improvement?.p19DeltaDb) ?? finite(damage?.p19WorseDb),
    }),
  ].filter(Boolean);
}

/** The per-seat values the run recorded, by seat id. */
function perSeatMap(result, key) {
  const seats = Array.isArray(result?.[key]) ? result[key] : [];
  const map = new Map();
  seats.forEach((seat) => {
    const id = String(seat?.seatId || "");
    if (!id) return;
    map.set(id, {
      db: finite(seat?.variationDbRaw),
      level: seat?.level ?? null,
      isPrimary: seat?.isPrimary === true,
    });
  });
  return map;
}

/**
 * The per-seat rows the designer reviews, from the run's OWN recorded per-seat
 * results — the same rows the protection read when it held the candidate. The
 * affected seat's proposed value is the recorded regression applied to its own
 * recorded current value whenever the retained rows do not already carry it.
 */
function seatRows(decision, regression) {
  const currentP20 = perSeatMap(decision?.before, "perSeatP20");
  const proposedP20 = perSeatMap(decision?.after, "perSeatP20");
  const currentP19 = perSeatMap(decision?.before, "perSeatP19");
  const proposedP19 = perSeatMap(decision?.after, "perSeatP19");

  const ids = new Set([
    ...proposedP20.keys(),
    ...currentP20.keys(),
    ...proposedP19.keys(),
  ]);
  if (regression?.seatId) ids.add(regression.seatId);

  const rows = [];
  ids.forEach((seatId) => {
    const usesP20 = proposedP20.has(seatId) || currentP20.has(seatId) || regression?.parameter !== "P19";
    const current = (usesP20 ? currentP20 : currentP19).get(seatId) || null;
    let proposed = (usesP20 ? proposedP20 : proposedP19).get(seatId) || null;
    const isAffected = regression?.seatId === seatId;

    if (isAffected && regression.rawDeltaDb != null && current?.db != null) {
      proposed = {
        db: current.db + regression.rawDeltaDb,
        level: regression.levelAfter ?? proposed?.level ?? null,
        isPrimary: true,
      };
    }

    const direction = directionFor(current?.db, proposed?.db);
    // A DISPLAYED LEVEL that drops is a regression in its own right, recorded as
    // the level pair itself: it is stated as worsening even when the raw value
    // behind it was not retained. So is a seat the run recorded a deterioration
    // amount for: the direction is the run's own recorded fact, never re-derived.
    const levelDrop = isAffected
      && levelNumber(regression.levelAfter) != null
      && levelNumber(regression.levelBefore) != null
      && levelNumber(regression.levelAfter) > levelNumber(regression.levelBefore);
    const recordedWorsening = isAffected
      && finite(regression.rawDeltaDb) != null
      && finite(regression.rawDeltaDb) > 0;
    const resolvedDirection = direction
      || (levelDrop || recordedWorsening ? TRADE_OFF_DIRECTION.WORSENS : null);
    const levelPair = levelDrop
      ? `${regression.levelBefore} → ${regression.levelAfter}`
      : null;

    const beforeText = valueText(current?.db, current?.level ?? (isAffected ? regression.levelBefore : null));
    // With no raw value retained, the recorded level itself is the proposed
    // result — stated as the level, never as an invented deviation.
    const afterText = proposed?.db != null
      ? valueText(proposed.db, proposed.level ?? null)
      : (isAffected ? levelText(regression.levelAfter) : null);
    // THE AFFECTED SEAT IS ALWAYS STATED. A run that recorded which seat loses
    // performance and by how much, but retained neither of that seat's own values,
    // still states the seat and the exact amount it loses: the row is never
    // dropped, and no absolute value is ever invented to fill the pair.
    const pairKnown = Boolean(beforeText || afterText);
    // THE RECORDED REGRESSION AMOUNT IS RETAINED EVIDENCE. Where the run kept the
    // exact amount a protected seat loses ("1.2 dB"), that figure labels the row
    // beside its own values, exactly as recorded — it is never converted to the
    // whole-number display rule the ordinary before → after rows follow.
    const recordedAmount = isAffected && regression.rawDeltaDb != null
      ? recordedAmountText(regression.rawDeltaDb)
      : null;

    rows.push(
      row({
        key: `seat:${seatId}`,
        group: (proposed?.isPrimary || current?.isPrimary || isAffected)
          ? "Primary seats"
          : "Secondary seats",
        label: formatSeatLabel(seatId),
        before: beforeText,
        after: afterText,
        direction: resolvedDirection,
        delta: proposed?.db != null && current?.db != null ? proposed.db - current.db : null,
        deltaLabel: levelPair || recordedAmount,
        force: isAffected,
        pairKnown,
      }),
    );
  });

  return rows.filter(Boolean);
}

/**
 * The change this candidate is. The run's own recorded offset statement names a
 * delay change in installer words; otherwise the first sentence of its own
 * statement names the candidate. Never re-worded, never invented.
 */
function adjustmentLine(decision) {
  const offset = typeof decision?.offsetStatement === "string" ? decision.offsetStatement.trim() : "";
  if (offset) return offset;
  const statement = typeof decision?.statement === "string" ? decision.statement.trim() : "";
  if (!statement) return null;
  const cut = statement.indexOf(". ");
  return cut > 0 ? statement.slice(0, cut + 1) : statement;
}

/**
 * Resolve the trade-off state for the open design version.
 *
 * @param {object} params
 * @param {object|null} params.decision - the decision the run saved with its plan
 * @param {boolean} [params.kept] - the designer kept the current design
 * @returns {object|null} the trade-off the designer must decide, or null
 */
export function resolveTradeOffState({ decision = null, kept = false } = {}) {
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
  const overall = overallRows(record);
  const seats = seatRows(record, regression);
  const affected = regression?.seatId
    ? seats.find((seat) => seat.key === `seat:${regression.seatId}`) || null
    : null;

  const seatLabel = regression?.seatId ? formatSeatLabel(regression.seatId) : null;
  const seat = regression?.seatId
    ? {
      seatId: regression.seatId,
      label: seatLabel,
      scope: "primary",
      parameter: regression.parameter,
      before: affected?.before || null,
      after: affected?.after || null,
      // The amount itself stays the NUMBER the run recorded — the row's own display
      // text states it beside the values, and never replaces the figure.
      delta: finite(affected?.delta) ?? regression.rawDeltaDb ?? null,
      deltaText: affected?.delta ?? null,
      direction: TRADE_OFF_DIRECTION.WORSENS,
    }
    : null;

  // The one impact line stated on the main panel: WHICH protected measure moves,
  // ITS current → proposed result where the run retained them, and by exactly how
  // much. Where the run retained no pair for that seat, the amount it recorded is
  // stated instead — the seat is never described by two empty dashes.
  const worsenedMetric = overall.find((line) => line.direction === TRADE_OFF_DIRECTION.WORSENS) || null;
  const seatPair = seat && (seat.before || seat.after) ? `${seat.before || "—"} → ${seat.after || "—"}` : null;
  const seatAmount = seat?.delta != null ? recordedAmountText(seat.delta) : null;
  const seatClause = !seat
    ? null
    : seatPair
      ? `${seat.parameter} ${seatPair}${seat.deltaText ? ` (${seat.deltaText})` : ""}`
      : seatAmount
        ? `${seat.parameter} worsens by ${seatAmount}`
        : `${seat.parameter} worsens`;
  const impact = seat
    ? `Primary seat ${seat.label}: ${seatClause}`
    : (worsenedMetric
      ? `${worsenedMetric.label}: ${worsenedMetric.before} → ${worsenedMetric.after}${worsenedMetric.delta ? ` (${worsenedMetric.delta})` : ""}`
      : TRADE_OFF_METRIC_NOTE);

  // ── THE DECISION, STATED PLAINLY ───────────────────────────────────────────
  // The review opens with the decision itself rather than with two metric rows:
  // what the change buys, what it costs, and — separately and lightly — the
  // metric that is NOT the trade-off. Every figure here is the same one the
  // detail rows already carry; nothing is calculated a second time.
  const p20Row = overall.find((line) => line.key === "p20") || null;
  const p19Row = overall.find((line) => line.key === "p19") || null;
  const amountText = seat?.delta != null ? recordedAmountText(seat.delta) : null;
  const protectedLevel = p19Row?.levelAfter || p19Row?.levelBefore || null;

  const decisionSentence = seat
    ? `Overall bass consistency improves, but ${seat.label} gets worse.`
    : "Overall bass consistency improves, but one protected measure gets worse.";

  // THE DISPLAYED IMPROVEMENT, derived from the two displayed endpoints of the
  // pair stated directly above it — see optimiserDisplayDelta.js. It therefore
  // always adds up with that pair.
  const gain = p20Row && p20Row.direction === TRADE_OFF_DIRECTION.IMPROVES
    ? {
      title: "Overall bass consistency",
      metric: TRADE_OFF_METRIC.P20_LABEL,
      pair: p20Row.pair,
      delta: displayImprovementText(record.before?.p20?.deviationDb, record.after?.p20?.deviationDb),
    }
    : null;

  const giveUp = seat
    ? {
      label: seat.label,
      metric: TRADE_OFF_METRIC.P20_LABEL,
      // The amount the run recorded, never rounded away and never invented.
      amount: amountText ? `Worsens by ${amountText}` : "Worsens",
    }
    : null;

  const protectedMetric = p19Row
    ? {
      label: TRADE_OFF_METRIC.P19_PROTECTED,
      direction: p19Row.direction,
      unchanged: p19Row.direction === TRADE_OFF_DIRECTION.UNCHANGED,
      level: protectedLevel,
      text: `${TRADE_OFF_METRIC.P19_PROTECTED} — ${
        p19Row.direction === TRADE_OFF_DIRECTION.IMPROVES
          ? "Improves"
          : p19Row.direction === TRADE_OFF_DIRECTION.WORSENS
            ? "Worsens"
            : "Unchanged"
      }${protectedLevel ? ` · ${protectedLevel}` : ""}`,
    }
    : null;

  return {
    isTradeOff: true,
    kept: kept === true,
    headline: kept === true ? TRADE_OFF_KEPT_SENTENCE : TRADE_OFF_HEADLINE,
    label: kept === true ? TRADE_OFF_KEPT_LABEL : null,
    adjustment: adjustmentLine(record),
    // THE DECISION, IN ONE SENTENCE — the first thing the review states.
    decisionSentence,
    // What the change BUYS and what it COSTS, as the two blocks of the decision.
    gain,
    giveUp,
    // The exact amount the affected seat loses ("1.2 dB"): the give-up block and
    // the Apply sentence both state this same figure.
    amountText,
    // The metric that is NOT the trade-off, stated separately and lightly.
    protectedMetric,
    seat,
    impact,
    overall,
    rows: [...overall, ...seats],
    // The change's own identity, so the review and Apply name the same candidate.
    candidateId: record.candidateId || null,
    objective: record.objective || null,
    objectiveLabel: record.objectiveLabel || null,
    scopeNote: seats.length > 1
      ? null
      : (seat?.before || seat?.after ? TRADE_OFF_SCOPE_NOTE : TRADE_OFF_AFFECTED_VALUES_NOTE),
  };
}