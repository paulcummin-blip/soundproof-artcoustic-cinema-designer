// bassIdentityDiagnostics.js
// --------------------------
// Read-only observability for the bass identity that proves WHY a reopened
// design is marked stale. It captures the EXACT canonical object hashed by
// computeCalibrationFingerprint at two points:
//
//   BASS_PUBLISHED  — immediately after a bass result publishes successfully
//   BASS_REOPENED   — after the Room Designer has fully hydrated the same
//                     version and reconstructed the bass authority
//
// When both captures exist for the same (project, version), it produces a
// deterministic field-by-field diff and classifies the first differing field.
//
// HARD RULES (enforced by construction):
//   · It never changes bass maths, fingerprint exclusions, grading or the
//     published authority. It only reads and stores copies.
//   · It never puts timestamps, current time, session ids or diagnostic ids
//     into the acoustic identity — those live only in capture metadata.
//   · It never mutates the design or the fingerprint inputs.
//   · The PUBLISHED capture is persisted to localStorage so it survives a
//     close/reopen; the REOPENED capture is also persisted for inspection.
//     Large, identity-irrelevant fields (productCapabilities response curves)
//     are slimmed for persistence to stay within quota — their fieldDigest still
//     catches any difference.
//
// This module is pure observability. Nothing it writes is read by the bass
// engine, reconciliation, reports or proposals.

import {
  buildCanonicalBassIdentity,
  buildCanonicalFieldDigests,
} from "./bassAnalysisFingerprints";

export const BASS_IDENTITY_STAGE = Object.freeze({
  PUBLISHED: "BASS_PUBLISHED",
  REOPENED: "BASS_REOPENED",
});

const STORAGE_KEY = "sp-bass-identity-diag-v1";
const scopeKey = (projectId, versionId) =>
  `${String(projectId || "free")}::${String(versionId || "free")}`;

const listeners = new Set();
const captures = new Map(); // key -> { published?, reopened? }
let persisted = loadPersisted();
// Snapshot cache for useSyncExternalStore. getSnapshot MUST return a stable
// reference while the store is unchanged, or React detects a change on every
// render and enters an infinite update loop. `snapshotVersion` bumps on every
// mutation; getSnapshot rebuilds `cachedSnapshot` only when the version moves.
let snapshotVersion = 0;
let cachedSnapshot = null;
let cachedSnapshotVersion = -1;

function loadPersisted() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function savePersisted() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Quota or serialization failure — diagnostics must never break the app.
  }
}

function notify() {
  snapshotVersion += 1;
  listeners.forEach((listener) => listener());
}

// Slim a canonical identity for localStorage persistence. Drops the large
// productCapabilities response curves (identity-irrelevant; models are already
// captured in product.models) and replaces combinedResponse with a compact
// signature. The full canonical is kept in-memory for same-session deep diffs.
function slimForPersistence(canonicalIdentity) {
  if (!canonicalIdentity) return null;
  const product = canonicalIdentity.product;
  const slimmedProduct = product
    ? {
        ...product,
        productCapabilities: Array.isArray(product.productCapabilities)
          ? {
              count: product.productCapabilities.length,
              modelKeys: product.productCapabilities.map((c) => c?.modelKey ?? null),
            }
          : (product.productCapabilities ?? null),
      }
    : null;
  const calibration = canonicalIdentity.calibration;
  const slimmedCalibration = calibration
    ? {
        ...calibration,
        combinedResponse: calibration.combinedResponse
          ? `combined:${JSON.stringify(calibration.combinedResponse).length}`
          : (calibration.combinedResponse ?? null),
      }
    : null;
  return {
    geometry: canonicalIdentity.geometry,
    product: slimmedProduct,
    calibration: slimmedCalibration,
  };
}

function buildRecord({ stage, fingerprintInputs, fingerprints, requested }) {
  if (!fingerprintInputs) return null;
  const identity = buildCanonicalBassIdentity(fingerprintInputs, fingerprints);
  const fieldDigests = buildCanonicalFieldDigests(identity);
  return {
    stage,
    fingerprint: identity.fingerprints.calibration || null,
    fingerprints: identity.fingerprints,
    canonicalIdentity: identity,
    slimCanonical: slimForPersistence(identity),
    fieldDigests,
    requested: requested
      ? {
          p14TargetBasis: requested.p14TargetBasis ?? null,
          requestedLevel: requested.requestedLevel ?? null,
          selectedP14TargetDb: requested.selectedP14TargetDb ?? null,
          p18TargetBasis: requested.p18TargetBasis ?? null,
        }
      : null,
    capturedAtMs: Date.now(),
  };
}

/**
 * Capture a bass identity snapshot. Observability only — never throws.
 * @returns {object|null} the stored record, or null when inputs are missing.
 */
export function captureBassIdentity({
  projectId,
  versionId,
  stage,
  fingerprintInputs,
  fingerprints = null,
  requested = null,
}) {
  if (!projectId || !versionId || projectId === "free" || versionId === "free") return null;
  if (stage !== BASS_IDENTITY_STAGE.PUBLISHED && stage !== BASS_IDENTITY_STAGE.REOPENED) return null;
  const record = buildRecord({ stage, fingerprintInputs, fingerprints, requested });
  if (!record) return null;

  const key = scopeKey(projectId, versionId);
  const entry = captures.get(key) || {};
  const existing = stage === BASS_IDENTITY_STAGE.PUBLISHED ? entry.published : entry.reopened;
  // Idempotent: skip when the fingerprint is unchanged since the last capture of
  // this stage. Avoids redundant localStorage writes on every eligible render
  // (the identity is stable across re-renders for an unchanged design).
  if (existing && existing.fingerprint === record.fingerprint) {
    return existing;
  }
  if (stage === BASS_IDENTITY_STAGE.PUBLISHED) entry.published = record;
  else entry.reopened = record;
  captures.set(key, entry);

  // Persist (slimmed) so PUBLISHED survives close/reopen.
  const persistedEntry = persisted[key] || {};
  if (stage === BASS_IDENTITY_STAGE.PUBLISHED) {
    persistedEntry.published = slimRecordForPersistence(record);
  } else {
    persistedEntry.reopened = slimRecordForPersistence(record);
  }
  persisted[key] = persistedEntry;
  savePersisted();

  if (typeof window !== "undefined") {
    window.__SP_BASS_IDENTITY_DIAGNOSTICS__ = {
      scope: key,
      stage,
      fingerprint: record.fingerprint,
      key,
    };
  }
  notify();
  return record;
}

function slimRecordForPersistence(record) {
  if (!record) return null;
  return {
    stage: record.stage,
    fingerprint: record.fingerprint,
    fingerprints: record.fingerprints,
    canonicalIdentity: record.slimCanonical,
    fieldDigests: record.fieldDigests,
    requested: record.requested,
    capturedAtMs: record.capturedAtMs,
  };
}

/** Read one stage capture for a project version (memory first, then persisted). */
export function getBassIdentityCapture(projectId, versionId, stage) {
  const key = scopeKey(projectId, versionId);
  const entry = captures.get(key) || persisted[key] || {};
  if (stage === BASS_IDENTITY_STAGE.PUBLISHED) return entry.published || null;
  if (stage === BASS_IDENTITY_STAGE.REOPENED) return entry.reopened || null;
  return entry || null;
}

// ── Deep first-diff ──────────────────────────────────────────────────────
// Walks the two canonical trees in stable key order and returns the first
// leaf path that differs. Arrays are compared by index (the canonical already
// sorts sources/seats/models/evaluatedProfiles deterministically).
function deepFirstDiff(a, b, basePath = []) {
  if (a === b) return null;
  if (typeof a !== typeof b) return { path: basePath, published: a, reopened: b };
  if (a == null || b == null) return { path: basePath, published: a, reopened: b };
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const d = deepFirstDiff(a[i], b[i], [...basePath, i]);
      if (d) return d;
    }
    return null;
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
    for (const k of keys) {
      const d = deepFirstDiff(a[k], b[k], [...basePath, k]);
      if (d) return d;
    }
    return null;
  }
  return { path: basePath, published: a, reopened: b };
}

// Fields whose value comes from component-local useState defaults inside
// useAuthoritativeBassResponse and is NOT persisted in the design. A diff on
// one of these paths is the prime HYDRATION_DEFAULT suspect.
const HYDRATION_DEFAULT_PATHS = new Set([
  "geometry.roomDamping", "geometry.axialQ", "geometry.modalGainScalar",
  "geometry.modalDistanceBlend", "geometry.propagationPhaseScale",
  "geometry.enableRewCoreReflections", "geometry.rewSourceCurveMode",
  "geometry.qStrategy", "geometry.rewModalBandwidthScale",
  "geometry.disableReflectionPhaseJitter", "geometry.disableReflectionCoherenceWeight",
  "geometry.disableLateField", "geometry.disableModalPropagationPhase",
  "geometry.mute68HzAxialMode", "geometry.debugDisableModalContribution",
  "geometry.rewParityFieldMode", "geometry.abApplyModeMultiplicity",
  "geometry.roomIsSealed", "geometry.abMidbandQScale", "geometry.abGlobalQScale",
  "geometry.modeGenerationFMaxHz", "geometry.overrideConstantAxialQ",
  "geometry.overrideAbsorptionAxialQ", "geometry.debugMode200Multiplier",
  "geometry.debugModalPhaseConvention", "geometry.reflectionGainScale",
  "geometry.debugModalHSign", "geometry.rewParityModalMagnitudeScale",
  "geometry.modalCoherenceMode", "geometry.highOrderAxialScale",
  "geometry.modalSourceReferenceMode", "geometry.modalStorageMode",
  "calibration.activeFitProfile",
]);

function classifyDifference(path, published, reopened) {
  const pathStr = path.join(".");
  const lastKey = path[path.length - 1];
  if (published == null || reopened == null) return "NULL_UNDEFINED";
  if (lastKey === "id" || /Id$/.test(String(lastKey || "")) || lastKey === "designatedRspSeatId") {
    return "GENERATED_ID";
  }
  if (typeof published === "number" && typeof reopened === "number") {
    const delta = Math.abs(published - reopened);
    if (delta > 0 && delta < 0.01) return "NUMERIC_PRECISION";
  }
  if (Array.isArray(published) && Array.isArray(reopened)) {
    const sa = JSON.stringify([...published].sort((x, y) => String(x).localeCompare(String(y))));
    const sb = JSON.stringify([...reopened].sort((x, y) => String(x).localeCompare(String(y))));
    if (sa === sb) return "ORDERING";
  }
  if (/version|Version|schema|Schema/.test(String(lastKey || ""))) return "VERSION_STAMP";
  if (HYDRATION_DEFAULT_PATHS.has(pathStr)) return "HYDRATION_DEFAULT";
  if (
    pathStr.startsWith("geometry.room") ||
    pathStr.startsWith("geometry.rsp") ||
    pathStr.startsWith("geometry.seats") ||
    pathStr.startsWith("geometry.sources") ||
    pathStr.startsWith("geometry.absorption")
  ) {
    return "REAL_ACOUSTIC_CHANGE";
  }
  if (
    pathStr.startsWith("calibration.p14Identity") ||
    pathStr.startsWith("calibration.eqConstraints") ||
    pathStr.startsWith("calibration.houseCurveFingerprint") ||
    pathStr.startsWith("calibration.usableLfHz") ||
    pathStr.startsWith("calibration.assessmentStartHz") ||
    pathStr.startsWith("calibration.assessmentEndHz") ||
    pathStr.startsWith("calibration.optimisationTransitionHz") ||
    pathStr.startsWith("product.models") ||
    pathStr.startsWith("product.quantity") ||
    pathStr.startsWith("product.productDataVersion") ||
    pathStr.startsWith("product.productCapabilities") ||
    pathStr.startsWith("product.splConfig")
  ) {
    return "REAL_ACOUSTIC_CHANGE";
  }
  return "OTHER";
}

/**
 * Produce the deterministic before/after diff for a project version.
 * Uses the full canonical when both captures are in memory; otherwise uses the
 * persisted slim canonical (still sufficient to localize the first differing
 * field — productCapabilities is the only field slimmed, and its fieldDigest
 * is preserved).
 */
export function diffBassIdentityCaptures(projectId, versionId) {
  const published = getBassIdentityCapture(projectId, versionId, BASS_IDENTITY_STAGE.PUBLISHED);
  const reopened = getBassIdentityCapture(projectId, versionId, BASS_IDENTITY_STAGE.REOPENED);
  if (!published || !reopened) {
    return {
      ready: false,
      reason: !published ? "missing-published" : "missing-reopened",
      publishedFingerprint: published?.fingerprint || null,
      reopenedFingerprint: reopened?.fingerprint || null,
    };
  }
  const fingerprintsEqual = published.fingerprint === reopened.fingerprint;
  const pubCanonical = published.canonicalIdentity;
  const reCanonical = reopened.canonicalIdentity;
  const firstRaw = deepFirstDiff(pubCanonical, reCanonical, []);
  const firstDiff = firstRaw
    ? {
        path: firstRaw.path.join("."),
        published: firstRaw.published,
        reopened: firstRaw.reopened,
        differenceType: classifyDifference(firstRaw.path, firstRaw.published, firstRaw.reopened),
      }
    : null;

  const fieldDigestDiffs = [];
  const stages = ["geometry", "product", "calibration"];
  for (const stage of stages) {
    const pubDigest = published.fieldDigests?.[stage] || {};
    const reDigest = reopened.fieldDigests?.[stage] || {};
    const keys = Array.from(new Set([...Object.keys(pubDigest), ...Object.keys(reDigest)])).sort();
    for (const k of keys) {
      if (pubDigest[k] !== reDigest[k]) {
        fieldDigestDiffs.push({
          stage,
          field: k,
          publishedDigest: pubDigest[k] ?? null,
          reopenedDigest: reDigest[k] ?? null,
        });
      }
    }
  }

  return {
    ready: true,
    fingerprintsEqual,
    publishedFingerprint: published.fingerprint,
    reopenedFingerprint: reopened.fingerprint,
    firstDiff,
    fieldDigestDiffs,
    publishedAtMs: published.capturedAtMs || null,
    reopenedAtMs: reopened.capturedAtMs || null,
  };
}

// ── React binding ───────────────────────────────────────────────────────
export function subscribeBassIdentityDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBassIdentityDiagnosticsSnapshot() {
  if (cachedSnapshotVersion !== snapshotVersion) {
    cachedSnapshotVersion = snapshotVersion;
    cachedSnapshot = {};
    for (const [key, entry] of captures) cachedSnapshot[key] = entry;
  }
  return cachedSnapshot;
}

/** Test-only: forget every capture (memory + persisted). */
export function _resetBassIdentityDiagnosticsForTest() {
  captures.clear();
  persisted = {};
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

// Expose a console helper for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__SP_BASS_IDENTITY_DIFF__ = (projectId, versionId) =>
    diffBassIdentityCaptures(projectId, versionId);
}