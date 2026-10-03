// Focused regression runner for the Marquee live failures.
// Run: node src/test/marquee-live-failures.run.mjs

import { register } from "node:module";
import fs from "node:fs";
import assert from "node:assert/strict";

register("../../test/_alias-loader.mjs", import.meta.url);

const {
  SAVED_BASS_OUT_OF_DATE_MESSAGE,
  applyRestoredBassAuthority,
  assessRestoredBassAuthorityCurrentness,
} = await import("../components/engineering/restoredBassOverlay.js");
const { assessEngineeringReportCompleteness } = await import("../components/engineering/engineeringReportCompleteness.js");
const {
  buildPersistedBassAuthority,
  resolvePersistedBassAuthority,
} = await import("../components/room/bass/completedBassResultPersistence.js");
const {
  createBassAnalysisResult,
  createBassParameterResult,
} = await import("../components/room/bass/bassAnalysisContract.js");
const { formatBassParameterValue } = await import("../components/room/bass/bassParameterValueFormatter.js");
const { resolveProposalSource } = await import("../components/proposal/sourceAuthority/proposalSourceAuthority.js");

const FP = "cal:v8:current-authority|target:min-l3|result-schema:34|metric-schema:21";
const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error?.message || String(error) });
  }
};

function baseSummary() {
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

function currentAuthority() {
  const resolved = resolvePersistedBassAuthority(
    "marquee::v1",
    buildPersistedBassAuthority(null, FP, authoritativeContract()),
  );
  return {
    ...resolved,
    status: "complete",
    authorityStatus: "AUTHORITATIVE",
    currentFingerprint: FP,
    structurallyComplete: true,
    authoritative: true,
    exportable: true,
  };
}

check("stale preserved bass cannot clear report missing keys", () => {
  const summary = baseSummary();
  const staleAuthority = {
    status: "stale",
    authorityStatus: "STALE",
    currentFingerprint: "cal:v8:new-active-design",
    contract: { job: { status: "complete", resultFingerprint: FP, currentJobFingerprint: FP } },
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
  assert.equal(restored.bassAuthorityCurrent, false);
  assert.equal(restored.bassAuthorityRejectionReason, "authority-status-stale");
  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.missingParameterKeys, ["p14", "p18", "p19", "p20"]);
  assert.equal(readiness.reason, SAVED_BASS_OUT_OF_DATE_MESSAGE);
});

check("only exact current authoritative fingerprint is accepted", () => {
  const authority = currentAuthority();
  assert.deepEqual(
    assessRestoredBassAuthorityCurrentness(authority),
    { current: true, outOfDate: false, reason: null },
  );
  const mismatch = assessRestoredBassAuthorityCurrentness({
    ...authority,
    currentFingerprint: "cal:v8:different-active-design",
  });
  assert.equal(mismatch.current, false);
  assert.equal(mismatch.reason, "active-design-fingerprint-mismatch");
});

check("accepted restored bass carries non-zero score multipliers", () => {
  const authority = currentAuthority();
  const summary = baseSummary();
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
  assert.equal(restored.bassAuthorityCurrent, true);
  assert.ok(restored.parameterAuthority.p14.multiplier > 0);
  assert.ok(restored.parameterAuthority.p18.multiplier > 0);
  assert.ok(restored.parameterAuthority.p19.multiplier > 0, JSON.stringify(restored.parameterAuthority.p19));
  assert.ok(restored.parameterAuthority.p20.seats.s1.multiplier > 0);
  assert.ok(restored.parameterAuthority.p20.seats.s2.multiplier > 0);
});

check("proposal blocks on the shared stale-bass reason", () => {
  const proposal = resolveProposalSource({
    projectId: "marquee",
    versionId: "v1",
    hasSource: true,
    sourceOutOfDateReason: SAVED_BASS_OUT_OF_DATE_MESSAGE,
  });
  assert.equal(proposal.ready, false);
  assert.equal(proposal.message, SAVED_BASS_OUT_OF_DATE_MESSAGE);
  assert.ok(Object.values(proposal.reports).every((report) => report.status === "Stale"));
  assert.ok(Object.values(proposal.reports).every((report) => report.reason === SAVED_BASS_OUT_OF_DATE_MESSAGE));
});

check("P18 uses favourable whole-Hz flooring everywhere", () => {
  assert.equal(formatBassParameterValue("p18", 16.6149), "16 Hz");
  const visual = fs.readFileSync(new URL("../components/report/client/ClientBassCapability.jsx", import.meta.url), "utf8");
  const print = fs.readFileSync(new URL("../components/report/client/print/PrintBassCapabilityContent.jsx", import.meta.url), "utf8");
  assert.match(visual, /Math\.floor\(p18Hz\)/);
  assert.match(print, /Math\.floor\(p18Hz\)/);
  assert.doesNotMatch(visual, /p18Hz\.toFixed\(0\)/);
  assert.doesNotMatch(print, /p18Hz\.toFixed\(0\)/);
});

check("header mounts explicit project/version report URLs", () => {
  const header = fs.readFileSync(new URL("../components/roomdesigner/RoomDesignerHeader.jsx", import.meta.url), "utf8");
  assert.match(header, /params\.set\("projectId", effectiveProjectId\)/);
  assert.match(header, /params\.set\("versionId", activeVersionId\)/);
  assert.match(header, /window\.location\.assign\(url\)/);
  assert.match(header, /openReport\("\/DesignReview"\)/);
  assert.match(header, /openReport\("\/RP22ClientReport"\)/);
});

const failed = results.filter((result) => !result.passed);
results.forEach((result) => {
  console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.name}${result.error ? ` — ${result.error}` : ""}`);
});
console.log(`Marquee live-failure regression: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
