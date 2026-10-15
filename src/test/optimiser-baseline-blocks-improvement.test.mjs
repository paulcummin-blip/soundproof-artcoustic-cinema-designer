// Reproduction of the reported defect, run against the project's OWN saved
// evidence (src/test/fixtures/optimiserBaselineForensic.json, read from the
// completed production authority and the saved optimiser plan).
//
// The reported chain is:
//   published Current: P20 ±15.1 dB · L1
//   best confirmed attempt: P20 ±11 dB · L1  (~3 dB better seat-to-seat)
//   P19 unchanged, no required metric worse
//   yet: "The current design could not be validated, so no candidate could be
//   compared against it."
//
// These tests state what MUST hold. They fail while the baseline is required to
// satisfy candidate-confirmation requirements it can never carry.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateConfirmedCandidate } from "../components/room/bass/improveBassV2/confirmedCandidateValidity.js";
import { extractAuthorityForComparison } from "../components/room/bass/improveBassV2/currentAuthorityComparison.js";
import { STAGE2_CANONICAL_VERSION } from "../components/room/bass/stage2/stage2Constants.js";
import {
  resolveBaselineParity,
  buildPublishedBaseline,
} from "../components/room/bass/optimiserPlan/optimiserBaselineAuthority.js";
import {
  selectConfirmedRecommendations,
} from "../components/room/bass/improveBassV2/confirmedRecommendationSelection.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/optimiserBaselineForensic.json", import.meta.url), "utf8"),
);

const entry = fixture.entry;
const authority = {
  contract: entry,
  currentFingerprint: fixture.cacheKey,
  authorityStatus: "AUTHORITATIVE",
  authoritative: true,
};

const published = extractAuthorityForComparison(authority);
const seatIds = (published?.perSeatP20 || []).map((row) => row.seatId);

const targetIdentity = {
  p14TargetBasis: entry?.requestedP14Basis ?? null,
  p14TargetLevel: entry?.requestedP14Level ?? null,
  p14TargetDb: entry?.requestedP14TargetDb ?? null,
  p18TargetBasis: null,
};

// The live installed sources. The published contract records the effective
// tuning and the instance ids it was published with, so the baseline can be
// rebuilt from the published record itself.
const contractSources = (() => {
  const sc = entry?.selectedCandidate || {};
  const tuning = sc.appliedTuning || sc.effectiveTuning || entry?.appliedTuning || null;
  const ids = (Array.isArray(tuning) ? tuning.map((t) => t?.sourceId) : []).filter(Boolean);
  if (!ids.length) return null;
  return ids.map((id) => ({
    id,
    tuning: tuning.find((t) => String(t?.sourceId) === String(id)) || {},
  }));
})();

describe("published Current is an acceptable optimiser baseline", () => {
  it("resolves baseline parity from the published result alone", () => {
    const parity = resolveBaselineParity({
      currentAuthority: authority,
      liveCacheKey: fixture.cacheKey,
      targetIdentity,
      seatIds,
    });
    expect(parity.status).toBe("MATCH");
  });

  it("builds a published baseline and it is accepted for comparison", () => {
    const baseline = buildPublishedBaseline({
      currentAuthority: authority,
      sources: contractSources,
      sourceIds: (contractSources || []).map((source) => source.id),
      startFingerprint: fixture.cacheKey,
    });
    expect(baseline).toBeTruthy();
    const check = validateConfirmedCandidate(baseline, {
      seats: seatIds.map((id) => ({ id, isPrimary: true })),
      sourceIds: (contractSources || []).map((source) => source.id),
      inputIdentity: fixture.cacheKey,
    });
    // The published result is the designer-facing authority. It is not required
    // to be rediscovered as a candidate in order to serve as the baseline.
    expect(check.issues).toEqual([]);
    expect(check.valid).toBe(true);
  });

  it("never reports an unvalidated baseline when the published result matches", () => {
    const baseline = buildPublishedBaseline({
      currentAuthority: authority,
      sources: contractSources,
      sourceIds: (contractSources || []).map((source) => source.id),
      startFingerprint: fixture.cacheKey,
    });
    const selection = selectConfirmedRecommendations([], { instanceIds: (contractSources || []).map((s) => s.id) }, baseline);
    expect(selection.baselineValidation.valid).toBe(true);
    expect(selection.validationFailed).toBe(false);
    expect(selection.message || "").not.toMatch(/could not be validated/i);
  });

  it("keeps the published P20/P19 authority values untouched", () => {
    expect(published.achievedP20VariationDb).toBeCloseTo(15.107231078723444, 6);
    expect(published.achievedP20Level).toBe(1);
    expect(published.achievedP19VariationDb).toBeCloseTo(0.7913641929311979, 6);
    expect(STAGE2_CANONICAL_VERSION).toBeTruthy();
  });
});