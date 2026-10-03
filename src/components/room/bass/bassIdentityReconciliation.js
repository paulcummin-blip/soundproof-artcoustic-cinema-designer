// bassIdentityReconciliation.js
// -----------------------------
// The missing restore step: rebuild the bass identity from the FULLY HYDRATED
// design, then compare it against the saved contracts.
//
// Why this module exists
// ----------------------
// A persisted bass authority row carries a current_fingerprint written by a
// previous session. Nothing on the restore path ever recomputed that identity
// from the design actually being opened. A key produced from unsettled inputs —
// before the room, reference listening position, subwoofer instances, resolved
// subwoofer capability, usable LF limit, transition frequency or P14 target had
// resolved — was therefore restored verbatim as "out of date" on every open,
// even when a valid saved contract for the real design sat in the same cache
// record (the P14 target bank).
//
// This module is PURE: no React, no DB, no cache writes, no acoustics maths,
// no grading. It only answers identity questions:
//
//   isBassIdentityReady()               — may an identity be produced at all?
//   buildBassIdentity()                 — the identity to compare and persist
//   buildFingerprintInputDigest()        — named, rounded inputs for diagnosis
//   describeFingerprintDifferences()     — which inputs actually moved
//   findSavedContractForFingerprint()    — completed map first, then the bank
//   parseTargetCacheBank()               — read the bank out of a cache record
//
// Match order used everywhere: completed_by_fingerprint (the capped snapshot
// map) first, then every entry of the P14 target bank — so a contract the cap
// has evicted is still found.

import {
  BASS_ANALYSIS_CONTRACT_VERSION,
  COMPLETED_BASS_CACHE_VERSION,
  INSTANCE_AUTHORITY_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from "@/lib/bassAuthorityVersion";

export const RECONCILIATION_VERSION = 1;

export const IDENTITY_MATCH_SOURCE = Object.freeze({
  COMPLETED: "completed_by_fingerprint",
  BANK: "target_cache",
});

const round = (value, decimals = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
};

const byId = (a, b) => {
  const left = String(a?.id ?? "");
  const right = String(b?.id ?? "");
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

// ── 1. Identity readiness ──────────────────────────────────────────────────
//
// The persisted identity may only be produced, compared or written from a FULLY
// hydrated design. Every input below is an input to the calibration fingerprint
// (see bassAnalysisFingerprints.js), so a missing one produces a key that
// describes nothing real — which is exactly how a false "out of date" was
// written in the first place.
//
// The room-response curve is deliberately NOT required. It is not an identity
// input (it is an output of the room physics), and on a read-only open it is
// empty until background preparation runs — requiring it would block the
// restore from ever reconciling.
export function isBassIdentityReady({
  roomDims = null,
  rspPosition = null,
  seatingPositions = null,
  sources = null,
  productCapabilities = null,
  usableLfHz = null,
  optimisationTransitionHz = null,
  requested = null,
  targetKey = null,
} = {}) {
  const missing = [];
  const dims = [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM];
  if (!dims.every((value) => Number(value) > 0)) missing.push("room-dimensions");
  if (!rspPosition
    || !Number.isFinite(Number(rspPosition.x))
    || !Number.isFinite(Number(rspPosition.y))) missing.push("reference-listening-position");
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) missing.push("seating");
  const subCount = Array.isArray(sources) ? sources.length : 0;
  if (subCount === 0) missing.push("subwoofers");
  // Unresolved / empty subwoofer capability: the capability list is built one
  // entry per subwoofer, so a count mismatch means a sub resolved to no model.
  if (subCount > 0 && (!Array.isArray(productCapabilities) || productCapabilities.length !== subCount)) {
    missing.push("subwoofer-capability");
  }
  if (!Number.isFinite(Number(usableLfHz))) missing.push("usable-lf-limit");
  if (!Number.isFinite(Number(optimisationTransitionHz))) missing.push("transition-frequency");
  if (!requested?.p14TargetBasis
    || !Number.isFinite(Number(requested?.selectedP14TargetDb))
    || !Number.isFinite(Number(requested?.requestedLevel))) missing.push("p14-target-selection");
  if (!targetKey) missing.push("p14-target-key");

  return {
    ready: missing.length === 0,
    missing,
    reason: missing.length === 0 ? null : `identity-inputs-not-ready:${missing.join(",")}`,
  };
}

// ── 2. Identity ────────────────────────────────────────────────────────────

export function buildBassIdentity({
  fingerprints = null,
  cacheKey = null,
  baseDesignFingerprint = null,
  requested = null,
  targetKey = null,
  optimiserVersions = null,
} = {}) {
  return {
    reconciliationVersion: RECONCILIATION_VERSION,
    // The full result fingerprint — the sole identity a saved contract carries.
    cacheKey: cacheKey || null,
    calibrationFingerprint: fingerprints?.calibration ?? null,
    geometryFingerprint: fingerprints?.geometry ?? null,
    productFingerprint: fingerprints?.product ?? null,
    baseDesignFingerprint: baseDesignFingerprint ?? null,
    selectedTarget: {
      targetKey: targetKey || null,
      basis: requested?.p14TargetBasis ?? null,
      level: requested?.requestedLevel ?? null,
      targetDb: round(requested?.selectedP14TargetDb, 2),
      requiredExtensionHz: requested?.selectedP14RequiredExtensionHz ?? null,
    },
    schema: {
      instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
      contractVersion: BASS_ANALYSIS_CONTRACT_VERSION,
      completedCacheVersion: COMPLETED_BASS_CACHE_VERSION,
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      ...(optimiserVersions || {}),
    },
  };
}

// ── 3. Fingerprint-input digest ────────────────────────────────────────────
//
// A named, rounded copy of the identity inputs. Stored alongside the bank so a
// future mismatch can name what moved instead of only saying "out of date".
// This is a diagnostic record, never an authority: the fingerprints remain the
// only identity used for matching.
export function buildFingerprintInputDigest(fingerprintInputs, requested = null) {
  const i = fingerprintInputs || {};
  const sources = Array.isArray(i.sources)
    ? i.sources
    : (Array.isArray(i.subsForSimulation) ? i.subsForSimulation : []);
  const seats = Array.isArray(i.seatingPositions) ? i.seatingPositions : [];
  const capabilities = Array.isArray(i.productCapabilities) ? i.productCapabilities : [];

  return {
    room: {
      widthM: round(i.roomDims?.widthM, 3),
      lengthM: round(i.roomDims?.lengthM, 3),
      heightM: round(i.roomDims?.heightM, 3),
    },
    rsp: i.rspPosition
      ? {
          x: round(i.rspPosition.x, 3),
          y: round(i.rspPosition.y, 3),
          z: round(i.rspPosition.z, 3),
          designatedRspSeatId: i.rspPosition.designatedRspSeatId ?? null,
        }
      : null,
    seatCount: seats.length,
    seats: seats.slice().sort(byId).map((seat) => ({
      id: seat?.id ?? null,
      x: round(seat?.x, 3),
      y: round(seat?.y, 3),
      z: round(seat?.z, 3),
    })),
    subCount: sources.length,
    subModels: sources.map((sub) => sub?.modelKey ?? null).sort(),
    subs: sources.slice().sort(byId).map((sub) => ({
      id: sub?.id ?? null,
      x: round(sub?.x, 3),
      y: round(sub?.y, 3),
      z: round(sub?.z, 3),
      rotationDeg: round(sub?.rotationDeg ?? sub?.rotation_deg ?? sub?.rotation, 2),
      gainDb: round(sub?.tuning?.gainDb, 2),
      delayMs: round(sub?.tuning?.delayMs, 2),
      polarity: sub?.tuning?.polarity ?? 0,
    })),
    productCapability: {
      count: capabilities.length,
      usableLfHz: round(i.usableLfHz, 2),
      dataVersion: i.productDataVersion ?? null,
    },
    absorption: {
      front: round(i.surfaceAbsorption?.front, 3),
      back: round(i.surfaceAbsorption?.back, 3),
      left: round(i.surfaceAbsorption?.left, 3),
      right: round(i.surfaceAbsorption?.right, 3),
      ceiling: round(i.surfaceAbsorption?.ceiling, 3),
      floor: round(i.surfaceAbsorption?.floor, 3),
    },
    roomDamping: round(i.roomDamping, 2),
    axialQ: round(i.axialQ, 3),
    transitionHz: round(i.optimisationTransitionHz, 2),
    houseCurve: i.houseCurveFingerprint || null,
    assessmentStartHz: round(i.assessmentStartHz, 2),
    assessmentEndHz: round(i.assessmentEndHz, 2),
    activeFitProfile: i.activeFitProfile ?? null,
    splConfig: {
      globalPowerW: round(i.splConfig?.globalPowerW, 1),
      globalEqHeadroomDb: round(i.splConfig?.globalEqHeadroomDb, 2),
      radiationMode: i.splConfig?.radiationMode ?? null,
    },
    p14Target: {
      basis: requested?.p14TargetBasis ?? i.p14TargetBasis ?? null,
      level: requested?.requestedLevel ?? i.p14TargetLevel ?? null,
      targetDb: round(requested?.selectedP14TargetDb ?? i.selectedP14TargetDb, 2),
    },
  };
}

const FIELD_LABELS = {
  room: "room dimensions",
  rsp: "reference listening position",
  seatCount: "seat count",
  seats: "seating layout",
  subCount: "subwoofer count",
  subModels: "subwoofer models",
  subs: "subwoofer layout (position / height / orientation / gain / delay / polarity)",
  productCapability: "subwoofer capability",
  absorption: "surface absorption",
  roomDamping: "room damping",
  axialQ: "axial Q",
  transitionHz: "transition frequency",
  houseCurve: "house curve",
  assessmentStartHz: "assessment band start",
  assessmentEndHz: "assessment band end",
  activeFitProfile: "EQ fit profile",
  splConfig: "SPL configuration",
  p14Target: "bass target selection",
};

function describeEntryChange(key, before, after) {
  if (key !== "subs" && key !== "seats") return null;
  const previous = Array.isArray(before) ? before : [];
  const next = Array.isArray(after) ? after : [];
  const changed = next.filter((entry) => {
    const match = previous.find((candidate) => candidate?.id === entry?.id);
    return !match || JSON.stringify(match) !== JSON.stringify(entry);
  });
  const removed = previous.filter((entry) => !next.some((candidate) => candidate?.id === entry?.id));
  const noun = key === "subs" ? "subwoofer" : "seat";
  const parts = [];
  if (changed.length) parts.push(`${changed.map((entry) => entry?.id || "unidentified").join(", ")} changed or added`);
  if (removed.length) parts.push(`${removed.map((entry) => entry?.id || "unidentified").join(", ")} removed`);
  return parts.length ? `${noun}: ${parts.join("; ")}` : null;
}

/**
 * Which identity inputs differ between two digests, in plain language.
 * Returns an empty array when either digest is unavailable.
 */
export function describeFingerprintDifferences(liveDigest, storedDigest, { limit = 6 } = {}) {
  if (!liveDigest || !storedDigest) return [];
  const differences = [];
  for (const key of Object.keys(liveDigest)) {
    const after = liveDigest[key];
    const before = storedDigest[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    differences.push({
      key,
      label: FIELD_LABELS[key] || key,
      before: before ?? null,
      after: after ?? null,
      detail: describeEntryChange(key, before, after),
    });
    if (differences.length >= limit) break;
  }
  return differences;
}

// ── 4. Saved-contract lookup ───────────────────────────────────────────────

/**
 * Find the saved contract for one exact result fingerprint.
 *
 * Order: completed_by_fingerprint first (that map is the row's own snapshot
 * list), then every entry of the P14 target bank regardless of target key. The
 * bank is scanned without a base-design gate on purpose: the contract's own
 * fingerprint is the proof, and a base-design gate here is what let a valid
 * saved contract stay invisible.
 */
export function findSavedContractForFingerprint({ completedByFingerprint = null, bankTargets = null, fingerprint = null } = {}) {
  if (!fingerprint) return { contract: null, source: null, targetKey: null };
  const completed = completedByFingerprint?.[fingerprint];
  if (completed) {
    return { contract: completed, source: IDENTITY_MATCH_SOURCE.COMPLETED, targetKey: null };
  }
  for (const [targetKey, entry] of Object.entries(bankTargets || {})) {
    if (entry?.job?.resultFingerprint === fingerprint) {
      return { contract: entry, source: IDENTITY_MATCH_SOURCE.BANK, targetKey };
    }
  }
  return { contract: null, source: null, targetKey: null };
}

/** Read the P14 target bank (and its stored digests) out of a cache record. */
export function parseTargetCacheBank(targetCacheValue) {
  let stored = targetCacheValue;
  if (typeof stored === "string") {
    try {
      stored = JSON.parse(stored);
    } catch (error) {
      stored = null;
    }
  }
  return {
    baseDesignFingerprint: stored?.baseDesignFingerprint || null,
    targets: stored && typeof stored.targets === "object" && stored.targets ? stored.targets : {},
    fingerprintDigests: stored && typeof stored.fingerprintDigests === "object" && stored.fingerprintDigests
      ? stored.fingerprintDigests
      : {},
  };
}