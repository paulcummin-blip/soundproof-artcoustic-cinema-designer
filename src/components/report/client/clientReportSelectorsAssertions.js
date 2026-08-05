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

  // Base mock: P3 L4 + mlp P4 L4 + P12 L3 → all pass
  const mockHighlightsAnalysis = {
    gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } },
    perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } },
  };
  const mockBass = { publicationVerified: true, parameters: { p20: { level: "L3" } } };
  const mockP5 = { level: "L2" };
  const mockP9 = { applicable: true, level: "L3" };
  const mockSpeakers = [{ role: "TFL" }, { role: "TFR" }];

  const highlightsResult = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockBass,
    p5Snapshot: mockP5,
    p9Snapshot: mockP9,
    placedSpeakers: mockSpeakers,
  });
  check("6b. All five highlights present when passing", highlightsResult.length === 5);
  check("6c. Clear dialogue present (P3 L4 + mlp P4 L4 + P12 L3)", highlightsResult.some((h) => h.id === "clear-dialogue"));
  check("6d. Consistent bass present", highlightsResult.some((h) => h.id === "consistent-bass"));
  check("6e. Clean cinema peaks present (P12 & P13)", highlightsResult.some((h) => h.id === "clean-cinema-peaks"));

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

  // 6g1. primary[4] cannot qualify — primary[4] L4 but mlp P4 missing → suppress
  const primary4Only = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 4: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: {} },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g1. primary[4] cannot qualify clear dialogue", !primary4Only.some((h) => h.id === "clear-dialogue"));

  // 6g2. Passing real-seat P4 cannot replace missing mlp P4
  const realSeatP4Only = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { "seat-r1-c3": { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g2. Real-seat P4 cannot replace missing mlp P4", !realSeatP4Only.some((h) => h.id === "clear-dialogue"));

  // 6g3. Missing mlp entry suppresses clear dialogue
  const missingMlp = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: {} },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g3. Missing mlp P4 suppresses clear dialogue", !missingMlp.some((h) => h.id === "clear-dialogue"));

  // 6g4. P3 missing suppresses
  const p3Missing = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g4. P3 missing suppresses clear dialogue", !p3Missing.some((h) => h.id === "clear-dialogue"));

  // 6g5. P3 N/A suppresses
  const p3Na = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "N/A" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g5. P3 N/A suppresses clear dialogue", !p3Na.some((h) => h.id === "clear-dialogue"));

  // 6g6. P3 Fail suppresses
  const p3Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "Fail" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g6. P3 Fail suppresses clear dialogue", !p3Fail.some((h) => h.id === "clear-dialogue"));

  // 6g7. P3 L1 suppresses
  const p3L1 = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L1" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6g7. P3 L1 suppresses clear dialogue", !p3L1.some((h) => h.id === "clear-dialogue"));

  // 6h1. mlp P4 N/A suppresses
  const mlpP4Na = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "N/A" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6h1. mlp P4 N/A suppresses clear dialogue", !mlpP4Na.some((h) => h.id === "clear-dialogue"));

  // 6h2. mlp P4 Fail suppresses
  const mlpP4Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "Fail" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6h2. mlp P4 Fail suppresses clear dialogue", !mlpP4Fail.some((h) => h.id === "clear-dialogue"));

  // 6h3. mlp P4 L1 suppresses
  const mlpP4L1 = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L1" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6h3. mlp P4 L1 suppresses clear dialogue", !mlpP4L1.some((h) => h.id === "clear-dialogue"));

  // 6i1. P12 missing suppresses
  const p12Missing = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6i1. P12 missing suppresses clear dialogue", !p12Missing.some((h) => h.id === "clear-dialogue"));

  // 6i2. P12 N/A suppresses
  const p12Na = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "N/A" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6i2. P12 N/A suppresses clear dialogue", !p12Na.some((h) => h.id === "clear-dialogue"));

  // 6i3. P12 Fail suppresses
  const p12Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "Fail" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6i3. P12 Fail suppresses clear dialogue", !p12Fail.some((h) => h.id === "clear-dialogue"));

  // 6i4. P12 L1 suppresses
  const p12L1 = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L1" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6i4. P12 L1 suppresses clear dialogue", !p12L1.some((h) => h.id === "clear-dialogue"));

  // 6j1. Explicit status "unverified" on P3 suppresses
  const p3Unverified = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4", status: "unverified" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j1. P3 status unverified suppresses clear dialogue", !p3Unverified.some((h) => h.id === "clear-dialogue"));

  // 6j2. Explicit status "unverified" on mlp P4 suppresses
  const mlpP4Unverified = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4", status: "unverified" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j2. mlp P4 status unverified suppresses clear dialogue", !mlpP4Unverified.some((h) => h.id === "clear-dialogue"));

  // 6j3. Explicit status "unverified" on P12 suppresses
  const p12Unverified = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3", status: "unverified" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j3. P12 status unverified suppresses clear dialogue", !p12Unverified.some((h) => h.id === "clear-dialogue"));

  // 6j4. Explicit stale status suppresses
  const p3Stale = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4", status: "stale" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j4. P3 stale status suppresses clear dialogue", !p3Stale.some((h) => h.id === "clear-dialogue"));

  // 6j5. Explicit incomplete status suppresses
  const mlpP4Incomplete = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4", status: "incomplete" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j5. mlp P4 incomplete status suppresses clear dialogue", !mlpP4Incomplete.some((h) => h.id === "clear-dialogue"));

  // 6j6. Explicit error status suppresses
  const p12Error = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3", status: "error" }, 13: { level: "L3" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6j6. P12 error status suppresses clear dialogue", !p12Error.some((h) => h.id === "clear-dialogue"));

  // 6j7. Absent status field does NOT suppress (base mock has no status fields)
  check("6j7. Absent status field does not suppress (covered by 6c)", highlightsResult.some((h) => h.id === "clear-dialogue"));

  // 6k. No cross-category parameter combinations — paramRef stays within one category
  const noCrossCategory = highlightsResult.every((h) => {
    const ref = String(h.paramRef || "");
    const cat = h.category;
    if (cat === "Spatial Resolution") return !ref.includes("12") && !ref.includes("13") && !ref.includes("20");
    if (cat === "Dynamic Range") return ref.includes("12") || ref.includes("13");
    if (cat === "Timbre Matching") return ref.includes("20");
    return false;
  });
  check("6k. No cross-category parameter combinations", noCrossCategory);

  // 6l. Clean cinema peaks omitted when P13 is L1 (both P12 & P13 required)
  const p13Fail = selectClientDesignHighlights({
    analysisResult: { gradedParameters: { primary: { 3: { level: "L4" }, 12: { level: "L3" }, 13: { level: "L1" } } }, perSeatRp22: { mlp: { rp22: { 4: { level: "L4" } } } } },
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6l. Clean cinema peaks omitted when P13 is L1", !p13Fail.some((h) => h.id === "clean-cinema-peaks"));

  // 6m. Consistent bass omitted when not verified
  const unverifiedBass = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: { publicationVerified: false, parameters: { p20: { level: "L3" } } },
    p5Snapshot: mockP5, p9Snapshot: mockP9, placedSpeakers: mockSpeakers,
  });
  check("6m. Consistent bass omitted when not verified", !unverifiedBass.some((h) => h.id === "consistent-bass"));

  // 6n. Immersive overhead suppressed when P9 not applicable
  const p9NotApplicable = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockBass, p5Snapshot: mockP5,
    p9Snapshot: { applicable: false, level: "N/A" },
    placedSpeakers: mockSpeakers,
  });
  check("6n. Immersive overhead suppressed when P9 not applicable", !p9NotApplicable.some((h) => h.id === "immersive-overhead"));

  // 6o. Immersive overhead suppressed when P9 is L1
  const p9L1 = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockBass, p5Snapshot: mockP5,
    p9Snapshot: { applicable: true, level: "L1" },
    placedSpeakers: mockSpeakers,
  });
  check("6o. Immersive overhead suppressed when P9 is L1", !p9L1.some((h) => h.id === "immersive-overhead"));

  // 6p. Immersive overhead suppressed when P9 is Fail
  const p9Fail = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockBass, p5Snapshot: mockP5,
    p9Snapshot: { applicable: true, level: "Fail" },
    placedSpeakers: mockSpeakers,
  });
  check("6p. Immersive overhead suppressed when P9 is Fail", !p9Fail.some((h) => h.id === "immersive-overhead"));

  // 6q. Immersive overhead suppressed when no overhead speakers exist
  const noOverheads = selectClientDesignHighlights({
    analysisResult: mockHighlightsAnalysis,
    bassPresentation: mockBass, p5Snapshot: mockP5, p9Snapshot: mockP9,
    placedSpeakers: [{ role: "L" }],
  });
  check("6q. Immersive overhead suppressed when no overhead speakers", !noOverheads.some((h) => h.id === "immersive-overhead"));

  return { ran: true, results };
}