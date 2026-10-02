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
  assert.match(overlay, /row\?\.status === "scored"/);
  assert.match(authorityHook, /completedBassAuthority\?\.hydrationSettled !== true/);
  assert.match(authorityHook, /bassRestoreFailed/);
  assert.match(technicalReport, /const bassReportPending = !projectIdMatch \|\| completedBassAuthority\?\.hydrationSettled !== true/);
  assert.match(technicalReport, /\|\| bassReportPending;/);
  assert.match(compliancePrint, /engineeringAuthority\.loading/);
  assert.match(compliancePrint, /engineeringAuthority\.bassRestoreFailed/);
});
