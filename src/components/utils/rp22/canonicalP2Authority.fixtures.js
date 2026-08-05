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

  return tests;
}