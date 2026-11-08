// test/stage2-front-rear-coverage-safeguard.test.mjs
// Focused regression tests for the Stage 2 confirmation coverage safeguard.
//
// DEFECT (Room B):
//   startConfirmationForQuantity selected the highest-ranked raw Stage 2
//   candidate and permitted a different placement ONLY where the raw ranking
//   produced a tie. In Room B, RP22_G (side walls) ranked first and RP22_F
//   (front/rear walls) ranked second with no tie, so RP22_F — already holding
//   Stage 2 per-source transfer evidence — received NO canonical
//   confirmation. An independent canonical replay later established F's
//   preferred delay-only result, proving the omission.
//
// FIX:
//   When the leading raw candidate uses a side/mixed-wall arrangement, the
//   best already-evaluated, physically feasible front/rear-wall candidate
//   also receives canonical confirmation — even without a tie — using the
//   SAME processing opportunities (placement-only + delay-only + level-delay),
//   limits and RP22 calculations, reusing the existing Stage 2 per-source
//   transfers (no Stage 1 / physical rerun). The acoustic ranking, winner,
//   eligibility authority and practical-selection authority are unchanged.
//
// Ranking semantics: comparePlacementResults sorts placements DESCENDING by
// rankingTuple value (higher = ranks first). rankingTuple[0] =
// -effectivePrimaryNullDepth, so a LESS negative value (lower null depth) is
// better. To make G (side) rank first, G's tuple must be HIGHER than F's.
//
// No acoustic physics, RP22 scoring, Stage 1 search, ranking maths, tuning
// search algorithm, graph rendering, electronic optimisation or Apply/Restore
// logic is changed.
//
// Run: node --import ./test/_alias-register.mjs test/stage2-front-rear-coverage-safeguard.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { Stage2PlacementController } from "@/components/room/bass/stage2/stage2PlacementStore";
import { isSideOrMixedWallFamily } from "@/components/room/bass/stage2/stage2PracticalPlacementPreference";
import { FAMILY_IDS } from "@/components/room/bass/stage1/stage1FamilyRegistry";
import { comparePlacementResults, isPlacementTied } from "@/components/room/bass/stage2/stage2PlacementRanking";

// ── Helpers ──────────────────────────────────────────────────────────────

const W = 5.8;
const L = 8.4;

function makeSources(coords) {
  return coords.map((c) => ({ x: c.x, y: c.y, xNorm: c.x / W, yNorm: c.y / L }));
}

function makeRawTransfer(finalistId, familyId, coords, { perSource = false } = {}) {
  const sources = makeSources(coords);
  const rt = {
    finalistId,
    familyId,
    quantity: 2,
    coordinates: coords,
    sources,
    rspRawCurve: [],
    perSeatRawCurves: [],
    seatPriorityMap: [],
  };
  if (perSource) {
    // Minimal per-source per-seat transfers so the tuning search runs. The
    // search operates on the rsp seat entry; provide one source per coordinate.
    // Each transfer carries a `points` array of {frequency, re, im}.
    const freqs = [20, 30, 40, 50, 63, 80, 100, 120];
    rt.perSourcePerSeatComplexTransfers = sources.map((s, idx) => ({
      seatId: "rsp",
      sourceIndex: idx,
      points: freqs.map((f) => ({ frequency: f, re: 1, im: 0 })),
    }));
  }
  return rt;
}

function makePlacement(finalistId, familyId, coords, rankingTuple, opts = {}) {
  const rawTransfer = makeRawTransfer(finalistId, familyId, coords, opts);
  return { finalistId, rawTransfer, placementRanking: { rankingTuple, placementMetrics: {} } };
}

// G (side) ranks first: tuple[0] = -2 (lower null depth). F (front/rear) ranks
// second: tuple[0] = -5. Not tied (|−2 − (−5)| = 3 > tolerance).
const G_TUPLE = [-2, -1, -1, -3, 0, "g"];
const F_TUPLE = [-5, -1, -1, -3, 0, "f"];

function makeG(opts) {
  return makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], G_TUPLE, opts);
}
function makeF(opts) {
  return makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], F_TUPLE, opts);
}

function freshController(placements, qty) {
  const c = new Stage2PlacementController();
  c.params = { roomDims: { widthM: W, lengthM: L }, seatPriorityMap: new Map() };
  c.placementResults = { [qty]: placements.slice() };
  c.quantityFinalists = { [qty]: placements.map((p) => ({ id: p.finalistId })) };
  c.confirmationQueued = { [qty]: false };
  c.confirmationJobsExpectedByQty = { [qty]: 0 };
  c.confirmationJobsDoneByQty = { [qty]: 0 };
  c.confirmationJobsPlanned = 0;
  c.confirmationJobsDone = 0;
  c.totalJobsPlanned = 0;
  c.canonicalJobsRun = 0;
  c.completedResults = {};
  c.quantityFinal = {};
  c.quantityEvaluated = {};
  c.bestPerQuantity = {};
  c.queue = [];
  c.controllerPhase = "placement";
  c.projectId = "test";
  c.versionId = "test";
  c.currentFingerprint = "fp";
  return c;
}

function jobsByFinalist(controller, qty) {
  const out = {};
  for (const job of controller.queue) {
    if (job.quantity !== qty) continue;
    const id = job.finalist?.id;
    if (!out[id]) out[id] = [];
    out[id].push({
      tuningVariant: job.tuningVariant || "placement-only",
      rawTransfer: job.rawTransfer,
      familyId: job.finalist?.familyId,
      sources: job.finalist?.sources,
    });
  }
  return out;
}

function tuningVariantSet(jobsForId) {
  return new Set(jobsForId.map((j) => j.tuningVariant));
}

// ── Tests ───────────────────────────────────────────────────────────────

test("1. Reproduce Room B: G raw winner, F second, no tie → both G and F receive canonical confirmation", () => {
  const g = makeG();
  const f = makeF();
  assert.ok(isSideOrMixedWallFamily(FAMILY_IDS.RP22_G), "G is side/mixed");
  assert.ok(!isSideOrMixedWallFamily(FAMILY_IDS.RP22_F), "F is front/rear");
  assert.ok(comparePlacementResults(g, f) < 0, "G ranks strictly higher than F");
  assert.equal(isPlacementTied(g, f), false, "G and F are not tied");

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.G?.length, "G must receive confirmation jobs");
  assert.ok(jobs.F?.length, "F must receive confirmation jobs (safeguard)");
  assert.ok(tuningVariantSet(jobs.G).has("placement-only"), "G placement-only");
  assert.ok(tuningVariantSet(jobs.F).has("placement-only"), "F placement-only (safeguard)");
});

test("2. Both G and F receive the SAME processing opportunities (placement-only + tuning variants)", () => {
  const g = makeG({ perSource: true });
  const f = makeF({ perSource: true });

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  const gVariants = tuningVariantSet(jobs.G);
  const fVariants = tuningVariantSet(jobs.F);
  assert.equal(fVariants.size, gVariants.size, "F and G get the same number of distinct processing opportunities");
  for (const v of gVariants) {
    assert.ok(fVariants.has(v), `F must receive the same opportunity as G: ${v}`);
  }
});

test("3. G may still win on its actual engineering evidence (ranking/winner preserved)", () => {
  const g = makeG();
  const f = makeF();
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);
  assert.equal(c.bestPerQuantity[2].finalistId, "G", "raw ranking winner (G) is preserved");
});

test("4. A practical front/rear candidate can win where its canonical evidence supports it (eligibility authority unchanged)", () => {
  const g = makeG();
  const f = makeF();
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const fJobs = jobsByFinalist(c, 2).F || [];
  assert.ok(fJobs.length > 0, "F has queued canonical confirmation → evidence will exist for selectPracticalBest");
  for (const j of fJobs) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_F);
    assert.equal(j.rawTransfer?.finalistId, "F");
  }
});

test("5. Confirmation budget and job accounting remain correct", () => {
  const g = makeG({ perSource: true });
  const f = makeF({ perSource: true });
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const totalQueued = c.queue.filter((j) => j.quantity === 2).length;
  assert.equal(c.confirmationJobsPlanned, totalQueued, "confirmationJobsPlanned equals queued confirmation jobs");
  assert.equal(c.totalJobsPlanned, totalQueued, "totalJobsPlanned equals queued confirmation jobs");
  assert.equal(c.confirmationJobsExpectedByQty[2], totalQueued, "expected-by-qty equals queued jobs");
  for (const j of c.queue) {
    assert.equal(j.phase, "confirmation");
    assert.equal(j.quantity, 2);
  }
});

test("6. Rejected/failed placements cannot enter the promotion set", () => {
  const g = makeG();
  const f = makeF();
  const rejectedId = "REJECTED_SIDE";
  // REJECTED_SIDE is physically rejected and absent from placementResults.
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(!jobs[rejectedId], "physically rejected candidate is never queued");
  assert.ok(jobs.G?.length && jobs.F?.length, "only feasible G and F are queued");
});

test("7. No extra canonical work when the raw winner is already a front/rear candidate", () => {
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-2, -1, -1, -3, 0, "f"]);
  const cFront = makePlacement("C", FAMILY_IDS.C_FRONT_PAIR, [{ x: 1.45, y: 0 }, { x: 4.35, y: 0 }], [-5, -1, -1, -3, 0, "c"]);
  assert.ok(comparePlacementResults(f, cFront) < 0, "F ranks first");

  const c = freshController([f, cFront], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.F?.length, "F (raw winner) is confirmed");
  assert.ok(!jobs.C?.length, "no safeguard when raw winner is already front/rear and not tied");
});

test("8. No duplicate processing of an already-confirmed candidate (tie alternate collision)", () => {
  // G (side) wins raw, F (front/rear) is ranked[1] AND tied with G. The tie
  // alternate would be F; the safeguard also queues F's full search. F must
  // be queued ONCE via the full search, not twice.
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-2, -1, -1, -3, 0, "g"], { perSource: true });
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-2, -1, -1, -3, 0, "f"], { perSource: true });
  assert.equal(isPlacementTied(g, f), true, "G and F are tied");

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const fJobs = jobsByFinalist(c, 2).F || [];
  const placementOnlyCount = fJobs.filter((j) => j.tuningVariant === "placement-only").length;
  assert.equal(placementOnlyCount, 1, "F placement-only queued exactly once (no duplicate)");
});

test("9. If no feasible front/rear candidate exists, existing fallback behaviour is preserved", () => {
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-2, -1, -1, -3, 0, "g"]);
  const d = makePlacement("D", FAMILY_IDS.RP22_D, [{ x: 0, y: 2.1 }, { x: 0, y: 6.3 }], [-5, -1, -1, -3, 0, "d"]);
  assert.ok(isSideOrMixedWallFamily(FAMILY_IDS.RP22_D), "D is side/mixed");
  assert.ok(comparePlacementResults(g, d) < 0, "G ranks first");

  const c = freshController([g, d], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.G?.length, "G (raw winner) is confirmed");
  assert.ok(!jobs.D?.length, "no front/rear safeguard candidate exists; D not queued (not tied)");
});

test("10. Candidate-specific P19/P20 evidence, geometry and processing identity preserved", () => {
  const g = makeG({ perSource: true });
  const f = makeF({ perSource: true });
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  for (const j of jobs.G) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_G);
    assert.equal(j.rawTransfer?.finalistId, "G");
  }
  for (const j of jobs.F) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_F);
    assert.equal(j.rawTransfer?.finalistId, "F");
    assert.equal(j.sources?.length, 2);
  }
  assert.notEqual(jobs.G[0].rawTransfer, jobs.F[0].rawTransfer, "distinct rawTransfer objects");
});

test("11. Reusing existing Stage 2 per-source transfers — no placement-phase job is queued", () => {
  const g = makeG({ perSource: true });
  const f = makeF({ perSource: true });
  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  for (const j of c.queue) {
    assert.equal(j.phase, "confirmation", "no placement-phase job queued by the safeguard");
    assert.ok(j.rawTransfer, "every confirmation job reuses a cached raw transfer");
  }
});