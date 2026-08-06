/**
 * p1LevelAuthority.fixtures
 * -------------------------
 * Focused assertions for the P1 level helper.
 *
 * Run with: node --experimental-vm-modules src/components/utils/rp22/p1LevelAuthority.fixtures.js
 * Or import and call runP1LevelFixtures() from a test runner.
 */
import { gradeP1Distance } from "./p1LevelAuthority";

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
    return false;
  }
  console.log(`PASS: ${label}`);
  return true;
}

export function runP1LevelFixtures() {
  let allPass = true;
  const g = gradeP1Distance;

  // 1. 0.49 m → FAIL
  allPass &= assertEqual(g(0.49).level, "FAIL", "0.49m → FAIL");

  // 2. 0.50 m → L1
  allPass &= assertEqual(g(0.50).level, "L1", "0.50m → L1");

  // 3. 0.79 m → L1
  allPass &= assertEqual(g(0.79).level, "L1", "0.79m → L1");

  // 4. 0.80 m → L2
  allPass &= assertEqual(g(0.80).level, "L2", "0.80m → L2");

  // 5. 1.19 m → L2
  allPass &= assertEqual(g(1.19).level, "L2", "1.19m → L2");

  // 6. 1.20 m → L3
  allPass &= assertEqual(g(1.20).level, "L3", "1.20m → L3");

  // 7. 1.49 m → L3
  allPass &= assertEqual(g(1.49).level, "L3", "1.49m → L3");

  // 8. 1.50 m → L4
  allPass &= assertEqual(g(1.50).level, "L4", "1.50m → L4");

  // 9. 1.875 m → L4
  allPass &= assertEqual(g(1.875).level, "L4", "1.875m → L4");

  // 10. null / NaN / Infinity / negative → no_data
  allPass &= assertEqual(g(null).status, "no_data", "null → no_data");
  allPass &= assertEqual(g(NaN).status, "no_data", "NaN → no_data");
  allPass &= assertEqual(g(Infinity).status, "no_data", "Infinity → no_data");
  allPass &= assertEqual(g(-1).status, "no_data", "negative → no_data");

  // 11. formatting uses two decimal places without changing grading input
  const r1875 = g(1.875);
  allPass &= assertEqual(r1875.formatted, "1.88m", "1.875m formatted → 1.88m");
  allPass &= assertEqual(r1875.level, "L4", "1.875m level → L4 (formatting did not change grading)");

  const r1075 = g(1.075);
  allPass &= assertEqual(r1075.formatted, "1.07m", "1.075m formatted → 1.07m");
  allPass &= assertEqual(r1075.level, "L2", "1.075m level → L2");

  // Full contract check for 1.875 m
  allPass &= assertEqual(
    { value: r1875.value, formatted: r1875.formatted, level: r1875.level, status: r1875.status, applicable: r1875.applicable, source: r1875.source },
    { value: 1.875, formatted: "1.88m", level: "L4", status: "ok", applicable: true, source: "p1LevelAuthority" },
    "1.875m full contract"
  );

  // Full contract check for 1.075 m
  allPass &= assertEqual(
    { value: r1075.value, formatted: r1075.formatted, level: r1075.level, status: r1075.status, applicable: r1075.applicable, source: r1075.source },
    { value: 1.075, formatted: "1.07m", level: "L2", status: "ok", applicable: true, source: "p1LevelAuthority" },
    "1.075m full contract"
  );

  // Full contract check for valid distance below 0.5 m
  const r049 = g(0.49);
  allPass &= assertEqual(
    { value: r049.value, formatted: r049.formatted, level: r049.level, status: r049.status, applicable: r049.applicable, source: r049.source },
    { value: 0.49, formatted: "0.49m", level: "FAIL", status: "ok", applicable: true, source: "p1LevelAuthority" },
    "0.49m full contract (FAIL preserves numeric value)"
  );

  // Full contract check for missing input
  const rNull = g(null);
  allPass &= assertEqual(
    { value: rNull.value, formatted: rNull.formatted, level: rNull.level, status: rNull.status, applicable: rNull.applicable, source: rNull.source },
    { value: null, formatted: null, level: null, status: "no_data", applicable: false, source: "p1LevelAuthority" },
    "null full contract"
  );

  // 12. no 0.6 / 0.9 threshold appears in the helper source
  const helperSource = g.toString();
  allPass &= assertEqual(helperSource.includes("0.6"), false, "helper source contains no 0.6 threshold");
  allPass &= assertEqual(helperSource.includes("0.9"), false, "helper source contains no 0.9 threshold");

  // Current project expectations
  allPass &= assertEqual(g(1.075).level, "L2", "Seat 1: 1.075m → L2");
  allPass &= assertEqual(g(1.875).level, "L4", "Seat 2: 1.875m → L4");
  allPass &= assertEqual(g(1.875).level, "L4", "Seat 3: 1.875m → L4");
  allPass &= assertEqual(g(1.075).level, "L2", "Seat 4: 1.075m → L2");

  console.log(allPass ? "\nALL P1 FIXTURES PASSED" : "\nSOME P1 FIXTURES FAILED");
  return Boolean(allPass);
}

// Fixtures are run by importing runP1LevelFixtures() from a test runner.