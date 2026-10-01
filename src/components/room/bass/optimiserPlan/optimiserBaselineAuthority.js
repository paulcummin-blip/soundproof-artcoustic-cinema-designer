// optimiserBaselineAuthority.js
// ---------------------------------------------------------------------------
// The optimiser's CURRENT baseline IS the published bass result.
//
// One canonical current bass authority. For a given project/version, design
// fingerprint, target identity, seat set and assessment band, the optimiser's
// baseline must be the SAME completed production bass authority the designer is
// shown. The optimiser never independently rebuilds "Current" and presents that
// as the designer-facing baseline.
//
// This module answers exactly three questions, read-only:
//
//   1. Does a matching completed production authority exist for the live design?
//      (fingerprint · target identity · assessment band · seat set · published
//      P19/P20 — exact values compared within a small tolerance)
//   2. If not: which parity reason failed, as persisted evidence?
//   3. If yes: the comparison object for the optimiser baseline, built from the
//      published contract's own values — nothing recalculated, nothing invented.
//
// No bass maths, no P19/P20 definition, no RP22 grading, no optimiser scoring.
// Fields the authority does not publish are recorded as null, never guessed.
// ---------------------------------------------------------------------------

import { extractAuthorityForComparison } from "../improveBassV2/currentAuthorityComparison.js";
import { STAGE2_CANONICAL_VERSION } from "../stage2/stage2Constants.js";

/** Parity outcome between the optimiser baseline and the published authority. */
export const BASELINE_PARITY_STATUS = Object.freeze({
  /** The published authority is the baseline. */
  MATCH: "MATCH",
  /** No completed production authority exists for the live design. */
  MISSING: "MISSING",
  /** An authority exists but does not match the live design / values. */
  MISMATCH: "MISMATCH",
  /** Saved before parity was recorded — re-run before applying anything. */
  UNKNOWN: "UNKNOWN",
});

/**
 * Small tolerance for the exact-value comparison between a re-derived Current
 * and the published authority. It is a PARITY tolerance, not a grading
 * threshold: two results this close are the same result.
 */
export const BASELINE_PARITY_TOLERANCE_DB = 0.1;

/** Why the optimiser has no usable published baseline. */
export const BASELINE_PARITY_REASON = Object.freeze({
  NO_AUTHORITY: "no-completed-authority",
  NOT_AUTHORITATIVE: "authority-not-authoritative",
  NO_CONTRACT: "no-authority-contract",
  NO_PUBLISHED_SEATS: "no-published-seat-results",
  NO_PUBLISHED_P19: "no-published-p19-headline",
  DESIGN_FINGERPRINT: "design-fingerprint-differs",
  TARGET_IDENTITY: "target-identity-differs",
  ASSESSMENT_BAND: "assessment-band-differs",
  SEAT_SET: "seat-set-differs",
  P19_VALUE: "published-p19-differs",
  P20_VALUE: "published-p20-differs",
});

/** The designer-facing status, copy and action for each blocked parity state. */
export const BASELINE_PARITY_COPY = Object.freeze({
  MISSING_STATUS: "Bass calculation required",
  MISSING_MESSAGE: "ADI needs the current bass calculation before it can optimise this design.",
  MISMATCH_STATUS: "Current authority mismatch",
  MISMATCH_MESSAGE: "The optimiser baseline does not match the published bass result. Recalculate bass performance before running ADI.",
  UNKNOWN_STATUS: "Baseline parity not recorded",
  CTA: "Calculate Bass Performance",
});

/** A finite number, or null. Never coerces null/undefined/"" to 0. */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/** FNV-1a over a stable string — an identity hash of inputs, never a metric. */
export function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/** The seat set the authority published, from its own per-seat P20 rows. */
export function publishedSeatIds(authority) {
  const rows = authority?.contract?.selectedCandidate?.perSeatP20Results;
  return (Array.isArray(rows) ? rows : []).map((row) => String(row?.seatId ?? "")).filter(Boolean);
}

/** Is this a completed production authority the designer can be shown? */
export function isCompletedAuthority(authority) {
  if (!authority) return false;
  return authority.authorityStatus === "AUTHORITATIVE" || authority.authoritative === true;
}

/**
 * The persisted parity trace. Every field is either the authority's own
 * published value or null — a field this authority does not carry is recorded
 * as null so nothing is invented and a later mismatch is diagnosable.
 */
export function buildBaselineParityTrace({ authority = null, liveCacheKey = null, targetIdentity = null, seatIds = [], reconstruction = null } = {}) {
  const contract = authority?.contract || null;
  const receipt = contract?.provenance || null;
  const envelope = contract?.assessmentEnvelope || null;
  const published = contract ? extractAuthorityForComparison(authority) : null;
  const authoritySeatIds = publishedSeatIds(authority);
  return {
    resultFingerprint: contract?.job?.resultFingerprint ?? null,
    designFingerprint: authority?.currentFingerprint ?? null,
    liveCacheKey: liveCacheKey ?? null,
    cacheId: authority?.cacheId ?? null,
    authorityStatus: authority?.authorityStatus ?? null,
    targetIdentity: {
      p14TargetDb: finiteOrNull(contract?.requestedP14TargetDb),
      p14TargetBasis: contract?.requestedP14TargetBasis ?? null,
      p18TargetBasis: contract?.requestedP18TargetBasis ?? null,
      contractTargetIdentity: contract?.p19TargetIdentity ?? null,
      requested: targetIdentity || null,
    },
    assessmentBand: envelope
      ? {
        startHz: finiteOrNull(envelope.assessmentStartHz),
        endHz: finiteOrNull(envelope.assessmentEndHz),
      }
      : null,
    // Published signatures when the authority carries them. Compaction does not
    // persist every signature, so a null here is a stated absence, not a value.
    frequencyGridHash: receipt?.frequencyGridSignature ?? receipt?.gridSignature ?? null,
    rspEqHash: receipt?.correctionCurveSignature ?? null,
    postEqRspCurveHash: receipt?.postEqCurveSignature ?? null,
    filterBankHash: receipt?.filterBankSignature ?? null,
    perSeatPostEqCurveHashes: contract?.selectedCandidate?.perSeatCurveSignatures ?? null,
    seatSetHash: authoritySeatIds.length ? stableHash(authoritySeatIds.join("|")) : null,
    seatIds: authoritySeatIds.length ? authoritySeatIds : null,
    liveSeatSetHash: Array.isArray(seatIds) && seatIds.length
      ? stableHash(seatIds.map((id) => String(id ?? "")).join("|"))
      : null,
    liveSeatIds: Array.isArray(seatIds) && seatIds.length ? seatIds.map((id) => String(id ?? "")) : null,
    exactP19Db: published?.achievedP19VariationDb ?? null,
    exactP20Db: published?.achievedP20VariationDb ?? null,
    p20Level: published?.achievedP20Level ?? null,
    worstP20Seat: published?.perSeatP20?.reduce(
      (worst, row) => (worst == null || Math.abs(Number(row?.variationDbRaw) || 0) > Math.abs(Number(worst.variationDbRaw) || 0) ? row : worst),
      null,
    )?.seatId ?? null,
    limitingFrequencyHz: published?.perSeatP20?.reduce(
      (worst, row) => (worst == null || Math.abs(Number(row?.variationDbRaw) || 0) > Math.abs(Number(worst.variationDbRaw) || 0) ? row : worst),
      null,
    )?.worstFrequencyHz ?? null,
    reconstruction: reconstruction
      ? {
        p19Db: finiteOrNull(reconstruction.achievedP19VariationDb),
        p20Db: finiteOrNull(reconstruction.achievedP20VariationDb),
      }
      : null,
    recordedAt: new Date().toISOString(),
  };
}

/** The published values an independently re-derived Current must agree with. */
function publishedValues(authority) {
  const published = authority?.contract ? extractAuthorityForComparison(authority) : null;
  if (!published) return null;
  return published;
}

/**
 * Resolve whether the published authority can serve as the optimiser baseline.
 *
 * @param {object} params
 * @param {object|null} params.currentAuthority - completedBassAuthority
 * @param {string|null} params.liveCacheKey - live production cacheKey
 * @param {object|null} params.targetIdentity - { p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis }
 * @param {Array} params.seatIds - the live applicable seat ids
 * @param {object|null} params.reconstruction - an independently re-derived Current, when one exists
 * @returns {{status: string, reasons: string[], trace: object, published: object|null}}
 */
export function resolveBaselineParity({
  currentAuthority = null,
  liveCacheKey = null,
  targetIdentity = null,
  seatIds = [],
  reconstruction = null,
} = {}) {
  const reasons = [];
  const trace = buildBaselineParityTrace({ authority: currentAuthority, liveCacheKey, targetIdentity, seatIds, reconstruction });
  const fail = (status) => ({ status, reasons, trace, published: null });

  if (!currentAuthority) {
    reasons.push(BASELINE_PARITY_REASON.NO_AUTHORITY);
    return fail(BASELINE_PARITY_STATUS.MISSING);
  }
  if (!isCompletedAuthority(currentAuthority)) {
    reasons.push(BASELINE_PARITY_REASON.NOT_AUTHORITATIVE);
    return fail(BASELINE_PARITY_STATUS.MISSING);
  }
  const contract = currentAuthority.contract;
  if (!contract) {
    reasons.push(BASELINE_PARITY_REASON.NO_CONTRACT);
    return fail(BASELINE_PARITY_STATUS.MISSING);
  }

  const published = publishedValues(currentAuthority);
  if (!published || !(published.perSeatP20 || []).length) {
    reasons.push(BASELINE_PARITY_REASON.NO_PUBLISHED_SEATS);
    return fail(BASELINE_PARITY_STATUS.MISSING);
  }
  if (finiteOrNull(published.achievedP19VariationDb) == null) {
    reasons.push(BASELINE_PARITY_REASON.NO_PUBLISHED_P19);
    return fail(BASELINE_PARITY_STATUS.MISSING);
  }

  // Design identity: the authority must belong to the live design.
  if (liveCacheKey && currentAuthority.currentFingerprint && currentAuthority.currentFingerprint !== liveCacheKey) {
    reasons.push(BASELINE_PARITY_REASON.DESIGN_FINGERPRINT);
  }
  if (!liveCacheKey || !currentAuthority.currentFingerprint) {
    reasons.push(BASELINE_PARITY_REASON.DESIGN_FINGERPRINT);
  }

  // Target identity: never compare a result run against a different target.
  const authorityTargetDb = finiteOrNull(contract.requestedP14TargetDb);
  const liveTargetDb = finiteOrNull(targetIdentity?.p14TargetDb);
  if (authorityTargetDb != null && liveTargetDb != null && Math.abs(authorityTargetDb - liveTargetDb) > BASELINE_PARITY_TOLERANCE_DB) {
    reasons.push(BASELINE_PARITY_REASON.TARGET_IDENTITY);
  }

  // Assessment band: the same comparison band, when both state one.
  const bandStart = finiteOrNull(contract.assessmentEnvelope?.assessmentStartHz);
  const bandEnd = finiteOrNull(contract.assessmentEnvelope?.assessmentEndHz);
  const liveStart = finiteOrNull(targetIdentity?.assessmentStartHz);
  const liveEnd = finiteOrNull(targetIdentity?.assessmentEndHz);
  if (bandStart != null && liveStart != null && bandStart !== liveStart) reasons.push(BASELINE_PARITY_REASON.ASSESSMENT_BAND);
  if (bandEnd != null && liveEnd != null && bandEnd !== liveEnd) reasons.push(BASELINE_PARITY_REASON.ASSESSMENT_BAND);

  // Seat set: the same seats the designer is looking at.
  const authoritySeatIds = publishedSeatIds(currentAuthority).slice().sort();
  const liveSeatIds = (Array.isArray(seatIds) ? seatIds : []).map((id) => String(id ?? "")).filter(Boolean).sort();
  if (liveSeatIds.length && (authoritySeatIds.length !== liveSeatIds.length
    || authoritySeatIds.some((id, index) => id !== liveSeatIds[index]))) {
    reasons.push(BASELINE_PARITY_REASON.SEAT_SET);
  }

  // A re-derived Current is only usable when it IS the published result.
  if (reconstruction) {
    const p19 = Math.abs(Number(reconstruction.achievedP19VariationDb) - Number(published.achievedP19VariationDb));
    const p20 = Math.abs(Number(reconstruction.achievedP20VariationDb) - Number(published.achievedP20VariationDb));
    if (Number.isFinite(p19) && p19 > BASELINE_PARITY_TOLERANCE_DB) reasons.push(BASELINE_PARITY_REASON.P19_VALUE);
    if (Number.isFinite(p20) && p20 > BASELINE_PARITY_TOLERANCE_DB) reasons.push(BASELINE_PARITY_REASON.P20_VALUE);
  }

  if (reasons.length) return fail(BASELINE_PARITY_STATUS.MISMATCH);
  return { status: BASELINE_PARITY_STATUS.MATCH, reasons: [], trace, published };
}

/**
 * The optimiser baseline, built from the PUBLISHED authority's own values.
 * Nothing here is recalculated: the per-seat P20 rows, the aggregate RSP P19
 * headline, P18/P14 and the assessment band all come from the completed
 * contract. Null when the contract does not carry the values a baseline needs —
 * in which case the caller must not proceed.
 */
export function buildPublishedBaseline({
  currentAuthority = null,
  sources = null,
  sourceIds = [],
  startFingerprint = null,
} = {}) {
  const contract = currentAuthority?.contract;
  if (!contract) return null;
  const published = extractAuthorityForComparison(currentAuthority);
  if (!published || !(published.perSeatP20 || []).length) return null;

  const envelope = contract.assessmentEnvelope || {};
  const startHz = finiteOrNull(envelope.assessmentStartHz);
  const endHz = finiteOrNull(envelope.assessmentEndHz);
  if (startHz == null || endHz == null || endHz <= startHz) return null;

  // The installed effective tuning of each source, read from the live
  // authoritative sources — the same source the canonical validation uses.
  const ids = (Array.isArray(sourceIds) ? sourceIds : []).map((id) => String(id));
  const appliedTuning = ids.length && Array.isArray(sources)
      && ids.every((id) => sources.some((source) => String(source?.id) === id))
    ? ids.map((id) => ({ ...(sources.find((source) => String(source?.id) === id)?.tuning || {}), sourceId: id }))
    : null;
  if (!appliedTuning) return null;

  const selectedCandidate = contract.selectedCandidate || {};
  return {
    ...published,
    inputIdentity: startFingerprint ?? null,
    assessmentStartHz: startHz,
    assessmentEndHz: endHz,
    operatingOutputDb: finiteOrNull(
      selectedCandidate.selectedOperatingOutputDb
      ?? contract.finalOptimisedBassResponse?.selectedOperatingOutputDb
      ?? contract.operatingOutputDb,
    ),
    p14TargetDb: finiteOrNull(contract.requestedP14TargetDb),
    requestedP14Pass: contract.requestedP14Pass ?? null,
    physicalValidation: selectedCandidate.physicalValidation ?? contract.physicalValidation ?? null,
    canonicalAuthorityReceipt: {
      ...(contract.provenance || {}),
      selectedCandidateId: contract.selectedCandidateId ?? null,
    },
    timingVersion: STAGE2_CANONICAL_VERSION,
    appliedTuning,
    isCurrent: true,
    candidateId: "current",
    candidateKind: "current",
    // The baseline's provenance, so the card can state where it came from.
    baselineSource: "published-authority",
    baselineParityStatus: BASELINE_PARITY_STATUS.MATCH,
  };
}

/**
 * The parity record persisted with every optimiser result, so a future mismatch
 * is diagnosable from stored evidence. `status` is the parity outcome; for
 * results saved before this existed, readers must report UNKNOWN.
 */
export function buildPersistedBaselineParity({ status, reasons = [], trace = null, reconstruction = null } = {}) {
  const blocked = status === BASELINE_PARITY_STATUS.MISSING || status === BASELINE_PARITY_STATUS.MISMATCH;
  return {
    status: status || null,
    reasons: Array.isArray(reasons) ? reasons : [],
    toleranceDb: BASELINE_PARITY_TOLERANCE_DB,
    trace: trace || null,
    reconstructionUsed: !!reconstruction,
    // A blocked parity is not applyable in any form.
    requiresBassCalculation: blocked,
    statusLabel: status === BASELINE_PARITY_STATUS.MISSING
      ? BASELINE_PARITY_COPY.MISSING_STATUS
      : status === BASELINE_PARITY_STATUS.MISMATCH
        ? BASELINE_PARITY_COPY.MISMATCH_STATUS
        : null,
    message: status === BASELINE_PARITY_STATUS.MISSING
      ? BASELINE_PARITY_COPY.MISSING_MESSAGE
      : status === BASELINE_PARITY_STATUS.MISMATCH
        ? BASELINE_PARITY_COPY.MISMATCH_MESSAGE
        : null,
  };
}

/** True when a saved parity record forbids applying anything from that result. */
export function parityBlocksApply(parity) {
  if (!parity) return true; // unrecorded (old result) — re-run before Apply
  return parity.status !== BASELINE_PARITY_STATUS.MATCH;
}