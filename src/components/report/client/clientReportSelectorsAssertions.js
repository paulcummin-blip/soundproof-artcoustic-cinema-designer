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
import { selectClientSpeakerBalance, resolveCoordinate } from "./selectClientSpeakerBalance";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";
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

  // 7. Speaker Balance selector (Stage C2)
  const emptyBalance = selectClientSpeakerBalance({});
  check("7a. Missing authority returns empty seats", emptyBalance.seats.length === 0 && !emptyBalance.hasAnyValid);

  // 7b. Real-seat P4/P6/P10 from perSeatRp22 via selectClientSeatCoverage
  const balanceSeats = [
    { id: "seat-a", x: 1.5, y: 3.0, z: 1.2 },
    { id: "seat-b", x: 3.0, y: 3.0, z: 1.2 },
  ];
  const balanceAnalysis = {
    perSeatRp22: {
      "seat-a": { rp22: { 4: { valueDb: 2.0, level: 3, formatted: "2 dB" }, 6: { valueDb: 4.0, level: 1, formatted: "4 dB" }, 10: { value: 55, level: 1, formatted: "55°" } } },
      "seat-b": { rp22: { 4: { valueDb: 1.5, level: 4, formatted: "1.5 dB" }, 6: { valueDb: 3.0, level: 3, formatted: "3 dB" }, 10: { value: 45, level: 3, formatted: "45°" } } },
    },
    gradedParameters: { primary: {} },
  };
  const balanceResult = selectClientSpeakerBalance({
    analysisResult: balanceAnalysis,
    seatingPositions: balanceSeats,
    rsp: { x: 2.25, y: 3.0 },
  });
  check("7b. Two seats mapped with valid P4/P6/P10", balanceResult.seats.length === 2);
  check("7b1. Seat-a P4 level 3", balanceResult.seats[0].p4?.level === 3);
  check("7b2. Seat-a P6 level 1", balanceResult.seats[0].p6?.level === 1);
  check("7b3. Seat-a P10 level 1", balanceResult.seats[0].p10?.level === 1);
  check("7b4. Seat-b P4 level 4", balanceResult.seats[1].p4?.level === 4);
  check("7b5. Seat-b P6 level 3", balanceResult.seats[1].p6?.level === 3);
  check("7b6. Seat-b P10 level 3", balanceResult.seats[1].p10?.level === 3);
  check("7b7. hasValidP4/P6/P10 all true", balanceResult.hasValidP4 && balanceResult.hasValidP6 && balanceResult.hasValidP10);
  check("7b8. hasAnyValid true", balanceResult.hasAnyValid);

  // 7c. Synthetic mlp not shown as result-bearing seat
  const mlpOnlyResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { mlp: { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 4 }, 10: { value: 40, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [],
    rsp: { x: 2, y: 3 },
  });
  check("7c. Synthetic mlp not in seats", mlpOnlyResult.seats.length === 0 && !mlpOnlyResult.hasAnyValid);

  // 7d. RSP shown as reference marker only
  check("7d. RSP returned as reference point", balanceResult.rsp !== null && balanceResult.rsp.x === 2.25 && balanceResult.rsp.y === 3.0);

  // 7e. Invalid original seat coordinates rejected, not coerced to zero
  const badCoordResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [
      { id: "good", x: 2, y: 3 },
      { id: "bad-x", x: NaN, y: 3 },
      { id: "bad-y", x: 2, y: undefined },
      { id: "missing-x", y: 3 },
    ],
    rsp: null,
  });
  check("7e. Invalid coordinates rejected", badCoordResult.seats.length === 1 && badCoordResult.seats[0].id === "good");

  // 7f. P10 N/A objects do not create markers
  const p10NaResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { "seat-x": { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 3 }, 10: { value: null, level: "—", formatted: "N/A (insufficient data)" } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "seat-x", x: 2, y: 3 }],
    rsp: null,
  });
  check("7f. P10 N/A does not create marker", p10NaResult.seats[0]?.p10 === null);
  check("7f1. P10 N/A does not affect P4/P6", p10NaResult.seats[0]?.p4 !== null && p10NaResult.seats[0]?.p6 !== null);
  check("7f2. hasValidP10 false", !p10NaResult.hasValidP10);
  check("7f3. hasValidP4/P6 still true", p10NaResult.hasValidP4 && p10NaResult.hasValidP6);

  // 7g. P10 does not depend on P9 applicability
  const noP9Result = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { "seat-z": { rp22: { 4: { valueDb: 1, level: 4 }, 10: { value: 50, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "seat-z", x: 2, y: 3 }],
    rsp: null,
  });
  check("7g. P10 valid without P9 data", noP9Result.seats[0]?.p10 !== null && noP9Result.hasValidP10);

  // 7h. Partial-layer projects show only available layers
  const partialResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { "seat-p": { rp22: { 4: { valueDb: 1, level: 4 }, 10: { value: 50, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "seat-p", x: 2, y: 3 }],
    rsp: null,
  });
  check("7h. Partial: P4 present, P6 absent", partialResult.seats[0]?.p4 !== null && partialResult.seats[0]?.p6 === null);
  check("7h1. Partial: P10 present", partialResult.seats[0]?.p10 !== null);
  check("7h2. Partial: hasValidP6 false", !partialResult.hasValidP6);
  check("7h3. Partial: hasAnyValid true", partialResult.hasAnyValid);

  // 7i. Page omitted when all three layers unavailable
  const allUnavailableResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { "seat-u": { rp22: { 4: { value: null, level: "—" }, 6: { value: null, level: "N/A" }, 10: { value: null, level: "—" } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "seat-u", x: 2, y: 3 }],
    rsp: null,
  });
  check("7i. All unavailable: hasAnyValid false", !allUnavailableResult.hasAnyValid);
  check("7i1. All unavailable: all markers null", allUnavailableResult.seats[0]?.p4 === null && allUnavailableResult.seats[0]?.p6 === null && allUnavailableResult.seats[0]?.p10 === null);

  // 7j. Current project parity — P4 L3/L4/L4/L3, P6 L1/L3/L3/L1, P10 L1/L3/L3/L1
  const projectSeats = [
    { id: "s1", x: 1, y: 2 },
    { id: "s2", x: 2, y: 2 },
    { id: "s3", x: 3, y: 2 },
    { id: "s4", x: 4, y: 2 },
  ];
  const projectAnalysis = {
    perSeatRp22: {
      s1: { rp22: { 4: { valueDb: 3, level: 3 }, 6: { valueDb: 6, level: 1 }, 10: { value: 60, level: 1 } } },
      s2: { rp22: { 4: { valueDb: 2, level: 4 }, 6: { valueDb: 4, level: 3 }, 10: { value: 50, level: 3 } } },
      s3: { rp22: { 4: { valueDb: 2, level: 4 }, 6: { valueDb: 4, level: 3 }, 10: { value: 50, level: 3 } } },
      s4: { rp22: { 4: { valueDb: 3, level: 3 }, 6: { valueDb: 6, level: 1 }, 10: { value: 60, level: 1 } } },
    },
    gradedParameters: { primary: {} },
  };
  const projectResult = selectClientSpeakerBalance({
    analysisResult: projectAnalysis,
    seatingPositions: projectSeats,
    rsp: { x: 2.5, y: 2 },
  });
  const p4Levels = projectResult.seats.map((s) => s.p4?.level);
  const p6Levels = projectResult.seats.map((s) => s.p6?.level);
  const p10Levels = projectResult.seats.map((s) => s.p10?.level);
  check("7j. P4 levels L3/L4/L4/L3", p4Levels.join("/") === "3/4/4/3");
  check("7j1. P6 levels L1/L3/L3/L1", p6Levels.join("/") === "1/3/3/1");
  check("7j2. P10 levels L1/L3/L3/L1", p10Levels.join("/") === "1/3/3/1");

  // 7k. Status no_data does not create marker
  const noDataResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { "seat-nd": { rp22: { 4: { valueDb: null, level: null, formatted: null } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "seat-nd", x: 2, y: 3 }],
    rsp: null,
  });
  check("7k. Status no_data does not create P4 marker", noDataResult.seats[0]?.p4 === null);

  // ── Stage C2 readability correction: strict coordinate + partial-layer ──

  // 7l. P4-only project (no P6, no P10)
  const p4OnlyResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7l. P4-only: P4 present, P6/P10 absent", p4OnlyResult.seats[0]?.p4 !== null && p4OnlyResult.seats[0]?.p6 === null && p4OnlyResult.seats[0]?.p10 === null);
  check("7l1. P4-only: hasValidP4 true, P6/P10 false", p4OnlyResult.hasValidP4 && !p4OnlyResult.hasValidP6 && !p4OnlyResult.hasValidP10);
  check("7l2. P4-only: hasAnyValid true", p4OnlyResult.hasAnyValid);

  // 7m. P4 + P6 project (no P10)
  const p4p6Result = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7m. P4+P6: P4/P6 present, P10 absent", p4p6Result.seats[0]?.p4 !== null && p4p6Result.seats[0]?.p6 !== null && p4p6Result.seats[0]?.p10 === null);
  check("7m1. P4+P6: hasValidP10 false", !p4p6Result.hasValidP10);
  check("7m2. P4+P6: hasAnyValid true", p4p6Result.hasAnyValid);

  // 7n. P10-only project (no P4, no P6) — valid without P9
  const p10OnlyResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 10: { value: 45, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7n. P10-only: P10 present, P4/P6 absent", p10OnlyResult.seats[0]?.p10 !== null && p10OnlyResult.seats[0]?.p4 === null && p10OnlyResult.seats[0]?.p6 === null);
  check("7n1. P10-only: hasValidP10 true without P9", p10OnlyResult.hasValidP10);
  check("7n2. P10-only: hasAnyValid true", p10OnlyResult.hasAnyValid);

  // 7o. Mixed omissions across multiple seats
  const mixedResult = selectClientSpeakerBalance({
    analysisResult: {
      perSeatRp22: {
        s1: { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 3 }, 10: { value: 45, level: 3 } } },
        s2: { rp22: { 4: { valueDb: 1, level: 4 }, 10: { value: 45, level: 3 } } },
        s3: { rp22: { 6: { valueDb: 2, level: 3 } } },
      },
      gradedParameters: { primary: {} },
    },
    seatingPositions: [{ id: "s1", x: 1, y: 2 }, { id: "s2", x: 2, y: 2 }, { id: "s3", x: 3, y: 2 }],
    rsp: null,
  });
  check("7o. Mixed: seat1 all three", mixedResult.seats[0]?.p4 !== null && mixedResult.seats[0]?.p6 !== null && mixedResult.seats[0]?.p10 !== null);
  check("7o1. Mixed: seat2 P4+P10, no P6", mixedResult.seats[1]?.p4 !== null && mixedResult.seats[1]?.p6 === null && mixedResult.seats[1]?.p10 !== null);
  check("7o2. Mixed: seat3 P6 only", mixedResult.seats[2]?.p4 === null && mixedResult.seats[2]?.p6 !== null && mixedResult.seats[2]?.p10 === null);
  check("7o3. Mixed: all three layers have at least one valid", mixedResult.hasValidP4 && mixedResult.hasValidP6 && mixedResult.hasValidP10);

  // 7p. Empty-string x rejected
  const emptyXResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", x: "", y: 3 }],
    rsp: null,
  });
  check("7p. Empty-string x rejected", emptyXResult.seats.length === 1 && emptyXResult.seats[0].id === "good");

  // 7q. Whitespace-only x rejected
  const wsXResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", x: "   ", y: 3 }],
    rsp: null,
  });
  check("7q. Whitespace-only x rejected", wsXResult.seats.length === 1 && wsXResult.seats[0].id === "good");

  // 7r. Whitespace-only y rejected
  const wsYResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", x: 2, y: " " }],
    rsp: null,
  });
  check("7r. Whitespace-only y rejected", wsYResult.seats.length === 1 && wsYResult.seats[0].id === "good");

  // 7s. Empty nested position value rejected
  const nestedEmptyResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", position: { x: "", y: "" } }],
    rsp: null,
  });
  check("7s. Empty nested position rejected", nestedEmptyResult.seats.length === 1 && nestedEmptyResult.seats[0].id === "good");

  // 7t. Genuine numeric zero remains valid
  const zeroResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 0, y: 0 }],
    rsp: null,
  });
  check("7t. Genuine zero x/y accepted", zeroResult.seats.length === 1 && zeroResult.seats[0].x === 0 && zeroResult.seats[0].y === 0);

  // 7u. Non-numeric string rejected
  const nonNumResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", x: "abc", y: 3 }],
    rsp: null,
  });
  check("7u. Non-numeric string x rejected", nonNumResult.seats.length === 1 && nonNumResult.seats[0].id === "good");

  // 7v. Infinity rejected
  const infResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { good: { rp22: { 4: { valueDb: 1, level: 4 } } }, bad: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "good", x: 2, y: 3 }, { id: "bad", x: Infinity, y: 3 }, { id: "bad2", x: -Infinity, y: 3 }],
    rsp: null,
  });
  check("7v. Infinity/-Infinity rejected", infResult.seats.length === 1 && infResult.seats[0].id === "good");

  // 7w. RSP with empty-string coordinates rejected (no rsp point)
  const rspEmptyResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: { x: "", y: 3 },
  });
  check("7w. RSP empty-string x → rsp null", rspEmptyResult.rsp === null);

  // 7x. RSP with whitespace coordinates rejected
  const rspWsResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: { x: "  ", y: 3 },
  });
  check("7x. RSP whitespace x → rsp null", rspWsResult.rsp === null);

  // 7y. RSP with genuine zero accepted
  const rspZeroResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: { x: 0, y: 0 },
  });
  check("7y. RSP genuine zero accepted", rspZeroResult.rsp !== null && rspZeroResult.rsp.x === 0 && rspZeroResult.rsp.y === 0);

  // 7z. Page omitted only when no real seat has valid P4, P6 or P10
  const allBadResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { value: null, level: "—" }, 6: { value: null, level: "N/A" }, 10: { value: null, level: "—" } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7z. Page omitted when all layers unavailable", !allBadResult.hasAnyValid);

  // 7z1. Page NOT omitted when at least one layer valid
  const oneValidResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { value: null, level: "—" }, 6: { value: null, level: "N/A" }, 10: { value: 45, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7z1. Page not omitted when one layer valid", oneValidResult.hasAnyValid);

  // ── Stage C2 final defects: coordinate fallback, legend omission, RSP collision ──

  // 7aa. Coordinate resolver — valid nested fallback after invalid top-level (x)
  check("7aa. Missing top-level + valid nested x", resolveCoordinate(undefined, 2) === 2);
  check("7aa1. Null top-level + valid nested x", resolveCoordinate(null, 2) === 2);
  check("7aa2. Empty top-level + valid nested x", resolveCoordinate("", 2) === 2);
  check("7aa3. Whitespace top-level + valid nested x", resolveCoordinate("  ", 2) === 2);
  check("7aa4. Text top-level + valid nested x", resolveCoordinate("abc", 2) === 2);
  check("7aa5. NaN top-level + valid nested x", resolveCoordinate(NaN, 2) === 2);
  check("7aa6. Infinity top-level + valid nested x", resolveCoordinate(Infinity, 2) === 2);
  check("7aa7. Valid zero top-level wins over different nested", resolveCoordinate(0, 5) === 0);
  check("7aa8. Both invalid → null", resolveCoordinate("", null) === null);
  check("7aa9. Both invalid (NaN + undefined) → null", resolveCoordinate(NaN, undefined) === null);

  // 7ab. Coordinate resolver — valid nested fallback (y)
  check("7ab. Missing top-level + valid nested y", resolveCoordinate(undefined, 3) === 3);
  check("7ab1. Null top-level + valid nested y", resolveCoordinate(null, 3) === 3);
  check("7ab2. Empty top-level + valid nested y", resolveCoordinate("", 3) === 3);
  check("7ab3. Whitespace top-level + valid nested y", resolveCoordinate("  ", 3) === 3);
  check("7ab4. Text top-level + valid nested y", resolveCoordinate("abc", 3) === 3);
  check("7ab5. NaN top-level + valid nested y", resolveCoordinate(NaN, 3) === 3);
  check("7ab6. Infinity top-level + valid nested y", resolveCoordinate(Infinity, 3) === 3);
  check("7ab7. Valid zero top-level wins over different nested y", resolveCoordinate(0, 5) === 0);

  // 7ac. Selector end-to-end: invalid top-level + valid nested → seat recovered
  const fallbackResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: "", y: "  ", position: { x: 2, y: 3 } }],
    rsp: null,
  });
  check("7ac. Invalid top-level + valid nested → seat recovered", fallbackResult.seats.length === 1 && fallbackResult.seats[0].x === 2 && fallbackResult.seats[0].y === 3);

  // 7ad. Selector: valid zero top-level wins over different nested
  const zeroWinsResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 0, y: 0, position: { x: 5, y: 5 } }],
    rsp: null,
  });
  check("7ad. Valid zero top-level wins over nested", zeroWinsResult.seats.length === 1 && zeroWinsResult.seats[0].x === 0 && zeroWinsResult.seats[0].y === 0);

  // 7ae. Selector: both invalid → seat rejected
  const bothInvalidResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: "", y: "  ", position: { x: null, y: undefined } }],
    rsp: null,
  });
  check("7ae. Both invalid → seat rejected", bothInvalidResult.seats.length === 0);

  // 7bb. Legend omission — selector flags for partial-layer configurations
  // P4-only
  const p4OnlyFlags = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7bb. P4-only: hasValidP4 true, P6/P10 false", p4OnlyFlags.hasValidP4 && !p4OnlyFlags.hasValidP6 && !p4OnlyFlags.hasValidP10);

  // P4 + P6
  const p4p6Flags = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7bb1. P4+P6: hasValidP4/P6 true, P10 false", p4p6Flags.hasValidP4 && p4p6Flags.hasValidP6 && !p4p6Flags.hasValidP10);

  // P10-only
  const p10OnlyFlags = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 10: { value: 45, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7bb2. P10-only: hasValidP10 true, P4/P6 false", p10OnlyFlags.hasValidP10 && !p10OnlyFlags.hasValidP4 && !p10OnlyFlags.hasValidP6);

  // P4 + P10
  const p4p10Flags = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 }, 10: { value: 45, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7bb3. P4+P10: hasValidP4/P10 true, P6 false", p4p10Flags.hasValidP4 && p4p10Flags.hasValidP10 && !p4p10Flags.hasValidP6);

  // All three
  const allThreeFlags = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s: { rp22: { 4: { valueDb: 1, level: 4 }, 6: { valueDb: 2, level: 3 }, 10: { value: 45, level: 3 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s", x: 2, y: 3 }],
    rsp: null,
  });
  check("7bb4. All three: all flags true", allThreeFlags.hasValidP4 && allThreeFlags.hasValidP6 && allThreeFlags.hasValidP10);

  // 7cc. RSP label placement — no collision with badges (centred RSP between two middle seats)
  // Simulate current project geometry: 4 seats, RSP at x=2.5 (between seats 2 and 3)
  const ccScale = 133.3;
  const ccPad = 0.6;
  const ccToPx = (x, y) => ({ px: (x + ccPad) * ccScale, py: (y + ccPad) * ccScale });
  const ccSeatPx = [1, 2, 3, 4].map((x) => ccToPx(x, 2));
  const ccBadgeY = ccSeatPx[0].py + 22;
  const ccBadgeRects = [];
  ccSeatPx.forEach((sp) => {
    ccBadgeRects.push({ x1: sp.px - 32 - 14, y1: ccBadgeY - 9, x2: sp.px - 32 + 14, y2: ccBadgeY + 9 });
    ccBadgeRects.push({ x1: sp.px - 14, y1: ccBadgeY - 9, x2: sp.px + 14, y2: ccBadgeY + 9 });
    ccBadgeRects.push({ x1: sp.px + 32 - 14, y1: ccBadgeY - 9, x2: sp.px + 32 + 14, y2: ccBadgeY + 9 });
  });
  const ccRspPx = ccToPx(2.5, 2);
  const ccSeatCircles = ccSeatPx.map((sp) => ({ cx: sp.px, cy: sp.py, r: 7 }));
  const ccScreenRect = { x1: 0, y1: 80, x2: 760, y2: 110 };
  const ccSvgBounds = { w: 760, h: 960 };
  const ccPlacement = resolveRspLabelPlacement(ccRspPx, ccSeatCircles, ccBadgeRects, ccScreenRect, ccSvgBounds);
  // Label rect
  const ccLabelRect = {
    x1: ccPlacement.x - 15, y1: ccPlacement.y - 7, x2: ccPlacement.x + 15, y2: ccPlacement.y + 7,
  };
  const ccLabelIntersectsBadges = ccBadgeRects.some((br) =>
    !(ccLabelRect.x2 < br.x1 || br.x2 < ccLabelRect.x1 || ccLabelRect.y2 < br.y1 || br.y2 < ccLabelRect.y1)
  );
  check("7cc. Centred RSP label does not intersect badges", !ccLabelIntersectsBadges);

  // 7cc1. RSP marker (8px ring) does not intersect badge bounds
  const ccMarkerR = 8;
  const ccMarkerIntersectsBadges = ccBadgeRects.some((br) => {
    const closestX = Math.max(br.x1, Math.min(ccRspPx.px, br.x2));
    const closestY = Math.max(br.y1, Math.min(ccRspPx.py, br.y2));
    const dx = ccRspPx.px - closestX;
    const dy = ccRspPx.py - closestY;
    return dx * dx + dy * dy < ccMarkerR * ccMarkerR;
  });
  check("7cc1. RSP marker does not intersect badges", !ccMarkerIntersectsBadges);

  // 7cc2. Off-centre RSP remains inside SVG
  const offCentreRsp = ccToPx(0.5, 5);
  const offCentrePlacement = resolveRspLabelPlacement(offCentreRsp, ccSeatCircles, ccBadgeRects, ccScreenRect, ccSvgBounds);
  const offCentreInBounds = offCentrePlacement.x >= 0 && offCentrePlacement.x <= 760 && offCentrePlacement.y >= 0 && offCentrePlacement.y <= 960;
  check("7cc2. Off-centre RSP label inside SVG", offCentreInBounds);

  // 7cc3. RSP has no P4/P6/P10 badges (selector-level)
  const ccSelectorResult = selectClientSpeakerBalance({
    analysisResult: { perSeatRp22: { s1: { rp22: { 4: { valueDb: 1, level: 4 } } }, s2: { rp22: { 4: { valueDb: 1, level: 4 } } } }, gradedParameters: { primary: {} } },
    seatingPositions: [{ id: "s1", x: 2, y: 2 }, { id: "s2", x: 3, y: 2 }],
    rsp: { x: 2.5, y: 2 },
  });
  check("7cc3. RSP is reference-only (no badges in selector)", ccSelectorResult.rsp !== null && !("p4" in ccSelectorResult.rsp) && !("p6" in ccSelectorResult.rsp) && !("p10" in ccSelectorResult.rsp));

  return { ran: true, results };
}