// bassAnalysisFingerprintFixtures.js — Phase 1B fingerprint fixtures.
// Pure, deterministic, no side effects. Imports one-way from the fingerprint
// module (fixtures → fingerprints). Never imported by production code.

import {
  computeGeometryFingerprint,
  computeProductFingerprint,
  computeCalibrationFingerprint,
  isValidFingerprint,
  FINGERPRINT_VERSION,
} from "@/components/room/bass/bassAnalysisFingerprints";

// Shared base inputs used across many fixtures.
function baseInputs() {
  return {
    roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 },
    rspPosition: { x: 2, y: 3, z: 1.2 },
    seatingPositions: [
      { id: "seat-1", x: 1.5, y: 3, z: 1.2 },
      { id: "seat-2", x: 2.5, y: 3, z: 1.2 },
    ],
    sources: [
      { id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ],
    surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.2, right: 0.2, ceiling: 0.2, floor: 0.1 },
    roomDamping: 0.05,
    axialQ: 30,
    qStrategy: "ab_corrected",
    splConfig: { globalPowerW: 500, globalEqHeadroomDb: 6, radiationMode: "half_space" },
    requestedOutputDb: 105,
    houseCurveVersion: "artcoustic-v1",
    eqConstraints: { maxBoostDb: 6, maxCutDb: 12, maxPerFilterBoostDb: 3, maxPerFilterCutDb: 6 },
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    optimisationTransitionHz: 120,
    targetAnchorDb: 0,
    usableLfHz: 35,
  };
}

export function runFingerprintFixtures() {
  const results = {};

  // 1. Identical semantic inputs produce identical fingerprints.
  {
    const a = baseInputs();
    const b = baseInputs();
    results.identicalGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.identicalProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.identicalCalibration = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 2. Object key insertion order does not matter.
  {
    const ordered = baseInputs();
    const reversed = {
      // Same values, different key order at every level.
      optimisationTransitionHz: 120,
      targetAnchorDb: 0,
      usableLfHz: 35,
      assessmentEndHz: 200,
      assessmentStartHz: 20,
      eqConstraints: { maxPerFilterCutDb: 6, maxPerFilterBoostDb: 3, maxCutDb: 12, maxBoostDb: 6 },
      houseCurveVersion: "artcoustic-v1",
      requestedOutputDb: 105,
      splConfig: { radiationMode: "half_space", globalEqHeadroomDb: 6, globalPowerW: 500 },
      qStrategy: "ab_corrected",
      axialQ: 30,
      roomDamping: 0.05,
      surfaceAbsorption: { floor: 0.1, ceiling: 0.2, right: 0.2, left: 0.2, back: 0.3, front: 0.3 },
      sources: [
        { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3, tuning: { polarity: 0, delayMs: 0, gainDb: 0 } },
        { id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3, tuning: { polarity: 0, delayMs: 0, gainDb: 0 } },
      ],
      seatingPositions: [
        { id: "seat-2", x: 2.5, y: 3, z: 1.2 },
        { id: "seat-1", x: 1.5, y: 3, z: 1.2 },
      ],
      rspPosition: { z: 1.2, y: 3, x: 2 },
      roomDims: { heightM: 2.7, lengthM: 6, widthM: 4 },
    };
    results.keyOrderGeometry = computeGeometryFingerprint(ordered) === computeGeometryFingerprint(reversed);
    results.keyOrderProduct = computeProductFingerprint(ordered) === computeProductFingerprint(reversed);
    results.keyOrderCalibration = computeCalibrationFingerprint(ordered) === computeCalibrationFingerprint(reversed);
  }

  // 3. Seat/source array order does not matter when IDs identify the same items.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [a.sources[1], a.sources[0]];
    b.seatingPositions = [a.seatingPositions[1], a.seatingPositions[0]];
    results.arrayOrderGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.arrayOrderProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.arrayOrderCalibration = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 4. Room dimension changes geometry (and therefore product and calibration).
  {
    const a = baseInputs();
    const b = baseInputs();
    b.roomDims = { widthM: 4.5, lengthM: 6, heightM: 2.7 };
    const gA = computeGeometryFingerprint(a);
    const gB = computeGeometryFingerprint(b);
    results.roomDimChangesGeometry = gA !== gB;
    results.roomDimChangesProduct = computeProductFingerprint(a) !== computeProductFingerprint(b);
    results.roomDimChangesCalibration = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
  }

  // 5. Seat position changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.seatingPositions = [
      { id: "seat-1", x: 1.5, y: 3.2, z: 1.2 },
      { id: "seat-2", x: 2.5, y: 3, z: 1.2 },
    ];
    results.seatPosChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 6. Source position changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [
      { id: "sub-1", modelKey: "SUB2-12", x: 1.2, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ];
    results.sourcePosChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 7. Source quantity changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [a.sources[0]];
    results.sourceQtyChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 8. Source height (z) changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [
      { id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.5, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ];
    results.sourceHeightChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 9. Source tuning (gain/delay/polarity) changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [
      { id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3, tuning: { gainDb: 2, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB2-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ];
    results.sourceTuningChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 10. Product model changes product but NOT geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [
      { id: "sub-1", modelKey: "SUB3-12", x: 1, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB3-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ];
    const gA = computeGeometryFingerprint(a);
    const gB = computeGeometryFingerprint(b);
    results.modelChangesProduct = computeProductFingerprint(a) !== computeProductFingerprint(b);
    results.modelDoesNotChangeGeometry = gA === gB;
  }

  // 11. Product quantity changes product.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.sources = [a.sources[0]];
    results.qtyChangesProduct = computeProductFingerprint(a) !== computeProductFingerprint(b);
  }

  // 12. Product capability (splConfig) changes product.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.splConfig = { globalPowerW: 1000, globalEqHeadroomDb: 6, radiationMode: "half_space" };
    results.capabilityChangesProduct = computeProductFingerprint(a) !== computeProductFingerprint(b);
  }

  // 13. Requested output changes product but NOT geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.requestedOutputDb = 110;
    results.outputChangesProduct = computeProductFingerprint(a) !== computeProductFingerprint(b);
    results.outputDoesNotChangeGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
  }

  // 14. House curve fingerprint changes calibration but NOT product or geometry.
  // The calibration fingerprint hashes houseCurveFingerprint (the hash of the
  // actual curve points), not a version label — a version label alone does
  // not guarantee the points haven't changed.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.houseCurveFingerprint = "hcurve:v1:abcdef1234567890";
    results.houseCurveChangesCalibration = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
    results.houseCurveDoesNotChangeProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.houseCurveDoesNotChangeGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
  }

  // 15. EQ constraints change calibration but NOT product.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.eqConstraints = { maxBoostDb: 9, maxCutDb: 12, maxPerFilterBoostDb: 3, maxPerFilterCutDb: 6 };
    results.eqConstraintsChangeCalibration = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
    results.eqConstraintsDoNotChangeProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
  }

  // 16. Assessment band changes calibration but NOT product.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.assessmentStartHz = 25;
    b.assessmentEndHz = 150;
    results.assessmentBandChangesCalibration = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
    results.assessmentBandDoesNotChangeProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
  }

  // 17. Transition frequency changes calibration but NOT product.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.optimisationTransitionHz = 100;
    results.transitionChangesCalibration = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
  }

  // 18. Priority mode does NOT change any fingerprint (it is not an input).
  {
    const a = baseInputs();
    // Priority mode is deliberately absent from the inputs object. Adding
    // a `priorityMode` field must not affect any fingerprint.
    const b = { ...baseInputs(), priorityMode: "spl" };
    results.priorityDoesNotChangeGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.priorityDoesNotChangeProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.priorityDoesNotChangeCalibration = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 19. Graph smoothing, scale, overlay/diagnostics visibility do NOT change any fingerprint.
  {
    const a = baseInputs();
    const b = {
      ...baseInputs(),
      graphSmoothing: "1/3_octave",
      graphScaleDb: 80,
      showZones: true,
      showAngles: true,
      showDiagnostics: true,
      diagnosticsPanelOpen: true,
    };
    results.displaySettingsDoNotChangeGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.displaySettingsDoNotChangeProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.displaySettingsDoNotChangeCalibration = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 20. No fingerprint contains NaN, Infinity, or [object Object].
  {
    const fp = computeCalibrationFingerprint(baseInputs());
    const geo = computeGeometryFingerprint(baseInputs());
    const prod = computeProductFingerprint(baseInputs());
    const all = [fp, geo, prod];
    results.noNaN = !all.some((s) => s.includes("NaN"));
    results.noInfinity = !all.some((s) => s.includes("Infinity"));
    results.noObjectObject = !all.some((s) => s.includes("[object Object]"));
  }

  // 21. Fingerprints with NaN/Infinity inputs do not leak those tokens.
  {
    const bad = {
      ...baseInputs(),
      roomDims: { widthM: NaN, lengthM: Infinity, heightM: 2.7 },
      rspPosition: { x: NaN, y: 3, z: 1.2 },
    };
    const geo = computeGeometryFingerprint(bad);
    const prod = computeProductFingerprint(bad);
    const cal = computeCalibrationFingerprint(bad);
    const all = [geo, prod, cal];
    results.badInputNoNaN = !all.some((s) => s.includes("NaN"));
    results.badInputNoInfinity = !all.some((s) => s.includes("Infinity"));
  }

  // 22. Fingerprints are valid per isValidFingerprint and use 64-bit hash (16 hex chars).
  {
    const geo = computeGeometryFingerprint(baseInputs());
    const prod = computeProductFingerprint(baseInputs());
    const cal = computeCalibrationFingerprint(baseInputs());
    results.validGeometry = isValidFingerprint(geo);
    results.validProduct = isValidFingerprint(prod);
    results.validCalibration = isValidFingerprint(cal);
    // 64-bit hash: the hash suffix must be 16 hex characters.
    const geoHash = geo.split(":").pop();
    const prodHash = prod.split(":").pop();
    const calHash = cal.split(":").pop();
    results.hashLength64Geometry = geoHash.length === 16;
    results.hashLength64Product = prodHash.length === 16;
    results.hashLength64Calibration = calHash.length === 16;
  }

  // 23. Fingerprints carry the correct version prefix.
  {
    const geo = computeGeometryFingerprint(baseInputs());
    const prod = computeProductFingerprint(baseInputs());
    const cal = computeCalibrationFingerprint(baseInputs());
    results.versionPrefixGeometry = geo.startsWith(`geo:v${FINGERPRINT_VERSION}:`);
    results.versionPrefixProduct = prod.startsWith(`prod:v${FINGERPRINT_VERSION}:`);
    results.versionPrefixCalibration = cal.startsWith(`cal:v${FINGERPRINT_VERSION}:`);
  }

  // 24. Fingerprints are deterministic across repeated calls (synchronous).
  {
    const a = baseInputs();
    const g1 = computeGeometryFingerprint(a);
    const g2 = computeGeometryFingerprint(a);
    const p1 = computeProductFingerprint(a);
    const p2 = computeProductFingerprint(a);
    const c1 = computeCalibrationFingerprint(a);
    const c2 = computeCalibrationFingerprint(a);
    results.deterministicGeometry = g1 === g2;
    results.deterministicProduct = p1 === p2;
    results.deterministicCalibration = c1 === c2;
  }

  // 25. Floating-point noise within rounding tolerance does not change fingerprints.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.roomDims = { widthM: 4.0000001, lengthM: 6.0000002, heightM: 2.7000003 };
    b.rspPosition = { x: 2.0000001, y: 3.0000001, z: 1.2000001 };
    results.floatNoiseGeometry = computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.floatNoiseProduct = computeProductFingerprint(a) === computeProductFingerprint(b);
    results.floatNoiseCalibration = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 26. Empty/null inputs do not throw and produce valid fingerprints.
  {
    let threw = false;
    let geo, prod, cal;
    try {
      geo = computeGeometryFingerprint(null);
      prod = computeProductFingerprint(null);
      cal = computeCalibrationFingerprint(null);
    } catch (e) {
      threw = true;
    }
    results.nullInputsNoThrow = !threw;
    results.nullInputsValid = isValidFingerprint(geo) && isValidFingerprint(prod) && isValidFingerprint(cal);
  }

  // 27. Calibration embeds product which embeds geometry (chained dependency).
  {
    const a = baseInputs();
    const cal = computeCalibrationFingerprint(a);
    // Changing geometry must change calibration (transitive).
    const b = baseInputs();
    b.roomDims = { widthM: 5, lengthM: 6, heightM: 2.7 };
    results.geometryChangePropagatesToCalibration = cal !== computeCalibrationFingerprint(b);
  }

  // 28. Surface absorption changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.surfaceAbsorption = { front: 0.5, back: 0.3, left: 0.2, right: 0.2, ceiling: 0.2, floor: 0.1 };
    results.absorptionChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 29. Modal Q (axialQ) changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.axialQ = 50;
    results.axialQChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 30. qStrategy changes geometry.
  {
    const a = baseInputs();
    const b = baseInputs();
    b.qStrategy = "standard";
    results.qStrategyChangesGeometry = computeGeometryFingerprint(a) !== computeGeometryFingerprint(b);
  }

  // 31. Evaluated profiles are included in the calibration fingerprint.
  // The sorted set of optimiser-evaluated fit profiles (with their named
  // constraints) must be part of the calibration canonical form.
  {
    const a = baseInputs();
    a.evaluatedProfiles = [
      { id: "accuracy", maximumAggregateBoostDb: 6, maximumCutDb: 15 },
      { id: "standard", maximumAggregateBoostDb: 6, maximumCutDb: 10 },
    ];
    const b = baseInputs();
    // No evaluatedProfiles — must differ from a.
    results.evaluatedProfilesIncluded = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
  }

  // 32. Evaluated-profile order does not matter (sorted before hashing).
  {
    const a = baseInputs();
    a.evaluatedProfiles = [
      { id: "accuracy", maximumAggregateBoostDb: 6, maximumCutDb: 15 },
      { id: "standard", maximumAggregateBoostDb: 6, maximumCutDb: 10 },
    ];
    const b = baseInputs();
    b.evaluatedProfiles = [
      { id: "standard", maximumAggregateBoostDb: 6, maximumCutDb: 10 },
      { id: "accuracy", maximumAggregateBoostDb: 6, maximumCutDb: 15 },
    ];
    results.evaluatedProfilesOrderInvariant = computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // 33. Evaluated-profile constraint change changes calibration fingerprint.
  {
    const a = baseInputs();
    a.evaluatedProfiles = [
      { id: "standard", maximumAggregateBoostDb: 6, maximumCutDb: 10 },
      { id: "accuracy", maximumAggregateBoostDb: 6, maximumCutDb: 15 },
    ];
    const b = baseInputs();
    b.evaluatedProfiles = [
      { id: "standard", maximumAggregateBoostDb: 6, maximumCutDb: 10 },
      { id: "accuracy", maximumAggregateBoostDb: 6, maximumCutDb: 20 }, // cut ceiling raised
    ];
    results.evaluatedProfilesConstraintChange = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
  }

  return results;
}