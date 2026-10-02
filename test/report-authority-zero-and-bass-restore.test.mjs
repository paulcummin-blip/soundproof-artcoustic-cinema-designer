import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  firstStatedPrimitive,
  isStatedPrimitive,
} from "../src/components/utils/renderSafe.jsx";
import {
  statesBassAuthority,
  statesBassResultEntry,
} from "../src/components/engineering/versionedEngineeringAuthority.js";
import {
  assessEngineeringReportCompleteness,
  REQUIRED_RP22_PARAMETER_KEYS,
} from "../src/components/engineering/engineeringReportCompleteness.js";

test("report value authority preserves numeric and string zero only", () => {
  assert.equal(isStatedPrimitive(0), true);
  assert.equal(isStatedPrimitive("0"), true);
  assert.equal(firstStatedPrimitive([0], "—"), "0");
  assert.equal(firstStatedPrimitive(["0"], "—"), "0");

  for (const empty of [null, undefined, "", "   ", NaN, "NaN"]) {
    assert.equal(isStatedPrimitive(empty), false);
    assert.equal(firstStatedPrimitive([empty], "—"), "—");
  }
});

test("bass summary is complete only when P14/P18/P19 and scored P20 are all stated", () => {
  const partial = {
    roomResultsByParameter: {
      14: { value: 115, formatted: "115 dBC" },
      18: { value: 16.6, formatted: "16 Hz" },
      19: { value: null, formatted: "—" },
    },
    project: {
      reportCounts: {
        seatResultsByParameter: {
          p20: [{ value: 0, valueFormatted: "±0.0 dB", status: "provisional" }],
        },
      },
    },
  };
  assert.equal(statesBassAuthority(partial), false);
  assert.equal(statesBassResultEntry({ value: 0, formatted: "0" }), true);
  assert.equal(statesBassResultEntry({ value: null, formatted: "—" }), false);

  const complete = structuredClone(partial);
  complete.roomResultsByParameter[19] = { value: 1.1, formatted: "±1 dB" };
  complete.project.reportCounts.seatResultsByParameter.p20[0] = {
    value: 0,
    valueFormatted: "±0.0 dB",
    status: "scored",
  };
  assert.equal(statesBassAuthority(complete), true);
});

test("published summary and report gates restore bass without opening the Bass UI", () => {
  const overlay = fs.readFileSync("src/components/engineering/restoredBassOverlay.js", "utf8");
  const rating = fs.readFileSync("src/components/hooks/useAppDesignRating.js", "utf8");
  const authorityHook = fs.readFileSync("src/components/engineering/useVersionedEngineeringAuthority.js", "utf8");
  const technicalReport = fs.readFileSync("src/pages/RP22Report.jsx", "utf8");
  const compliancePrint = fs.readFileSync("src/pages/ComplianceReportPrint.jsx", "utf8");

  assert.match(rating, /for \(const parameterNumber of \[14, 18, 19\]\)/);
  assert.match(overlay, /statesBassResultEntry\(existing\)/);
  assert.doesNotMatch(overlay, /if \(statesBassAuthority\(summary\)\) return summary/);
  assert.match(overlay, /previous\.state === "scored"/);
  assert.match(overlay, /summariseEngineeringResults/);
  assert.match(authorityHook, /completedBassAuthority\?\.hydrationSettled !== true/);
  assert.match(authorityHook, /bassRestoreFailed/);
  assert.match(technicalReport, /const bassReportPending = !projectIdMatch \|\| completedBassAuthority\?\.hydrationSettled !== true/);
  assert.match(technicalReport, /\|\| bassReportPending;/);
  assert.match(compliancePrint, /engineeringAuthority\.loading/);
  assert.match(compliancePrint, /engineeringAuthority\.bassRestoreFailed/);
  assert.match(compliancePrint, /engineeringAuthority\.reportComplete/);
  assert.match(technicalReport, /reportDataIncomplete/);
});

test("reports and proposals require every RP22 parameter and every seat result", () => {
  const seatIds = ["seat-1", "seat-2"];
  const parameterAuthority = Object.fromEntries(REQUIRED_RP22_PARAMETER_KEYS.map((key) => [
    key,
    { key, scope: "room", state: "scored", level: "L3", rawValue: key === "p11" ? 0 : 1 },
  ]));
  parameterAuthority.p1 = {
    key: "p1",
    scope: "seat",
    state: "scored",
    level: null,
    seats: Object.fromEntries(seatIds.map((seatId) => [seatId, { state: "scored", level: "L3" }])),
  };
  parameterAuthority.p20 = {
    key: "p20",
    scope: "seat",
    state: "scored",
    level: "L1",
    seats: Object.fromEntries(seatIds.map((seatId) => [seatId, { state: "scored", level: "L1", rawValue: 0 }])),
  };
  const complete = {
    parameterAuthority,
    project: { seatIds },
    seatHudById: { "seat-1": {}, "seat-2": {} },
  };
  assert.equal(assessEngineeringReportCompleteness(complete).complete, true);

  const partial = structuredClone(complete);
  partial.parameterAuthority.p19 = { key: "p19", scope: "room", state: "provisional", level: null };
  assert.equal(assessEngineeringReportCompleteness(partial).complete, false);
  assert.deepEqual(assessEngineeringReportCompleteness(partial).missingParameterKeys, ["p19"]);

  const missingSeat = structuredClone(complete);
  missingSeat.parameterAuthority.p20.seats["seat-2"] = { state: "provisional", level: null };
  assert.equal(assessEngineeringReportCompleteness(missingSeat).complete, false);
  assert.deepEqual(assessEngineeringReportCompleteness(missingSeat).incompleteSeatParameterKeys, ["p20"]);
});

test("visual report and proposal generation consume the same completeness gate", () => {
  const visual = fs.readFileSync("src/pages/RP22ClientReport.jsx", "utf8");
  const proposalSnapshot = fs.readFileSync("src/components/proposal/engineeringAuthority/useEngineeringSnapshot.js", "utf8");
  const proposalWizard = fs.readFileSync("src/components/proposal/CreateProposalWizard.jsx", "utf8");
  assert.match(visual, /authority\.reportComplete/);
  assert.match(proposalSnapshot, /assessEngineeringReportCompleteness/);
  assert.match(proposalWizard, /proposalDataReady/);
});
