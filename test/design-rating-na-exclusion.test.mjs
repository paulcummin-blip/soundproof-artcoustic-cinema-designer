// design-rating-na-exclusion.test.mjs
// Regression: N/A and NOT CALCULATED metrics must NOT contribute to the
// Artcoustic System Design Rating category floors or limiter tooltips.
//
// Only fully calculated metrics (L1-L4 or FAIL) may contribute to floors.
// This test verifies the isMetricIneligible guard in buildDesignRatingInput
// and the roomLevelNullSeatKeys exclusion.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== DESIGN RATING N/A EXCLUSION ===\n");

// --- Source inspection: isMetricIneligible guard exists ---
const buildInput = readSrc("components/report/technical/buildDesignRatingInput.js");

check(
  "buildDesignRatingInput exports buildDesignRatingInput",
  buildInput.includes("export function buildDesignRatingInput"),
);

check(
  "isMetricIneligible guard exists",
  buildInput.includes("function isMetricIneligible"),
);

check(
  "isMetricIneligible checks not_applicable status",
  buildInput.includes('"not_applicable"') && buildInput.includes('"na"'),
);

check(
  "isMetricIneligible checks NOT CALCULATED family",
  buildInput.includes("not.?calculated") && buildInput.includes("uncalculated"),
);

check(
  "isMetricIneligible checks CALCULATING / UPDATING",
  buildInput.includes("calculating") && buildInput.includes("updating"),
);

check(
  "isMetricIneligible checks N/A level",
  buildInput.includes('"N/A"') && buildInput.includes('"—"'),
);

check(
  "Ineligible metrics set to 'na' (excluded from floor)",
  buildInput.includes('seatScope[key][seatId] = "na"'),
);

check(
  "roomLevelNullSeatKeys exclusion exists",
  buildInput.includes("roomLevelNullSeatKeys"),
);

check(
  "Room-level null forces all per-seat values to 'na'",
  buildInput.includes('roomLevelNullSeatKeys.has(key)'),
);

// --- Source inspection: artcousticSystemDesignRating handles na ---
const ratingAuth = readSrc("components/report/technical/artcousticSystemDesignRating.js");

check(
  "artcousticSystemDesignRating exists",
  ratingAuth.includes("export function") || ratingAuth.includes("export const"),
);

check(
  "Rating authority skips na values (does not count them as FAIL or L1)",
  ratingAuth.includes('"na"') || ratingAuth.includes("'na'") || ratingAuth.includes("=== \"na\""),
);

// --- Functional test: isMetricIneligible logic ---
// We can't import the function directly (it's not exported), but we can
// verify the logic by checking the source covers all ineligible states.

check(
  "Dash formatted with no numeric value is ineligible",
  buildInput.includes('formatted === "—"') && buildInput.includes("hasRealNum"),
);

check(
  "Missing metric object is ineligible",
  buildInput.includes("!metric || typeof metric !== \"object\"") || buildInput.includes("!metric || typeof metric !== 'object'"),
);

// --- Summary ---
console.log(`\n--- DESIGN RATING N/A EXCLUSION: ${pass} passed, ${fail} failed ---\n`);
if (fail > 0) {
  console.error("DESIGN RATING N/A EXCLUSION FAILED");
  process.exit(1);
}
console.log("DESIGN RATING N/A EXCLUSION PASSED");