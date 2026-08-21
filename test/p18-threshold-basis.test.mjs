// P18 Technical Report threshold-family parity.
// Asserts the report resolver returns the basis-aware Minimum/Recommended
// thresholds for P18 — not the flat legacy `levels` (Recommended) family.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  p18ThresholdsForBasis,
  P18_THRESHOLDS_BY_BASIS,
} from "../src/components/utils/p18ExtensionAuthority.js";

test("P18 minimum basis thresholds (authoritative values)", () => {
  const t = p18ThresholdsForBasis("minimum");
  assert.equal(t.L1, 35, "minimum L1 = 35 Hz");
  assert.equal(t.L2, 30, "minimum L2 = 30 Hz");
  assert.equal(t.L3, 20, "minimum L3 = 20 Hz");
  assert.equal(t.L4, 18, "minimum L4 = 18 Hz");
  // Confirm against the frozen constant table too.
  assert.deepEqual(P18_THRESHOLDS_BY_BASIS.minimum, { L1: 35, L2: 30, L3: 20, L4: 18 });
});

test("P18 recommended basis thresholds (authoritative values)", () => {
  const t = p18ThresholdsForBasis("recommended");
  assert.equal(t.L1, 30, "recommended L1 = 30 Hz");
  assert.equal(t.L2, 25, "recommended L2 = 25 Hz");
  assert.equal(t.L3, 18, "recommended L3 = 18 Hz");
  assert.equal(t.L4, 15, "recommended L4 = 15 Hz");
  assert.deepEqual(P18_THRESHOLDS_BY_BASIS.recommended, { L1: 30, L2: 25, L3: 18, L4: 15 });
});

test("resolveParamThresholds threads p18Mode and delegates to p18ThresholdsForBasis", async () => {
  const src = await readFile(
    new URL("../src/components/report/technical/roomParameterLevelAuthority.js", import.meta.url),
    "utf8",
  );
  // P18 branch exists
  assert.match(src, /param\.id === 18/);
  // Delegates to the canonical basis authority (no duplicate hardcoded table)
  assert.match(src, /p18ThresholdsForBasis/);
  // p18Mode parameter is threaded through the resolver signature
  assert.match(src, /resolveParamThresholds\(param,\s*p12Mode,\s*p13Mode,\s*p14Mode,\s*p18Mode\)/);
});

test("useParameterGridAuthority derives p18Mode from completed bass authority and threads it", async () => {
  const src = await readFile(
    new URL("../src/components/report/technical/useParameterGridAuthority.jsx", import.meta.url),
    "utf8",
  );
  // p18Mode derived from the completed bass presentation (same authority as the P18 result)
  assert.match(src, /bassPresentation\.parameters\.p18\.targetBasis/);
  // Threaded into resolveParamThresholds
  assert.match(src, /resolveParamThresholds\(param,\s*p12Mode,\s*p13Mode,\s*p14Mode,\s*p18Mode\)/);
});

test("RP22ReportParameterGrid resolves P18 thresholds (not just P12/P13/P14)", async () => {
  const src = await readFile(
    new URL("../src/components/report/RP22ReportParameterGrid.jsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /param\.id === 18/);
});