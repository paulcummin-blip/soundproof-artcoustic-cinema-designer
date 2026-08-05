/**
 * selectClientBestListeningArea.fixtures
 * --------------------------------------
 * Deterministic test fixtures for the Best Listening Area selector.
 *
 * Validates the worst-applicable-level rule, client category mapping,
 * RSP handling, count summaries, and edge cases.
 */

import { selectClientBestListeningArea } from "./selectClientBestListeningArea";

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

  // ── 1. P4-only fixture ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("1a. P4-only → 1 seat", 1, r.seats.length);
    check("1b. P4-only L4 → primary", "primary", r.seats[0].categoryKey);
    check("1c. P4-only → hasPrimary", true, r.hasPrimary);
    check("1d. P4-only → primary count", 1, r.counts.primary);
    check("1e. P4-only → 1 category", 1, Object.keys(r.counts).length);
  }

  // ── 2. P4 + P6 fixture ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L2") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("2a. P4+P6 → worst is L2", "L2", r.seats[0].worstLevel);
    check("2b. P4+P6 L2 → good", "good", r.seats[0].categoryKey);
    check("2c. P4+P6 → good count", 1, r.counts.good);
    check("2d. P4+P6 → 1 category", 1, Object.keys(r.counts).length);
  }

  // ── 3. P10-only fixture ──
  {
    const analysis = makeAnalysis({
      "s1": { 10: param("L1") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("3a. P10-only L1 → acceptable", "acceptable", r.seats[0].categoryKey);
    check("3b. P10-only → worstLevel L1", "L1", r.seats[0].worstLevel);
  }

  // ── 4. Mixed unavailable layers ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L3"), 10: param(null, null, "no_data") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("4a. Mixed unavailable → worst is L3", "L3", r.seats[0].worstLevel);
    check("4b. Mixed unavailable → primary", "primary", r.seats[0].categoryKey);
  }

  // ── 5. Explicit FAIL ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("FAIL", 0.5) },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("5a. FAIL present → worst is FAIL", "FAIL", r.seats[0].worstLevel);
    check("5b. FAIL → improvement", "improvement", r.seats[0].categoryKey);
    check("5c. FAIL → improvement count", 1, r.counts.improvement);
    check("5d. FAIL → 1 category", 1, Object.keys(r.counts).length);
  }

  // ── 6. No valid results ──
  // (Tests 6–15 below; FAIL-specific tests 16–22 inserted before test 6) ──

  // ── 16. Explicit FAIL with status "ok" (no finite value) ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: paramFail("ok") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("16a. FAIL+ok → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("16b. FAIL+ok → improvement", "improvement", r.seats[0].categoryKey);
    check("16c. FAIL+ok → category label", "Improvement recommended", r.seats[0].category);
  }

  // ── 17. Explicit FAIL with status "fail" ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: paramFail("fail") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("17a. FAIL+fail → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("17b. FAIL+fail → improvement", "improvement", r.seats[0].categoryKey);
    check("17c. FAIL+fail → category label", "Improvement recommended", r.seats[0].category);
  }

  // ── 18. Status "fail" without explicit FAIL level → rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L3", 1.0, "fail"), 6: param("L4"), 10: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("18a. L3+fail rejected → worst L4", "L4", r.seats[0].worstLevel);
    check("18b. L3+fail rejected → primary", "primary", r.seats[0].categoryKey);
  }

  // ── 19. Status "no_data" → rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L3", 1.0, "no_data"), 6: param("L4"), 10: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("19a. no_data rejected → worst L4", "L4", r.seats[0].worstLevel);
    check("19b. no_data rejected → primary", "primary", r.seats[0].categoryKey);
  }

  // ── 20. Status "error" → rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L3", 1.0, "error"), 6: param("L4"), 10: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("20a. error rejected → worst L4", "L4", r.seats[0].worstLevel);
    check("20b. error rejected → primary", "primary", r.seats[0].categoryKey);
  }

  // ── 21. applicable === false → rejected ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: paramApplicable("L4", 1.0, "ok", false), 6: param("L3"), 10: param("L3") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("21a. applicable=false rejected → worst L3", "L3", r.seats[0].worstLevel);
    check("21b. applicable=false rejected → primary", "primary", r.seats[0].categoryKey);
  }

  // ── 22. Mixed L4 / L3 / FAIL → Improvement recommended ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L3"), 10: paramFail("fail") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("22a. Mixed L4/L3/FAIL → worst FAIL", "FAIL", r.seats[0].worstLevel);
    check("22b. Mixed L4/L3/FAIL → improvement", "improvement", r.seats[0].categoryKey);
    check("22c. Mixed L4/L3/FAIL → category label", "Improvement recommended", r.seats[0].category);
    check("22d. Mixed L4/L3/FAIL → improvement count", 1, r.counts.improvement);
  }

  // ── 6. No valid results (original) ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param(null, null, "no_data"), 6: param(null, null, "error"), 10: param("N/A") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("6a. No valid → not_assessed", "not_assessed", r.seats[0].categoryKey);
    check("6b. No valid → worstLevel null", null, r.seats[0].worstLevel);
    check("6c. No valid → hasPrimary false", false, r.hasPrimary);
    check("6d. No valid → explanation conservative", "The seating area provides a range of listening positions, with the strongest available seats highlighted.", r.explanation);
  }

  // ── 7. One seat ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L4"), 10: param("L4") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("7a. One seat → 1 seat", 1, r.seats.length);
    check("7b. One seat L4 → primary", "primary", r.seats[0].categoryKey);
    check("7c. One seat → hasPrimary", true, r.hasPrimary);
    check("7d. One seat → explanation primary", "The strongest listening area is centred on the primary seats, with the surrounding seats still providing a balanced and enjoyable cinema experience.", r.explanation);
  }

  // ── 8. Dense multi-row seating ──
  {
    const analysis = makeAnalysis({
      "r1c1": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
      "r1c2": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
      "r2c1": { 4: param("L3"), 6: param("L2"), 10: param("L2") },
      "r2c2": { 4: param("L3"), 6: param("L2"), 10: param("L2") },
      "r3c1": { 4: param("L2"), 6: param("L1"), 10: param("L1") },
      "r3c2": { 4: param("L2"), 6: param("L1"), 10: param("L1") },
    });
    const seats = [
      makeSeat("r1c1", 1, 2), makeSeat("r1c2", 3, 2),
      makeSeat("r2c1", 1, 4), makeSeat("r2c2", 3, 4),
      makeSeat("r3c1", 1, 6), makeSeat("r3c2", 3, 6),
    ];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("8a. Dense → 6 seats", 6, r.seats.length);
    check("8b. Row1 → primary", "primary", r.seats[0].categoryKey);
    check("8c. Row2 → good", "good", r.seats[2].categoryKey);
    check("8d. Row3 → acceptable", "acceptable", r.seats[4].categoryKey);
    check("8e. Dense → primary count", 2, r.counts.primary);
    check("8f. Dense → good count", 2, r.counts.good);
    check("8g. Dense → acceptable count", 2, r.counts.acceptable);
    check("8h. Dense → 3 categories", 3, Object.keys(r.counts).length);
  }

  // ── 9. Adjacent same-category seats ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
      "s2": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
    });
    const seats = [makeSeat("s1", 2, 3), makeSeat("s2", 2.5, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("9a. Adjacent same → both primary", "primary", r.seats[0].categoryKey);
    check("9b. Adjacent same → both primary", "primary", r.seats[1].categoryKey);
    check("9c. Adjacent same → primary count", 2, r.counts.primary);
    check("9d. Adjacent same → 1 category", 1, Object.keys(r.counts).length);
  }

  // ── 10. RSP coinciding with a real seat ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const rsp = { x: 2, y: 3 };
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp });
    check("10a. RSP coincides → seat still classified", "primary", r.seats[0].categoryKey);
    check("10b. RSP present → rsp point", { x: 2, y: 3 }, r.rsp);
  }

  // ── 11. Current four-seat project validation ──
  // P4: L3 / L4 / L4 / L3
  // P6: L1 / L3 / L3 / L1
  // P10: L1 / L3 / L3 / L1
  {
    const analysis = makeAnalysis({
      "seat1": { 4: param("L3"), 6: param("L1"), 10: param("L1") },
      "seat2": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
      "seat3": { 4: param("L4"), 6: param("L3"), 10: param("L3") },
      "seat4": { 4: param("L3"), 6: param("L1"), 10: param("L1") },
    });
    const seats = [
      makeSeat("seat1", 1, 2), makeSeat("seat2", 2, 3),
      makeSeat("seat3", 3, 4), makeSeat("seat4", 4, 5),
    ];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("11a. Seat1 (outer) → worst L1 → acceptable", "acceptable", r.seats[0].categoryKey);
    check("11b. Seat2 (centre) → worst L3 → primary", "primary", r.seats[1].categoryKey);
    check("11c. Seat3 (centre) → worst L3 → primary", "primary", r.seats[2].categoryKey);
    check("11d. Seat4 (outer) → worst L1 → acceptable", "acceptable", r.seats[3].categoryKey);
    check("11e. Counts → primary count = 2", 2, r.counts.primary);
    check("11f. Counts → acceptable count = 2", 2, r.counts.acceptable);
    check("11g. Counts → only 2 categories", 2, Object.keys(r.counts).length);
    check("11h. Has primary → primary explanation", "The strongest listening area is centred on the primary seats, with the surrounding seats still providing a balanced and enjoyable cinema experience.", r.explanation);
  }

  // ── 12. No seat upgraded by stronger results in another layer ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4"), 6: param("L4"), 10: param("L1") },
    });
    const seats = [makeSeat("s1", 2, 3)];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("12a. L4+L4+L1 → worst L1 (not upgraded)", "L1", r.seats[0].worstLevel);
    check("12b. L4+L4+L1 → acceptable (not primary)", "acceptable", r.seats[0].categoryKey);
  }

  // ── 13. Malformed seat coordinates are omitted ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4") },
      "s2": { 4: param("L4") },
    });
    const seats = [
      makeSeat("s1", 2, 3),
      { id: "s2", x: "abc", y: null },
    ];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("13a. Malformed omitted → 1 seat", 1, r.seats.length);
    check("13b. Valid seat kept → s1", "s1", r.seats[0].id);
  }

  // ── 14. RSP does not alter seat isPrimary ──
  {
    const analysis = makeAnalysis({
      "s1": { 4: param("L4") },
    });
    const seats = [{ id: "s1", x: 2, y: 3, z: 1.2, isPrimary: false }];
    const r = selectClientBestListeningArea({ analysisResult: analysis, seatingPositions: seats, rsp: null });
    check("14. isPrimary not altered → false", false, seats[0].isPrimary);
  }

  // ── 15. Empty input ──
  {
    const r = selectClientBestListeningArea({ analysisResult: null, seatingPositions: null, rsp: null });
    check("15a. Empty → 0 seats", 0, r.seats.length);
    check("15b. Empty → hasAny false", false, r.hasAny);
    check("15c. Empty → explanation empty", "", r.explanation);
  }

  return tests;
}

export { run };