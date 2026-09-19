import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGlobalBassTrimToCurve,
  applyGlobalBassTrimToSeatCurves,
} from "../src/components/room/bass/globalLevelAlignment.js";
import { computeOfficialP20Assessment } from "../src/components/utils/bassAuthoritativeAssessment.js";
import {
  applyAuthorityToCanonicalResult,
  finalOptimisedBassAuthorityMatches,
} from "../src/components/room/bass/finalOptimisedBassResponse.js";
import { buildFilterBankSignature } from "../src/components/room/bass/bassResultAuthority.js";

const rsp = [
  { frequency: 30, spl: 100 },
  { frequency: 40, spl: 101 },
  { frequency: 50, spl: 102 },
  { frequency: 63, spl: 103 },
  { frequency: 80, spl: 104 },
  { frequency: 100, spl: 105 },
];
const seats = [{
  seatId: "seat-a",
  isPrimary: true,
  responseData: rsp.map((point, index) => ({
    ...point,
    spl: point.spl + [1, -2, 2.5, -1, 0.5, 2][index],
  })),
}];

test("one final calibration trim moves RSP and every seat by the identical amount", () => {
  const trimDb = 3.25;
  const alignedRsp = applyGlobalBassTrimToCurve(rsp, trimDb);
  const alignedSeats = applyGlobalBassTrimToSeatCurves(seats, trimDb);

  alignedRsp.forEach((point, index) => {
    assert.equal(point.spl - rsp[index].spl, trimDb);
  });
  alignedSeats[0].responseData.forEach((point, index) => {
    assert.equal(point.spl - seats[0].responseData[index].spl, trimDb);
  });
});

test("P20 is invariant when the same final trim is applied to RSP and seats", () => {
  const before = computeOfficialP20Assessment({
    rspPostEqCurve: rsp,
    perSeatPostEqCurves: seats,
    assessmentStartHz: 30,
    assessmentEndHz: 100,
  });
  const trimDb = -4.5;
  const after = computeOfficialP20Assessment({
    rspPostEqCurve: applyGlobalBassTrimToCurve(rsp, trimDb),
    perSeatPostEqCurves: applyGlobalBassTrimToSeatCurves(seats, trimDb),
    assessmentStartHz: 30,
    assessmentEndHz: 100,
  });

  assert.equal(after.available, true);
  assert.ok(Math.abs(after.worstSeat.variationDbRaw - before.worstSeat.variationDbRaw) < 1e-9);
  assert.equal(after.worstSeat.level, before.worstSeat.level);
});

test("published and graphed final curves use the shared aligned calibration", () => {
  const filterBank = [];
  const canonical = {
    selectedCandidateId: "candidate-1",
    canonicalPostEqRsp: rsp,
    postEqRspCurve: rsp,
    canonicalPostEqSeatResponses: seats,
    postEqPerSeatCurves: seats,
    eqFilterBank: filterBank,
    filterBankSignature: buildFilterBankSignature({ generatedFilterBank: filterBank }),
    postEqCurveSignature: "pre-alignment",
    finalSeatVariationData: {
      p18: { candidateId: "candidate-1" },
      p19: { candidateId: "candidate-1" },
      p20: { candidateId: "candidate-1" },
    },
  };
  const trimDb = 2;
  const alignedRsp = applyGlobalBassTrimToCurve(rsp, trimDb);
  const alignedSeats = applyGlobalBassTrimToSeatCurves(seats, trimDb);
  const result = applyAuthorityToCanonicalResult(canonical, {
    candidateId: "candidate-1",
    alignedPostEqRsp: alignedRsp,
    alignedPostEqSeatResponses: alignedSeats,
    perSeatP19Results: [],
    perSeatP20Results: [],
  });

  assert.deepEqual(result.postEqRspCurve, alignedRsp);
  assert.deepEqual(result.postEqPerSeatCurves, alignedSeats);
  assert.deepEqual(result.canonicalPostEqRsp, alignedRsp);
  assert.deepEqual(result.canonicalPostEqSeatResponses, alignedSeats);
  assert.equal(finalOptimisedBassAuthorityMatches(result), true);
});
