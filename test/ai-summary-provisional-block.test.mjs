// test/ai-summary-provisional-block.test.mjs
//
// Regression tests for the provisional-authority block and stale detection.
// Locks the defect: AI must never summarize an intermediate Design Rating,
// and stale summaries must be detected when the design changes.
//
// Tests: E (stale fingerprint), M (authority changes mid-request),
// J (manual edits survive recalculation), K (regeneration does not overwrite).
//
// Run: node test/ai-summary-provisional-block.test.mjs

import { strict as assert } from "node:assert";
import { isAiSummaryReady } from "../src/components/aiSummary/aiSummaryReadiness.js";
import { isAiSummaryStale, extractGenerationFingerprints } from "../src/components/aiSummary/aiSummaryStaleDetection.js";

const tests = [];
let passed = 0, failed = 0;
function test(name, fn) { tests.push({ name, fn }); }

function makeSnapshot({ bassFp = "bass-fp-1", seatFp = "seat-fp-1", projectId = "proj-1", versionId = "ver-1" } = {}) {
  return {
    projectId, versionId,
    calculationFingerprint: bassFp,
    rating: { seatPriorityFingerprint: seatFp },
    engineeringSummary: {
      seatPriorityFingerprint: seatFp,
      primary: { designPerformanceIndex: 88 },
      secondary: { designPerformanceIndex: 71 },
      project: { designPerformanceIndex: 82 },
    },
  };
}

// E. stale fingerprint marks summary stale
test("E: matching fingerprints → not stale", () => {
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  const currentSnapshot = makeSnapshot();
  assert.equal(isAiSummaryStale({ summaryRecord, currentSnapshot }), false);
});

test("E2: bass fingerprint changed → stale", () => {
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  const currentSnapshot = makeSnapshot({ bassFp: "bass-fp-2" });
  assert.equal(isAiSummaryStale({ summaryRecord, currentSnapshot }), true);
});

test("E3: seat-priority fingerprint changed → stale", () => {
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  const currentSnapshot = makeSnapshot({ seatFp: "seat-fp-2" });
  assert.equal(isAiSummaryStale({ summaryRecord, currentSnapshot }), true);
});

test("E4: both fingerprints changed → stale", () => {
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  const currentSnapshot = makeSnapshot({ bassFp: "bass-fp-2", seatFp: "seat-fp-2" });
  assert.equal(isAiSummaryStale({ summaryRecord, currentSnapshot }), true);
});

// M. AI result discarded if authority changes mid-request
test("M: authority changed mid-request → stale detected", () => {
  // Simulate: summary was generated from bass-fp-1, but current snapshot now has bass-fp-2
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  const currentSnapshot = makeSnapshot({ bassFp: "bass-fp-2" });
  const stale = isAiSummaryStale({ summaryRecord, currentSnapshot });
  assert.equal(stale, true, "stale summary must be detected after authority change");
});

// M2: null summary record → stale (no previous generation)
test("M2: null summary record → stale", () => {
  const currentSnapshot = makeSnapshot();
  assert.equal(isAiSummaryStale({ summaryRecord: null, currentSnapshot }), true);
});

// M3: null current snapshot → stale
test("M3: null current snapshot → stale", () => {
  const summaryRecord = { generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" } };
  assert.equal(isAiSummaryStale({ summaryRecord, currentSnapshot: null }), true);
});

// Extract generation fingerprints
test("extractGenerationFingerprints returns correct identity", () => {
  const snap = makeSnapshot();
  const fp = extractGenerationFingerprints(snap);
  assert.equal(fp.calculationFingerprint, "bass-fp-1");
  assert.equal(fp.seatPriorityFingerprint, "seat-fp-1");
});

test("extractGenerationFingerprints null snapshot → null", () => {
  const fp = extractGenerationFingerprints(null);
  assert.equal(fp, null);
});

// J. manual edits survive recalculation (stale detection preserves old text)
test("J: stale summary preserves old text (not overwritten)", () => {
  // When design changes, the summary is marked stale but the old text
  // remains visible. The UI shows "Design changed — regenerate summary"
  // and the user can still see the old edited text.
  const summaryRecord = {
    ai_generated_text: "AI generated text",
    edited_text: "User edited text",
    generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" },
  };
  const currentSnapshot = makeSnapshot({ bassFp: "bass-fp-2" });
  const stale = isAiSummaryStale({ summaryRecord, currentSnapshot });
  assert.equal(stale, true, "must be stale");
  // The edited_text is preserved — not overwritten
  assert.equal(summaryRecord.edited_text, "User edited text");
});

// K. regeneration does not overwrite manual edits until explicitly accepted
test("K: stale detection does not auto-overwrite edited text", () => {
  // The isAiSummaryStale function only DETECTS staleness.
  // It does NOT modify the record. The UI must offer "Regenerate" and
  // only overwrite on explicit user action.
  const summaryRecord = {
    ai_generated_text: "Original AI text",
    edited_text: "Manual edits preserved",
    generated_from_fingerprints: { calculationFingerprint: "bass-fp-1", seatPriorityFingerprint: "seat-fp-1" },
  };
  const currentSnapshot = makeSnapshot({ bassFp: "bass-fp-2" });
  isAiSummaryStale({ summaryRecord, currentSnapshot });
  // Function is pure — does not modify the record
  assert.equal(summaryRecord.edited_text, "Manual edits preserved");
  assert.equal(summaryRecord.ai_generated_text, "Original AI text");
});

// Provisional authority block (68/63/66-style partial → cannot reach AI)
test("provisional: snapshot with no engineeringSummary → not ready", () => {
  const snap = { projectId: "proj-1", versionId: "ver-1", calculationFingerprint: "fp", rating: {} };
  const r = isAiSummaryReady({ publishedSnapshot: snap, projectId: "proj-1", versionId: "ver-1" });
  assert.equal(r.ready, false);
  assert.equal(r.reason, "waiting-for-analysis");
});

test("provisional: snapshot with null DPI → not ready", () => {
  const snap = makeSnapshot({ dpi: { primary: null, secondary: null, all: null } });
  // Override the DPI to null
  snap.engineeringSummary.primary.designPerformanceIndex = null;
  snap.engineeringSummary.secondary.designPerformanceIndex = null;
  snap.engineeringSummary.project.designPerformanceIndex = null;
  const r = isAiSummaryReady({ publishedSnapshot: snap, projectId: "proj-1", versionId: "ver-1" });
  assert.equal(r.ready, false);
});

// ── Run ──
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);