// Regression tests for the P14 background target scheduler retry/verify logic.
//
// Verifies:
// A. successful insertion -> advance
// B. first insertion failure -> retry (not silent loss)
// C. second insertion failure -> fail (no infinite loop)
// D. cancellation/fingerprint change -> discard (not failure)
// E. insert true but readback missing -> treat as failure
// F. partial sweep — one target fails permanently, others advance
//
// Also verifies diagnostic capture records exact gate pass/fail and sub-fields.
//
// Pure functions are inlined to avoid JSX import issues (same pattern as
// p14-no-selected-state.test.mjs).

import assert from 'assert';

// ── Inlined pure functions (from p14TargetBackgroundDiagnostics.js) ──

const MAX_BACKGROUND_TARGET_RETRIES = 1;

function resolveBackgroundTargetAdvance({
  insertResult,
  readbackResult,
  retryCount = 0,
  maxRetries = MAX_BACKGROUND_TARGET_RETRIES,
  fingerprintChanged = false,
  cancelled = false,
}) {
  if (cancelled) return { action: 'discard', retryCount };
  if (fingerprintChanged) return { action: 'discard', retryCount };
  if (insertResult && readbackResult) return { action: 'advance', retryCount: 0 };
  if (retryCount < maxRetries) return { action: 'retry', retryCount: retryCount + 1 };
  return { action: 'fail', retryCount };
}

// ── Inlined gate functions (simplified from source) ──

function isStructurallyComplete(contract) {
  const status = contract?.job?.status;
  return ['ready', 'complete'].includes(status)
    && !!contract?.version
    && !!contract?.selectedCandidate
    && !!contract?.selectedCandidateId
    && !!contract?.job?.resultFingerprint
    && !!contract?.job?.currentJobFingerprint
    && contract.job.resultFingerprint === contract.job.currentJobFingerprint;
}

function hasCanonicalSeatMetricAuthority(contract) {
  const realSeatCount = Number(contract?.provenance?.realSeatCount);
  if (!Number.isInteger(realSeatCount) || realSeatCount < 0) return false;
  const p19Seats = contract?.selectedCandidate?.perSeatP19Results;
  if (realSeatCount > 0 && (!Array.isArray(p19Seats) || p19Seats.length !== realSeatCount)) return false;
  return true;
}

function isAuthoritativeBassContract(contract) {
  if (!isStructurallyComplete(contract)) return false;
  if (!hasCanonicalSeatMetricAuthority(contract)) return false;
  const pub = contract?.metricPublication;
  return !!pub && pub.canonicalMetricPublicationValid === true;
}

function hasGraphPayload(contract) {
  return !!contract?.graphPayload?.postEqRspCurve?.length;
}

function hasReadyCanonicalP19Contract(contract) {
  const parameter = contract?.productAnalysis?.parameters?.p19;
  const graph = contract?.graphPayload;
  return parameter?.status === 'complete'
    && !!graph?.postEqRspCurve?.length
    && !!graph?.productionHouseCurveTarget?.length
    && Number.isFinite(parameter?.value)
    && Number.isFinite(parameter?.level);
}

function captureTargetFailureDiagnostics({
  targetKey, compactContract, workerResult, fingerprint, calibrationFingerprint,
  baseDesignFingerprint, foregroundTargetKey, retryCount, cancelled, failureReason,
}) {
  const contract = compactContract || null;
  const gateA = isAuthoritativeBassContract(contract);
  const gateB = hasGraphPayload(contract);
  const gateC = hasReadyCanonicalP19Contract(contract);
  const job = contract?.job || {};
  const selectedCandidate = contract?.selectedCandidate || {};
  const metricPub = contract?.metricPublication || {};
  const provenance = contract?.provenance || {};
  const p19 = contract?.productAnalysis?.parameters?.p19 || {};
  const graph = contract?.graphPayload || {};
  return {
    targetKey,
    failureReason: failureReason || (contract ? 'insert-rejected' : 'contract-build-null'),
    cancelled: !!cancelled,
    retryCount: retryCount || 0,
    baseDesignFingerprint: baseDesignFingerprint ? baseDesignFingerprint.substring(0, 24) : null,
    foregroundTargetKey: foregroundTargetKey || null,
    workerCompleted: !!workerResult,
    compactContractExists: !!contract,
    fingerprint: fingerprint ? fingerprint.substring(0, 24) : null,
    calibrationFingerprint: calibrationFingerprint ? calibrationFingerprint.substring(0, 24) : null,
    gateA: {
      pass: gateA,
      jobStatus: job.status || null,
      selectedCandidateId: contract?.selectedCandidateId || null,
      resultFingerprint: job.resultFingerprint ? job.resultFingerprint.substring(0, 24) : null,
      currentJobFingerprint: job.currentJobFingerprint ? job.currentJobFingerprint.substring(0, 24) : null,
      canonicalMetricPublicationValid: metricPub.canonicalMetricPublicationValid ?? null,
      publicationRejectionReason: metricPub.publicationRejectionReason || null,
    },
    gateB: {
      pass: gateB,
      postEqRspCurveLength: graph.postEqRspCurve?.length ?? null,
      productionHouseCurveTargetLength: graph.productionHouseCurveTarget?.length ?? null,
      postEqPerSeatCurvesCount: graph.postEqPerSeatCurves?.length ?? null,
    },
    gateC: {
      pass: gateC,
      p19Status: p19.status || null,
      p19Value: Number.isFinite(p19.value) ? p19.value : null,
      p19Level: Number.isFinite(p19.level) ? p19.level : null,
      perSeatP19ResultsCount: selectedCandidate.perSeatP19Results?.length ?? null,
      realSeatCount: provenance.realSeatCount ?? null,
    },
  };
}

function formatDiagnosticLine(diag) {
  if (!diag) return '';
  const ga = diag.gateA?.pass ? 'PASS' : 'FAIL';
  const gb = diag.gateB?.pass ? 'PASS' : 'FAIL';
  const gc = diag.gateC?.pass ? 'PASS' : 'FAIL';
  return `target ${diag.targetKey}: FAILED (reason=${diag.failureReason} retry=${diag.retryCount} gateA=${ga} gateB=${gb} gateC=${gc} contract=${diag.compactContractExists ? 'YES' : 'NO'} worker=${diag.workerCompleted ? 'YES' : 'NO'})`;
}

// ── Mock contract builder ──

function makeValidContract({ targetKey = 'minimum-L2', fingerprint = 'fp-123', seatCount = 4 } = {}) {
  return {
    version: 8,
    metricSchemaVersion: 3,
    instanceAuthorityVersion: 3,
    selectedCandidateId: `cand-${targetKey}`,
    selectedCandidate: {
      candidateId: `cand-${targetKey}`,
      perSeatP19Results: Array.from({ length: seatCount }, (_, i) => ({
        seatId: `seat-${i}`,
        variationDbRaw: 5.0,
        level: 2,
      })),
      perSeatP20Results: Array.from({ length: seatCount }, (_, i) => ({
        seatId: `seat-${i}`,
        variationDbRaw: 3.0,
        level: 2,
      })),
    },
    job: {
      status: 'complete',
      resultFingerprint: fingerprint,
      currentJobFingerprint: fingerprint,
      resultSchemaVersion: 2,
    },
    metricPublication: {
      canonicalMetricPublicationValid: true,
      publicationRejectionReason: null,
    },
    provenance: { realSeatCount: seatCount },
    productAnalysis: {
      parameters: {
        p19: { status: 'complete', value: 5.72, level: 0 },
      },
    },
    graphPayload: {
      postEqRspCurve: Array.from({ length: 360 }, (_, i) => ({ f: i, db: 0 })),
      productionHouseCurveTarget: Array.from({ length: 360 }, (_, i) => ({ f: i, db: 0 })),
      postEqPerSeatCurves: Array.from({ length: seatCount }, () => []),
    },
  };
}

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.error(`  \u2717 ${name}: ${e.message}`); }
}

// A. successful insertion -> advance
test('A: successful insertion -> advance', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: true,
    readbackResult: true,
    retryCount: 0,
    maxRetries: 1,
  });
  assert.strictEqual(decision.action, 'advance');
  assert.strictEqual(decision.retryCount, 0);
});

// B. first insertion failure -> retry
test('B: first insertion failure -> retry (not silent loss)', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: false,
    readbackResult: false,
    retryCount: 0,
    maxRetries: 1,
  });
  assert.strictEqual(decision.action, 'retry');
  assert.strictEqual(decision.retryCount, 1);
  // CRITICAL: action is NOT 'advance' — target is not silently lost
  assert.notStrictEqual(decision.action, 'advance');
});

// C. second insertion failure -> fail (no infinite loop)
test('C: second insertion failure -> fail (no infinite loop)', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: false,
    readbackResult: false,
    retryCount: 1,
    maxRetries: 1,
  });
  assert.strictEqual(decision.action, 'fail');
  assert.strictEqual(decision.retryCount, 1);
  // Must not retry again
  assert.notStrictEqual(decision.action, 'retry');
});

// D. cancellation -> discard (not failure)
test('D: cancellation -> discard (not failure)', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: false,
    readbackResult: false,
    retryCount: 0,
    maxRetries: 1,
    cancelled: true,
  });
  assert.strictEqual(decision.action, 'discard');
  assert.notStrictEqual(decision.action, 'fail');
  assert.notStrictEqual(decision.action, 'retry');
});

// D2. fingerprint change -> discard (not failure)
test('D2: fingerprint change -> discard (not failure)', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: false,
    readbackResult: false,
    retryCount: 0,
    maxRetries: 1,
    fingerprintChanged: true,
  });
  assert.strictEqual(decision.action, 'discard');
  assert.notStrictEqual(decision.action, 'fail');
});

// D3. fingerprint change overrides even successful insert
test('D3: fingerprint change overrides successful insert', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: true,
    readbackResult: true,
    retryCount: 0,
    maxRetries: 1,
    fingerprintChanged: true,
  });
  assert.strictEqual(decision.action, 'discard');
});

// D4. cancelled overrides even successful insert
test('D4: cancelled overrides successful insert', () => {
  const decision = resolveBackgroundTargetAdvance({
    insertResult: true,
    readbackResult: true,
    retryCount: 0,
    maxRetries: 1,
    cancelled: true,
  });
  assert.strictEqual(decision.action, 'discard');
});

// E. insert true but readback missing -> treat as failure (retry then fail)
test('E: insert true but readback missing -> retry then fail', () => {
  const decision1 = resolveBackgroundTargetAdvance({
    insertResult: true,
    readbackResult: false,
    retryCount: 0,
    maxRetries: 1,
  });
  assert.strictEqual(decision1.action, 'retry');
  assert.strictEqual(decision1.retryCount, 1);
  // NOT advance — readback missing means the cache entry is not verified
  assert.notStrictEqual(decision1.action, 'advance');

  const decision2 = resolveBackgroundTargetAdvance({
    insertResult: true,
    readbackResult: false,
    retryCount: 1,
    maxRetries: 1,
  });
  assert.strictEqual(decision2.action, 'fail');
});

// F. partial sweep — one target fails permanently, others advance
test('F: partial sweep — failed target does not block others', () => {
  const maxRetries = 1;
  const results = [];

  // Target 1: success first try
  results.push(resolveBackgroundTargetAdvance({ insertResult: true, readbackResult: true, retryCount: 0, maxRetries }).action);

  // Target 2: fail first try -> retry, fail second try -> fail
  const d1 = resolveBackgroundTargetAdvance({ insertResult: false, readbackResult: false, retryCount: 0, maxRetries });
  results.push(d1.action); // retry
  const d2 = resolveBackgroundTargetAdvance({ insertResult: false, readbackResult: false, retryCount: 1, maxRetries });
  results.push(d2.action); // fail

  // Target 3: success first try (continues after target 2 failed)
  results.push(resolveBackgroundTargetAdvance({ insertResult: true, readbackResult: true, retryCount: 0, maxRetries }).action);

  assert.deepStrictEqual(results, ['advance', 'retry', 'fail', 'advance']);
  // The sweep is NOT 3/3 — it is 2/3 with 1 failed
  const successCount = results.filter((a) => a === 'advance').length;
  const failCount = results.filter((a) => a === 'fail').length;
  assert.strictEqual(successCount, 2, '2 targets advanced');
  assert.strictEqual(failCount, 1, '1 target failed permanently');
});

// G. diagnostic capture: null contract -> all gates FAIL
test('G: diagnostic capture — null contract -> all gates FAIL', () => {
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'minimum-L1',
    compactContract: null,
    workerResult: { pool: { candidates: [] } },
    fingerprint: 'fp-abc',
    calibrationFingerprint: 'cal-xyz',
    baseDesignFingerprint: 'cal:v5:601a675bda8e18d1',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 1,
    cancelled: false,
    failureReason: 'contract-build-null',
  });
  assert.strictEqual(diag.targetKey, 'minimum-L1');
  assert.strictEqual(diag.compactContractExists, false);
  assert.strictEqual(diag.gateA.pass, false);
  assert.strictEqual(diag.gateB.pass, false);
  assert.strictEqual(diag.gateC.pass, false);
  assert.strictEqual(diag.failureReason, 'contract-build-null');
  assert.strictEqual(diag.retryCount, 1);
  assert.strictEqual(diag.workerCompleted, true);
});

// H. diagnostic capture: valid contract rejected by insert -> gates PASS but failure recorded
test('H: diagnostic capture — valid contract, insert rejected -> gates PASS', () => {
  const contract = makeValidContract({ targetKey: 'minimum-L3' });
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'minimum-L3',
    compactContract: contract,
    workerResult: { pool: { candidates: [{}] } },
    fingerprint: 'fp-def',
    calibrationFingerprint: 'cal-def',
    baseDesignFingerprint: 'cal:v5:abc',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 1,
    cancelled: false,
    failureReason: 'insert-rejected',
  });
  assert.strictEqual(diag.compactContractExists, true);
  assert.strictEqual(diag.gateA.pass, true);
  assert.strictEqual(diag.gateB.pass, true);
  assert.strictEqual(diag.gateC.pass, true);
  assert.strictEqual(diag.gateA.jobStatus, 'complete');
  assert.strictEqual(diag.gateA.canonicalMetricPublicationValid, true);
  assert.strictEqual(diag.gateB.postEqRspCurveLength, 360);
  assert.strictEqual(diag.gateB.productionHouseCurveTargetLength, 360);
  assert.strictEqual(diag.gateB.postEqPerSeatCurvesCount, 4);
  assert.strictEqual(diag.gateC.p19Status, 'complete');
  assert.strictEqual(diag.gateC.p19Value, 5.72);
  assert.strictEqual(diag.gateC.perSeatP19ResultsCount, 4);
  assert.strictEqual(diag.gateC.realSeatCount, 4);
});

// I. diagnostic capture: contract missing graphPayload -> gateB FAIL
test('I: diagnostic capture — missing graphPayload -> gateB FAIL', () => {
  const contract = makeValidContract({ targetKey: 'minimum-L4' });
  delete contract.graphPayload;
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'minimum-L4',
    compactContract: contract,
    workerResult: null,
    fingerprint: 'fp-ghi',
    calibrationFingerprint: 'cal-ghi',
    baseDesignFingerprint: 'cal:v5:ghi',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 0,
    cancelled: false,
    failureReason: 'insert-rejected',
  });
  assert.strictEqual(diag.gateA.pass, true);
  assert.strictEqual(diag.gateB.pass, false);
  assert.strictEqual(diag.gateB.postEqRspCurveLength, null);
});

// J. diagnostic capture: p19 incomplete -> gateC FAIL
test('J: diagnostic capture — p19 incomplete -> gateC FAIL', () => {
  const contract = makeValidContract({ targetKey: 'recommended-L1' });
  contract.productAnalysis.parameters.p19.status = 'uncalculated';
  contract.productAnalysis.parameters.p19.value = null;
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'recommended-L1',
    compactContract: contract,
    workerResult: { pool: { candidates: [{}] } },
    fingerprint: 'fp-jkl',
    calibrationFingerprint: 'cal-jkl',
    baseDesignFingerprint: 'cal:v5:jkl',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 0,
    cancelled: false,
    failureReason: 'insert-rejected',
  });
  assert.strictEqual(diag.gateA.pass, true);
  assert.strictEqual(diag.gateB.pass, true);
  assert.strictEqual(diag.gateC.pass, false);
  assert.strictEqual(diag.gateC.p19Status, 'uncalculated');
  assert.strictEqual(diag.gateC.p19Value, null);
});

// K. diagnostic capture: seat count mismatch -> gateA FAIL
test('K: diagnostic capture — seat count mismatch -> gateA FAIL', () => {
  const contract = makeValidContract({ targetKey: 'recommended-L2', seatCount: 4 });
  contract.provenance.realSeatCount = 8; // mismatch
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'recommended-L2',
    compactContract: contract,
    workerResult: { pool: { candidates: [{}] } },
    fingerprint: 'fp-mno',
    calibrationFingerprint: 'cal-mno',
    baseDesignFingerprint: 'cal:v5:mno',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 0,
    cancelled: false,
    failureReason: 'insert-rejected',
  });
  assert.strictEqual(diag.gateA.pass, false);
  assert.strictEqual(diag.gateC.realSeatCount, 8);
  assert.strictEqual(diag.gateC.perSeatP19ResultsCount, 4);
});

// L. formatDiagnosticLine produces compact string without arrays
test('L: formatDiagnosticLine — compact, no arrays', () => {
  const diag = captureTargetFailureDiagnostics({
    targetKey: 'minimum-L1',
    compactContract: null,
    workerResult: null,
    fingerprint: 'fp',
    calibrationFingerprint: 'cal',
    baseDesignFingerprint: 'cal:v5:abc',
    foregroundTargetKey: 'minimum-L2',
    retryCount: 1,
    cancelled: false,
    failureReason: 'contract-build-null',
  });
  const line = formatDiagnosticLine(diag);
  assert.ok(line.includes('target minimum-L1'));
  assert.ok(line.includes('gateA=FAIL'));
  assert.ok(line.includes('gateB=FAIL'));
  assert.ok(line.includes('gateC=FAIL'));
  assert.ok(line.includes('contract=NO'));
  assert.ok(line.includes('retry=1'));
  // Must not contain array data
  assert.ok(!line.includes('360'), 'line must not contain curve lengths');
});

// M. no silent loss: verify retry path does not advance
test('M: no silent loss — retry does not advance', () => {
  // The old bug: yieldAndRunNext() was called regardless of insert result.
  // The fix: failed insert -> retry (not advance).
  // Simulate the full lifecycle of a failing target:
  let retryCount = 0;
  const maxRetries = 1;
  const actions = [];

  // Attempt 1: fail
  let d = resolveBackgroundTargetAdvance({ insertResult: false, readbackResult: false, retryCount, maxRetries });
  actions.push(d.action);
  retryCount = d.retryCount;

  // Attempt 2: fail again (retryCount now 1)
  d = resolveBackgroundTargetAdvance({ insertResult: false, readbackResult: false, retryCount, maxRetries });
  actions.push(d.action);

  // The target was retried once, then failed. It was NEVER silently advanced.
  assert.deepStrictEqual(actions, ['retry', 'fail']);
  assert.ok(!actions.includes('advance'), 'failing target must never advance');
});

// N. successful retry: first fail, then success on retry
test('N: successful retry — fail then succeed on second attempt', () => {
  let retryCount = 0;
  const maxRetries = 1;

  // Attempt 1: fail
  let d = resolveBackgroundTargetAdvance({ insertResult: false, readbackResult: false, retryCount, maxRetries });
  assert.strictEqual(d.action, 'retry');
  retryCount = d.retryCount;

  // Attempt 2: succeed
  d = resolveBackgroundTargetAdvance({ insertResult: true, readbackResult: true, retryCount, maxRetries });
  assert.strictEqual(d.action, 'advance');
  assert.strictEqual(d.retryCount, 0, 'retryCount resets on success');
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);