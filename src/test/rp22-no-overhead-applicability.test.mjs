// rp22-no-overhead-applicability.test.mjs
// ---------------------------------------------------------------------------
// A system with no overhead / height speakers (a 5.2, for example) must never
// be blocked, downgraded or warned about for the overhead-only RP22 parameters.
//
// P9 and P10 require a height layer: without one they are N/A — complete for
// this design — and are excluded from the design rating, the compliance counts
// and the report readiness gate. P11 is assessed on the speakers that ARE
// installed and only reads N/A when there is no surround/wide/upper speaker to
// assess at all.
//
// Applicability only: no RP22 threshold, no layout calculation, no SPL value and
// no report layout is touched by any of this.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NO_OVERHEAD_LAYER_REASON,
  OVERHEAD_ONLY_PARAMETER_NUMBERS,
  hasOverheadLayer,
  hasZonalSpeakerLayer,
  isOverheadOnlyParameter,
} from "../components/utils/rp22/overheadLayerAuthority.js";
import { buildDesignRatingInput } from "../components/report/technical/buildDesignRatingInput.js";
import {
  calculateRoomDesignRating,
  buildArtcousticDesignRatingAuthority,
} from "../components/report/technical/artcousticSystemDesignRating.js";
import { summariseEngineeringResults } from "../components/engineering/engineeringSummaryAuthority.js";
import { assessEngineeringReportCompleteness } from "../../shared/assessmentTerminal.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..");
const read = (path) => readFileSync(join(SRC, path), "utf8");

const speaker = (role, overrides = {}) => ({
  id: role,
  role,
  model: "Evolve 3-1",
  enabled: true,
  position: { x: 1.2, y: 2.4, z: 1.0 },
  ...overrides,
});

/** The reported system: 5.2 — screen wall, side surrounds, subwoofers, no heights. */
const FIVE_TWO = [
  speaker("FL"), speaker("FC"), speaker("FR"), speaker("SL"), speaker("SR"),
];
/** The same system with a height layer installed. */
const WITH_OVERHEADS = [...FIVE_TWO, speaker("TFL"), speaker("TFR")];
/** No speaker P11 can assess. */
const THREE_ONE = [speaker("FL"), speaker("FC"), speaker("FR")];

const SEATS = [{ id: "s1", priority: "primary" }];

const ratingInput = (speakers, room = {}) => buildDesignRatingInput({
  seats: SEATS,
  analysisResult: { gradedParameters: { primary: room } },
  reportSeatHudById: { s1: { rp22: {} } },
  completedBassAuthority: null,
  completedBassPresentation: null,
  placedSpeakers: speakers,
});

/** Every parameter terminal except the three under test. */
const terminalSummary = (overheadStates) => {
  const parameters = {};
  for (let n = 1; n <= 21; n += 1) {
    const key = `p${n}`;
    parameters[key] = overheadStates[key]
      ? { key, scope: "room", state: overheadStates[key], level: null, seats: null }
      : { key, scope: "room", state: "scored", level: "L3", multiplier: 8, seats: null };
  }
  return { parameterAuthority: parameters, project: { seatIds: ["s1"] }, seatHudById: { s1: {} } };
};

describe("the design's own speaker set answers applicability", () => {
  it("finds no overhead layer in a 5.2 and one when heights are installed", () => {
    expect(hasOverheadLayer(FIVE_TWO)).toBe(false);
    expect(hasOverheadLayer(WITH_OVERHEADS)).toBe(true);
    // A role label with no product installed is not an overhead layer.
    expect(hasOverheadLayer([...FIVE_TWO, speaker("TFL", { model: "off" })])).toBe(false);
  });

  it("names P9 and P10 as the overhead-only parameters", () => {
    expect(OVERHEAD_ONLY_PARAMETER_NUMBERS).toEqual([9, 10]);
    expect(isOverheadOnlyParameter(9)).toBe(true);
    expect(isOverheadOnlyParameter(10)).toBe(true);
    expect(isOverheadOnlyParameter(11)).toBe(false);
  });

  it("treats the bed surrounds as a P11 speaker layer, and the screen wall alone as none", () => {
    expect(hasZonalSpeakerLayer(FIVE_TWO)).toBe(true);
    expect(hasZonalSpeakerLayer(WITH_OVERHEADS)).toBe(true);
    expect(hasZonalSpeakerLayer(THREE_ONE)).toBe(false);
  });
});

describe("P9 and P10 are N/A without a height layer, not missing", () => {
  const input = ratingInput(FIVE_TWO, {
    11: { value: 0, level: "L4", status: "ok" },
  });

  it("publishes P9 as N/A for every seat", () => {
    expect(input.p9).toEqual({ s1: "na" });
  });

  it("publishes P10 as N/A for every seat", () => {
    expect(input.p10).toEqual({ s1: "na" });
  });

  it("keeps N/A distinct from a missing assessment", () => {
    const [authority] = [buildArtcousticDesignRatingAuthority(input)];
    expect(authority.parameters.p9.state).toBe("na");
    expect(authority.parameters.p10.state).toBe("na");
    // Provisional would be the missing-assessment state; N/A is complete.
    expect(authority.parameters.p9.reason).toBeNull();
  });
});

describe("P11 is assessed for the speakers that are present", () => {
  it("grades the present bed surrounds instead of waiting for overheads", () => {
    const input = ratingInput(FIVE_TWO, {
      11: { value: 0, level: "L4", status: "ok" },
    });
    expect(input.p11).toEqual({ outsideCount: 0, level: "L4", indeterminate: false });
    expect(buildArtcousticDesignRatingAuthority(input).parameters.p11.state).toBe("scored");
  });

  it("reports N/A when the published authority says the layer is absent", () => {
    const input = ratingInput(FIVE_TWO, {
      11: { value: null, level: "N/A", status: "not_applicable" },
    });
    expect(input.p11).toEqual({ na: true });
    expect(buildArtcousticDesignRatingAuthority(input).parameters.p11.state).toBe("na");
  });

  it("reports N/A when there is no surround, wide or upper speaker at all", () => {
    const input = ratingInput(THREE_ONE, {
      11: { value: 0, level: "L4", status: "ok" },
    });
    expect(input.p11).toEqual({ na: true });
  });
});

describe("N/A parameters do not lower or distort the design rating", () => {
  const buildAuthority = (overheadInput) => buildArtcousticDesignRatingAuthority({
    seats: SEATS,
    p1: { s1: 1.6 },
    p4: { s1: 2 },
    p9: overheadInput,
    p10: overheadInput,
    p11: { na: true },
  });

  it("excludes the N/A parameters from the rating entirely", () => {
    const rating = calculateRoomDesignRating(buildAuthority("na"));
    const keys = rating.contributions.map((contribution) => contribution.key);
    expect(keys).not.toContain("p9");
    expect(keys).not.toContain("p10");
    expect(keys).not.toContain("p11");
  });

  it("scores exactly the same as an assessment that never ran those parameters", () => {
    const notApplicable = calculateRoomDesignRating(buildAuthority("na"));
    const missing = calculateRoomDesignRating(buildAuthority(null));
    expect(notApplicable.designPerformanceIndex).toBe(missing.designPerformanceIndex);
    expect(notApplicable.applicableWeight).toBe(missing.applicableWeight);
  });
});

describe("report readiness is complete for N/A parameters", () => {
  it("does not block a report when the overhead-only parameters are N/A", () => {
    const terminal = assessEngineeringReportCompleteness(
      terminalSummary({ p9: "na", p10: "na", p11: "na" }),
    );
    expect(terminal.complete).toBe(true);
    expect(terminal.missingParameterKeys).toEqual([]);
    expect(terminal.incompleteSeatParameterKeys).toEqual([]);
  });

  it("still lists them when they are genuinely unassessed (the control)", () => {
    const unassessed = assessEngineeringReportCompleteness(
      terminalSummary({ p9: "provisional", p10: "provisional", p11: "provisional" }),
    );
    expect(unassessed.complete).toBe(false);
    expect(unassessed.missingParameterKeys).toEqual(expect.arrayContaining(["p9", "p10", "p11"]));
  });
});

describe("the published summary reads N/A, never a dash or a not-verified count", () => {
  const summaryFor = (overheadState) => summariseEngineeringResults({
    designRatingAuthority: buildArtcousticDesignRatingAuthority({
      seats: SEATS,
      p9: { s1: overheadState },
      p10: { s1: overheadState },
      p11: { na: true },
    }),
    seats: SEATS,
    seatHudById: { s1: { rp22: {} } },
    perSeatRp23: {},
  });

  it("states N/A as the parameter status and on each seat row", () => {
    const summary = summaryFor("na");
    expect(summary.project.compliance.byParameter.p9.presentationStatus).toBe("not_applicable");
    expect(summary.project.compliance.byParameter.p10.presentationStatus).toBe("not_applicable");
    const rows = summary.project.reportCounts.seatResultRowsByParameter.p9.flatMap((row) => row.seats);
    expect(rows[0].level).toBe("N/A");
    expect(rows[0].level).not.toBe("—");
  });

  it("does not count N/A parameters as not verified or unavailable", () => {
    const notApplicable = summaryFor("na").project.compliance;
    const unassessed = summaryFor(null).project.compliance;
    expect(unassessed.counts.notVerified - notApplicable.counts.notVerified).toBe(2);
    expect(notApplicable.counts.notApplicable).toBe(2);
    expect(unassessed.counts.notApplicable).toBe(0);
  });
});

describe("the surfaces carry the reason through", () => {
  it("publishes the N/A metric from the engine for P9 and P10", () => {
    const engine = read("components/hooks/useRP22AnalysisEngine.jsx");
    expect(engine).toMatch(/const overheadLayerPresent = hasOverheadLayer\(speakersWithResolvedOverheads\)/);
    expect(engine).toMatch(/if \(!overheadLayerPresent\) \{\n(?:.|\n)*?metrics\.p9 = buildOverheadNotApplicableMetric\(\)/);
    expect(engine).toMatch(/metrics\.p10 = buildOverheadNotApplicableMetric\(\)/);
    expect(engine).toMatch(/hasZonalSpeakerLayer\(speakersWithResolvedOverheads\)/);
  });

  it("states the reason in the compliance panel for an overhead-only N/A parameter", () => {
    const panel = read("components/rp22/RP22CompliancePanel.jsx");
    expect(panel).toContain("isOverheadOnlyParameter(p.id)");
    expect(panel).toContain("{NO_OVERHEAD_LAYER_REASON}");
    expect(NO_OVERHEAD_LAYER_REASON).toBe("Not applicable — this design has no overhead / height speakers.");
  });
});