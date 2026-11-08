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
import { comparePlacementResults, buildPlacementRankingTuple } from "@/components/room/bass/stage2/stage2PlacementRanking";

// ── Helpers ──────────────────────────────────────────────────────────────

const W = 5.8;
const L = 8.4;

function makeSources(coords) {
  // coords: [{x,y}] in metres
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
  const seatPriorityMap = new Map([["rsp", "primary"]]);
  const placementRanking = { rankingTuple, placementMetrics: {} };
  return { finalistId, rawTransfer, placementRanking };
}

function freshController(placements, qty, params) {
  const c = new Stage2PlacementController();
  c.params = params || { roomDims: { widthM: W, lengthM: L }, seatPriorityMap: new Map() };
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
  // G ranks strictly higher (better primary null depth) → no tie.
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"]);
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"]);
  assert.ok(isSideOrMixedWallFamily(FAMILY_IDS.RP22_G), "G is side/mixed");
  assert.ok(!isSideOrMixedWallFamily(FAMILY_IDS.RP22_F), "F is front/rear");
  assert.notEqual(comparePlacementResults(g, f), 0, "G and F are not tied");

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.G?.length, "G must receive confirmation jobs");
  assert.ok(jobs.F?.length, "F must receive confirmation jobs (safeguard)");
  // Both receive placement-only at minimum.
  assert.ok(tuningVariantSet(jobs.G).has("placement-only"), "G placement-only");
  assert.ok(tuningVariantSet(jobs.F).has("placement-only"), "F placement-only (safeguard)");
});

test("2. Both G and F receive the SAME processing opportunities (placement-only + tuning variants)", () => {
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"], { perSource: true });
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"], { perSource: true });

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  const gVariants = tuningVariantSet(jobs.G);
  const fVariants = tuningVariantSet(jobs.F);
  // F's processing opportunities equal G's (same helper, same per-source
  // availability). Both include placement-only; tuning variants match.
  assert.equal(fVariants.size, gVariants.size, "F and G get the same number of distinct processing opportunities");
  for (const v of gVariants) {
    assert.ok(fVariants.has(v), `F must receive the same opportunity as G: ${v}`);
  }
});

test("3. G may still win on its actual engineering evidence (ranking/winner preserved)", () => {
  // The safeguard only QUEUES canonical confirmation for F; it does not
  // alter the raw ranking or force F to win. bestPerQuantity reflects the
  // raw ranking winner (G).
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"]);
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"]);

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  assert.equal(c.bestPerQuantity[2].finalistId, "G", "raw ranking winner (G) is preserved");
  // The downstream practical-selection authority (selectPracticalBest) decides
  // the final recommendation from completedResults; the safeguard does not
  // pre-empt it. Both candidates' evidence will flow through it unchanged.
});

test("4. A practical front/rear candidate can win where its canonical evidence supports it (eligibility authority unchanged)", () => {
  // selectPracticalBest already prefers the best front/rear candidate unless
  // the side/mixed candidate has a compelling benefit. The safeguard ensures F
  // actually HAS canonical evidence to feed that authority. Here we verify the
  // safeguard queues F so its evidence will exist; the authority itself is
  // covered by stage2-practical-placement-preference.test.mjs (unchanged).
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"]);
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"]);

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const fJobs = jobsByFinalist(c, 2).F || [];
  assert.ok(fJobs.length > 0, "F has queued canonical confirmation → evidence will exist for selectPracticalBest");
  // F's jobs carry F's own familyId and rawTransfer (candidate-specific identity preserved).
  for (const j of fJobs) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_F);
    assert.equal(j.rawTransfer?.finalistId, "F");
  }
});

test("5. Confirmation budget and job accounting remain correct", () => {
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"], { perSource: true });
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"], { perSource: true });

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const totalQueued = c.queue.filter((j) => j.quantity === 2).length;
  assert.equal(c.confirmationJobsPlanned, totalQueued, "confirmationJobsPlanned equals queued confirmation jobs");
  assert.equal(c.totalJobsPlanned, totalQueued, "totalJobsPlanned equals queued confirmation jobs");
  assert.equal(c.confirmationJobsExpectedByQty[2], totalQueued, "expected-by-qty equals queued jobs");
  // Every queued job is a confirmation job for qty 2.
  for (const j of c.queue) {
    assert.equal(j.phase, "confirmation");
    assert.equal(j.quantity, 2);
  }
});

test("6. Rejected/failed placements cannot enter the promotion set", () => {
  // Only successfully-placed candidates appear in placementResults. A
  // failed placement (e.g. a physically rejected side candidate) is absent
  // and must not be queued by the safeguard.
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"]);
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"]);
  // "REJECTED_SIDE" is NOT in placementResults — it was physically rejected.
  const rejectedId = "REJECTED_SIDE";

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(!jobs[rejectedId], "physically rejected candidate is never queued");
  assert.ok(jobs.G?.length && jobs.F?.length, "only feasible G and F are queued");
});

test("7. No extra canonical work when the raw winner is already a front/rear candidate", () => {
  // F wins raw ranking (front/rear) → no safeguard needed. Only F's jobs are
  // queued (plus a tie alternate only if tied).
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-5, -1, -1, -3, 0, "f"]);
  const cFrontPair = makePlacement("C", FAMILY_IDS.C_FRONT_PAIR, [{ x: 1.45, y: 0 }, { x: 4.35, y: 0 }], [-3, -1, -1, -3, 0, "c"]);

  const c = freshController([f, cFrontPair], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.F?.length, "F (raw winner) is confirmed");
  assert.ok(!jobs.C?.length, "no safeguard when raw winner is already front/rear and not tied");
});

test("8. No duplicate processing of an already-confirmed candidate (tie alternate collision)", () => {
  // G (side) wins raw, F (front/rear) is ranked[1] AND tied with G. The tie
  // alternate would be F; the safeguard also queues F's full search. F must
  // be queued ONCE via the full search, not twice (no duplicate placement-only).
  const gTuple = [-5, -1, -1, -3, 0, "g"];
  const fTuple = [-5, -1, -1, -3, 0, "f"]; // identical first 3 → tied
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], gTuple);
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], fTuple);

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const fJobs = jobsByFinalist(c, 2).F || [];
  // F appears exactly once as placement-only (from the full safeguard
  // search), NOT a second time from the tie-alternate placement-only path.
  const placementOnlyCount = fJobs.filter((j) => j.tuningVariant === "placement-only").length;
  assert.equal(placementOnlyCount, 1, "F placement-only queued exactly once (no duplicate)");
});

test("9. If no feasible front/rear candidate exists, existing fallback behaviour is preserved", () => {
  // Only side/mixed candidates exist. Safeguard finds no front/rear; the
  // existing tie logic (if any) and best confirmation stand unchanged.
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"]);
  const d = makePlacement("D", FAMILY_IDS.RP22_D, [{ x: 0, y: 2.1 }, { x: 0, y: 6.3 }], [-4, -1, -1, -3, 0, "d"]);
  assert.ok(isSideOrMixedWallFamily(FAMILY_IDS.RP22_D), "D is side/mixed");

  const c = freshController([g, d], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  assert.ok(jobs.G?.length, "G (raw winner) is confirmed");
  // No front/rear candidate → no safeguard job. D only appears if tied with G.
  assert.ok(!jobs.D?.length, "no front/rear safeguard candidate exists; D not queued (not tied)");
});

test("10. Candidate-specific P19/P20 evidence, geometry and processing identity preserved", () => {
  const gCoords = [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }];
  const fCoords = [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }];
  const g = makePlacement("G", FAMILY_IDS.RP22_G, gCoords, [-5, -1, -1, -3, 0, "g"], { perSource: true });
  const f = makePlacement("F", FAMILY_IDS.RP22_F, fCoords, [-3, -1, -1, -3, 0, "f"], { perSource: true });

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  const jobs = jobsByFinalist(c, 2);
  // G jobs carry G's familyId, sources and rawTransfer; F jobs carry F's own.
  for (const j of jobs.G) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_G);
    assert.equal(j.rawTransfer?.finalistId, "G");
  }
  for (const j of jobs.F) {
    assert.equal(j.familyId, FAMILY_IDS.RP22_F);
    assert.equal(j.rawTransfer?.finalistId, "F");
    // F's sources normalised from F's geometry (front/rear midpoints).
    assert.equal(j.sources?.length, 2);
  }
  // G and F jobs reference distinct rawTransfer objects (no cross-contamination).
  assert.notEqual(jobs.G[0].rawTransfer, jobs.F[0].rawTransfer);
});

test("11. Reusing existing Stage 2 per-source transfers — no placement-phase job is queued", () => {
  // The safeguard must reuse cached raw transfers: it queues ONLY
  // confirmation-phase jobs, never placement-phase jobs.
  const g = makePlacement("G", FAMILY_IDS.RP22_G, [{ x: 0, y: 4.2 }, { x: 5.8, y: 4.2 }], [-5, -1, -1, -3, 0, "g"], { perSource: true });
  const f = makePlacement("F", FAMILY_IDS.RP22_F, [{ x: 2.9, y: 0 }, { x: 2.9, y: 8.4 }], [-3, -1, -1, -3, 0, "f"], { perSource: true });

  const c = freshController([g, f], 2);
  c.startConfirmationForQuantity(2);

  for (const j of c.queue) {
    assert.equal(j.phase, "confirmation", "no placement-phase job queued by the safeguard");
    assert.ok(j.rawTransfer, "every confirmation job reuses a cached raw transfer");
  }
});