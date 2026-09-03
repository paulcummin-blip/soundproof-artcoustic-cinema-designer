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
