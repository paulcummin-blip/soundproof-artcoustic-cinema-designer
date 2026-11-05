// improvementActionPresentation.js
// ---------------------------------------------------------------------------
// Plain-English presentation of what a pending ADI Bass Optimisation
// recommendation actually proposes, and what its Apply button does.
//
// This module is a PURE READ-ONLY resolver. It reads the SAME authorities the
// improvement card already reads — the headline, the designer summary, the
// placement recommendation, the run's own saved calibration decision and the
// saved plan levers — and returns presentation only:
//
//   actionType        "electronic" | "seating" | "subwoofers"
//   actionHeadline    one plain-English sentence
//   proposedChanges   [{ setting, label, from, to }] — only settings that move
//   scopeStatement     what will and will not change
//   applyLabel        "Apply Bass Settings" | "Move Seating" | "Move Subwoofers"
//
// It performs NO calculation, re-ranks nothing, changes no engineering logic,
// no fingerprint, no saved state, and no Apply functionality. Where a value
// was not recorded it returns null, so the card states nothing rather than
// inventing it.
// ---------------------------------------------------------------------------

import { OPTIMISER_LEVER } from "./optimiserPlanConstants.js";
import { PLACEMENT_KIND } from "./placementRecommendationAuthority.js";

/** The three action types a pending recommendation can be. */
export const IMPROVEMENT_ACTION_TYPE = Object.freeze({
  ELECTRONIC: "electronic",
  SEATING: "seating",
  SUBWOOFERS: "subwoofers",
});

/** The action-specific Apply button labels. */
export const IMPROVEMENT_APPLY_LABEL = Object.freeze({
  [IMPROVEMENT_ACTION_TYPE.ELECTRONIC]: "Apply Bass Settings",
  [IMPROVEMENT_ACTION_TYPE.SEATING]: "Move Seating",
  [IMPROVEMENT_ACTION_TYPE.SUBWOOFERS]: "Move Subwoofers",
});

/** The plain-English action headlines — pending state. */
export const IMPROVEMENT_HEADLINE = Object.freeze({
  [IMPROVEMENT_ACTION_TYPE.ELECTRONIC]: "ADI recommends adjusting your bass settings",
  [IMPROVEMENT_ACTION_TYPE.SEATING]: "ADI recommends moving your seating",
  [IMPROVEMENT_ACTION_TYPE.SUBWOOFERS]: "ADI recommends moving your subwoofers",
});

/** The applied-state headlines — what is now in the design. */
export const IMPROVEMENT_APPLIED_HEADLINE = Object.freeze({
  [IMPROVEMENT_ACTION_TYPE.ELECTRONIC]: "Bass settings now in use",
  [IMPROVEMENT_ACTION_TYPE.SEATING]: "Seating moved",
  [IMPROVEMENT_ACTION_TYPE.SUBWOOFERS]: "Subwoofers moved",
});

/** The scope statements — what will and will not change. */
export const IMPROVEMENT_SCOPE = Object.freeze({
  [IMPROVEMENT_ACTION_TYPE.ELECTRONIC]:
    "No speakers, subwoofers or seating will be moved. Sound Proof will apply these settings and recalculate the result.",
  [IMPROVEMENT_ACTION_TYPE.SEATING]:
    "The seating positions will change in the Room Designer. No subwoofer or speaker settings will be changed.",
  [IMPROVEMENT_ACTION_TYPE.SUBWOOFERS]:
    "The subwoofer positions will change in the Room Designer. No speaker or seating positions will be changed.",
});

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** "2.5 ms" — one decimal place, never a trailing zero. */
function msText(value) {
  const n = num(value);
  if (n == null) return null;
  return `${Number(n.toFixed(1))} ms`;
}

/** "-3 dB" — signed, one decimal place. */
function dbText(value) {
  const n = num(value);
  if (n == null) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n.toFixed(1))} dB`;
}

/** "2.60 m" — two decimals, in metres. */
function metresText(value) {
  const n = num(value);
  if (n == null) return null;
  return `${Number(n.toFixed(2))} m`;
}

/** "Normal" / "Inverted" from a polarity value. */
function polarityText(value) {
  const n = num(value);
  if (n == null) return null;
  return n < 0 ? "Inverted" : "Normal";
}

/** "Sub 1" — a short subwoofer label from the subId. */
function subLabel(subId, index) {
  if (typeof subId === "string" && subId.trim()) return subId;
  if (Number.isFinite(index)) return `Sub ${index + 1}`;
  return "Subwoofer";
}

/**
 * Resolve the action type from the authorities the card already reads.
 *
 * Priority: an explicit placement recommendation (subwoofers), then a seating
 * recommendation, then an electronic calibration lever. Returns null when the
 * state is not a pending or applied recommendation the card would show.
 */
export function resolveImprovementActionType({
  headline = null,
  summary = null,
  placement = null,
  improvementResult = null,
} = {}) {
  const hl = headline;
  const pl = placement;
  const ir = improvementResult;

  // Physical subwoofer placement — recommended or already applied.
  if (pl?.kind === PLACEMENT_KIND.RECOMMENDED || pl?.kind === PLACEMENT_KIND.APPLIED) {
    return IMPROVEMENT_ACTION_TYPE.SUBWOOFERS;
  }

  // Seating recommendation — the summary carries the seating detail.
  if (summary?.seatingRecommendation) {
    return IMPROVEMENT_ACTION_TYPE.SEATING;
  }

  // Electronic calibration — delay, gain or polarity. Determined by the
  // recommended lever key when the headline says a calibration is on offer.
  const leverKey = summary?.recommendedLever || null;
  const isElectronicLever = leverKey === OPTIMISER_LEVER.DELAY
    || leverKey === OPTIMISER_LEVER.GAIN
    || leverKey === OPTIMISER_LEVER.POLARITY;
  if (isElectronicLever) {
    return IMPROVEMENT_ACTION_TYPE.ELECTRONIC;
  }

  // Fall back to the headline / improvement case: a calibration under review
  // or applied is electronic; anything else has no action type.
  if (ir?.caseKey === "applied" || ir?.caseKey === "review") {
    if (hl?.kind === "consider" || hl?.kind === "applied" || hl?.kind === "improvement") {
      return IMPROVEMENT_ACTION_TYPE.ELECTRONIC;
    }
  }

  return null;
}

/**
 * Build the Proposed Changes rows for an electronic calibration lever.
 * Reads the lever's own persisted changes — each carries from/to values for
 * delay, gain or polarity. Only settings that genuinely change are returned.
 */
function electronicProposedChanges({ leverRow = null } = {}) {
  const changes = Array.isArray(leverRow?.changes) ? leverRow.changes : [];
  const rows = [];
  changes.forEach((change, index) => {
    const lever = change?.lever || leverRow?.key || leverRow?.lever || null;
    const label = subLabel(change?.subId, index);
    if (lever === OPTIMISER_LEVER.DELAY) {
      const from = msText(change?.fromMs);
      const to = msText(change?.toMs);
      if (from && to && from !== to) rows.push({ setting: "Delay", label, from, to });
    } else if (lever === OPTIMISER_LEVER.GAIN) {
      const from = dbText(change?.fromDb);
      const to = dbText(change?.toDb);
      if (from && to && from !== to) rows.push({ setting: "Gain", label, from, to });
    } else if (lever === OPTIMISER_LEVER.POLARITY) {
      const from = polarityText(change?.from);
      const to = polarityText(change?.to);
      if (from && to && from !== to) rows.push({ setting: "Polarity", label, from, to });
    }
  });
  return rows;
}

/**
 * Build the Proposed Changes rows for a subwoofer placement move.
 * Reads the placement recommendation's own move groups — each carries from/to
 * position text and a movement description. Only groups that genuinely move
 * are returned.
 */
function subwooferProposedChanges({ placement = null } = {}) {
  const groups = Array.isArray(placement?.move?.groups) ? placement.move.groups : [];
  const rows = [];
  groups.forEach((group) => {
    const label = group?.groupPhrase || group?.subLabelsText || "Subwoofers";
    const from = group?.fromText || null;
    const to = group?.toText || null;
    if (from && to && from !== to) {
      rows.push({ setting: "Position", label, from, to });
    }
  });
  return rows;
}

/**
 * Build the Proposed Changes rows for a seating move.
 * Reads the lever's own persisted seat changes — each carries fromY/toY in
 * metres. Only seats that genuinely move are returned.
 */
function seatingProposedChanges({ leverRow = null, seatingRecommendation = null } = {}) {
  const changes = Array.isArray(leverRow?.changes) ? leverRow.changes : [];
  const rows = [];
  changes.forEach((change) => {
    const from = metresText(change?.fromY);
    const to = metresText(change?.toY);
    const label = change?.seatId || "Seat";
    if (from && to && from !== to) {
      rows.push({ setting: "Seat position", label, from, to });
    }
  });
  // When the lever changes are not readable but the seating recommendation
  // carries a movement label, return an empty array — the headline and scope
  // statement still state the move; the table simply has no per-seat rows.
  if (rows.length === 0 && seatingRecommendation?.movementLabel) {
    return [];
  }
  return rows;
}

/**
 * Resolve the complete presentation for a pending or applied recommendation.
 *
 * @returns {object|null} null when no action type can be determined.
 */
export function resolveImprovementActionPresentation({
  headline = null,
  summary = null,
  placement = null,
  improvementResult = null,
  planView = null,
} = {}) {
  const actionType = resolveImprovementActionType({
    headline,
    summary,
    placement,
    improvementResult,
  });
  if (!actionType) return null;

  // Find the recommended lever's own persisted changes for the table.
  const leverKey = summary?.recommendedLever || null;
  const levers = Array.isArray(planView?.levers) ? planView.levers : [];
  const leverRow = leverKey
    ? levers.find((row) => (row?.key ?? row?.lever) === leverKey) || null
    : null;

  let proposedChanges = [];
  if (actionType === IMPROVEMENT_ACTION_TYPE.ELECTRONIC) {
    proposedChanges = electronicProposedChanges({ leverRow });
  } else if (actionType === IMPROVEMENT_ACTION_TYPE.SUBWOOFERS) {
    proposedChanges = subwooferProposedChanges({ placement });
  } else if (actionType === IMPROVEMENT_ACTION_TYPE.SEATING) {
    proposedChanges = seatingProposedChanges({
      leverRow,
      seatingRecommendation: summary?.seatingRecommendation || null,
    });
  }

  return {
    actionType,
    actionHeadline: IMPROVEMENT_HEADLINE[actionType],
    appliedHeadline: IMPROVEMENT_APPLIED_HEADLINE[actionType],
    proposedChanges,
    scopeStatement: IMPROVEMENT_SCOPE[actionType],
    applyLabel: IMPROVEMENT_APPLY_LABEL[actionType],
  };
}