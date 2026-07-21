// bassAnalysisFingerprints.js — Phase 1B: Deterministic bass analysis fingerprints.
//
// Three pure, synchronous, browser/worker-safe fingerprint helpers:
//   computeGeometryFingerprint(inputs)    — physical room/listener/source geometry
//   computeProductFingerprint(inputs)     — geometry + subwoofer model/capability/output
//   computeCalibrationFingerprint(inputs) — product + house curve/EQ limits/assessment band
//
// Design rules:
//   - Deterministic: stable canonical serialization (sorted keys) + FNV-1a hash.
//   - Independent of JavaScript object key insertion order.
//   - Numeric inputs are rounded to absorb harmless floating-point noise.
//   - No external dependencies. No raw JSON.stringify without sorted keys.
//   - Every result carries a version prefix: "geo:v1:hash", "prod:v1:hash", "cal:v1:hash".
//   - NaN, Infinity, and non-serializable values are coerced to null before hashing.

export const FINGERPRINT_VERSION = 1;

// ---------------------------------------------------------------------------
// 1. Stable serialization primitives
// ---------------------------------------------------------------------------

// Rounds to `decimals` places to absorb floating-point noise. Returns null
// for non-finite values so NaN/Infinity never enter the canonical form.
function num(v, decimals = 6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// Recursively serializes a value with sorted object keys, producing a
// deterministic string independent of key insertion order. Non-finite
// numbers become "null"; functions/undefined become "null".
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
    return "{" + parts.join(",") + "}";
  }
  // functions, symbols, etc.
  return "null";
}

// FNV-1a 32-bit hash with configurable offset basis (seed). No external
// dependencies. Works in browser and worker. Two independently seeded 32-bit
// hashes are combined into a 16-character hexadecimal result (64-bit).
function fnv1a32Seeded(str, offsetBasis) {
  let hash = offsetBasis;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// 64-bit fingerprint: two independently seeded FNV-1a 32-bit hashes combined.
// Seed A = standard FNV-1a offset basis (0x811c9dc5).
// Seed B = independent offset basis (0x40007a67) — different seed, same prime.
// Produces a 16-character hex string. Deterministic, synchronous, no deps.
function fingerprint64(canonical) {
  const str = stableStringify(canonical);
  const hashA = fnv1a32Seeded(str, 0x811c9dc5);
  const hashB = fnv1a32Seeded(str, 0x40007a67);
  return hashA + hashB;
}

function fingerprint(canonical, prefix) {
  return `${prefix}:v${FINGERPRINT_VERSION}:${fingerprint64(canonical)}`;
}

// ---------------------------------------------------------------------------
// 2. Shared normalizers
// ---------------------------------------------------------------------------

// Sort an array by stable `id` so array order does not affect the fingerprint
// when IDs identify the same physical items.
function sortById(arr) {
  return arr.slice().sort((a, b) => {
    const aId = a.id || "";
    const bId = b.id || "";
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

// Geometry-only source fields: position, height, relative tuning. NO model.
function normalizeSourceGeometry(s) {
  return {
    id: s?.id || null,
    x: num(s?.x),
    y: num(s?.y),
    z: num(s?.z),
    gainDb: num(s?.tuning?.gainDb),
    delayMs: num(s?.tuning?.delayMs, 3),
    polarity: s?.tuning?.polarity ?? 0,
  };
}

function normalizeSeat(s) {
  return {
    id: s?.id || `${num(s?.x)}-${num(s?.y)}`,
    x: num(s?.x),
    y: num(s?.y),
    z: num(s?.z),
  };
}

// Accept either `sources` (new) or `subsForSimulation` (legacy alias).
function resolveSources(inputs) {
  if (Array.isArray(inputs.sources)) return inputs.sources;
  if (Array.isArray(inputs.subsForSimulation)) return inputs.subsForSimulation;
  return [];
}

// ---------------------------------------------------------------------------
// 3. Geometry fingerprint
// ---------------------------------------------------------------------------

// Every input that physically changes normalized room response. Excludes:
//   subwoofer product/model, product capability, requested SPL/output,
//   priority mode, graph smoothing/scale, overlay/diagnostics visibility,
//   and open/closed panel state.
export function computeGeometryFingerprint(inputs) {
  const i = inputs || {};

  const sources = sortById(resolveSources(i).map(normalizeSourceGeometry));
  const seats = sortById((Array.isArray(i.seatingPositions) ? i.seatingPositions : []).map(normalizeSeat));

  const canonical = {
    room: {
      w: num(i.roomDims?.widthM),
      l: num(i.roomDims?.lengthM),
      h: num(i.roomDims?.heightM),
    },
    rsp: i.rspPosition
      ? { x: num(i.rspPosition.x), y: num(i.rspPosition.y), z: num(i.rspPosition.z) }
      : null,
    sources,
    sourceCount: sources.length,
    seats,
    absorption: {
      front: num(i.surfaceAbsorption?.front, 4),
      back: num(i.surfaceAbsorption?.back, 4),
      left: num(i.surfaceAbsorption?.left, 4),
      right: num(i.surfaceAbsorption?.right, 4),
      ceiling: num(i.surfaceAbsorption?.ceiling, 4),
      floor: num(i.surfaceAbsorption?.floor, 4),
    },
    roomDamping: num(i.roomDamping, 2),
    axialQ: num(i.axialQ, 3),
    modalSourceReferenceMode: i.modalSourceReferenceMode || null,
    modalGainScalar: num(i.modalGainScalar, 4),
    modalDistanceBlend: num(i.modalDistanceBlend, 4),
    modalStorageMode: i.modalStorageMode || null,
    propagationPhaseScale: num(i.propagationPhaseScale, 4),
    enableRewCoreReflections: !!i.enableRewCoreReflections,
    rewSourceCurveMode: i.rewSourceCurveMode || null,
    qStrategy: i.qStrategy || null,
    rewModalBandwidthScale: num(i.rewModalBandwidthScale, 4),
    disableReflectionPhaseJitter: !!i.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: !!i.disableReflectionCoherenceWeight,
    disableLateField: !!i.disableLateField,
    disableModalPropagationPhase: !!i.disableModalPropagationPhase,
    mute68HzAxialMode: !!i.mute68HzAxialMode,
    debugDisableModalContribution: !!i.debugDisableModalContribution,
    rewParityFieldMode: i.rewParityFieldMode || null,
    overrideConstantAxialQ: !!i.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: !!i.overrideAbsorptionAxialQ,
    debugMode200Multiplier: num(i.debugMode200Multiplier, 4),
    debugModalPhaseConvention: i.debugModalPhaseConvention || null,
    reflectionGainScale: num(i.reflectionGainScale, 4),
    debugModalHSign: i.debugModalHSign || null,
    rewParityModalMagnitudeScale: num(i.rewParityModalMagnitudeScale, 4),
    modalCoherenceMode: i.modalCoherenceMode || null,
    highOrderAxialScale: num(i.highOrderAxialScale, 4),
  };

  return fingerprint(canonical, "geo");
}

// ---------------------------------------------------------------------------
// 4. Product fingerprint
// ---------------------------------------------------------------------------

// Geometry fingerprint + subwoofer model(s), quantity, product-specific
// capability/tuning inputs, and requested output. Excludes priority mode,
// graph display settings, and diagnostics visibility.
export function computeProductFingerprint(inputs) {
  const i = inputs || {};
  const geometryFp = computeGeometryFingerprint(i);

  const rawSources = resolveSources(i);
  const models = rawSources
    .map((s) => s?.modelKey || null)
    .filter((m) => m != null)
    .sort();

  const canonical = {
    geometry: geometryFp,
    models,
    quantity: rawSources.length,
    splConfig: {
      globalPowerW: num(i.splConfig?.globalPowerW, 1),
      globalEqHeadroomDb: num(i.splConfig?.globalEqHeadroomDb, 2),
      radiationMode: i.splConfig?.radiationMode || "half_space",
    },
    requestedOutputDb: num(i.requestedOutputDb, 2),
  };

  return fingerprint(canonical, "prod");
}

// ---------------------------------------------------------------------------
// 5. House-curve fingerprint
// ---------------------------------------------------------------------------

// Hash the actual house-curve points (frequency + offsetDb pairs) so the
// fingerprint truthfully identifies the live curve definition. A version
// label alone does not guarantee the points haven't changed.
export function computeHouseCurveFingerprint(houseCurvePoints) {
  const points = Array.isArray(houseCurvePoints) ? houseCurvePoints : [];
  const canonical = points.map((p) => ({
    f: num(p?.frequency ?? p?.f, 3),
    db: num(p?.offsetDb ?? p?.db ?? p?.spl, 4),
  }));
  return fingerprint({ points: canonical }, "hcurve");
}

// ---------------------------------------------------------------------------
// 6. Calibration fingerprint
// ---------------------------------------------------------------------------

// Product fingerprint + house-curve fingerprint, EQ cut/boost constraints
// (from the active fit profile config), assessment start/end frequencies,
// target anchor/reference level, active fitting profile, requested output,
// and usable LF limit. Excludes selected priority mode, graph smoothing/
// scale, and diagnostics visibility.
//
// Phase 2A: Uses live values from the selected candidate when available.
// Falls back to current requested configuration when no candidate exists.
export function computeCalibrationFingerprint(inputs) {
  const i = inputs || {};
  const productFp = computeProductFingerprint(i);

  const canonical = {
    product: productFp,
    houseCurveFingerprint: i.houseCurveFingerprint || null,
    eqConstraints: {
      maxBoostDb: num(i.eqConstraints?.maxBoostDb, 2),
      maxCutDb: num(i.eqConstraints?.maxCutDb, 2),
      maxPerFilterBoostDb: num(i.eqConstraints?.maxPerFilterBoostDb, 2),
      maxPerFilterCutDb: num(i.eqConstraints?.maxPerFilterCutDb, 2),
    },
    assessmentStartHz: num(i.assessmentStartHz, 3),
    assessmentEndHz: num(i.assessmentEndHz, 3),
    optimisationTransitionHz: num(i.optimisationTransitionHz, 3),
    targetAnchorDb: num(i.targetAnchorDb, 2),
    activeFitProfile: i.activeFitProfile || null,
    requestedOutputDb: num(i.requestedOutputDb, 2),
    usableLfHz: num(i.usableLfHz, 3),
  };

  return fingerprint(canonical, "cal");
}

// ---------------------------------------------------------------------------
// 7. Validation helper (for fixtures and future consumers)
// ---------------------------------------------------------------------------

// Returns true if a fingerprint string is well-formed: non-empty string with
// a version prefix and a 16-character hex hash suffix (64-bit). Does not decode
// the hash. Accepts 8-char (legacy 32-bit) hashes for backward compatibility
// with Phase 1B fixture test strings.
export function isValidFingerprint(fp) {
  if (typeof fp !== "string" || fp.length === 0) return false;
  const parts = fp.split(":");
  if (parts.length < 3) return false;
  if (!["geo", "prod", "cal"].includes(parts[0])) return false;
  if (!parts[1].startsWith("v")) return false;
  const hash = parts[parts.length - 1];
  if (!/^[0-9a-f]+$/.test(hash)) return false;
  // Accept 16-char (64-bit) or 8-char (legacy 32-bit) hashes.
  if (hash.length !== 16 && hash.length !== 8) return false;
  return true;
}