import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const owner = readFileSync(new URL("../src/components/room/bass/BassBackgroundAnalysisOwner.jsx", import.meta.url), "utf8");
const authoritativeHook = readFileSync(new URL("../src/components/room/bass/useAuthoritativeBassResponse.js", import.meta.url), "utf8");
const normalizedHook = readFileSync(new URL("../src/components/room/bass/useNormalizedRoomTransferLive.js", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/components/room/bass/bassBackgroundAnalysisStore.js", import.meta.url), "utf8");
const designer = readFileSync(new URL("../src/pages/RoomDesigner.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/room/SubwooferPanel.jsx", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/components/room/bass/completedBassResultPersistence.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../src/components/room/bass/authoritativeBassResponseEngine.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/components/room/bass/authoritativeBassResponse.worker.js", import.meta.url), "utf8");
const timing = readFileSync(new URL("../src/components/room/bass/manualBassTimingDiagnostics.js", import.meta.url), "utf8");
const resultsStore = readFileSync(new URL("../src/components/room/bass/bassResultsStore.js", import.meta.url), "utf8");

test("geometry observation cannot schedule authoritative analysis", () => {
  assert.match(owner, /controller\.observeInputs\(/);
  assert.doesNotMatch(owner, /controller\.updateInputs\(/);
  assert.match(controller, /observeInputs\(\{ valid, fingerprint \}\)/);
  assert.doesNotMatch(controller.match(/observeInputs[\s\S]*?\n  updateInputs/)?.[0] || "", /startPending|startRequest|setTimer/);
});

test("all authoritative workers require an explicit matching request", () => {
  assert.match(authoritativeHook, /analysisRequestFingerprint !== fingerprints\?\.calibration/);
  assert.match(normalizedHook, /analysisRequestFingerprint !== geometryFingerprint/);
  assert.match(owner, /const onCalculate = useCallback/);
  assert.match(owner, /controller\.requestManual\(/);
  assert.match(panel, /Calculate Bass Performance/);
});

test("geometry changes cancel stale work and invalidate publication authority", () => {
  assert.match(owner, /markBassAuthorityStale\(scopeId, cacheKey\)/);
  assert.match(controller, /this\.cancelActive\("superseded"\)/);
  assert.match(persistence, /STALE: "STALE"/);
});

test("legacy placement sweeps cannot auto-start from panel or geometry", () => {
  assert.match(designer, /useBassHeavyAction/);
  assert.match(designer, /requestId: recommendationsActive \? bassHeavyAction\.requestId : null/);
  assert.match(designer, /enabled: recommendationsActive/);
});

test("Stage A does not alter acoustic equations or engine constants", () => {
  assert.doesNotMatch(owner, /maximumCutDb|maximumAggregateBoostDb|RP22.*threshold/i);
  assert.doesNotMatch(authoritativeHook, /pointsPerOctave\s*=/);
});

test("manual Calculate path no longer waits on normalized preview/refined lifecycle", () => {
  // canCalculate must not reference the normalized hook's geometryFingerprint.
  const canCalculateBlock = owner.match(/const canCalculate =[\s\S]*?seatingPositions\.length > 0;/)?.[0] || "";
  assert.doesNotMatch(canCalculateBlock, /normalizedLive/);
  // The normalized hook is invoked with analysisRequestId: null on the manual path.
  assert.match(owner, /analysisRequestId: null,\s*analysisRequestFingerprint: null,/);
  // manualRequestMatchesCurrent no longer depends on a normalized fingerprint.
  const manualMatchBlock = owner.match(/const manualRequestMatchesCurrent =[\s\S]*?;/)?.[0] || "";
  assert.doesNotMatch(manualMatchBlock, /normalized/);
});

test("authoritative engine prepares the mode bank once and reuses it for flat-source RSP transfers", () => {
  // Mode bank prepared once.
  const modeBankCalls = (engine.match(/prepareModeBank\(/g) || []).length;
  assert.equal(modeBankCalls, 1);
  // Flat-source RSP transfers reuse the precomputed mode bank.
  assert.match(engine, /precomputedModes\s*\}/);
  // Flat-source transfers are RSP-only (one simulation per enabled sub).
  assert.match(engine, /for the RSP listener only/);
  assert.match(engine, /sources\.forEach\(\(sub, sourceIndex\) =>/);
  // The flat 94 dB source convention is preserved.
  assert.match(engine, /REFERENCE_SOURCE_DB = 94/);
  assert.match(engine, /FLAT_SOURCE_CURVE = REW_SOURCE_CURVES\.flat_rew_reference/);
});

test("authoritative worker returns perSourceRspComplexTransfers in its result", () => {
  assert.match(engine, /perSourceRspComplexTransfers\s*\}/);
  assert.match(worker, /simulateAuthoritativeBassResponse/);
});

test("preparation watchdog is fingerprint-specific and bounded", () => {
  assert.match(owner, /PREPARATION_WATCHDOG_MS = 90000/);
  assert.match(owner, /manualAnalysisRequest\.id !== requestId \|\| manualAnalysisRequest\.fingerprint !== requestFingerprint/);
  // Watchdog is cleared when preparation completes (dispatch to optimiser).
  assert.match(owner, /Clear the preparation watchdog — preparation is complete\./);
});

test("authoritative worker failure clears calculating state", () => {
  assert.match(owner, /authoritative\.status === "error"/);
  const errorBlock = owner.match(/authoritative\.status === "error"[\s\S]*?setManualAnalysisRequest\(null\);/)?.[0] || "";
  assert.match(errorBlock, /markBassAuthorityFailed/);
  assert.match(errorBlock, /setManualAnalysisRequest\(null\)/);
});

test("user-facing phase label is wired through the results store and Calculate button", () => {
  assert.match(resultsStore, /calculationPhaseLabel: null/);
  assert.match(owner, /calculationPhaseLabel/);
  assert.match(owner, /Preparing bass response…/);
  assert.match(owner, /Optimising bass performance…/);
  assert.match(owner, /Finalising results…/);
  assert.match(panel, /bassCalculationPhaseLabel/);
});

test("timing instrumentation is development-only and bounded", () => {
  assert.match(timing, /const isDev = \(\) => typeof import\.meta/);
  assert.match(timing, /if \(isDev\(\)\)/);
  // No persistence or history accumulation.
  assert.doesNotMatch(timing, /localStorage|sessionStorage|JSON\.stringify/);
});

test("flat-source RSP transfers use buildNormalizedPhysicsOptions for numerical parity", () => {
  // The engine must import buildNormalizedPhysicsOptions from the normalized builder.
  assert.match(engine, /import \{ buildNormalizedPhysicsOptions \} from "@\/components\/room\/bass\/normalizedPhysicsOptionsBuilder"/);
  // The flat-source transfer must use buildNormalizedPhysicsOptions(physics), NOT engineOptionsBase.
  assert.match(engine, /const flatTransferPhysics = buildNormalizedPhysicsOptions\(physics\)/);
  assert.match(engine, /\.\.\.flatTransferPhysics, freqMinHz: 15, freqMaxHz: 200, smoothing: "none", precomputedModes/);
  // The flat-source transfer call must NOT pass engineOptionsBase directly.
  const flatTransferBlock = engine.match(/PASS 2[\s\S]*?perSourceRspComplexTransfers\.push\(/)?.[0] || "";
  assert.doesNotMatch(flatTransferBlock, /\.\.\.engineOptionsBase, precomputedModes\}/);
});