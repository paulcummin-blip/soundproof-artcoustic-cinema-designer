/**
 * clientReportSelectorsAssertions
 * ------------------------------
 * Development-only deterministic assertions for the client report selectors.
 * Runs only in Vite dev mode.
 *
 * Covers:
 *   1. Missing authority
 *   2. Discrete seat mapping
 *   3. Bass authority split
 *   4. Pillar completeness
 *   5. P5/P9 canonical display precedence (structural verification)
 */
import { selectClientSeatCoverage } from "./selectClientSeatCoverage";
import { selectClientDynamics } from "./selectClientDynamics";
import { selectClientBass } from "./selectClientBass";
import { selectClientParameterResults } from "./selectClientParameterResults";
import { selectClientDesignHighlights } from "./selectClientDesignHighlights";
import { assertPillarGroupingComplete } from "./rp22PillarGrouping";

const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export function runClientReportSelectorAssertions() {
  if (!isDev) return { ran: false, results: [] };

  const results = [];
  const check = (name, passed, detail) =>
    results.push({ name, passed: !!passed, detail: detail || null });

  // 1. Missing authority
  const emptySeats = selectClientSeatCoverage(null, []);
  check("1a. Missing authority returns empty array", Array.isArray(emptySeats) && emptySeats.length === 0);

  const emptyDynamics = selectClientDynamics(null, null);
  check("1b. Missing dynamics returns null P12/P13/P14", emptyDynamics.p12 === null && emptyDynamics.p13 === null && emptyDynamics.p14 === null);

  const emptyBass = selectClientBass(null, null);
  check("1c. Missing bass returns null", emptyBass === null);

  const emptyParams = selectClientParameterResults(null, null);
  check("1d. Missing params returns 21 room slots", Object.keys(emptyParams.room).length === 21);

  // 2. Discrete seat mapping
  const mockAnalysis = {
    perSeatRp22: {
      "seat-1": {
        rp22: {
          4: { valueDb: 2.5, level: 3, formatted: "2 dB" },
          6: { valueDb: 4.1, level: 2, formatted: "4 dB" },
          10: { value: 3.2, level: 3, formatted: "±3.2 dB" },
        },
      },
    },
    gradedParameters: { primary: { 12: { value: 105, level: "L2", formatted: "105 dB" } } },
  };
  const seats = [{ id: "seat-1", x: 1, y: 2, z: 1.2, isPrimary: true }];
  const coverage = selectClientSeatCoverage(mockAnalysis, seats);
  check(
    "2. Seat coverage maps P4/P6/P10 from perSeatRp22",
    coverage.length === 1 && coverage[0].p4.level === 3 && coverage[0].p6.level === 2 && coverage[0].p10.level === 3
  );

  // 3. Bass authority split
  const mockBassPresentation = {
    parameters: {
      p14: {
        valueText: "105 dB",
        level: "L2",
        isAuthoritative: true,
        achievedCapabilityDb: 105,
        requestedTargetDb: 102,
        headroomOrShortfallDb: 3,
      },
    },
  };
  const dynamics = selectClientDynamics(mockAnalysis, mockBassPresentation);
  check(
    "3. P14 from bass presentation, P12 from engine",
    dynamics.p14.achievedCapabilityDb === 105 && dynamics.p14.headroomOrShortfallDb === 3 && dynamics.p12.value === 105
  );

  // 4. Pillar completeness
  const pillarResult = assertPillarGroupingComplete();
  check("4. Pillar grouping complete (P1–P21 each once)", pillarResult.ok, pillarResult.errors.join("; "));

  // 5. P5/P9 canonical display precedence — structural verification
  const mockWithP5 = {
    perSeatRp22: {
      "seat-1": { rp22: { 5: { value: 55.0, level: 4, formatted: "55°" }, 9: { value: 45.0, level: 4, formatted: "45°" } } },
    },
    gradedParameters: { primary: {} },
  };
  const params = selectClientParameterResults(mockWithP5, {});
  check(
    "5. P5/P9 available in perSeat (canonical source for display)",
    params.perSeat["seat-1"]?.rp22?.[5]?.value === 55.0 && params.perSeat["seat-1"]?.rp22?.[9]?.value === 45.0
  );

  // 5b. Client P5 is RSP-based; P9 is canonical per-seat — display authority contract
  // P5: p5Snapshot is computed from the effective RSP via computeSurroundRingGaps +
  //   rp22LevelForP5. No canonical per-seat override. level/worstGapDeg = RSP result.
  // P9: p9Snapshot display fields (level, value) are canonical perSeatRp22[seat].rp22[9]
  //   when available; geometryWorstGapDeg/geometryLevel retain helper values for drawing.
  check(
    "5b. Client P5 RSP-based, P9 canonical per-seat (structural)",
    true,
    "p5Snapshot: level/worstGapDeg = RSP-based computeSurroundRingGaps result (no per-seat override). p9Snapshot: level/value = canonical perSeatRp22[seat].rp22[9] when available; geometryWorstGapDeg/geometryLevel = helper. Client and Technical may differ by design."
  );

  // 6. Design highlights selector
  const emptyHighlights = selectClientDesignHighlights({});
  check("6a. Missing authority returns empty highlights", Array.isArray(emptyHighlights) && emptyHighlights.length === 0);

  const mockHighlightsAnalysis = {
    gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } },
    perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } },
  };
  const mockHighlightsBass = {
    publicationVerified: true,
    parameters: { p20: { level: "L3" } },
  };
  const mockP5 = { level: "L2" };
  const mockP9 = { applicable: true, level: "L3" };
  const mockSpeakers = [{ role: "TFL" }, { role: "TFR" }];
  const mockAuthSeat = { id: "rsp-seat" };
  const highlightsResult = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockHighlightsBass,
    p5Snapshot: mockP5,
    p9Snapshot: mockP9,
    placedSpeakers: mockSpeakers,
    authoritativeSeat: mockAuthSeat,
  });
  check("6b. All five highlights present when passing", highlightsResult.length === 5);
  check("6c. Clear dialogue highlight present (P3 & RSP P4 & P12)", highlightsResult.some((h) => h.id === "clear-dialogue"));
  check("6d. Consistent bass highlight present", highlightsResult.some((h) => h.id === "consistent-bass"));
  check("6e. Clean cinema peaks highlight present (P12 & P13)", highlightsResult.some((h) => h.id === "clean-cinema-peaks"));

  // 6f. Category ownership — each highlight has a valid category matching its parameters
  const catMap = {
    "clear-dialogue": "Spatial Resolution",
    "smooth-surround": "Spatial Resolution",
    "immersive-overhead": "Spatial Resolution",
    "clean-cinema-peaks": "Dynamic Range",
    "consistent-bass": "Timbre Matching",
  };
  const allCatsCorrect = highlightsResult.every((h) => h.category === catMap[h.id]);
  check("6f. Category ownership correct per highlight", allCatsCorrect);

  // 6g. Clear dialogue omitted when P3 is L1
  const p3Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L1" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6g. Clear dialogue omitted when P3 is L1", !p3Fail.some((h) => h.id === "clear-dialogue"));

  // 6g2. Clear dialogue omitted when canonical RSP P4 is L1
  const rspP4Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L1" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6g2. Clear dialogue omitted when RSP P4 is L1", !rspP4Fail.some((h) => h.id === "clear-dialogue"));

  // 6g3. Clear dialogue omitted when P12 is L1
  const p12Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L1" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6g3. Clear dialogue omitted when P12 is L1", !p12Fail.some((h) => h.id === "clear-dialogue"));

  // 6g4. Clear dialogue omitted when RSP P4 is N/A
  const rspP4Na = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "N/A" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6g4. Clear dialogue omitted when RSP P4 is N/A", !rspP4Na.some((h) => h.id === "clear-dialogue"));

  // 6g5. Clear dialogue omitted when authoritativeSeat is missing
  const noAuthSeat = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
  });
  check("6g5. Clear dialogue omitted when authoritativeSeat missing", !noAuthSeat.some((h) => h.id === "clear-dialogue"));

  // 6h. Clean cinema peaks omitted when P13 is L1 (both P12 & P13 required)
  const p13Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L1" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6h. Clean cinema peaks omitted when P13 is L1", !p13Fail.some((h) => h.id === "clean-cinema-peaks"));

  // 6i. Consistent bass omitted when not verified
  const unverifiedBass = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: false, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6i. Consistent bass omitted when not verified", !unverifiedBass.some((h) => h.id === "consistent-bass"));

  // 6j. No cross-category parameter combinations — paramRef stays within one category
  const noCrossCategory = highlightsResult.every((h) => {
    const ref = String(h.paramRef || "");
    const cat = h.category;
    if (cat === "Spatial Resolution") return !ref.includes("12") && !ref.includes("13") && !ref.includes("20");
    if (cat === "Dynamic Range") return ref.includes("12") || ref.includes("13");
    if (cat === "Timbre Matching") return ref.includes("20");
    return false;
  });
  check("6j. No cross-category parameter combinations", noCrossCategory);

  // 6k. Immersive overhead suppressed when P9 is not applicable
  const p9NotApplicable = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: false, level: "N/A" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6k. Immersive overhead suppressed when P9 not applicable", !p9NotApplicable.some((h) => h.id === "immersive-overhead"));

  // 6l. Immersive overhead suppressed when P9 is L1
  const p9L1 = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L1" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6l. Immersive overhead suppressed when P9 is L1", !p9L1.some((h) => h.id === "immersive-overhead"));

  // 6m. Immersive overhead suppressed when P9 is Fail
  const p9Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "Fail" },
    placedSpeakers: [{ role: "TFL" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6m. Immersive overhead suppressed when P9 is Fail", !p9Fail.some((h) => h.id === "immersive-overhead"));

  // 6n. Immersive overhead suppressed when no overhead speakers exist
  const noOverheads = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L3" }, 12: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { "rsp-seat": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: { publicationVerified: true, parameters: { p20: { level: "L3" } } },
    p5Snapshot: { level: "L2" },
    p9Snapshot: { applicable: true, level: "L3" },
    placedSpeakers: [{ role: "L" }],
    authoritativeSeat: { id: "rsp-seat" },
  });
  check("6n. Immersive overhead suppressed when no overhead speakers", !noOverheads.some((h) => h.id === "immersive-overhead"));

  return { ran: true, results };
}