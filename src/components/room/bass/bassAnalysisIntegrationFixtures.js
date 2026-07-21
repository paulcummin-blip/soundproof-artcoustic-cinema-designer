// bassAnalysisIntegrationFixtures.js — Phase 1C integration fixtures.
// Pure, deterministic, no side effects. One-way dependency:
//   fixtures → adapter, contract, fingerprints, candidateConsistency
// Never imported by production code.

import { adaptCurrentBassOptimisationResult } from "@/components/room/bass/bassAnalysisAdapter";
import { validateStructuredCloneSafe } from "@/components/room/bass/bassAnalysisContract";
import {
  computeGeometryFingerprint,
  computeProductFingerprint,
  computeCalibrationFingerprint,
  isValidFingerprint,
} from "@/components/room/bass/bassAnalysisFingerprints";
import {
  buildCandidateSignature,
  signatureToString,
} from "@/components/room/bass/candidateConsistency";
import {
  buildBassGraphSeries,
  detailedEqStatusText,
  isMatchingDetailedResult,
} from "@/components/room/bass/bassGraphDomainBuilder";

// Shared base inputs for fingerprint computation.
function baseFingerprintInputs() {
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
    axialQ: 4.0,
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

// Shared base optimisation result for adapter tests.
function baseOptimisationResult() {
  return {
    selectedCandidate: {
      achievedP14Level: 3, achievedP14Db: 107.5,
      achievedP18Level: 2, achievedP18FrequencyHz: 32,
      achievedP19Level: 1, achievedP19VariationDb: 5.0,
      p20Available: true, achievedP20Level: 2, achievedP20VariationDb: 3.5,
      generatedFilterBank: [{ enabled: true, frequencyHz: 45, gainDb: -3, Q: 4 }],
      designEqFitProfile: "standard",
      requestedP14Level: 3, requestedP18Level: 2, requestedP19Level: 1,
      assessmentStartHz: 20, assessmentEndHz: 200,
    },
    poolId: "integration-pool",
    selectedMode: "balanced",
  };
}

function baseRspRawCurve() {
  return [
    { frequency: 20, spl: 90 },
    { frequency: 30, spl: 92 },
    { frequency: 50, spl: 95 },
    { frequency: 80, spl: 93 },
  ];
}

function basePerSeatCurves() {
  return [
    { seatId: "seat-1", responseData: [{ frequency: 20, spl: 89 }, { frequency: 50, spl: 94 }] },
    { seatId: "seat-2", responseData: [{ frequency: 20, spl: 88 }, { frequency: 50, spl: 93 }] },
  ];
}

export function runIntegrationFixtures() {
  const results = {};

  // I1. Live adaptation retains full-precision values and authoritative P20 grading.
  {
    const opt = baseOptimisationResult();
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: opt,
      detailedStatus: "COMPLETE",
      rspRawCurve: baseRspRawCurve(),
      perSeatRawCurves: basePerSeatCurves(),
      responseDomain: "legacy_product_aware",
    });
    const p = adapted.productAnalysis.parameters;
    results.i1MetricParityP14 = p.p14.level === 3 && p.p14.value === 107.5;
    results.i1MetricParityP18 = p.p18.level === 2 && p.p18.value === 32;
    results.i1MetricParityP19 = p.p19.level === 1 && p.p19.value === 5.0;
    results.i1MetricParityP20 = p.p20.level === 3 && p.p20.value === 3.5;
  }

  // I2. Candidate and pool identities match the live candidate signature.
  {
    const opt = baseOptimisationResult();
    const rsp = baseRspRawCurve();
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: opt,
      rspRawCurve: rsp,
      perSeatRawCurves: basePerSeatCurves(),
    });
    const liveSig = signatureToString(buildCandidateSignature({ result: opt, rspRawCurve: rsp }));
    results.i2CandidateIdMatches = adapted.selectedCandidateId === liveSig;
    results.i2PoolIdMatches = adapted.provenance.poolId === "integration-pool";
  }

  // I3. Geometry/product/calibration fingerprints populate correctly.
  {
    const inputs = baseFingerprintInputs();
    const geo = computeGeometryFingerprint(inputs);
    const prod = computeProductFingerprint(inputs);
    const cal = computeCalibrationFingerprint(inputs);
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: { geometry: geo, product: prod, calibration: cal },
      perSeatRawCurves: [],
    });
    results.i3FingerprintsPopulate =
      adapted.fingerprints.geometry === geo &&
      adapted.fingerprints.product === prod &&
      adapted.fingerprints.calibration === cal &&
      isValidFingerprint(geo) && isValidFingerprint(prod) && isValidFingerprint(cal);
  }

  // I4. Product-only change leaves geometry unchanged.
  {
    const a = baseFingerprintInputs();
    const b = baseFingerprintInputs();
    b.sources = [
      { id: "sub-1", modelKey: "SUB3-12", x: 1, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      { id: "sub-2", modelKey: "SUB3-12", x: 3, y: 0.5, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    ];
    results.i4ProductOnlyGeometryUnchanged =
      computeGeometryFingerprint(a) === computeGeometryFingerprint(b);
    results.i4ProductOnlyProductChanged =
      computeProductFingerprint(a) !== computeProductFingerprint(b);
  }

  // I5. Position/seat/room change changes geometry and therefore downstream fingerprints.
  {
    const a = baseFingerprintInputs();
    const b = baseFingerprintInputs();
    b.roomDims = { widthM: 5, lengthM: 6, heightM: 2.7 };
    const gA = computeGeometryFingerprint(a);
    const gB = computeGeometryFingerprint(b);
    results.i5GeometryChanged = gA !== gB;
    results.i5ProductChanged = computeProductFingerprint(a) !== computeProductFingerprint(b);
    results.i5CalibrationChanged = computeCalibrationFingerprint(a) !== computeCalibrationFingerprint(b);
  }

  // I6. Priority change changes selected mode only (not fingerprints).
  {
    const inputs = baseFingerprintInputs();
    const geo = computeGeometryFingerprint(inputs);
    const prod = computeProductFingerprint(inputs);
    const cal = computeCalibrationFingerprint(inputs);
    const adaptedBalanced = adaptCurrentBassOptimisationResult({
      optimisationResult: { ...baseOptimisationResult(), selectedMode: "balanced" },
      canonicalPriorityMode: "balanced",
      fingerprints: { geometry: geo, product: prod, calibration: cal },
      perSeatRawCurves: [],
    });
    const adaptedSpl = adaptCurrentBassOptimisationResult({
      optimisationResult: { ...baseOptimisationResult(), selectedMode: "spl" },
      canonicalPriorityMode: "spl",
      fingerprints: { geometry: geo, product: prod, calibration: cal },
      perSeatRawCurves: [],
    });
    results.i6PriorityChangesMode = adaptedBalanced.selectedMode !== adaptedSpl.selectedMode;
    results.i6PriorityDoesNotChangeFingerprints =
      adaptedBalanced.fingerprints.geometry === adaptedSpl.fingerprints.geometry &&
      adaptedBalanced.fingerprints.product === adaptedSpl.fingerprints.product &&
      adaptedBalanced.fingerprints.calibration === adaptedSpl.fingerprints.calibration;
  }

  // I7. Graph smoothing/scale/diagnostics do not affect fingerprints.
  {
    const a = baseFingerprintInputs();
    const b = {
      ...baseFingerprintInputs(),
      graphSmoothing: "1/3_octave",
      graphScaleDb: 80,
      showZones: true,
      showAngles: true,
      showDiagnostics: true,
      diagnosticsPanelOpen: true,
    };
    results.i7DisplaySettingsDoNotAffectFingerprints =
      computeGeometryFingerprint(a) === computeGeometryFingerprint(b) &&
      computeProductFingerprint(a) === computeProductFingerprint(b) &&
      computeCalibrationFingerprint(a) === computeCalibrationFingerprint(b);
  }

  // I8. Response-domain states are truthful.
  {
    const unavailable = adaptCurrentBassOptimisationResult({ perSeatRawCurves: [] });
    const legacy = adaptCurrentBassOptimisationResult({ responseDomain: "legacy_product_aware", perSeatRawCurves: [] });
    const normalized = adaptCurrentBassOptimisationResult({ responseDomain: "normalized_room_transfer", perSeatRawCurves: [] });
    results.i8UnavailableDomain =
      unavailable.roomResponse.responseDomain === "unavailable" &&
      unavailable.roomResponse.productIndependent === null;
    results.i8LegacyDomain =
      legacy.roomResponse.responseDomain === "legacy_product_aware" &&
      legacy.roomResponse.productIndependent === false;
    results.i8NormalizedDomain =
      normalized.roomResponse.responseDomain === "normalized_room_transfer" &&
      normalized.roomResponse.productIndependent === true;
  }

  // I9. No response cannot be marked complete.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "COMPLETE",
      optimisationResult: baseOptimisationResult(),
      perSeatRawCurves: [],
    });
    results.i9NoResponseNotComplete =
      adapted.roomResponse.status === "uncalculated" &&
      adapted.roomResponse.rspCurve.length === 0;
  }

  // I10. Contract remains structured-clone safe with all live data.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: baseOptimisationResult(),
      detailedStatus: "COMPLETE",
      rspRawCurve: baseRspRawCurve(),
      perSeatRawCurves: basePerSeatCurves(),
      activeSubs: [{ modelKey: "SUB2-12" }, { modelKey: "SUB2-12" }],
      usableLfHz: 35,
      sourceLayout: baseFingerprintInputs().sources,
      responseDomain: "legacy_product_aware",
      fingerprints: {
        geometry: computeGeometryFingerprint(baseFingerprintInputs()),
        product: computeProductFingerprint(baseFingerprintInputs()),
        calibration: computeCalibrationFingerprint(baseFingerprintInputs()),
      },
    });
    const validation = validateStructuredCloneSafe(adapted);
    let cloneOk = false;
    try {
      if (typeof structuredClone === "function") {
        const cloned = structuredClone(adapted);
        cloneOk = cloned.productAnalysis.parameters.p14.level === 3 &&
          cloned.roomResponse.rspCurve.length === 4 &&
          cloned.provenance.realSeatCount === 2;
      } else {
        const json = JSON.stringify(adapted);
        const parsed = JSON.parse(json);
        cloneOk = parsed.productAnalysis.parameters.p14.level === 3;
      }
    } catch (e) {
      cloneOk = false;
    }
    results.i10StructuredCloneSafe = validation.safe && cloneOk;
  }

  // I11. Adapting does not call simulation, fitting or ranking functions.
  // The adapter is pure — it only maps existing values. We verify by checking
  // that the adapter produces the same result when called twice with the same
  // inputs (no side effects, no state mutation).
  {
    const opt = baseOptimisationResult();
    const rsp = baseRspRawCurve();
    const seats = basePerSeatCurves();
    const a1 = adaptCurrentBassOptimisationResult({
      optimisationResult: opt, rspRawCurve: rsp, perSeatRawCurves: seats,
    });
    const a2 = adaptCurrentBassOptimisationResult({
      optimisationResult: opt, rspRawCurve: rsp, perSeatRawCurves: seats,
    });
    results.i11AdaptingIsPure =
      JSON.stringify(a1) === JSON.stringify(a2) &&
      a1.productAnalysis.parameters.p14.level === a2.productAnalysis.parameters.p14.level &&
      a1.selectedCandidateId === a2.selectedCandidateId;
  }

  // I12. analysisId is stable for the same calibration fingerprint + pool.
  {
    const inputs = baseFingerprintInputs();
    const cal = computeCalibrationFingerprint(inputs);
    const a1 = adaptCurrentBassOptimisationResult({
      optimisationResult: baseOptimisationResult(),
      fingerprints: { calibration: cal },
      perSeatRawCurves: [],
    });
    const a2 = adaptCurrentBassOptimisationResult({
      optimisationResult: baseOptimisationResult(),
      fingerprints: { calibration: cal },
      perSeatRawCurves: [],
    });
    results.i12AnalysisIdStable = a1.analysisId === a2.analysisId && a1.analysisId != null;
  }

  // I13. RSP curve point count and seat curve count match inputs.
  {
    const rsp = baseRspRawCurve();
    const seats = basePerSeatCurves();
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: baseOptimisationResult(),
      rspRawCurve: rsp,
      perSeatRawCurves: seats,
      responseDomain: "legacy_product_aware",
    });
    results.i13RspCurvePointCount = adapted.roomResponse.rspCurve.length === rsp.length;
    results.i13SeatCurveCount = adapted.roomResponse.seatCurves.length === seats.length;
  }

  // I14. Job status maps correctly from detailedStatus.
  {
    const complete = adaptCurrentBassOptimisationResult({
      detailedStatus: "COMPLETE",
      optimisationResult: baseOptimisationResult(),
      perSeatRawCurves: [],
    });
    const calculating = adaptCurrentBassOptimisationResult({
      detailedStatus: "CALCULATING",
      optimisationResult: baseOptimisationResult(),
      perSeatRawCurves: [],
    });
    const stale = adaptCurrentBassOptimisationResult({
      detailedStatus: "OUT_OF_DATE",
      optimisationResult: baseOptimisationResult(),
      perSeatRawCurves: [],
    });
    results.i14JobStatusComplete = complete.job.status === "complete";
    results.i14JobStatusRunning = calculating.job.status === "running";
    results.i14JobStatusStale = stale.job.status === "stale";
  }

  // I15–I21. Phase 4 graph-domain regression coverage.
  {
    const normalized = { id: "normalized-rsp", kind: "normalized", data: baseRspRawCurve() };
    const absent = buildBassGraphSeries({ designEqEnabled: false, normalizedSeries: normalized });
    results.i15AbsentOptimisationResultIsSafe = absent.length === 1 && absent[0].id === "normalized-rsp";

    const withTarget = buildBassGraphSeries({ designEqEnabled: false, showHouseCurve: true, normalizedSeries: normalized });
    results.i16NormalizedTargetIndependent = withTarget.some((item) => item.kind === "normalized-target" && item.label.includes("not predicted product SPL"));

    const calculating = buildBassGraphSeries({ designEqEnabled: true, rspRawCurve: baseRspRawCurve(), optimisationResult: null, hasMatchingDetailedResult: false });
    results.i17EqOnWithoutResultKeepsRaw = calculating.length === 1 && calculating[0].kind === "raw";
    results.i18CalculatingLifecycleVisible = detailedEqStatusText({ designEqEnabled: true, detailedStatus: "CALCULATING" }).startsWith("Calculating detailed EQ");

    const ready = { ...baseOptimisationResult(), selectedP14TargetDb: 100, finalPostEqCurve: baseRspRawCurve().map((point) => ({ ...point, spl: point.spl + 2 })) };
    const matching = buildBassGraphSeries({ designEqEnabled: true, showHouseCurve: true, rspRawCurve: baseRspRawCurve(), optimisationResult: ready, hasMatchingDetailedResult: true });
    results.i19MatchingResultShowsThreeDomains = ["raw", "post-eq", "house-curve"].every((kind) => matching.some((item) => item.kind === kind));

    const currentFingerprint = "cal-current";
    const staleResult = { calibrationFingerprint: "cal-stale", pool: [{}] };
    results.i20StaleResultRejected = !isMatchingDetailedResult("COMPLETE", staleResult, currentFingerprint);

    const returned = buildBassGraphSeries({ designEqEnabled: false, showHouseCurve: false, normalizedSeries: normalized, rspRawCurve: baseRspRawCurve(), optimisationResult: ready, hasMatchingDetailedResult: true });
    results.i21EqOffReturnsUnchangedNormalized = returned.length === 1 && returned[0].id === "normalized-rsp" && JSON.stringify(returned[0].data) === JSON.stringify(normalized.data);
  }

  return results;
}