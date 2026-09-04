// luxavo-duffy-benchmark.test.mjs
//
// Luxavo/Duffy benchmark — measures the button-to-result time for a standard
// reference room configuration. The actual timing is captured at runtime in
// the browser by manualBassTimingDiagnostics.js (development-only, never
// persisted). This test validates that:
//   1. The timing instrumentation captures all lifecycle phases.
//   2. The benchmark room configuration is well-defined.
//   3. The button-to-result trace structure is complete.
//
// The ACTUAL measured button-to-result time is reported by the browser
// console in development mode:
//   [manual-bass-timing] SUMMARY { authoritativeMs, optimiserMs, totalMs }
//
// To run the benchmark in the browser:
//   1. Open the Room Designer with the Luxavo/Duffy reference room.
//   2. Open the Subwoofers panel.
//   3. Press "Calculate Bass Performance".
//   4. Read the [manual-bass-timing] SUMMARY line from the browser console.
//
// The Luxavo/Duffy reference room:
//   Width: 4.8 m, Length: 7.2 m, Height: 2.7 m
//   Seats: 2 rows × 3 seats (6 total)
//   Subs: 2 × SUB2-12 (front left + front right)
//   Target: Minimum L2 (109 dBC)

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const timingPath = new URL("../src/components/room/bass/manualBassTimingDiagnostics.js", import.meta.url);
const timingSource = readFileSync(timingPath, "utf8");

const ownerPath = new URL("../src/components/room/bass/BassBackgroundAnalysisOwner.jsx", import.meta.url);
const ownerSource = readFileSync(ownerPath, "utf8");

const storePath = new URL("../src/components/room/bass/bassResultsStore.js", import.meta.url);
const storeSource = readFileSync(storePath, "utf8");

// Luxavo/Duffy reference room configuration
export const LUXAVO_DUFFY_ROOM = Object.freeze({
  roomDims: { widthM: 4.8, lengthM: 7.2, heightM: 2.7 },
  seatingPositions: [
    { id: "r1s1", x: 1.6, y: 2.8, z: 1.2, row: 1, indexInRow: 1 },
    { id: "r1s2", x: 2.4, y: 2.8, z: 1.2, row: 1, indexInRow: 2 },
    { id: "r1s3", x: 3.2, y: 2.8, z: 1.2, row: 1, indexInRow: 3 },
    { id: "r2s1", x: 1.6, y: 4.6, z: 1.2, row: 2, indexInRow: 1 },
    { id: "r2s2", x: 2.4, y: 4.6, z: 1.2, row: 2, indexInRow: 2 },
    { id: "r2s3", x: 3.2, y: 4.6, z: 1.2, row: 2, indexInRow: 3 },
  ],
  rspPosition: { x: 2.4, y: 2.8, z: 1.2 },
  sources: [
    { id: "front-left", modelKey: "SUB2-12", x: 0.5, y: 0.5, z: 0.35 },
    { id: "front-right", modelKey: "SUB2-12", x: 4.3, y: 0.5, z: 0.35 },
  ],
  target: { p14TargetBasis: "minimum", requestedLevel: 2, selectedP14TargetDb: 109 },
});

describe("Luxavo/Duffy benchmark — timing instrumentation", () => {
  test("timing trace captures all lifecycle phases", () => {
    const phases = [
      "acceptedAtMs",
      "authoritativeStartMs",
      "authoritativeCompleteMs",
      "optimiserStartMs",
      "optimiserCompleteMs",
      "publicationMs",
      "publicationAcceptedMs",
      "calculatingClearedMs",
    ];
    for (const phase of phases) {
      assert.match(timingSource, new RegExp(phase), `Timing trace must capture ${phase}`);
    }
  });

  test("timing trace computes button-to-result total", () => {
    assert.match(timingSource, /totalDurationMs/);
    assert.match(timingSource, /authoritativeDurationMs/);
    assert.match(timingSource, /optimiserDurationMs/);
  });

  test("timing instrumentation is development-only", () => {
    assert.match(timingSource, /const isDev/);
    assert.match(timingSource, /import\.meta.*DEV/);
    assert.doesNotMatch(timingSource, /localStorage|sessionStorage|JSON\.stringify/);
  });
});

describe("Luxavo/Duffy benchmark — lifecycle wiring", () => {
  test("BassBackgroundAnalysisOwner creates timing trace on manual calculate", () => {
    assert.match(ownerSource, /createManualBassTimingTrace/);
    assert.match(ownerSource, /timingTraceRef\.current\.mark\("acceptedAtMs"\)/);
  });

  test("authoritative start is marked when worker starts, not at button click", () => {
    assert.match(ownerSource, /authoritativeStartMs/);
    assert.match(ownerSource, /authoritative\.status === "calculating"/);
  });

  test("publication accepted is marked after verified authority publishes", () => {
    assert.match(ownerSource, /publicationAcceptedMs/);
    assert.match(ownerSource, /hasCurrentResult && !calculationInProgress/);
  });

  test("terminal outcome is explicitly tracked for all terminal states", () => {
    assert.match(ownerSource, /lastTerminalOutcome/);
    assert.match(ownerSource, /outcome: "success"/);
    assert.match(ownerSource, /outcome: "error"/);
    assert.match(ownerSource, /outcome: "timeout"/);
    assert.match(ownerSource, /outcome: "cancelled"/);
    assert.match(ownerSource, /outcome: "rejected"/);
  });

  test("calculationOutcome and terminalMessage are published to the shared store", () => {
    assert.match(storeSource, /calculationOutcome/);
    assert.match(storeSource, /terminalMessage/);
  });

  test("hasCurrentResult is gated by verified authority, not structural storage", () => {
    assert.match(ownerSource, /hasCurrentResult = completedBassAuthority\?\.authoritative === true/);
    assert.match(ownerSource, /completedBassAuthority\?\.currentFingerprint === cacheKey/);
  });
});

describe("Luxavo/Duffy benchmark — reference room configuration", () => {
  test("reference room has valid dimensions", () => {
    const { roomDims } = LUXAVO_DUFFY_ROOM;
    assert.ok(roomDims.widthM > 0 && roomDims.widthM < 20);
    assert.ok(roomDims.lengthM > 0 && roomDims.lengthM < 30);
    assert.ok(roomDims.heightM > 0 && roomDims.heightM < 10);
  });

  test("reference room has 6 seats in 2 rows", () => {
    const { seatingPositions } = LUXAVO_DUFFY_ROOM;
    assert.strictEqual(seatingPositions.length, 6);
    const rows = new Set(seatingPositions.map((s) => s.row));
    assert.strictEqual(rows.size, 2);
  });

  test("reference room has 2 front subwoofers", () => {
    const { sources } = LUXAVO_DUFFY_ROOM;
    assert.strictEqual(sources.length, 2);
    assert.ok(sources.every((s) => s.modelKey === "SUB2-12"));
  });

  test("RSP is at front row centre", () => {
    const { rspPosition, seatingPositions } = LUXAVO_DUFFY_ROOM;
    const frontRow = seatingPositions.filter((s) => s.row === 1);
    assert.ok(frontRow.some((s) => s.x === rspPosition.x && s.y === rspPosition.y));
  });
});