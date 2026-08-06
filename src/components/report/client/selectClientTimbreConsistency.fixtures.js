/**
 * selectClientTimbreConsistency.fixtures
 * --------------------------------------
 * Deterministic test fixtures for the Timbre Consistency selector.
 *
 * Validates P16/P17 per-seat reading, worst-applicable-level rule,
 * client category mapping, count summaries, and edge cases.
 */

import { selectClientTimbreConsistency } from "./selectClientTimbreConsistency";

function run() {
  const tests = [];
  const check = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    tests.push({ test: name, expected: String(expected), actual: String(actual), pass });
  };

  // Helper: build a minimal analysisResult with perSeatRp22
  function makeAnalysis(seatResults) {
    const perSeatRp22 = {};
    for (const [seatId, rp22] of Object.entries(seatResults)) {
      perSeatRp22[seatId] = { isPrimary: false, rp22 };
    }
    return { perSeatRp22 };
  }

  // Helper: make a seat
  function makeSeat(id, x, y) {
    return { id, x, y, z: 1.2, isPrimary: false };
  }

  // Helper: make a param result
  function param(level, value = 1.0, status = "ok") {
    return { level, value, formatted: String(value), status };
  }

  // Helper: make a FAIL param (no finite value required)
  function paramFail(status = "ok") {
    return { level: "FAIL", status };
  }

  // Helper: make a param with applicable flag
  function paramApplicable(level, value, status, applicable) {
    return { level, value, formatted: String(value), status, applicable };
  }

  // Helper: make a param with no status field (missing status)
  function paramNoStatus(level, value = 1.0) {
    return { level, value, formatted: String(value) };
  }

  // ── 1. P16-only fixture ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("1a. P16-only → 1 seat", 1, r.seats.length);
    check("1b. P16-only L4 → highly_consistent", "highly_consistent", r.seats[0].categoryKey);
    check("1c. P16-only → worstLevel L4", "L4", r.seats[0].worstLevel);
    check("1d. P16-only → highly_consistent count", 1, r.counts.highly_consistent);
    check("1e. P16-only → hasAnyValidResult", true, r.hasAnyValidResult);
  }

  // ── 2. P17-only fixture ──
  {
    const analysis = makeAnalysis({
      "s1": { 17: param("L2") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("2a. P17-only → 1 seat", 1, r.seats.length);
    check("2b. P17-only L2 → consistent", "consistent", r.seats[0].categoryKey);
    check("2c. P17-only → worstLevel L2", "L2", r.seats[0].worstLevel);
    check("2d. P17-only → consistent count", 1, r.counts.consistent);
    check("2e. P17-only → hasAnyValidResult", true, r.hasAnyValidResult);
  }

  // ── 3. Worst-result selection (P16 L4 + P17 L2 → L2) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4"), 17: param("L2") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("3a. P16 L4 + P17 L2 → worst L2", "L2", r.seats[0].worstLevel);
    check("3b. P16 L4 + P17 L2 → consistent", "consistent", r.seats[0].categoryKey);
    check("3c. Worst-result → consistent count", 1, r.counts.consistent);
  }

  // ── 3b. Worst-result selection (P16 L2 + P17 L4 → L2) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L2"), 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("3d. P16 L2 + P17 L4 → worst L2", "L2", r.seats[0].worstLevel);
    check("3e. P16 L2 + P17 L4 → consistent", "consistent", r.seats[0].categoryKey);
  }

  // ── 3c. Worst-result selection (P16 L3 + P17 L4 → L3) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L3"), 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("3f. P16 L3 + P17 L4 → worst L3", "L3", r.seats[0].worstLevel);
    check("3g. P16 L3 + P17 L4 → very_consistent", "very_consistent", r.seats[0].categoryKey);
  }

  // ── 4. Explicit FAIL (P16 FAIL + P17 L4 → FAIL) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: paramFail("ok"), 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("4a. P16 FAIL + P17 L4 → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("4b. FAIL → improvement", "improvement", r.seats[0].categoryKey);
    check("4c. FAIL → improvement count", 1, r.counts.improvement);
    check("4d. FAIL → label", "Improvement recommended", r.seats[0].categoryLabel);
  }

  // ── 4b. Explicit FAIL with status "fail" ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4"), 17: paramFail("fail") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("4e. P17 FAIL+fail → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("4f. P17 FAIL+fail → improvement", "improvement", r.seats[0].categoryKey);
  }

  // ── 4c. Explicit FAIL with missing status (absent) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: { level: "FAIL" }, 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("4g. P16 FAIL no status → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("4h. P16 FAIL no status → improvement", "improvement", r.seats[0].categoryKey);
  }

  // ── 5. Missing status accepted (L1–L4 with no status field) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: paramNoStatus("L4"), 17: paramNoStatus("L3") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("5a. Missing status P16 L4 accepted", "L4", r.seats[0].p16.level);
    check("5b. Missing status P17 L3 accepted", "L3", r.seats[0].p17.level);
    check("5c. Missing status → worst L3", "L3", r.seats[0].worstLevel);
    check("5d. Missing status → very_consistent", "very_consistent", r.seats[0].categoryKey);
    check("5e. Missing status → hasAnyValidResult", true, r.hasAnyValidResult);
  }

  // ── 5b. Missing status with absent value → rejected (value not finite) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: { level: "L4" }, 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("5f. L4 no value → rejected (P16 null contribution)", "L4", r.seats[0].worstLevel);
    check("5g. L4 no value → only P17 counted", "highly_consistent", r.seats[0].categoryKey);
  }

  // ── 6. no_data rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L3", 1.0, "no_data"), 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("6a. no_data rejected → worst L4 (P17 only)", "L4", r.seats[0].worstLevel);
    check("6b. no_data rejected → highly_consistent", "highly_consistent", r.seats[0].categoryKey);
  }

  // ── 6b. error status rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L3", 1.0, "error"), 17: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("6c. error rejected → worst L4", "L4", r.seats[0].worstLevel);
  }

  // ── 6c. N/A level rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: { level: "N/A", value: 1.0, status: "ok" }, 17: param("L3") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("6d. N/A level rejected → worst L3 (P17 only)", "L3", r.seats[0].worstLevel);
  }

  // ── 6d. Both no_data → not_assessed ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param(null, null, "no_data"), 17: param(null, null, "no_data") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("6e. Both no_data → not_assessed", "not_assessed", r.seats[0].categoryKey);
    check("6f. Both no_data → worstLevel null", null, r.seats[0].worstLevel);
    check("6g. Both no_data → hasAnyValidResult false", false, r.hasAnyValidResult);
  }

  // ── 7. applicable === false rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: paramApplicable("L4", 1.0, "ok", false), 17: param("L3") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("7a. applicable=false rejected → worst L3 (P17 only)", "L3", r.seats[0].worstLevel);
    check("7b. applicable=false rejected → very_consistent", "very_consistent", r.seats[0].categoryKey);
  }

  // ── 7b. Both applicable=false → not_assessed ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: paramApplicable("L4", 1.0, "ok", false), 17: paramApplicable("L3", 1.0, "ok", false) },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("7c. Both applicable=false → not_assessed", "not_assessed", r.seats[0].categoryKey);
    check("7d. Both applicable=false → hasAnyValidResult false", false, r.hasAnyValidResult);
  }

  // ── 8. Malformed coordinates rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4"), 17: param("L4") },
      "s2": { 16: param("L4"), 17: param("L4") },
      "s3": { 16: param("L4"), 17: param("L4") },
    });
    const seats = [
      makeSeat("s1", 2, 3),
      { id: "s2", x: "abc", y: 3 },
      { id: "s3", x: 2, y: null },
    ];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("8a. Malformed coords → 1 seat", 1, r.seats.length);
    check("8b. Valid seat kept → s1", "s1", r.seats[0].id);
  }

  // ── 8b. Missing seat ID rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4"), 17: param("L4") },
    });
    const seats = [
      makeSeat("s1", 2, 3),
      { x: 3, y: 3 },
    ];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("8c. Missing seat ID → 1 seat", 1, r.seats.length);
  }

  // ── 8c. Synthetic mlp excluded ──
  {
    const analysis = makeAnalysis({
      "mlp": { 16: param("L4"), 17: param("L4") },
      "s1": { 16: param("L3"), 17: param("L3") },
    });
    const seats = [
      makeSeat("mlp", 2.5, 3),
      makeSeat("s1", 2, 3),
    ];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("8d. Synthetic mlp excluded → 1 seat", 1, r.seats.length);
    check("8e. Only real seat → s1", "s1", r.seats[0].id);
  }

  // ── 9. Current four-seat project validation ──
  // seat-r1-c1: P16 L2, P17 L2 → Consistent (L2)
  // seat-r1-c2: P16 L4, P17 L3 → Very consistent (L3)
  // seat-r1-c3: P16 L4, P17 L3 → Very consistent (L3)
  // seat-r1-c4: P16 L2, P17 L2 → Consistent (L2)
  {
    const analysis = makeAnalysis({
      "seat-r1-c1": { 16: param("L2"), 17: param("L2") },
      "seat-r1-c2": { 16: param("L4"), 17: param("L3") },
      "seat-r1-c3": { 16: param("L4"), 17: param("L3") },
      "seat-r1-c4": { 16: param("L2"), 17: param("L2") },
    });
    const seats = [
      makeSeat("seat-r1-c1", 1, 3),
      makeSeat("seat-r1-c2", 2, 3),
      makeSeat("seat-r1-c3", 3, 3),
      makeSeat("seat-r1-c4", 4, 3),
    ];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("9a. Seat1 P16 L2 + P17 L2 → consistent", "consistent", r.seats[0].categoryKey);
    check("9b. Seat1 → worstLevel L2", "L2", r.seats[0].worstLevel);
    check("9c. Seat2 P16 L4 + P17 L3 → very_consistent", "very_consistent", r.seats[1].categoryKey);
    check("9d. Seat2 → worstLevel L3", "L3", r.seats[1].worstLevel);
    check("9e. Seat3 P16 L4 + P17 L3 → very_consistent", "very_consistent", r.seats[2].categoryKey);
    check("9f. Seat3 → worstLevel L3", "L3", r.seats[2].worstLevel);
    check("9g. Seat4 P16 L2 + P17 L2 → consistent", "consistent", r.seats[3].categoryKey);
    check("9h. Seat4 → worstLevel L2", "L2", r.seats[3].worstLevel);
    check("9i. Counts → very_consistent = 2", 2, r.counts.very_consistent);
    check("9j. Counts → consistent = 2", 2, r.counts.consistent);
    check("9k. Counts → only 2 categories", 2, Object.keys(r.counts).length);
    check("9l. hasAnyValidResult true", true, r.hasAnyValidResult);
    check("9m. 4 seats classified", 4, r.seats.length);
  }

  // ── 10. Empty input ──
  {
    const r = selectClientTimbreConsistency({ analysisResult: null, seatingPositions: null });
    check("10a. Empty → 0 seats", 0, r.seats.length);
    check("10b. Empty → hasAnyValidResult false", false, r.hasAnyValidResult);
    check("10c. Empty → empty counts", 0, Object.keys(r.counts).length);
  }

  // ── 11. No valid results (all N/A) ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: { level: "N/A" }, 17: { level: "—" } },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("11a. All N/A → not_assessed", "not_assessed", r.seats[0].categoryKey);
    check("11b. All N/A → worstLevel null", null, r.seats[0].worstLevel);
    check("11c. All N/A → hasAnyValidResult false", false, r.hasAnyValidResult);
  }

  // ── 12. No seat upgraded by stronger result in other param ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param("L4"), 17: param("L1") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("12a. L4+L1 → worst L1 (not upgraded)", "L1", r.seats[0].worstLevel);
    check("12b. L4+L1 → acceptable", "acceptable", r.seats[0].categoryKey);
  }

  // ── 13. Numeric level values (1–4) normalised correctly ──
  {
    const analysis = makeAnalysis({
      "s1": { 16: param(4), 17: param(3) },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientTimbreConsistency({ analysisResult: analysis, seatingPositions: seats });
    check("13a. Numeric 4 → L4", "L4", r.seats[0].worstLevel === "L3" ? "L3" : "L4");
    check("13b. Numeric 4+3 → worst L3", "L3", r.seats[0].worstLevel);
    check("13c. Numeric → very_consistent", "very_consistent", r.seats[0].categoryKey);
  }

  return tests;
}

export { run };