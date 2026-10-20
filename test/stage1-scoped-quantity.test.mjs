import { describe, it, expect } from "vitest";
import { runFullStage1Search } from "../src/components/room/bass/stage1/stage1PlacementEngine.js";

const input = {
  roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
  rspPosition: { x: 2.25, y: 3.6, z: 1.2 },
  seatingPositions: [
    { id: "s1", x: 1.6, y: 3.6, z: 1.2 },
    { id: "s2", x: 2.25, y: 3.6, z: 1.2 },
    { id: "s3", x: 2.9, y: 3.6, z: 1.2 },
  ],
};

describe("Stage 1 selected-quantity scope", () => {
  it("cold one-sub scoped run matches the full study's one-sub result", () => {
    const t0 = performance.now();
    const full = runFullStage1Search(input);
    const fullMs = performance.now() - t0;
    const t1 = performance.now();
    const scoped = runFullStage1Search({ ...input, scopeQuantity: 1 });
    const scopedMs = performance.now() - t1;
    console.log(`STAGE1_TIMING full=${fullMs.toFixed(0)}ms scoped1=${scopedMs.toFixed(0)}ms keys=${Object.keys(scoped.results)}`);
    expect(Object.keys(scoped.results)).toEqual(["one_sub_result"]);
    const a = full.results.one_sub_result, b = scoped.results.one_sub_result;
    expect(b.candidateCount).toBe(a.candidateCount);
    expect(b.coarseCandidateCount).toBe(a.coarseCandidateCount);
    expect(b.fineCandidateCount).toBe(a.fineCandidateCount);
    expect(b.finalists).toEqual(a.finalists);
  }, 120000);
  it("no scope still searches all four quantities", () => {
    const full = runFullStage1Search(input);
    expect(Object.keys(full.results).sort()).toEqual(["four_sub_result", "one_sub_result", "three_sub_result", "two_sub_result"]);
  }, 120000);
});