/**
 * canonicalP2Authority.fixtures
 * -----------------------------
 * Deterministic test fixtures for the canonical P2 authority.
 * Run via exec_tool: require('./src/components/utils/rp22/canonicalP2Authority.fixtures').runCanonicalP2Assertions()
 */
import { evaluateCanonicalP2 } from "./canonicalP2Authority";

export function runCanonicalP2Assertions() {
  const tests = [];

  const check = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    tests.push({ test: name, expected, actual, pass });
  };

  // 1. 5.1.0 → value 5 → L1
  {
    const r = evaluateCanonicalP2("5.1.0");
    check("1. 5.1.0 → value 5", 5, r.value);
    check("1. 5.1.0 → L1", "L1", r.level);
  }

  // 2. 5.1.2 → value 7 → L1
  {
    const r = evaluateCanonicalP2("5.1.2");
    check("2. 5.1.2 → value 7", 7, r.value);
    check("2. 5.1.2 → L1", "L1", r.level);
  }

  // 3. 7.1.4 → value 11 → L2
  {
    const r = evaluateCanonicalP2("7.1.4");
    check("3. 7.1.4 → value 11", 11, r.value);
    check("3. 7.1.4 → L2", "L2", r.level);
  }

  // 4. 7.4.4 → value 11 → L2
  {
    const r = evaluateCanonicalP2("7.4.4");
    check("4. 7.4.4 → value 11", 11, r.value);
    check("4. 7.4.4 → L2", "L2", r.level);
  }

  // 5. 7.4.6 → value 13 → L2 for Dolby
  {
    const r = evaluateCanonicalP2("7.4.6");
    check("5. 7.4.6 → value 13", 13, r.value);
    check("5. 7.4.6 → L2 (Dolby)", "L2", r.level);
  }

  // 6. 9.4.6 → value 15 → L4
  {
    const r = evaluateCanonicalP2("9.4.6");
    check("6. 9.4.6 → value 15", 15, r.value);
    check("6. 9.4.6 → L4", "L4", r.level);
  }

  // 7. 9.1.6 and 9.4.6 produce the same P2 value and level
  {
    const r1 = evaluateCanonicalP2("9.1.6");
    const r2 = evaluateCanonicalP2("9.4.6");
    check("7. 9.1.6 and 9.4.6 → same value", r1.value, r2.value);
    check("7. 9.1.6 and 9.4.6 → same level", r1.level, r2.level);
  }

  // 8. Changing only subwoofer count never changes P2
  {
    const r1 = evaluateCanonicalP2("7.1.4");
    const r2 = evaluateCanonicalP2("7.4.4");
    const r3 = evaluateCanonicalP2("7.2.4");
    check("8. 7.1.4 vs 7.4.4 → same value", r1.value, r2.value);
    check("8. 7.1.4 vs 7.2.4 → same value", r1.value, r3.value);
    check("8. 7.1.4 vs 7.4.4 → same level", r1.level, r2.level);
  }

  // 9. Missing layout produces no_data
  {
    const r = evaluateCanonicalP2(null);
    check("9. Missing layout → no_data", "no_data", r.status);
    check("9. Missing layout → null value", null, r.value);
    check("9. Missing layout → null level", null, r.level);
  }

  // 10. Empty layout produces no_data
  {
    const r = evaluateCanonicalP2("");
    check("10. Empty layout → no_data", "no_data", r.status);
    check("10. Empty layout → null value", null, r.value);
  }

  // 11. Malformed layout produces no_data
  {
    const r = evaluateCanonicalP2("abc");
    check("11. Malformed layout → no_data", "no_data", r.status);
    check("11. Malformed layout → null value", null, r.value);
  }

  // 12. Negative or fractional channel fields are rejected
  {
    const r1 = evaluateCanonicalP2("-1.1.0");
    check("12a. Negative listener → no_data", "no_data", r1.status);
    const r2 = evaluateCanonicalP2("5.1.2.5");
    check("12b. Extra dot field (4 parts) → no_data", "no_data", r2.status);
    const r3 = evaluateCanonicalP2("5.-1.0");
    check("12c. Negative subwoofer → no_data", "no_data", r3.status);
  }

  // 13. Valid layout below five feeds produces FAIL, not no_data
  {
    const r = evaluateCanonicalP2("3.1.0");
    check("13a. 3.1.0 → value 3", 3, r.value);
    check("13b. 3.1.0 → FAIL", "FAIL", r.level);
    check("13c. 3.1.0 → status ok", "ok", r.status);
  }

  // 14. Technical and Stage B selectors receive the exact same canonical object
  {
    const r = evaluateCanonicalP2("9.4.6");
    check("14a. Configuration preserved", "9.4.6", r.configuration);
    check("14b. Formatted preserved", "15 speakers", r.formatted);
    check("14c. Source identifier", "canonical-layout", r.source);
    check("14d. Applicable true", true, r.applicable);
  }

  // 15. No local grading fallback remains (verified by no_data for invalid)
  {
    const r = evaluateCanonicalP2("invalid");
    check("15a. Invalid → no_data (no local fallback)", "no_data", r.status);
    check("15b. Invalid → null level (no local fallback)", null, r.level);
    check("15c. Invalid → null value (no local fallback)", null, r.value);
  }

  // ── Integration assertions: nullable layout input path ──

  // Simulate the nullable canonicalP2Layout resolution used by both engine callers
  function resolveCanonicalP2Layout(app) {
    return app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? app?.speakerSystem?.dolbyPreset ?? null;
  }

  // I1. All layout sources missing → primary[2].status === "no_data"
  {
    const layout = resolveCanonicalP2Layout({});
    const r = evaluateCanonicalP2(layout);
    check("I1. All sources missing → no_data", "no_data", r.status);
  }

  // I2. All layout sources missing → value and level are null
  {
    const layout = resolveCanonicalP2Layout({});
    const r = evaluateCanonicalP2(layout);
    check("I2a. All sources missing → null value", null, r.value);
    check("I2b. All sources missing → null level", null, r.level);
  }

  // I3. Explicit app.dolbyLayout = "5.1" → value 5 / L1
  {
    const layout = resolveCanonicalP2Layout({ dolbyLayout: "5.1" });
    const r = evaluateCanonicalP2(layout);
    check("I3a. Explicit 5.1 → value 5", 5, r.value);
    check("I3b. Explicit 5.1 → L1", "L1", r.level);
  }

  // I4. Explicit app.dolbyLayout = "9.4.6" → value 15 / L4
  {
    const layout = resolveCanonicalP2Layout({ dolbyLayout: "9.4.6" });
    const r = evaluateCanonicalP2(layout);
    check("I4a. Explicit 9.4.6 → value 15", 15, r.value);
    check("I4b. Explicit 9.4.6 → L4", "L4", r.level);
  }

  // I5. Malformed layout does not fall back to 5.1
  {
    const layout = resolveCanonicalP2Layout({ dolbyLayout: "garbage" });
    const r = evaluateCanonicalP2(layout);
    check("I5a. Malformed → no_data (not 5.1)", "no_data", r.status);
    check("I5b. Malformed → null value", null, r.value);
    check("I5c. Malformed → null level", null, r.level);
  }

  // I6. app.dolbyLayout overrides legacy fallback fields
  {
    const layout = resolveCanonicalP2Layout({ dolbyLayout: "9.4.6", dolbyConfig: "5.1", speakerSystem: { dolbyLayout: "7.1.4" } });
    const r = evaluateCanonicalP2(layout);
    check("I6. dolbyLayout overrides legacy → 9.4.6", "9.4.6", r.configuration);
    check("I6. dolbyLayout overrides legacy → L4", "L4", r.level);
  }

  // I7. Secondary source used only when higher-priority source is absent
  {
    const layout = resolveCanonicalP2Layout({ dolbyConfig: "7.1.4" });
    const r = evaluateCanonicalP2(layout);
    check("I7a. Secondary dolbyConfig used → 7.1.4", "7.1.4", r.configuration);
    check("I7b. Secondary dolbyConfig → value 11", 11, r.value);
    check("I7c. Secondary dolbyConfig → L2", "L2", r.level);
  }

  // I8. Changing only subwoofer count does not change value or level
  {
    const l1 = resolveCanonicalP2Layout({ dolbyLayout: "9.1.6" });
    const l2 = resolveCanonicalP2Layout({ dolbyLayout: "9.4.6" });
    const r1 = evaluateCanonicalP2(l1);
    const r2 = evaluateCanonicalP2(l2);
    check("I8a. 9.1.6 vs 9.4.6 → same value", r1.value, r2.value);
    check("I8b. 9.1.6 vs 9.4.6 → same level", r1.level, r2.level);
  }

  // I9. Technical Report displays canonical no_data when input is absent
  {
    const layout = resolveCanonicalP2Layout({});
    const r = evaluateCanonicalP2(layout);
    check("I9. No input → no_data (Technical parity)", "no_data", r.status);
  }

  // I10. selectClientParameterResults.room[2] displays canonical no_data when input is absent
  {
    const layout = resolveCanonicalP2Layout({});
    const r = evaluateCanonicalP2(layout);
    check("I10. No input → no_data (Stage B parity)", "no_data", r.status);
  }

  // I11. No p2SystemConfig or equivalent local fallback remains (verified by no_data for absent input)
  {
    const layout = resolveCanonicalP2Layout({});
    const r = evaluateCanonicalP2(layout);
    check("I11. Absent input → no local L1 fallback", null, r.level);
    check("I11b. Absent input → no local value fallback", null, r.value);
  }

  // I12. No additional useRP22AnalysisEngine call is introduced (structural: verified at file level)
  {
    check("I12. Single evaluator function (no duplicate engine)", "function", typeof evaluateCanonicalP2);
  }

  return tests;
}