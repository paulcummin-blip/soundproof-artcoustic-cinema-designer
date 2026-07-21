// bassAnalysisContractFixtures.js — Deterministic Phase 1A contract + hardening fixtures.
// Split from bassAnalysisContract.js to keep the contract module under 600 lines.
// Pure, no side effects. One-way dependency: fixtures → contract (never the reverse).

import {
  createBassAnalysisResult,
  createBassParameterResult,
  formatParameterResult,
  adaptCurrentBassOptimisationResult,
  validateStructuredCloneSafe,
  normalizeMode,
  toCanonicalMode,
  toInternalMode,
  PARAM_P14, PARAM_P18, PARAM_P19, PARAM_P20,
  PARAM_STATUS_UNCALCULATED, PARAM_STATUS_CALCULATING, PARAM_STATUS_UPDATING,
  PARAM_STATUS_COMPLETE, PARAM_STATUS_NOT_APPLICABLE,
  PRODUCT_STATUS_RUNNING, PRODUCT_STATUS_COMPLETE, PRODUCT_STATUS_STALE,
  VALID_PRODUCT_STATUSES,
  BASS_MODE_BALANCED, BASS_MODE_HOUSE_CURVE_ACCURACY, BASS_MODE_DEPTH, BASS_MODE_SPL,
  CANONICAL_BASS_MODES,
} from "@/components/room/bass/bassAnalysisContract";

export function runContractFixtures() {
  const results = {};

  // 1. Empty contract produces four uncalculated parameters.
  {
    const c = createBassAnalysisResult();
    const params = c.productAnalysis.parameters;
    results.emptyContractUncalculated =
      params.p14.status === PARAM_STATUS_UNCALCULATED &&
      params.p18.status === PARAM_STATUS_UNCALCULATED &&
      params.p19.status === PARAM_STATUS_UNCALCULATED &&
      params.p20.status === PARAM_STATUS_UNCALCULATED &&
      params.p14.level === null && params.p18.level === null &&
      params.p19.level === null && params.p20.level === null;
  }

  // 2. Uncalculated formatter produces "—".
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14 }));
    results.uncalculatedFormatterDash = f.text === "P14 —" && f.isUpdating === false;
  }

  // 3. Calculating formatter produces "…".
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_CALCULATING }));
    results.calculatingFormatterEllipsis = f.text === "P14 …" && f.isUpdating === false;
  }

  // 4. Level zero produces FAIL.
  {
    const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_COMPLETE, level: 0 }));
    results.levelZeroFail = f.text === "P14 FAIL" && f.isUpdating === false;
  }

  // 5. Levels 1–4 format correctly.
  {
    let ok = true;
    for (let lvl = 1; lvl <= 4; lvl++) {
      const f = formatParameterResult(createBassParameterResult({ parameter: PARAM_P14, status: PARAM_STATUS_COMPLETE, level: lvl }));
      if (f.text !== `P14 L${lvl}`) ok = false;
    }
    results.levelsOneToFour = ok;
  }

  // 6. One real seat makes P20 not applicable.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 2, generatedFilterBank: [] }, poolId: "p1" },
      perSeatRawCurves: [{ seatId: "seat-1" }],
    });
    results.oneSeatP20NotApplicable = adapted.productAnalysis.parameters.p20.status === PARAM_STATUS_NOT_APPLICABLE;
  }

  // 7. Two seats with P20 level zero produces FAIL.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: { selectedCandidate: { p20Available: true, achievedP20Level: 0, achievedP20VariationDb: 9.5, generatedFilterBank: [] }, poolId: "p1" },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const p20 = adapted.productAnalysis.parameters.p20;
    results.twoSeatsP20LevelZeroFail = p20.status === PARAM_STATUS_COMPLETE && p20.level === 0 && formatParameterResult(p20).text === "P20 FAIL";
  }

  // 8. Canonical/internal mode mappings round-trip correctly.
  {
    let ok = true;
    for (const canonical of CANONICAL_BASS_MODES) {
      const internal = toInternalMode(canonical);
      const back = toCanonicalMode(internal);
      if (back !== canonical) ok = false;
    }
    if (toCanonicalMode("accuracy") !== BASS_MODE_HOUSE_CURVE_ACCURACY) ok = false;
    if (toCanonicalMode("extension") !== BASS_MODE_DEPTH) ok = false;
    if (toCanonicalMode("balanced") !== BASS_MODE_BALANCED) ok = false;
    if (toCanonicalMode("spl") !== BASS_MODE_SPL) ok = false;
    results.modeRoundTrip = ok;
  }

  // 9. Partial optimiser results do not throw.
  {
    let threw = false;
    try {
      adaptCurrentBassOptimisationResult({});
      adaptCurrentBassOptimisationResult({ optimisationResult: {} });
      adaptCurrentBassOptimisationResult({ optimisationResult: { selectedCandidate: null } });
      adaptCurrentBassOptimisationResult({ perSeatRawCurves: null });
    } catch (e) {
      threw = true;
    }
    results.partialResultsNoThrow = !threw;
  }

  // 10. Adapter output contains no functions or circular references.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 2, achievedP14Db: 105, achievedP18Level: 2, achievedP18FrequencyHz: 35, achievedP19Level: 1, achievedP19VariationDb: 5.2, p20Available: true, achievedP20Level: 1, achievedP20VariationDb: 4.5, generatedFilterBank: [{ enabled: true, frequencyHz: 40, gainDb: 3, Q: 5 }], designEqFitProfile: "standard" },
        poolId: "test-pool",
        selectedMode: "balanced",
        selectedByMode: { balanced: { achievedP14Level: 2, generatedFilterBank: [] } },
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const validation = validateStructuredCloneSafe(adapted);
    results.noFunctionsOrCircular = validation.safe;
  }

  // 11. Recursively reject NaN and Infinity.
  {
    const bad = { a: NaN, b: Infinity, c: [1, { d: -Infinity }] };
    const validation = validateStructuredCloneSafe(bad);
    results.rejectsNaNAndInfinity = !validation.safe && validation.issues.length === 3;
  }

  // 12. structuredClone succeeds where supported.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 3, achievedP14Db: 108, achievedP18Level: 3, achievedP18FrequencyHz: 30, achievedP19Level: 2, achievedP19VariationDb: 4.0, p20Available: false, generatedFilterBank: [], designEqFitProfile: "house_curve" },
        poolId: "clone-pool",
        selectedMode: "accuracy",
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }, { seatId: "seat-3" }],
    });
    let ok = false;
    try {
      if (typeof structuredClone === "function") {
        const cloned = structuredClone(adapted);
        ok = cloned.selectedMode === BASS_MODE_HOUSE_CURVE_ACCURACY && cloned.productAnalysis.parameters.p14.level === 3;
      } else {
        const json = JSON.stringify(adapted);
        ok = json != null && JSON.parse(json).productAnalysis.parameters.p14.level === 3;
      }
    } catch (e) {
      ok = false;
    }
    results.structuredCloneSucceeds = ok;
  }

  // 13. Existing P14/P18/P19/P20 fields map without changing their values or levels.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      optimisationResult: {
        selectedCandidate: {
          achievedP14Level: 3, achievedP14Db: 107.5,
          achievedP18Level: 2, achievedP18FrequencyHz: 32,
          achievedP19Level: 1, achievedP19VariationDb: 5.0,
          p20Available: true, achievedP20Level: 2, achievedP20VariationDb: 3.5,
          generatedFilterBank: [{ enabled: true, frequencyHz: 45, gainDb: -3, Q: 4 }],
          designEqFitProfile: "standard",
        },
        achievedP14Level: "L3", achievedP14Db: 107.5,
        achievedP18Level: "L2", achievedP18FrequencyHz: 32,
        achievedP19Level: "L1", achievedP19VariationDb: 5.0,
        poolId: "parity-pool",
        selectedMode: "balanced",
      },
      perSeatRawCurves: [{ seatId: "seat-1" }, { seatId: "seat-2" }],
    });
    const p = adapted.productAnalysis.parameters;
    results.parityP14 = p.p14.level === 3 && p.p14.value === 107.5;
    results.parityP18 = p.p18.level === 2 && p.p18.value === 32;
    results.parityP19 = p.p19.level === 1 && p.p19.value === 5.0;
    results.parityP20 = p.p20.level === 2 && p.p20.value === 3.5;
    results.parityAll = results.parityP14 && results.parityP18 && results.parityP19 && results.parityP20;
  }

  // ---- Phase 1A hardening fixtures ----

  // H1. Product-analysis statuses contain only permitted values across all states.
  {
    const statuses = new Set();
    for (const ds of [null, "IDLE", "CALCULATING", "COMPLETE", "OUT_OF_DATE", "CANCELLED", "ERROR"]) {
      for (const hasRes of [false, true]) {
        const opt = hasRes
          ? { optimisationResult: { selectedCandidate: { achievedP14Level: 2, achievedP14Db: 105, generatedFilterBank: [] }, poolId: "p" }, perSeatRawCurves: [] }
          : { perSeatRawCurves: [] };
        const adapted = adaptCurrentBassOptimisationResult({ ...opt, detailedStatus: ds });
        statuses.add(adapted.productAnalysis.status);
      }
    }
    let ok = true;
    for (const s of statuses) {
      if (!VALID_PRODUCT_STATUSES.includes(s)) ok = false;
    }
    results.hardeningProductStatusesValid = ok && !statuses.has("calculating");
  }

  // H2. job.progress is null or a finite number from 0–1.
  {
    const cases = [
      adaptCurrentBassOptimisationResult({ detailedProgress: null }),
      adaptCurrentBassOptimisationResult({ detailedProgress: { completedRequests: 5, totalRequests: 10 } }),
      adaptCurrentBassOptimisationResult({ detailedProgress: { completedRequests: 0, totalRequests: 10 } }),
      adaptCurrentBassOptimisationResult({ detailedProgress: { completedRequests: 10, totalRequests: 10 } }),
      adaptCurrentBassOptimisationResult({ detailedProgress: { completedRequests: 15, totalRequests: 10 } }),
      adaptCurrentBassOptimisationResult({ detailedProgress: { completedRequests: 3, totalRequests: 0 } }),
    ];
    let ok = true;
    for (const c of cases) {
      const p = c.job.progress;
      if (p != null && (!Number.isFinite(p) || p < 0 || p > 1)) ok = false;
    }
    results.hardeningProgressIsNumberOrNull = ok &&
      cases[0].job.progress === null &&
      cases[1].job.progress === 0.5 &&
      cases[2].job.progress === 0 &&
      cases[3].job.progress === 1 &&
      cases[4].job.progress === 1 &&
      cases[5].job.progress === null;
  }

  // H3. CALCULATING without previous results maps to running/calculating.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "CALCULATING",
      perSeatRawCurves: [],
    });
    results.hardeningCalculatingNoPrevious = adapted.job.status === "running" &&
      adapted.productAnalysis.status === PRODUCT_STATUS_RUNNING &&
      adapted.productAnalysis.parameters.p14.status === PARAM_STATUS_CALCULATING &&
      adapted.job.isRefreshingPreviousResult === false;
  }

  // H4. CALCULATING with previous results maps to running/updating.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "CALCULATING",
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 2, achievedP14Db: 105, achievedP18Level: 2, achievedP18FrequencyHz: 35, achievedP19Level: 1, achievedP19VariationDb: 5, p20Available: false, generatedFilterBank: [] },
        poolId: "refresh-pool",
      },
      perSeatRawCurves: [{ seatId: "s1" }, { seatId: "s2" }],
    });
    const p14 = adapted.productAnalysis.parameters.p14;
    results.hardeningCalculatingWithPrevious = adapted.job.status === "running" &&
      adapted.productAnalysis.status === PRODUCT_STATUS_RUNNING &&
      adapted.job.isRefreshingPreviousResult === true &&
      p14.status === PARAM_STATUS_UPDATING &&
      p14.level === 2 && p14.value === 105 &&
      p14.isStale === false;
  }

  // H5. Updating level zero formats as FAIL, never L0.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "CALCULATING",
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 0, achievedP14Db: 90, generatedFilterBank: [] },
        poolId: "fail-refresh",
      },
      perSeatRawCurves: [],
    });
    const f = formatParameterResult(adapted.productAnalysis.parameters.p14);
    results.hardeningUpdatingLevelZeroFail = f.text === "P14 FAIL" && f.isUpdating === true;
  }

  // H6. OUT_OF_DATE retains levels but marks them stale, not updating.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "OUT_OF_DATE",
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 3, achievedP14Db: 108, generatedFilterBank: [] },
        poolId: "stale-pool",
      },
      perSeatRawCurves: [],
    });
    const p14 = adapted.productAnalysis.parameters.p14;
    const f = formatParameterResult(p14);
    results.hardeningOutOfDateStaleNotUpdating = adapted.productAnalysis.status === PRODUCT_STATUS_STALE &&
      p14.status === PARAM_STATUS_COMPLETE &&
      p14.level === 3 && p14.value === 108 &&
      p14.isStale === true &&
      f.isUpdating === false &&
      f.text === "P14 L3";
  }

  // H7. CANCELLED with a previous result is stale, not updating.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "CANCELLED",
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 1, achievedP14Db: 100, generatedFilterBank: [] },
        poolId: "cancelled-pool",
      },
      perSeatRawCurves: [],
    });
    const p14 = adapted.productAnalysis.parameters.p14;
    results.hardeningCancelledStaleNotUpdating = adapted.productAnalysis.status === PRODUCT_STATUS_STALE &&
      p14.status === PARAM_STATUS_COMPLETE &&
      p14.isStale === true &&
      formatParameterResult(p14).isUpdating === false;
  }

  // H8. Empty room-response arrays cannot have complete status.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      detailedStatus: "COMPLETE",
      optimisationResult: {
        selectedCandidate: { achievedP14Level: 2, achievedP14Db: 105, generatedFilterBank: [] },
        poolId: "rr-pool",
      },
      perSeatRawCurves: [],
    });
    results.hardeningRoomResponseNotComplete = adapted.roomResponse.status === "uncalculated" &&
      Array.isArray(adapted.roomResponse.rspCurve) && adapted.roomResponse.rspCurve.length === 0 &&
      Array.isArray(adapted.roomResponse.seatCurves) && adapted.roomResponse.seatCurves.length === 0;
  }

  // H9. Internal and canonical mode inputs both normalize correctly.
  {
    results.hardeningModeNormalization =
      normalizeMode("accuracy") === BASS_MODE_HOUSE_CURVE_ACCURACY &&
      normalizeMode("house_curve_accuracy") === BASS_MODE_HOUSE_CURVE_ACCURACY &&
      normalizeMode("extension") === BASS_MODE_DEPTH &&
      normalizeMode("depth") === BASS_MODE_DEPTH &&
      normalizeMode("balanced") === BASS_MODE_BALANCED &&
      normalizeMode("spl") === BASS_MODE_SPL &&
      normalizeMode(null) === BASS_MODE_BALANCED &&
      normalizeMode("unknown") === BASS_MODE_BALANCED;
  }

  // H10. Partial/malformed filter data does not throw.
  {
    let threw = false;
    let sig = null;
    try {
      const adapted = adaptCurrentBassOptimisationResult({
        optimisationResult: {
          selectedCandidate: {
            achievedP14Level: 2, generatedFilterBank: [
              { enabled: true, frequencyHz: "40", gainDb: "3.5", Q: "5" },
              { enabled: true, frequencyHz: null, gainDb: undefined, Q: NaN },
              { enabled: true },
              { enabled: true, frequencyHz: "abc", gainDb: {}, Q: [] },
            ],
          },
          poolId: "malformed-pool",
        },
        perSeatRawCurves: [],
      });
      sig = adapted.provenance.candidateSignature;
    } catch (e) {
      threw = true;
    }
    results.hardeningMalformedFilterNoThrow = !threw && sig != null && typeof sig === "string";
  }

  // H11. Shared references are structured-clone safe.
  {
    const shared = { value: 1 };
    const obj = { a: shared, b: shared };
    const validation = validateStructuredCloneSafe(obj);
    results.hardeningSharedRefSafe = validation.safe;
  }

  // H12. Genuine circular references are rejected.
  {
    const obj = {};
    obj.self = obj;
    const validation = validateStructuredCloneSafe(obj);
    results.hardeningCircularRejected = !validation.safe &&
      validation.issues.some((i) => i.type === "circular");
  }

  // H13. NaN and Infinity remain rejected.
  {
    const bad = { a: NaN, b: Infinity, c: -Infinity };
    const validation = validateStructuredCloneSafe(bad);
    results.hardeningNaNInfinityRejected = !validation.safe &&
      validation.issues.length === 3;
  }

  // ---- Phase 1B adapter fingerprint fixtures ----

  // F1. Valid fingerprints are copied into the contract.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: {
        geometry: "geo:v1:abcdef12",
        product: "prod:v1:fedcba98",
        calibration: "cal:v1:12345678",
      },
      perSeatRawCurves: [],
    });
    results.adapterCopiesValidFingerprints =
      adapted.fingerprints.geometry === "geo:v1:abcdef12" &&
      adapted.fingerprints.product === "prod:v1:fedcba98" &&
      adapted.fingerprints.calibration === "cal:v1:12345678";
  }

  // F2. Missing fingerprints remain null.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: { geometry: "geo:v1:abcdef12" },
      perSeatRawCurves: [],
    });
    results.adapterMissingFingerprintsNull =
      adapted.fingerprints.geometry === "geo:v1:abcdef12" &&
      adapted.fingerprints.product === null &&
      adapted.fingerprints.calibration === null;
  }

  // F3. No fingerprints argument leaves all null.
  {
    const adapted = adaptCurrentBassOptimisationResult({ perSeatRawCurves: [] });
    results.adapterNoFingerprintsAllNull =
      adapted.fingerprints.geometry === null &&
      adapted.fingerprints.product === null &&
      adapted.fingerprints.calibration === null;
  }

  // F4. Invalid fingerprint strings are rejected (remain null).
  {
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: {
        geometry: "not-a-fingerprint",
        product: "prod:v1:NOTHEX",
        calibration: "cal:x1:12345678",
      },
      perSeatRawCurves: [],
    });
    results.adapterRejectsInvalidFingerprints =
      adapted.fingerprints.geometry === null &&
      adapted.fingerprints.product === null &&
      adapted.fingerprints.calibration === null;
  }

  // F5. Non-string fingerprints are rejected.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: { geometry: 123, product: {}, calibration: null },
      perSeatRawCurves: [],
    });
    results.adapterRejectsNonStringFingerprints =
      adapted.fingerprints.geometry === null &&
      adapted.fingerprints.product === null &&
      adapted.fingerprints.calibration === null;
  }

  // F6. Fingerprints survive structured clone.
  {
    const adapted = adaptCurrentBassOptimisationResult({
      fingerprints: {
        geometry: "geo:v1:abcdef12",
        product: "prod:v1:fedcba98",
        calibration: "cal:v1:12345678",
      },
      perSeatRawCurves: [],
    });
    const validation = validateStructuredCloneSafe(adapted);
    let cloneOk = false;
    try {
      if (typeof structuredClone === "function") {
        const cloned = structuredClone(adapted);
        cloneOk = cloned.fingerprints.geometry === "geo:v1:abcdef12";
      } else {
        const json = JSON.stringify(adapted);
        cloneOk = json != null && JSON.parse(json).fingerprints.geometry === "geo:v1:abcdef12";
      }
    } catch (e) {
      cloneOk = false;
    }
    results.adapterFingerprintsStructuredCloneSafe = validation.safe && cloneOk;
  }

  return results;
}