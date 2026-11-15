// optimiserApplyProvenance.js
// ---------------------------------------------------------------------------
// Durable Apply provenance for the ADI Optimisation Plan.
//
// When the designer applies a confirmed recommendation through the existing
// lever handler, a record is appended to the plan's `appliedLeverRecords`
// array. The record carries:
//
//   - the original ADI run ID
//   - the lever key and direction (to = applied, from = undone)
//   - the exact before/after values and affected sub/seat IDs
//   - the design fingerprint before the change (sourceDesignFingerprint)
//   - the resulting design fingerprint after the change (resultingDesignFingerprint)
//   - the verified post-recalculation P19/P20 levels and calculation identity
//
// This is the ONLY authority that proves ADI applied a recommendation. Matching
// coordinates alone are never accepted as proof — a coincidental value match
// does not create an applied record.
//
// The record is stored on the plan object itself (design_state.optimiser_plan.
// appliedLeverRecords) and persists across reloads through the existing
// ProjectVersion autosave. It introduces no competing save system.
//
// The provenance is read by resolveOptimiserPlanStatus to distinguish a
// fingerprint mismatch caused by ADI's own apply (keep the panel visible,
// disable further applies) from one caused by an unrelated design change
// (mark stale).
// ---------------------------------------------------------------------------

import { getOptimiserPlanAuthority, setOptimiserPlanAuthority } from "./optimiserPlanStore.js";

/**
 * Compact a single lever change into a plain, JSON-safe before/after snapshot.
 * Only the fields relevant to the lever kind are kept; every other field is
 * dropped so nothing oversized is ever written.
 */
function compactChange(change) {
  if (!change || typeof change !== "object") return null;
  const out = {
    lever: change.lever || null,
    subId: change.subId || null,
    seatId: change.seatId ?? null,
    label: change.label || null,
  };
  // Placement
  if (change.fromX != null) out.fromX = Number(change.fromX);
  if (change.fromY != null) out.fromY = Number(change.fromY);
  if (change.toX != null) out.toX = Number(change.toX);
  if (change.toY != null) out.toY = Number(change.toY);
  // Delay
  if (change.fromMs != null) out.fromMs = Number(change.fromMs);
  if (change.toMs != null) out.toMs = Number(change.toMs);
  // Gain
  if (change.fromDb != null) out.fromDb = Number(change.fromDb);
  if (change.toDb != null) out.toDb = Number(change.toDb);
  // Polarity
  if (change.from != null) out.from = change.from;
  if (change.to != null) out.to = change.to;
  if (change.fromLabel != null) out.fromLabel = change.fromLabel;
  if (change.toLabel != null) out.toLabel = change.toLabel;
  // Movement descriptors
  if (change.distanceMm != null) out.distanceMm = change.distanceMm;
  if (change.direction != null) out.direction = change.direction;
  if (change.deltaMm != null) out.deltaMm = change.deltaMm;
  return out;
}

function compactChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes.map(compactChange).filter(Boolean);
}

/**
 * Append a PENDING apply record to the plan immediately after the designer
 * commits a lever change, BEFORE the recalculation completes. If the browser
 * is reloaded mid-recalc, this record survives and the panel can state
 * "Applied — verification incomplete" instead of silently treating the plan
 * as stale.
 *
 * Returns the appended record (or null if no plan exists).
 */
export function recordLeverAppliedPending(projectId, versionId, {
  runId = null,
  leverKey = null,
  direction = "to",
  lever = null,
  sourceDesignFingerprint = null,
  resultingDesignFingerprint = null,
  affectedIds = [],
} = {}) {
  const current = getOptimiserPlanAuthority(projectId, versionId);
  if (!current) return null;
  const records = Array.isArray(current.appliedLeverRecords)
    ? [...current.appliedLeverRecords] : [];
  const record = {
    runId,
    leverKey,
    direction, // "to" = applied, "from" = undone
    appliedAt: new Date().toISOString(),
    sourceDesignFingerprint: sourceDesignFingerprint || null,
    resultingDesignFingerprint: resultingDesignFingerprint || null,
    beforeValues: compactChanges(direction === "to" ? lever?.changes : lever?.changes),
    afterValues: compactChanges(lever?.changes),
    affectedIds: Array.isArray(affectedIds) ? [...affectedIds] : [],
    verification: { status: "pending" },
    undoneAt: null,
    undoVerification: null,
  };
  records.push(record);
  setOptimiserPlanAuthority(projectId, versionId, { ...current, appliedLeverRecords: records });
  return record;
}

/**
 * Complete the verification on a pending apply record after the recalculation
 * finishes. Sets the resulting design fingerprint, the calculation identity,
 * and the verified P19/P20 levels. Only a record whose verification.status
 * is "pending" is updated — a record already verified or marked incomplete is
 * never overwritten.
 */
export function completeLeverApplyVerification(projectId, versionId, runId, leverKey, {
  status,
  resultingDesignFingerprint = null,
  calculationFingerprint = null,
  levels = null,
  failureReason = null,
} = {}) {
  const current = getOptimiserPlanAuthority(projectId, versionId);
  if (!current || !Array.isArray(current.appliedLeverRecords)) return;
  let touched = false;
  const records = current.appliedLeverRecords.map((r) => {
    if (r.runId !== runId || r.leverKey !== leverKey) return r;
    if (r.verification?.status !== "pending") return r;
    touched = true;
    return {
      ...r,
      resultingDesignFingerprint: resultingDesignFingerprint || r.resultingDesignFingerprint || null,
      verification: {
        status, // "verified" | "incomplete"
        calculationFingerprint: calculationFingerprint || null,
        levels: levels || null,
        failureReason: failureReason || null,
        verifiedAt: new Date().toISOString(),
      },
    };
  });
  if (!touched) return;
  setOptimiserPlanAuthority(projectId, versionId, { ...current, appliedLeverRecords: records });
}

/**
 * Mark an applied record as undone. The record stays in the array (so the run
 * remains "spent"), but `undoneAt` and `undoVerification` are set. This is
 * called after the undo recalculation completes.
 */
export function completeLeverUndoVerification(projectId, versionId, runId, leverKey, {
  status,
  calculationFingerprint = null,
  levels = null,
  failureReason = null,
} = {}) {
  const current = getOptimiserPlanAuthority(projectId, versionId);
  if (!current || !Array.isArray(current.appliedLeverRecords)) return;
  let touched = false;
  const records = current.appliedLeverRecords.map((r) => {
    if (r.runId !== runId || r.leverKey !== leverKey || r.direction !== "to") return r;
    touched = true;
    return {
      ...r,
      undoneAt: new Date().toISOString(),
      undoVerification: {
        status, // "verified" | "incomplete"
        calculationFingerprint: calculationFingerprint || null,
        levels: levels || null,
        failureReason: failureReason || null,
        verifiedAt: new Date().toISOString(),
      },
    };
  });
  if (!touched) return;
  setOptimiserPlanAuthority(projectId, versionId, { ...current, appliedLeverRecords: records });
}

/**
 * Resolve the apply provenance for a plan against the current design
 * fingerprint.
 *
 * Returns:
 *   status: "verified" | "pending" | "incomplete" | "none"
 *   hasAppliedRecord: true if ANY apply record exists for this run (run spent)
 *   appliedLeverKeys: lever keys that have been applied and not undone
 *   verifiedRecord: the matching verified record (when status === "verified")
 *   pendingRecord: the matching pending record (when status === "pending")
 *
 * - "verified": a record's resultingDesignFingerprint matches the current
 *   fingerprint AND its verification is verified. The panel stays visible with
 *   the actual RP22 improvement.
 * - "pending": a record was committed from this plan's design fingerprint but
 *   verification hasn't completed. The panel shows "Applied — verifying…"
 * - "incomplete": a record was committed but verification failed. The panel
 *   shows "Applied — verification incomplete"
 * - "none": no apply record explains the current design. An unrelated change
 *   made the design stale.
 */
export function resolveApplyProvenance(plan, currentDesignFingerprint) {
  const records = Array.isArray(plan?.appliedLeverRecords) ? plan.appliedLeverRecords : [];
  const savedFingerprint = plan?.designFingerprint || null;
  // Only records from THIS run count towards "spent" and "applied levers."
  // Records from a previous run are historical evidence: they do not disable
  // the new run's Apply buttons.
  const runId = plan?.run?.runId || null;
  const currentRunRecords = runId
    ? records.filter((r) => r.runId === runId)
    : records;

  const hasAppliedRecord = currentRunRecords.some((r) => r.direction === "to");
  const appliedLeverKeys = [...new Set(currentRunRecords
    .filter((r) => r.direction === "to" && !r.undoneAt)
    .map((r) => r.leverKey))];

  // ── Verified: resulting fingerprint matches current ──
  for (const r of records) {
    if (r.direction !== "to" || r.undoneAt) continue;
    if (r.verification?.status !== "verified") continue;
    if (r.resultingDesignFingerprint
      && r.resultingDesignFingerprint === currentDesignFingerprint) {
      return {
        status: "verified",
        hasAppliedRecord,
        appliedLeverKeys,
        verifiedRecord: r,
      };
    }
  }

  // ── Pending / incomplete: committed from this plan, verification not verified ──
  for (const r of records) {
    if (r.direction !== "to" || r.undoneAt) continue;
    if (r.verification?.status !== "pending" && r.verification?.status !== "incomplete") continue;
    // The apply came from this plan's design fingerprint
    if (r.sourceDesignFingerprint && r.sourceDesignFingerprint === savedFingerprint) {
      return {
        status: r.verification.status, // "pending" or "incomplete"
        hasAppliedRecord,
        appliedLeverKeys,
        pendingRecord: r,
      };
    }
  }

  return { status: "none", hasAppliedRecord, appliedLeverKeys };
}

/**
 * Merge appliedLeverRecords from the existing plan into a new plan record.
 *
 * A later optimisation run must NOT erase the record of a previously applied
 * recommendation. When a new run saves its plan/evidence, the existing plan's
 * appliedLeverRecords are carried over so historical Apply provenance survives.
 *
 * The records are per-run (each carries its own runId), so resolveApplyProvenance
 * can distinguish the current run's records from previous runs' records.
 */
export function mergeAppliedLeverRecords(existingPlan, newRecord) {
  if (!newRecord || typeof newRecord !== "object") return newRecord;
  const existingRecords = Array.isArray(existingPlan?.appliedLeverRecords)
    ? existingPlan.appliedLeverRecords
    : [];
  if (existingRecords.length === 0) return newRecord;
  // Don't double-add records the new record already carries (defensive).
  const newRecords = Array.isArray(newRecord.appliedLeverRecords)
    ? newRecord.appliedLeverRecords
    : [];
  if (newRecords.length > 0) return newRecord;
  return { ...newRecord, appliedLeverRecords: existingRecords };
}