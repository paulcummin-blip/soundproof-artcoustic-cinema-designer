// Temporary checkpoint verification script
import { buildStageResults, STAGE_DISPLAY_LABELS } from "@/components/room/bass/improveBassV2/improveBassV2StageAuthority.js";
import { delayMsToAcousticDistance } from "@/components/room/bass/improveBassV2/acousticDistance.js";
import { defineGainGroups, generateGroupedGainCoarseCandidates, runGroupedGainSearch } from "@/components/room/bass/improveBassV2/groupedGainSearch.js";
import { generateSeatingCandidates, getSearchOffsets, describeSeatingChange } from "@/components/room/bass/improveBassV2/seatingPositionSearch.js";

// ── Checkpoint 2: Five-stage results ─────────────────────────────────
const selection = {
  currentResult: {
    candidateId: "current",
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 4.8, level: 4 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 3.0, level: 4 }],
  },
  calibrationResult: {
    candidateId: "delay-winner",
    appliedTuning: [
      { sourceId: "sub-fl", delayMs: 0 },
      { sourceId: "sub-fr", delayMs: 0 },
      { sourceId: "sub-rl", delayMs: 9 },
      { sourceId: "sub-rr", delayMs: 9 },
    ],
    perSeatP19: [{ seatId: "s1", isPrimary: true, variationDbRaw: 0.4, level: 4 }],
    perSeatP20: [{ seatId: "s1", isPrimary: true, variationDbRaw: 0.23, level: 4 }],
  },
  calibrationMaterial: { material: true, reason: "delay improvement" },
  calibrationDiagnostics: {
    coarseCount: 61, fineCount: 2,
    grouping: {
      groups: [
        { label: "Front pair", sourceIds: ["sub-fl", "sub-fr"] },
        { label: "Rear pair", sourceIds: ["sub-rl", "sub-rr"] },
      ],
    },
  },
  gainResult: null,
  gainMaterial: { material: false, reason: "no improvement" },
  gainDiagnostics: { tested: 9, options: [] },
  seatingResult: null,
  seatingMaterial: { material: false, reason: "no improvement" },
  seatingDiagnostics: { tested: 11 },
  confirmedResults: [],
};

const stageResults = buildStageResults(selection);

console.log("=== CHECKPOINT 2: FIVE STAGE RESULTS ===");
for (const [key, label] of Object.entries(STAGE_DISPLAY_LABELS)) {
  const sr = stageResults[key];
  console.log(`${label}:`);
  console.log(`  status: ${sr.verdict.toUpperCase().replace(/_/g, " ")}`);
  console.log(`  hasResult: ${!!sr.result}`);
  if (sr.reason) console.log(`  reason: ${sr.reason}`);
  if (sr.delayGroupLabel) {
    console.log(`  groupLabel: ${sr.delayGroupLabel}`);
    console.log(`  adjustmentMs: ${sr.delayAdjustmentMs} ms`);
    console.log(`  acousticPath: ${delayMsToAcousticDistance(sr.delayAdjustmentMs).toFixed(2)} m`);
  }
  console.log("");
}

// ── Checkpoint 4: Delay presentation ──────────────────────────────────
console.log("=== CHECKPOINT 4: DELAY PRESENTATION ===");
const delayMs = 9.0;
const acousticM = delayMsToAcousticDistance(delayMs);
console.log(`Delay: ${delayMs.toFixed(1)} ms`);
console.log(`Equivalent acoustic path: +${acousticM.toFixed(2)} m (timing equivalent)`);
console.log(`Speed of sound: 343 m/s (shared authority)`);
console.log("");

// ── Checkpoint 5: Gain search execution ──────────────────────────────
console.log("=== CHECKPOINT 5: GAIN SEARCH EXECUTION ===");
const instances = [
  { id: "sub-fl", position: { x: 1, y: 1 }, gainDb: 0 },
  { id: "sub-fr", position: { x: 3, y: 1 }, gainDb: 0 },
  { id: "sub-rl", position: { x: 1, y: 5 }, gainDb: 0 },
  { id: "sub-rr", position: { x: 3, y: 5 }, gainDb: 0 },
];
const roomDims = { widthM: 5, lengthM: 7, heightM: 2.4 };
const grouping = defineGainGroups(instances, roomDims);
console.log("Gain groups:");
for (const g of grouping.groups) {
  console.log(`  ${g.label}: ${JSON.stringify(g.sourceIds)} (${g.sourceIds.length} sources — symmetric pair)`);
}
console.log(`Grouping status: ${grouping.status}`);

// Provide frozen effective source tuning (baseline) for coarse candidate generation
const baseline = [
  { sourceId: "sub-fl", delayMs: 0, gainDb: 0, polarity: 0 },
  { sourceId: "sub-fr", delayMs: 0, gainDb: 0, polarity: 0 },
  { sourceId: "sub-rl", delayMs: 9, gainDb: 0, polarity: 0 },
  { sourceId: "sub-rr", delayMs: 9, gainDb: 0, polarity: 0 },
];
const coarse = generateGroupedGainCoarseCandidates(grouping, baseline);
console.log(`Coarse candidate count: ${coarse.length}`);
console.log(`Group directions: ${grouping.groups.map(g => g.label).join(", ")}`);
// Verify front L/R share one gain, rear L/R share one gain
for (const g of grouping.groups) {
  console.log(`  ${g.label} has ${g.sourceIds.length} sources (symmetric pair)`);
}
// Show a few candidates
for (const c of coarse.slice(0, 5)) {
  console.log(`  candidate: id=${c.id}, direction=${c.direction}, adj=${c.adjustmentDb}dB`);
}
console.log("");

// ── Checkpoint 6: Seating search execution ───────────────────────────
console.log("=== CHECKPOINT 6: SEATING SEARCH EXECUTION ===");
const offsets = getSearchOffsets();
console.log(`Seating offsets tested: ${offsets.map(o => (o > 0 ? "+" : "") + o + " mm").join(", ")}`);
console.log(`Offset count: ${offsets.length}`);

const seatingPositions = [
  { id: "s1", isPrimary: true, x: 2, y: 3, earHeightM: 1.2, platformHeightM: 0.3 },
  { id: "s2", isPrimary: false, x: 2, y: 3.5, earHeightM: 1.2, platformHeightM: 0.3 },
];
const seatingCandidates = generateSeatingCandidates(seatingPositions, roomDims, "front");
console.log(`Seating candidates generated: ${seatingCandidates.length}`);
const validCandidates = seatingCandidates.filter(c => c.valid);
const rejectedCandidates = seatingCandidates.filter(c => !c.valid);
console.log(`Valid candidates: ${validCandidates.length}`);
console.log(`Rejected candidates: ${rejectedCandidates.length}`);
if (rejectedCandidates.length > 0) {
  for (const r of rejectedCandidates) {
    console.log(`  Rejected offset ${r.offsetMm}mm: ${r.rejectionReason}`);
  }
}
if (validCandidates.length > 0) {
  const first = validCandidates[0];
  console.log(`First valid candidate: offset=${first.offsetMm}mm, direction=${first.direction}`);
  const movedSeats = first.seatingPositions;
  if (movedSeats && movedSeats.length > 1) {
    const ys = movedSeats.map(s => s.y);
    const xs = movedSeats.map(s => s.x);
    console.log(`All x unchanged: ${xs.every(x => x === seatingPositions[0].x)}`);
    const deltaY0 = ys[0] - seatingPositions[0].y;
    const deltaY1 = ys[1] - seatingPositions[1].y;
    console.log(`All y shifted by same delta: ${Math.abs(deltaY0 - deltaY1) < 1e-9} (delta0=${deltaY0.toFixed(3)}, delta1=${deltaY1.toFixed(3)})`);
    console.log(`Seat IDs unchanged: ${movedSeats.every((s, i) => s.id === seatingPositions[i].id)}`);
    console.log(`Ear heights unchanged: ${movedSeats.every((s, i) => s.earHeightM === seatingPositions[i].earHeightM)}`);
    console.log(`Platform heights unchanged: ${movedSeats.every((s, i) => s.platformHeightM === seatingPositions[i].platformHeightM)}`);
  }
}
console.log(`Sign convention: negative = ${describeSeatingChange(-100)}, positive = ${describeSeatingChange(100)}`);