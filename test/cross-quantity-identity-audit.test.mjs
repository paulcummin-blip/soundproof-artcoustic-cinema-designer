// cross-quantity-identity-audit.test.mjs
// Focused tests for cross-quantity V2 candidate identity authority and audit.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createCrossQuantityAuditTrail } from "../src/components/room/bass/improveBassV2/crossQuantityAuditTrail.js";
import { buildCandidateDesignContext } from "../src/components/room/bass/improveBassV2/candidateDesignContext.js";
import { extractEligibleCrossQuantityScope } from "../src/components/room/bass/optimiseWorkflow/crossQuantityScope.js";

const ROOM = { widthM: 4.5, lengthM: 6, heightM: 2.4 };
const TWO_INSTALLED = [
  { id: "inst-front-1", model: "sub-x", enabled: true, position: { x: 1, y: 0.2 }, bottomHeightM: 0.1, orientation: "vertical" },
  { id: "inst-front-2", model: "sub-x", enabled: true, position: { x: 3.5, y: 0.2 }, bottomHeightM: 0.1, orientation: "vertical" },
];
const FOUR_COORDS = [
  { x: 1, y: 0.2 }, { x: 3.5, y: 0.2 }, { x: 1, y: 5.8 }, { x: 3.5, y: 5.8 },
];

test("buildCandidateDesignContext: four candidate-owned source IDs, unique and non-null", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "RP22_D:front-rear-corners",
    quantity: 4,
    coordinates: FOUR_COORDS,
    selectedSubModel: "sub-x",
    subwooferBottomHeightM: 0.1,
    seatingPositions: [{ id: "rsp" }],
    rspPosition: { x: 2.25, y: 3, z: 1.2 },
  });
  assert.equal(ctx.isCrossQuantity, true);
  assert.equal(ctx.quantity, 4);
  assert.equal(ctx.sourceIds.length, 4);
  assert.equal(new Set(ctx.sourceIds).size, 4);
  assert.ok(ctx.sourceIds.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(ctx.instances.length, 4);
  assert.equal(ctx.candidateIdentity, "cross-quantity:4sub:RP22_D:front-rear-corners");
});

test("buildCandidateDesignContext: source IDs do not collide with installed IDs", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "f1",
    quantity: 4,
    coordinates: FOUR_COORDS,
    selectedSubModel: "sub-x",
    subwooferBottomHeightM: 0.1,
  });
  const installedIds = TWO_INSTALLED.map((i) => i.id);
  assert.ok(!ctx.sourceIds.some((id) => installedIds.includes(id)),
    "candidate source IDs must not reuse installed instance IDs");
});

test("extractEligibleCrossQuantityScope: returns [4] for installed=2 with eligible four-sub finalists", () => {
  const stage2 = {
    four_sub_result: {
      evaluatedFinalists: [
        { finalistId: "f4a", coordinates: FOUR_COORDS, physicalRejection: null, terminal: false,
          requestedP14Pass: true, achievedP19VariationDb: 1.5, achievedP19Level: 4,
          rankingData: { rankingTuple: [4, 0.5, 0.2] } },
      ],
    },
    two_sub_result: { evaluatedFinalists: [] },
  };
  const scope = extractEligibleCrossQuantityScope(stage2, 2);
  assert.deepEqual(scope, [4]);
});

test("extractEligibleCrossQuantityScope: excludes quantity whose only finalist is physically rejected", () => {
  const stage2 = {
    four_sub_result: {
      evaluatedFinalists: [
        { finalistId: "f4a", coordinates: FOUR_COORDS, physicalRejection: { passed: false }, terminal: true },
      ],
    },
  };
  const scope = extractEligibleCrossQuantityScope(stage2, 2);
  assert.deepEqual(scope, []);
});

test("audit trail: records scope, admission, transfer, confirmation, disposition", () => {
  const trail = createCrossQuantityAuditTrail("run-1");
  trail.recordScope([4]);
  trail.recordAdmission("f4a", 4, 4, ["cand-f4a-src-1", "cand-f4a-src-2", "cand-f4a-src-3", "cand-f4a-src-4"], "admitted");
  trail.recordTransfer("f4a", "prepared");
  trail.recordProxy("f4a", "proxy-computed");
  trail.recordConfirmation("f4a", "success", "f4a");
  trail.recordDisposition("f4a", "evaluated-outranked");
  const snap = trail.snapshot();
  assert.equal(snap.runId, "run-1");
  assert.deepEqual(snap.admittedScope, [4]);
  assert.equal(snap.receipts.length, 1);
  const r = snap.receipts[0];
  assert.equal(r.finalistId, "f4a");
  assert.equal(r.quantity, 4);
  assert.equal(r.sourceCount, 4);
  assert.equal(r.admission, "admitted");
  assert.equal(r.transfer, "prepared");
  assert.equal(r.proxy, "proxy-computed");
  assert.equal(r.confirmationSubmitted, true);
  assert.equal(r.confirmationResult, "success");
  assert.equal(r.receiptRef, "f4a");
  assert.equal(r.finalDisposition, "evaluated-outranked");
});

test("audit trail: not-promoted disposition for candidates never confirmed", () => {
  const trail = createCrossQuantityAuditTrail("run-2");
  trail.recordAdmission("f4a", 4, 4, ["s1", "s2", "s3", "s4"], "admitted");
  trail.recordTransfer("f4a", "prepared");
  trail.recordProxy("f4a", "proxy-computed");
  // never confirmed
  trail.recordNotPromoted("f4a");
  const snap = trail.snapshot();
  assert.equal(snap.receipts[0].finalDisposition, "not-promoted");
  assert.equal(snap.receipts[0].confirmationSubmitted, false);
});

test("audit trail: failed transfer records failure reason", () => {
  const trail = createCrossQuantityAuditTrail("run-3");
  trail.recordAdmission("f4a", 4, 4, ["s1", "s2", "s3", "s4"], "admitted");
  trail.recordTransfer("f4a", "failed", "inconsistent source identities");
  const snap = trail.snapshot();
  assert.equal(snap.receipts[0].transfer, "failed:inconsistent source identities");
});

test("audit trail: selected disposition for cross-quantity winner", () => {
  const trail = createCrossQuantityAuditTrail("run-4");
  trail.recordAdmission("f4a", 4, 4, ["s1", "s2", "s3", "s4"], "admitted");
  trail.recordConfirmation("f4a", "success", "f4a");
  trail.recordDisposition("f4a", "selected");
  const snap = trail.snapshot();
  assert.equal(snap.receipts[0].finalDisposition, "selected");
});

test("audit trail: lightweight — no response arrays retained", () => {
  const trail = createCrossQuantityAuditTrail("run-5");
  trail.recordAdmission("f4a", 4, 4, ["s1", "s2", "s3", "s4"], "admitted");
  const snap = trail.snapshot();
  const r = snap.receipts[0];
  // No fields for curves, tuning payloads, or evidence arrays.
  assert.ok(!("rspRawCurve" in r));
  assert.ok(!("perSeatRawCurves" in r));
  assert.ok(!("appliedTuning" in r));
  assert.ok(!("perSourcePerSeatComplexTransfers" in r));
});

// Identity authority: simulate the prepareFullTransfer source-mapping logic
// (extracted inline so the test does not depend on the full engine closure).
function mapSourcesForPrepare(finalistSources, installedInstances, designContext, selectedSubModel, subwooferBottomHeightM) {
  const active = (installedInstances || []).filter((i) => i.enabled !== false);
  const ctxIds = designContext?.sourceIds || null;
  const ctxInst = designContext?.instances || null;
  const isCross = designContext?.isCrossQuantity === true;
  return (finalistSources || []).map((source, index) => {
    if (isCross && ctxIds && ctxInst) {
      const ci = ctxInst[index] || null;
      return {
        sourceId: ctxIds[index] || null,
        modelKey: ci?.model || source.modelKey || selectedSubModel,
        bottomHeightM: Number.isFinite(Number(source.bottomHeightM))
          ? Number(source.bottomHeightM)
          : Number.isFinite(Number(ci?.bottomHeightM)) ? Number(ci.bottomHeightM) : subwooferBottomHeightM,
        orientation: source.orientation || ci?.orientation || null,
      };
    }
    const instance = active[index] || null;
    return {
      sourceId: source.sourceId || instance?.id || null,
      modelKey: source.modelKey || instance?.model || selectedSubModel,
      bottomHeightM: Number.isFinite(Number(source.bottomHeightM))
        ? Number(source.bottomHeightM)
        : Number.isFinite(Number(instance?.bottomHeightM)) ? Number(instance.bottomHeightM) : subwooferBottomHeightM,
      orientation: source.orientation || instance?.orientation || null,
    };
  });
}

test("identity mapping: cross-quantity candidate uses candidate-owned IDs, not installed", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "f4a", quantity: 4, coordinates: FOUR_COORDS,
    selectedSubModel: "sub-x", subwooferBottomHeightM: 0.1,
  });
  const finalistSources = FOUR_COORDS.map(() => ({ xNorm: 0.5, yNorm: 0.5, coordinateSpace: "cabinet_centre" }));
  const mapped = mapSourcesForPrepare(finalistSources, TWO_INSTALLED, ctx, "sub-x", 0.1);
  assert.equal(mapped.length, 4);
  assert.deepEqual(mapped.map((s) => s.sourceId), ctx.sourceIds);
  assert.ok(!mapped.some((s) => s.sourceId === TWO_INSTALLED[0].id || s.sourceId === TWO_INSTALLED[1].id),
    "no installed IDs substituted for cross-quantity candidate");
  assert.ok(mapped.every((s) => s.sourceId), "no null source IDs");
  assert.equal(new Set(mapped.map((s) => s.sourceId)).size, 4, "no duplicate source IDs");
});

test("identity mapping: same-quantity candidate preserves installed-source behaviour", () => {
  const finalistSources = TWO_INSTALLED.map(() => ({ xNorm: 0.5, yNorm: 0.2, coordinateSpace: "cabinet_centre" }));
  const mapped = mapSourcesForPrepare(finalistSources, TWO_INSTALLED, null, "sub-x", 0.1);
  assert.equal(mapped.length, 2);
  assert.deepEqual(mapped.map((s) => s.sourceId), ["inst-front-1", "inst-front-2"]);
});

test("identity integrity guard: cross-quantity with mismatched source count is rejected", () => {
  const ctx = buildCandidateDesignContext({
    finalistId: "f4a", quantity: 4, coordinates: FOUR_COORDS,
    selectedSubModel: "sub-x", subwooferBottomHeightM: 0.1,
  });
  // Simulate a 3-source finalist mistakenly paired with a 4-source context.
  const finalistSources = FOUR_COORDS.slice(0, 3).map(() => ({ xNorm: 0.5, yNorm: 0.5, coordinateSpace: "cabinet_centre" }));
  const mapped = mapSourcesForPrepare(finalistSources, TWO_INSTALLED, ctx, "sub-x", 0.1);
  const ids = mapped.map((s) => s.sourceId);
  const expected = ctx.sourceIds.length;
  // The guard in prepareFullTransfer checks length match; simulate it.
  const guardFails = ids.length !== expected || ids.some((id) => !id) || new Set(ids).size !== ids.length;
  assert.ok(guardFails, "mismatched source count must fail the integrity guard");
});