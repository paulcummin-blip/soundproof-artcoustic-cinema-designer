// test/ai-summary-payload.test.mjs
//
// Tests for buildAiSummaryPayload — the canonical AI input schema builder.
// Verifies: N/A exclusion, FAIL retention, P19/P20 seat preservation,
// Primary/Secondary category floors, DPI scores passed.
//
// Run: node test/ai-summary-payload.test.mjs

import { strict as assert } from "node:assert";
import { buildAiSummaryPayload } from "../src/components/aiSummary/buildAiSummaryPayload.js";

const tests = [];
let passed = 0, failed = 0;
function test(name, fn) { tests.push({ name, fn }); }

// ── Mock data ──
function makeSnapshot({ parameters = {}, dpi = { primary: 88, secondary: 71, all: 82 }, categories = null } = {}) {
  const defaultCategories = [
    { name: "Spatial Resolution", floorLevel: "L3" },
    { name: "Dynamic Range", floorLevel: "L4" },
    { name: "Timbre Matching", floorLevel: "L2" },
  ];
  const cats = categories || defaultCategories;
  return {
    projectId: "proj-1",
    versionId: "ver-1",
    calculationFingerprint: "bass-fp-1",
    rating: { seatPriorityFingerprint: "seat-fp-1" },
    engineeringSummary: {
      seatPriorityFingerprint: "seat-fp-1",
      primary: { designPerformanceIndex: dpi.primary, seatIds: ["seat-1"], categories: cats },
      secondary: { designPerformanceIndex: dpi.secondary, seatIds: ["seat-2"], categories: cats },
      project: { designPerformanceIndex: dpi.all, seatIds: ["seat-1", "seat-2"] },
      parameterAuthority: parameters,
      viewing: { available: true, primary_floor: "L3", secondary_floor: "L2", project_floor: "L2", summary: "Viewing angles calculated.", per_seat: [{ seat_id: "seat-1" }] },
    },
  };
}

function makeProject() {
  return {
    name: "Test Cinema",
    client_name: "Test Client",
    version_name: "Current Design",
    room_width: 4.5,
    room_length: 6.0,
    room_height: 2.4,
    account_id: "acc-1",
    subwooferInstances: [{ id: "sub-1", model: "Sub A", enabled: true }],
    screen_size: 120,
    aspect_ratio: "16:9",
  };
}

// D. same-fingerprint Engineering Summary feeds payload
test("D: payload carries fingerprint identity", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.equal(payload.identity.projectId, "proj-1");
  assert.equal(payload.identity.versionId, "ver-1");
  assert.equal(payload.identity.calculationFingerprint, "bass-fp-1");
  assert.equal(payload.identity.seatPriorityFingerprint, "seat-fp-1");
});

// 5. Design Rating values passed
test("5: DPI scores passed through", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.equal(payload.designRating.primary, 88);
  assert.equal(payload.designRating.secondary, 71);
  assert.equal(payload.designRating.all, 82);
});

// I. Primary/Secondary category floors preserved
test("I: category floors preserved for Primary and Secondary", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.equal(payload.categoryFloors.primary.length, 3);
  assert.equal(payload.categoryFloors.secondary.length, 3);
  assert.equal(payload.categoryFloors.primary[0].name, "Spatial Resolution");
  assert.equal(payload.categoryFloors.primary[0].floorLevel, "L3");
  assert.equal(payload.categoryFloors.primary[1].name, "Dynamic Range");
  assert.equal(payload.categoryFloors.primary[1].floorLevel, "L4");
});

// F. N/A / Not Calculated parameters excluded
test("F: N/A parameters excluded", () => {
  const parameters = {
    p4: { scope: "room", state: "scored", level: "L3" },
    p5: { scope: "room", state: "na", level: null },
    p6: { scope: "room", state: "scored", level: "L4" },
    p15: { scope: "room", state: "provisional", level: null },
  };
  const snap = makeSnapshot({ parameters });
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.parameters.all.p4, "p4 should be included");
  assert.equal(payload.parameters.all.p4.level, "L3");
  assert.ok(!payload.parameters.all.p5, "p5 (N/A) should be excluded");
  assert.ok(!payload.parameters.all.p15, "p15 (provisional) should be excluded");
  assert.ok(payload.parameters.all.p6, "p6 should be included");
});

// G. genuine FAIL retained
test("G: FAIL level retained", () => {
  const parameters = {
    p4: { scope: "room", state: "scored", level: "FAIL" },
    p6: { scope: "room", state: "scored", level: "L4" },
  };
  const snap = makeSnapshot({ parameters });
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.parameters.all.p4, "p4 with FAIL should be retained");
  assert.equal(payload.parameters.all.p4.level, "FAIL");
});

// H. P19/P20 seat results preserved
test("H: P19 per-seat results preserved", () => {
  const parameters = {
    p19: {
      scope: "seat", state: "scored",
      seats: {
        "seat-1": { state: "scored", level: "L3", rawValue: 2.5 },
        "seat-2": { state: "scored", level: "L2", rawValue: 4.0 },
      },
    },
    p20: {
      scope: "seat", state: "scored",
      seats: {
        "seat-1": { state: "scored", level: "L4", rawValue: 1.0 },
        "seat-2": { state: "scored", level: "L3", rawValue: 2.0 },
      },
    },
  };
  const snap = makeSnapshot({ parameters });
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.bass, "bass should be present");
  assert.ok(payload.bass.p19, "P19 should be present");
  assert.equal(payload.bass.p19.perSeat["seat-1"].level, "L3");
  assert.equal(payload.bass.p19.perSeat["seat-2"].level, "L2");
  assert.ok(payload.bass.p20, "P20 should be present");
  assert.equal(payload.bass.p20.perSeat["seat-1"].level, "L4");
});

// 6. Bass values passed (P14, P18)
test("6: P14 and P18 passed when scored", () => {
  const parameters = {
    p14: { scope: "room", state: "scored", level: "L3", rawValue: 105.0 },
    p18: { scope: "room", state: "scored", level: "L4", rawValue: 32.0 },
  };
  const snap = makeSnapshot({ parameters });
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.bass.p14, "P14 should be present");
  assert.equal(payload.bass.p14.level, "L3");
  assert.ok(payload.bass.p18, "P18 should be present");
  assert.equal(payload.bass.p18.level, "L4");
});

// P14/P18 excluded when not scored
test("P14/P18 excluded when not scored", () => {
  const parameters = {
    p14: { scope: "room", state: "provisional", level: null },
    p18: { scope: "room", state: "na", level: null },
  };
  const snap = makeSnapshot({ parameters });
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(!payload.bass || !payload.bass.p14, "P14 should be excluded");
  assert.ok(!payload.bass || !payload.bass.p18, "P18 should be excluded");
});

// Viewing passed when available
test("viewing passed when available", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.viewing, "viewing should be present");
  assert.equal(payload.viewing.primaryFloor, "L3");
  assert.equal(payload.viewing.secondaryFloor, "L2");
});

// Null snapshot → null payload
test("null snapshot → null payload", () => {
  const payload = buildAiSummaryPayload({ publishedSnapshot: null, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.equal(payload, null);
});

// Project info passed
test("project info passed", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.equal(payload.project.name, "Test Cinema");
  assert.equal(payload.project.clientName, "Test Client");
  assert.equal(payload.project.versionName, "Current Design");
  assert.equal(payload.project.roomDimensions.widthM, 4.5);
});

// System info passed
test("system info passed", () => {
  const snap = makeSnapshot();
  const payload = buildAiSummaryPayload({ publishedSnapshot: snap, projectDetails: makeProject(), projectId: "proj-1", versionId: "ver-1" });
  assert.ok(payload.system, "system should be present");
  assert.equal(payload.system.subwooferCount, 1);
  assert.deepEqual(payload.system.subwooferModels, ["Sub A"]);
});

// ── Run ──
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);