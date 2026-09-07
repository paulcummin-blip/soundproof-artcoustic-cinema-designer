// Regression tests for validateCachedBassResult candidate-profile validation.
// Tests the fix: non-diagnostic results require a deterministic candidate,
// diagnostic results require a house_curve multi-start candidate.

import { validateCachedBassResult, buildFilterBankSignature, HOUSE_CURVE_LIMITS } from "../src/components/room/bass/bassResultAuthority.js";
import {
  BASS_OPTIMISER_VERSIONS,
} from "../src/components/room/bass/bassOptimiserWorkerProtocol.js";

const { protocolVersion, poolVersion, engineVersion, resultSchemaVersion, metricSchemaVersion } = BASS_OPTIMISER_VERSIONS;
const FINGERPRINT = "test-fp-001";

function makeBaseResult({ collectDiagnostics, candidates }) {
  const pool = {
    candidates,
    selectablePool: candidates,
    protocolVersion, poolVersion, engineVersion, resultSchemaVersion, metricSchemaVersion,
  };
  return {
    pool,
    fingerprint: FINGERPRINT,
    protocolVersion, poolVersion, engineVersion, resultSchemaVersion, metricSchemaVersion,
    collectDiagnostics: collectDiagnostics === true,
  };
}

function makeDeterministicCandidate() {
  const fb = [{ enabled: true, frequencyHz: 40, gainDb: 2, Q: 1.0 }];
  return {
    designEqFitProfile: "deterministic",
    startStrategy: "single",
    canonicalVerticalOffsetDb: 0,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    generatedFilterBank: fb,
    finalPostEqCurve: [{ frequency: 20, spl: 90 }, { frequency: 100, spl: 95 }],
    filterBankSignature: buildFilterBankSignature({ generatedFilterBank: fb }),
  };
}

function makeHouseCurveCandidate({ maxCut = 15, maxBoost = 6, strategy = "multi-start" } = {}) {
  const fb = [{ enabled: true, frequencyHz: 35, gainDb: 3, Q: 1.2 }];
  return {
    designEqFitProfile: "house_curve",
    startStrategy: strategy,
    canonicalVerticalOffsetDb: 0,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    generatedFilterBank: fb,
    finalPostEqCurve: [{ frequency: 20, spl: 91 }, { frequency: 100, spl: 94 }],
    filterBankSignature: buildFilterBankSignature({ generatedFilterBank: fb }),
    designEqFitProfileConfig: { maximumCutDb: maxCut, maximumAggregateBoostDb: maxBoost },
  };
}

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} ${detail}`);
  }
}

// TEST A — Normal deterministic result (collectDiagnostics = false)
{
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [makeDeterministicCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("A: normal deterministic result is valid", v.valid === true, JSON.stringify(v));
}

// TEST B — Normal result without deterministic candidate
{
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [makeHouseCurveCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("B: normal result without deterministic candidate is invalid", v.valid === false, JSON.stringify(v));
  assert("B: reason is deterministic-candidate-missing", v.reason === "deterministic-candidate-missing", v.reason);
}

// TEST C — Diagnostic result with valid house_curve candidate
{
  const result = makeBaseResult({
    collectDiagnostics: true,
    candidates: [makeHouseCurveCandidate({ maxCut: 15, maxBoost: 6, strategy: "multi-start" })],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("C: diagnostic result with valid house_curve candidate is valid", v.valid === true, JSON.stringify(v));
}

// TEST D — Diagnostic result without house_curve candidate
{
  const result = makeBaseResult({
    collectDiagnostics: true,
    candidates: [makeDeterministicCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("D: diagnostic result without house_curve candidate is invalid", v.valid === false, JSON.stringify(v));
  assert("D: reason is house-curve-candidate-missing", v.reason === "house-curve-candidate-missing", v.reason);
}

// TEST E — Existing version/fingerprint/signature failures still reject
{
  // Fingerprint mismatch
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [makeDeterministicCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: "wrong-fp" });
  assert("E1: fingerprint mismatch still rejects", v.valid === false && v.reason === "fingerprint-mismatch", JSON.stringify(v));
}
{
  // Pool version mismatch
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [makeDeterministicCandidate()],
  });
  result.poolVersion = 999;
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("E2: pool version mismatch still rejects", v.valid === false, JSON.stringify(v));
}
{
  // Empty candidates
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("E3: empty candidates still rejects", v.valid === false && v.reason === "candidate-pool-empty", JSON.stringify(v));
}
{
  // Filter signature mismatch
  const badCandidate = makeDeterministicCandidate();
  badCandidate.filterBankSignature = "tampered";
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [badCandidate],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("E4: filter signature mismatch still rejects", v.valid === false && v.reason === "candidate-filter-signature-mismatch", JSON.stringify(v));
}
{
  // Diagnostic house_curve incompatible (wrong maxCut)
  const result = makeBaseResult({
    collectDiagnostics: true,
    candidates: [makeHouseCurveCandidate({ maxCut: 10 })],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("E5: diagnostic house_curve incompatible still rejects", v.valid === false && v.reason === "house-curve-candidate-incompatible", JSON.stringify(v));
}

// TEST F — Mixed candidate set (deterministic + house_curve, non-diagnostic)
{
  const result = makeBaseResult({
    collectDiagnostics: false,
    candidates: [makeDeterministicCandidate(), makeHouseCurveCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("F: mixed candidates non-diagnostic is valid (deterministic present)", v.valid === true, JSON.stringify(v));
}

// TEST G — Mixed candidate set (deterministic + house_curve, diagnostic)
{
  const result = makeBaseResult({
    collectDiagnostics: true,
    candidates: [makeDeterministicCandidate(), makeHouseCurveCandidate()],
  });
  const v = validateCachedBassResult(result, { fingerprint: FINGERPRINT });
  assert("G: mixed candidates diagnostic is valid (house_curve present)", v.valid === true, JSON.stringify(v));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);