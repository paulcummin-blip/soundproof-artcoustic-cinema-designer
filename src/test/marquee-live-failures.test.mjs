import { expect, test } from "vitest";
import fs from "node:fs";
import {
  SAVED_BASS_OUT_OF_DATE_MESSAGE,
  applyRestoredBassAuthority,
  assessRestoredBassAuthorityCurrentness,
} from "../components/engineering/restoredBassOverlay.js";
import { assessEngineeringReportCompleteness } from "../components/engineering/engineeringReportCompleteness.js";
import {
  buildPersistedBassAuthority,
  resolvePersistedBassAuthority,
} from "../components/room/bass/completedBassResultPersistence.js";
import {
  createBassAnalysisResult,
  createBassParameterResult,
} from "../components/room/bass/bassAnalysisContract.js";
import { formatBassParameterValue } from "../components/room/bass/bassParameterValueFormatter.js";
import { resolveProposalSource } from "../components/proposal/sourceAuthority/proposalSourceAuthority.js";

const FP = "cal:v8:current-authority|target:min-l3|result-schema:34|metric-schema:21";

function staleSummary() {
  const parameterAuthority = Object.fromEntries(
    Array.from({ length: 21 }, (_, index) => [
      `p${index + 1}`,
      { state: "scored", scope: "room", level: "L4", rawValue: 1, multiplier: 12, effectiveWeight: 1 },
    ]),
  );
  return {
    parameterAuthority,
    roomResultsByParameter: {},
    seatHudById: {},
    project: { seatIds: ["s1"] },
    primary: { seatIds: ["s1"] },
  };
}

function authoritativeContract() {
  const contract = createBassAnalysisResult();
  Object.assign(contract.job, {
    status: "complete",
    currentJobFingerprint: FP,
    resultFingerprint: FP,
    completedAtMs: 100,
  });
  contract.selectedCandidateId = "candidate-authoritative";
  contract.selectedCandidate = {
    id: "candidate-authoritative",
    p14TargetBasis: "minimum",
    perSeatP19Results: [],
    perSeatP20Results: [
      { seatId: "s1", variationDbRaw: 0.2, displayVariationDb: 0, level: "L4" },
      { seatId: "s2", variationDbRaw: 4.9, displayVariationDb: 4, level: "L2" },
    ],
  };
  contract.provenance = { ...(contract.provenance || {}), realSeatCount: 2 };
  contract.selectedP14TargetDb = 115;
  contract.selectedP14TargetBasis = "minimum";
  contract.selectedP14Level = 3;
  contract.productAnalysis.parameters = {
    p14: createBassParameterResult({ parameter: "P14", status: "complete", level: 3, value: 115 }),
    p18: createBassParameterResult({ parameter: "P18", status: "complete", level: 4, value: 16.6149 }),
    p19: createBassParameterResult({ parameter: "P19", status: "complete", level: 4, value: 0.9755 }),
    p20: createBassParameterResult({ parameter: "P20", status: "complete", level: 1, value: 16.9169 }),
  };
  contract.metricPublication = {
    canonicalMetricPublicationValid: true,
    publicationRejectionReason: null,
  };
  return contract;
}

test("stale preserved bass cannot clear report missing keys", () => {
  const summary = staleSummary();
  const staleAuthority = {
    status: "stale",
    authorityStatus: "STALE",
    currentFingerprint: "cal:v8:new-active-design",
    contract: {
      job: {
        status: "complete",
        resultFingerprint: FP,
        currentJobFingerprint: FP,
      },
    },
    authoritative: true,
    exportable: true,
    structurallyComplete: true,
  };

  const restored = applyRestoredBassAuthority(summary, {
    projectId: "marquee",
    versionId: "v1",
    completedBassAuthority: staleAuthority,
  });
  const readiness = assessEngineeringReportCompleteness(restored);

  expect(restored.bassAuthorityCurrent).toBe(false);
  expect(restored.bassAuthorityRejectionReason).toBe("authority-status-stale");
  expect(readiness.complete).toBe(false);
  expect(readiness.missingParameterKeys).toEqual(["p14", "p18", "p19", "p20"]);
  expect(readiness.reason).toBe(SAVED_BASS_OUT_OF_DATE_MESSAGE);
});

test("only an exact current authoritative fingerprint is accepted", () => {
  const contract = authoritativeContract();
  const persisted = buildPersistedBassAuthority(null, FP, contract);
  const authority = resolvePersistedBassAuthority("marquee::v1", persisted);
  const currentness = assessRestoredBassAuthorityCurrentness(authority);

  expect(currentness).toEqual({ current: true, outOfDate: false, reason: null });

  const mismatch = assessRestoredBassAuthorityCurrentness({
    ...authority,
    currentFingerprint: "cal:v8:different-active-design",
  });
  expect(mismatch.current).toBe(false);
  expect(mismatch.reason).toBe("active-design-fingerprint-mismatch");
});

test("accepted restored bass carries score multipliers instead of zero contributions", () => {
  const contract = authoritativeContract();
  const authority = resolvePersistedBassAuthority(
    "marquee::v1",
    buildPersistedBassAuthority(null, FP, contract),
  );
  const summary = staleSummary();
  summary.project.seatIds = ["s1", "s2"];
  summary.primary.seatIds = ["s1"];
  summary.parameterAuthority.p14 = { state: "provisional", scope: "room", level: null, rawValue: null };
  summary.parameterAuthority.p18 = { state: "provisional", scope: "room", level: null, rawValue: null };
  summary.parameterAuthority.p19 = { state: "provisional", scope: "room", level: null, rawValue: null };
  summary.parameterAuthority.p20 = {
    state: "provisional",
    scope: "seat",
    level: null,
    seats: {
      s1: { state: "provisional", level: null },
      s2: { state: "provisional", level: null },
    },
  };

  const restored = applyRestoredBassAuthority(summary, {
    projectId: "marquee",
    versionId: "v1",
    completedBassAuthority: authority,
  });

  expect(restored.bassAuthorityCurrent).toBe(true);
  expect(restored.parameterAuthority.p14.multiplier).toBeGreaterThan(0);
  expect(restored.parameterAuthority.p18.multiplier).toBeGreaterThan(0);
  expect(restored.parameterAuthority.p19.multiplier).toBeGreaterThan(0);
  expect(restored.parameterAuthority.p20.seats.s1.multiplier).toBeGreaterThan(0);
  expect(restored.parameterAuthority.p20.seats.s2.multiplier).toBeGreaterThan(0);
});

test("proposal, navigation and P18 display use the shared fixed policies", () => {
  const proposal = resolveProposalSource({
    projectId: "marquee",
    versionId: "v1",
    hasSource: true,
    sourceOutOfDateReason: SAVED_BASS_OUT_OF_DATE_MESSAGE,
  });
  expect(proposal.ready).toBe(false);
  expect(proposal.message).toBe(SAVED_BASS_OUT_OF_DATE_MESSAGE);
  expect(Object.values(proposal.reports).every((report) => report.status === "Stale")).toBe(true);
  expect(Object.values(proposal.reports).every((report) => report.reason === SAVED_BASS_OUT_OF_DATE_MESSAGE)).toBe(true);

  expect(formatBassParameterValue("p18", 16.6149)).toBe("16 Hz");

  const header = fs.readFileSync(new URL("../components/roomdesigner/RoomDesignerHeader.jsx", import.meta.url), "utf8");
  expect(header).toMatch(/params\.set\("projectId", effectiveProjectId\)/);
  expect(header).toMatch(/params\.set\("versionId", activeVersionId\)/);
  expect(header).toMatch(/window\.location\.assign\(url\)/);

  const visual = fs.readFileSync(new URL("../components/report/client/ClientBassCapability.jsx", import.meta.url), "utf8");
  const print = fs.readFileSync(new URL("../components/report/client/print/PrintBassCapabilityContent.jsx", import.meta.url), "utf8");
  expect(visual).toMatch(/Math\.floor\(p18Hz\)/);
  expect(print).toMatch(/Math\.floor\(p18Hz\)/);
  expect(visual).not.toMatch(/p18Hz\.toFixed\(0\)/);
  expect(print).not.toMatch(/p18Hz\.toFixed\(0\)/);
});
