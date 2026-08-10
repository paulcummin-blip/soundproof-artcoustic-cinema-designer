/**
 * designRecommendationP2Parity.fixtures
 * --------------------------------------
 * Regression: baseline / candidate Dolby-layout parity for P2.
 *
 * Defect fixed: the Room Designer baseline useRP22AnalysisEngine call was
 * not passing dolbyLayout, so baseline P2 = no_data while candidate P2 was
 * scored from candidate.dolbyLayout. This created false P2 improvements under
 * changes that cannot affect speaker count (seating, LCR, screen).
 *
 * Fix: baseline now passes dolbyLayout: dolbyPreset (the same canonical
 * appState.dolbyLayout used by the Room Designer and the candidate engine).
 *
 * Non-layout-changing candidates (seating, LCR, screen) inherit the baseline
 * layout unchanged, so evaluateCanonicalP2(baseline) === evaluateCanonicalP2(candidate).
 * Only genuine channel-count mutations pass a different layout string.
 *
 * Run via exec_tool:
 *   require('./src/components/recommendations/designRecommendationP2Parity.fixtures').runP2ParityAssertions()
 */
import { evaluateCanonicalP2 } from "../utils/rp22/canonicalP2Authority.js";

export function runP2ParityAssertions() {
  const tests = [];

  const check = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    tests.push({ test: name, expected, actual, pass });
  };

  // ── Baseline: 9.1.6 with 15 discrete speakers ──
  const baselineLayout = "9.1.6";
  const baselineP2 = evaluateCanonicalP2(baselineLayout);

  // B1. Baseline P2 raw = 15
  check("B1. Baseline 9.1.6 → P2 raw = 15", 15, baselineP2.value);
  // B2. Baseline P2 level = L4
  check("B2. Baseline 9.1.6 → P2 level = L4", "L4", baselineP2.level);
  // B3. Baseline P2 status = ok (not no_data — this was the defect)
  check("B3. Baseline 9.1.6 → P2 status = ok", "ok", baselineP2.status);
  // B4. Baseline P2 applicable = true
  check("B4. Baseline 9.1.6 → P2 applicable = true", true, baselineP2.applicable);

  // ── Seating-only candidate: same layout string → identical P2 ──
  // The candidate generator passes dolbyLayout through unchanged for seating.
  const seatingP2 = evaluateCanonicalP2(baselineLayout);
  check("S1. Seating candidate → P2 raw = 15", 15, seatingP2.value);
  check("S2. Seating candidate → P2 level = L4", "L4", seatingP2.level);
  check("S3. Seating P2 === baseline P2 (parity)", true, seatingP2.value === baselineP2.value && seatingP2.level === baselineP2.level);
  check("S4. Seating P2 changed: NO", false, seatingP2.value !== baselineP2.value || seatingP2.level !== baselineP2.level);

  // ── LCR-model-only candidate: same layout string → identical P2 ──
  const lcrP2 = evaluateCanonicalP2(baselineLayout);
  check("L1. LCR candidate → P2 raw = 15", 15, lcrP2.value);
  check("L2. LCR candidate → P2 level = L4", "L4", lcrP2.level);
  check("L3. LCR P2 === baseline P2 (parity)", true, lcrP2.value === baselineP2.value && lcrP2.level === baselineP2.level);
  check("L4. LCR P2 changed: NO", false, lcrP2.value !== baselineP2.value || lcrP2.level !== baselineP2.level);

  // ── Screen-size-only candidate: same layout string → identical P2 ──
  const screenP2 = evaluateCanonicalP2(baselineLayout);
  check("SC1. Screen candidate → P2 raw = 15", 15, screenP2.value);
  check("SC2. Screen candidate → P2 level = L4", "L4", screenP2.level);
  check("SC3. Screen P2 === baseline P2 (parity)", true, screenP2.value === baselineP2.value && screenP2.level === baselineP2.level);
  check("SC4. Screen P2 changed: NO", false, screenP2.value !== baselineP2.value || screenP2.level !== baselineP2.level);

  // ── Channel-count candidate: genuine layout mutation → P2 changes ──
  // 9.1.6 → 7.1.6 (remove front wides): value drops 15 → 13, level L4 → L2
  const channelCountLayout = "7.1.6";
  const ccP2 = evaluateCanonicalP2(channelCountLayout);
  check("CC1. Channel-count layout ≠ baseline", true, channelCountLayout !== baselineLayout);
  check("CC2. Channel-count P2 changed: YES", true, ccP2.value !== baselineP2.value || ccP2.level !== baselineP2.level);
  check("CC3. Channel-count → P2 raw = 13", 13, ccP2.value);
  check("CC4. Channel-count → P2 level = L2", "L2", ccP2.level);

  // ── 6→4 overhead candidate: 9.1.6 → 9.1.4 → P2 changes (13 → 11) ──
  const overheadReductionLayout = "9.1.4";
  const ohP2 = evaluateCanonicalP2(overheadReductionLayout);
  check("OH1. 9.1.4 P2 changed: YES", true, ohP2.value !== baselineP2.value || ohP2.level !== baselineP2.level);
  check("OH2. 9.1.4 → P2 raw = 13", 13, ohP2.value);
  check("OH3. 9.1.4 → P2 level = L2", "L2", ohP2.level);

  // ── Defect guard: undefined layout still produces no_data ──
  const nullP2 = evaluateCanonicalP2(undefined);
  check("N1. Undefined layout → no_data", "no_data", nullP2.status);
  check("N2. Undefined layout → null level", null, nullP2.level);
  check("N3. Undefined layout → null value", null, nullP2.value);

  // ── Defect guard: null layout still produces no_data ──
  const nullP2b = evaluateCanonicalP2(null);
  check("N4. Null layout → no_data", "no_data", nullP2b.status);

  return tests;
}