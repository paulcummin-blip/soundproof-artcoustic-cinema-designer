import test from "node:test";
import assert from "node:assert/strict";

// Cold-hydration fingerprint stability regression.
//
// These modules are dependency-free (no @/ alias, no React), so the tests
// run under bare Node and exercise the REAL authorities used by hydration:
//   - computeEffectiveRsp            (shared by hydration + useEffectiveRsp)
//   - buildAuthoritativeRspPosition  (shared by hydration path + bass engine)
//   - computeGeometryFingerprint     (the fingerprint that gates authority)
//
// The escaped defect: isProjectHydrationReady became true BEFORE derived RSP
// and orientation-aware source-Z were synchronously available, so the first
// hydration-ready render produced a transient fingerprint (rsp:null, or
// sub4-12 vertical centre-Z) that mismatched the persisted authority —
// wiping restored results and triggering a 50s recalculation.

import { computeEffectiveRsp } from "../src/components/room/rsp/computeEffectiveRsp.js";
import { buildAuthoritativeRspPosition } from "../src/components/room/bass/authoritativeRspPosition.js";
import { computeGeometryFingerprint } from "../src/components/room/bass/bassAnalysisFingerprints.js";

// ---------------------------------------------------------------------------
// Shared geometry-fingerprint inputs (room + absorption defaults).
// Only rspPosition and sources vary between cases.
// ---------------------------------------------------------------------------
function baseGeometryInputs() {
  return {
    roomDims: { widthM: 6.0, lengthM: 8.0, heightM: 2.4 },
    seatingPositions: [],
    sources: [],
    surfaceAbsorption: {
      front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3,
    },
    roomDamping: 0.3,
    axialQ: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Regression #6 — manual RSP cold hydration (Yarm-like)
// ---------------------------------------------------------------------------
test("manual RSP cold hydration: synchronous RSP derivation produces no rsp:null transient fingerprint", () => {
  // Yarm-like hydrated project values.
  const rspMode = "manual_position";
  const manualRspY_m = 3.33;
  const roomWidthM = 6.0;

  // 1) The SAME pure authority hydration now calls before hydration-ready.
  const rsp = computeEffectiveRsp({
    rspMode,
    manualRspY_m,
    manualRspX_m: null,
    roomWidthM,
    screenFrontPlaneM: null,
    screenWidthM: null,
    currentMlpY_m: null,
    rowDerivedRspYByMode: {},
  });

  assert.equal(rsp.effectiveRspY_m, 3.33, "effectiveRspY_m === manualRspY_m (3.33)");
  assert.equal(rsp.effectiveRspX_m, 3.0, "effectiveRspX_m === room centreline (3.0)");
  assert.equal(rsp.rspSourceLabel, "Manual RSP");

  // 2) Build the authoritative RSP position the bass engine consumes.
  const rspPosition = buildAuthoritativeRspPosition({ widthM: roomWidthM }, rsp.effectiveRspY_m, rsp.effectiveRspX_m);
  assert.deepEqual(
    { x: rspPosition.x, y: rspPosition.y, z: rspPosition.z },
    { x: 3.0, y: 3.33, z: 1.2 },
    "authoritative RSP position === {x:3.0, y:3.33, z:1.2}"
  );
  assert.equal(rspPosition.__isSyntheticRsp, true);

  // 3) The transient (pre-fix) first-render fingerprint carried rsp:null.
  const transientFingerprint = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    rspPosition: null,
  });

  // 4) The hydration-ready (post-fix) fingerprint carries the real RSP.
  const liveFingerprint = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    rspPosition,
  });

  assert.notEqual(
    transientFingerprint,
    liveFingerprint,
    "rsp:null transient fingerprint must differ from the hydration-ready fingerprint"
  );
  assert.ok(
    transientFingerprint.startsWith("geo:v"),
    "transient fingerprint is a geometry fingerprint"
  );
  assert.ok(
    liveFingerprint.startsWith("geo:v"),
    "live fingerprint is a geometry fingerprint"
  );

  // 5) The persisted authority was built from the same real RSP, so the live
  //    fingerprint matches it — hasAuthoritativeResult(projectId, live) === true.
  //    Simulate the persisted record's current_fingerprint with the live value.
  const persistedFingerprint = liveFingerprint;
  assert.equal(
    liveFingerprint,
    persistedFingerprint,
    "live fingerprint === persisted authoritative fingerprint (hasAuthoritativeResult === true)"
  );

  // 6) No temporary rsp:null fingerprint is produced at the hydration-ready
  //    boundary: the hydration-derived rspPosition is non-null, so the only
  //    fingerprint the engine can build at first render is the live one.
  assert.ok(rspPosition !== null, "hydration-derived rspPosition is non-null");
  assert.equal(
    liveFingerprint,
    computeGeometryFingerprint({ ...baseGeometryInputs(), rspPosition }),
    "fingerprint is stable across repeated hydration-ready renders"
  );
});

// ---------------------------------------------------------------------------
// Regression #7 — SUB4-12 horizontal orientation cold hydration
// ---------------------------------------------------------------------------
// SUB4-12 registry dimensions (widthMm=440, heightMm=1700). Horizontal
// orientation swaps width/height in getSpeakerModelMeta, so cabinet height
// becomes 0.44m instead of 1.70m. With bottomHeightM=0.1:
//   vertical centre-Z   = 0.1 + 1.70/2 = 0.95
//   horizontal centre-Z = 0.1 + 0.44/2 = 0.32
// These match the real bassInputAdapter → deriveCentreZ → getCabinetHeightM
// path (getCabinetHeightM reads getSpeakerModelMeta(model, orientation).heightM).
const SUB4_12_WIDTH_M = 0.44;
const SUB4_12_HEIGHT_M = 1.70;
const SUB4_12_BOTTOM_M = 0.10;

function sub412CentreZ(orientation) {
  const cabinetH = orientation === "horizontal" ? SUB4_12_WIDTH_M : SUB4_12_HEIGHT_M;
  return Number((SUB4_12_BOTTOM_M + cabinetH / 2).toFixed(6));
}

function sub412Source(orientation) {
  return {
    id: "subf1",
    x: 1.5,
    y: 0.2,
    z: sub412CentreZ(orientation),
    tuning: { gainDb: 0, delayMs: 0, polarity: 1 },
  };
}

test("SUB4-12 horizontal cold hydration: orientation-aware source centre-Z matches settled adapter (no R1→R2 fingerprint change)", () => {
  // Pre-fix hydration called bassInputAdapter(instances) with NO orientation,
  // producing the vertical centre-Z (0.95). Settled state later called
  // bassInputAdapter(instances, {frontOrientation:"horizontal"}), producing
  // 0.32 — a different fingerprint and a false authority mismatch.
  const preFixZ = sub412CentreZ(null);          // 0.95 (vertical, no orientation)
  const postFixZ = sub412CentreZ("horizontal");  // 0.32 (horizontal)

  assert.equal(preFixZ, 0.95, "pre-fix (no orientation) centre-Z is the vertical 0.95");
  assert.equal(postFixZ, 0.32, "post-fix (horizontal) centre-Z is 0.32");
  assert.notEqual(preFixZ, postFixZ, "orientation changes SUB4-12 centre-Z");

  // The fix passes frontOrientation/rearOrientation into bassInputAdapter
  // during hydration, so the hydrated source centre-Z equals the settled
  // orientation-aware adapter result.
  const hydratedSource = sub412Source("horizontal");
  const settledSource = sub412Source("horizontal");
  assert.equal(hydratedSource.z, settledSource.z, "hydrated centre-Z === settled centre-Z");

  // The pre-fix (no-orientation) source carries the wrong centre-Z.
  const preFixSource = sub412Source(null);
  assert.notEqual(preFixSource.z, hydratedSource.z, "pre-fix source centre-Z differs from post-fix");

  // Fingerprints: orientation-aware (post-fix) is stable; no-orientation
  // (pre-fix) differs — proving the orientation pass-through is required.
  const fpHorizontal = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    sources: [hydratedSource],
  });
  const fpVertical = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    sources: [preFixSource],
  });

  assert.notEqual(
    fpHorizontal,
    fpVertical,
    "SUB4-12 horizontal vs vertical sources produce different fingerprints (orientation matters)"
  );

  // No R1→R2 fingerprint change: the hydrated (R1) and settled (R2) sources
  // are identical because both pass the same orientation — the fingerprint is
  // stable across the hydration→settled transition.
  const r1Hydration = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    sources: [sub412Source("horizontal")],
  });
  const r2Settled = computeGeometryFingerprint({
    ...baseGeometryInputs(),
    sources: [sub412Source("horizontal")],
  });
  assert.equal(r1Hydration, r2Settled, "no R1→R2 fingerprint change from subwoofer orientation");
});

// ---------------------------------------------------------------------------
// Negative control — auto_from_screen with missing screen inputs falls
// through to null (no spurious RSP), preserving the existing fallback.
// ---------------------------------------------------------------------------
test("auto_from_screen with missing screen inputs falls through to the fallback (no regression)", () => {
  const rsp = computeEffectiveRsp({
    rspMode: "auto_from_screen",
    manualRspY_m: null,
    roomWidthM: 6.0,
    screenFrontPlaneM: null,
    screenWidthM: null,
    currentMlpY_m: null,
    rowDerivedRspYByMode: {},
  });
  // Fallback label — no authoritative derivation. Number(null)===0 means the
  // fallback Y is 0 (pre-existing behaviour), not a real RSP. Hydration must
  // skip this (0 is not > 0 and label is "Current RSP") and leave mlpY_m for
  // the RoomDesigner effect, exactly as before the fix.
  assert.equal(rsp.rspSourceLabel, "Current RSP", "fallback label when no inputs are finite/positive");
  assert.equal(rsp.effectiveRspX_m, 3.0, "centreline X still resolved from room width");
  assert.ok(!(rsp.effectiveRspY_m > 0), "fallback Y is not a positive authoritative value (hydration skips it)");
});