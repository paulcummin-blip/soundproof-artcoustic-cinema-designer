import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const roomVisualisation = read("src/components/room/RoomVisualisation.jsx");
const recommendationEngine = read("src/components/recommendations/DesignRecommendationEngine.jsx");
const runtimeDiagnostic = read("src/components/utils/rp22RuntimeDiagnostic.js");

test("RoomVisualisation reuses the Room Designer RP22 authority", () => {
  assert.doesNotMatch(
    roomVisualisation,
    /useRP22AnalysisEngine\s*\(/,
    "RoomVisualisation must not run a second full RP22 analysis"
  );
  assert.match(
    roomVisualisation,
    /const liveRp22 = analysisResult \|\| \{\};/,
    "Live Impact must consume the authority already passed by RoomDesigner"
  );
});

test("automatic recommendation candidates run one at a time only after interaction is quiet", () => {
  assert.match(recommendationEngine, /requestIdleCallback\(beginNext/);
  assert.match(recommendationEngine, /const \[activeCandidateId, setActiveCandidateId\]/);
  assert.match(recommendationEngine, /return activeCandidate && !baselineBassPending/);
  assert.match(recommendationEngine, /getIdleResumeDeadline\(\)/);
  assert.match(recommendationEngine, /!isUserInteracting\(\)/);
  assert.match(recommendationEngine, /candidateReadyAfterRef\.current = Date\.now\(\) \+ 10000/);
  assert.doesNotMatch(
    recommendationEngine,
    /!baselineBassPending && candidates\.map\(/,
    "all candidate evaluators must not mount together"
  );
});

test("a geometry or model change invalidates settled recommendation results", () => {
  assert.match(recommendationEngine, /seats: \(candidate\.seats \|\| \[\]\)\.map/);
  assert.match(recommendationEngine, /speakers: \(candidate\.placedSpeakers \|\| \[\]\)\.map/);
  assert.match(
    recommendationEngine,
    /useEffect\(\(\) => \{\s*candidateReadyAfterRef\.current = Date\.now\(\) \+ 10000;\s*setResultsById\(\{\}\);\s*setActiveCandidateId\(null\);\s*\}, \[candidateSignature\]\);/
  );
});

test("temporary RP22 console diagnostics are opt-in, not production-default", () => {
  assert.match(
    runtimeDiagnostic,
    /globalThis\.__B44_RP22_RUNTIME_DIAGNOSTICS === true/
  );
  assert.match(
    runtimeDiagnostic,
    /export function logRp22EngineDiagnostic\(snapshot\) \{\s*if \(!diagnosticsEnabled\(\)\) return;/
  );
  assert.match(
    runtimeDiagnostic,
    /export function logRp22SplDiagnostic\(snapshot\) \{\s*if \(!diagnosticsEnabled\(\)\) return;/
  );
});
