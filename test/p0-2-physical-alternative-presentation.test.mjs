// test/p0-2-physical-alternative-presentation.test.mjs
// P0-2 regression: physical alternatives must be reproducible. The
// presentation shows the complete proposed configuration from candidate-owned
// data — actual evaluated positions, tuning, seating movement, RSP and
// P14/P19/P20 results. Missing candidate-owned physical data is clearly
// identified; no coordinates or tuning are inferred from the installed layout.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPhysicalAlternativePresentation,
  buildPhysicalAlternativePresentations,
} from "../src/components/room/bass/improveBassV2/coordinatedPhysicalAlternativePresentation.js";
import { buildOption } from "../src/components/room/bass/improveBassV2/coordinatedSearchOptions.js";

const BASELINE_OPTION = buildOption({
  optionId: "baseline",
  label: "Keep your proposed design",
  evidence: {
    p14: { achievedDb: 95, targetDb: 95, headroomDb: 0 },
    p19: { level: 2, variationDb: 4.0 },
    p20Primary: { seatId: "seat-1", level: 2, variationDb: 5.0, worstFrequencyHz: 35 },
    p20Secondary: { seatId: "seat-4", level: 1, variationDb: 7.0, worstFrequencyHz: 42 },
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, level: 2, variationDb: 5.0, worstFrequencyHz: 35 },
      { seatId: "seat-4", isPrimary: false, level: 1, variationDb: 7.0, worstFrequencyHz: 42 },
    ],
  },
  meta: {
    quantity: 2,
    coordinates: [{ x: 1, y: 1 }, { x: 3, y: 1 }],
    seatingPositions: [{ id: "seat-1" }],
    seatingOffsetMm: 0,
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.05,
    placementId: "baseline-current",
    designatedSeatId: "seat-1",
  },
});

const ALT_OPTION = buildOption({
  optionId: "alternative-B",
  label: "4 subs, move seating 600 mm toward screen",
  evidence: {
    p14: { achievedDb: 97, targetDb: 95, headroomDb: 2 },
    p19: { level: 3, variationDb: 2.0 },
    p20Primary: { seatId: "seat-1", level: 3, variationDb: 2.5, worstFrequencyHz: 28 },
    p20Secondary: { seatId: "seat-4", level: 2, variationDb: 4.0, worstFrequencyHz: 35 },
    perSeatP20: [
      { seatId: "seat-1", isPrimary: true, level: 3, variationDb: 2.5, worstFrequencyHz: 28 },
      { seatId: "seat-4", isPrimary: false, level: 2, variationDb: 4.0, worstFrequencyHz: 35 },
    ],
    tuning: [
      { sourceId: "coord-1", delayMs: 5, gainDb: -1, polarity: 0, phaseControlDeg: 90 },
      { sourceId: "coord-2", delayMs: 3, gainDb: -1, polarity: 0, phaseControlDeg: 45 },
      { sourceId: "coord-3", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
      { sourceId: "coord-4", delayMs: 2, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
    ],
    responseBasis: "combined-lcr-sub",
  },
  meta: {
    quantity: 4,
    coordinates: [
      { x: 0.665, y: 0.1375 },
      { x: 2.835, y: 0.1375 },
      { x: 0.665, y: 7.8625 },
      { x: 2.835, y: 7.8625 },
    ],
    seatingPositions: [{ id: "seat-1" }, { id: "seat-2" }],
    seatingOffsetMm: -600,
    crossover: { frequencyHz: 95, type: "lr4" },
    tuning: [
      { sourceId: "coord-1", delayMs: 5, gainDb: -1, polarity: 0, phaseControlDeg: 90 },
      { sourceId: "coord-2", delayMs: 3, gainDb: -1, polarity: 0, phaseControlDeg: 45 },
      { sourceId: "coord-3", delayMs: 1, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
      { sourceId: "coord-4", delayMs: 2, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
    ],
    selectedSubModel: "sub3-12",
    subwooferBottomHeightM: 0.05,
    placementId: "finalist-4sub-front-rear",
    designatedSeatId: "seat-1",
    roomDims: { widthM: 3.5, lengthM: 8 },
  },
});

describe("P0-2: buildPhysicalAlternativePresentation — reproducible config", () => {
  it("shows the actual evaluated subwoofer coordinates (not just 'positions changed')", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.equal(view.reproducible, true);
    assert.equal(view.arrangement.coordinates.length, 4);
    assert.deepEqual(
      view.arrangement.coordinates.map((c) => c.xLabel),
      ["0.67", "2.83", "0.67", "2.83"],
    );
    assert.deepEqual(
      view.arrangement.coordinates.map((c) => c.yLabel),
      ["0.14", "0.14", "7.86", "7.86"],
    );
  });

  it("shows subwoofer quantity, model and placement ID", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.equal(view.arrangement.quantity, 4);
    assert.equal(view.arrangement.model, "sub3-12");
    assert.equal(view.arrangement.placementId, "finalist-4sub-front-rear");
  });

  it("shows seating movement and designated RSP seat", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.equal(view.seatingMovement.offsetMm, -600);
    assert.equal(view.seatingMovement.direction, "toward screen");
    assert.equal(view.seatingMovement.designatedSeatId, "seat-1");
  });

  it("shows the associated tuning (crossover, delay, gain, phase, polarity)", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.equal(view.tuning.length, 4);
    assert.equal(view.tuning[0].delayMs, 5);
    assert.equal(view.tuning[0].gainDb, -1);
    assert.equal(view.tuning[0].phaseControlDeg, 90);
    assert.equal(view.crossover.frequencyHz, 95);
  });

  it("shows P14, P19 and Primary/Secondary P20 results", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.equal(view.p14.achievedDb, 97);
    assert.equal(view.p14.pass, true);
    assert.equal(view.p19.level, 3);
    assert.equal(view.p20Primary.level, 3);
    assert.equal(view.p20Secondary.level, 2);
  });

  it("shows improvement deltas vs the baseline", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    assert.ok(view.improvements);
    assert.equal(view.improvements.p19LevelDelta, 1);
    assert.equal(view.improvements.p20PrimaryLevelDelta, 1);
  });

  it("shows remaining compromising seats", () => {
    const view = buildPhysicalAlternativePresentation(ALT_OPTION, BASELINE_OPTION);
    // seat-4 has level 2 (< 3 is a compromise in this test threshold)
    assert.ok(view.compromisingSeats.length > 0);
    assert.equal(view.compromisingSeats[0].seatId, "seat-4");
  });

  it("marks NOT reproducible when coordinates are missing", () => {
    const incomplete = buildOption({
      optionId: "alternative-C",
      label: "Missing coordinates",
      evidence: { p14: { achievedDb: 95, targetDb: 95 } },
      meta: { quantity: 2, selectedSubModel: "sub3-12", seatingPositions: [{ id: "s1" }], coordinates: [] },
    });
    const view = buildPhysicalAlternativePresentation(incomplete, BASELINE_OPTION);
    assert.equal(view.reproducible, false);
    assert.ok(view.missingFields.some((f) => f.includes("coordinates")));
  });

  it("marks NOT reproducible when model is missing", () => {
    const incomplete = buildOption({
      optionId: "alternative-D",
      label: "Missing model",
      evidence: { p14: { achievedDb: 95, targetDb: 95 } },
      meta: {
        quantity: 2,
        coordinates: [{ x: 1, y: 1 }, { x: 3, y: 1 }],
        seatingPositions: [{ id: "s1" }],
        selectedSubModel: null,
      },
    });
    const view = buildPhysicalAlternativePresentation(incomplete, BASELINE_OPTION);
    assert.equal(view.reproducible, false);
    assert.ok(view.missingFields.some((f) => f.includes("model")));
  });

  it("never infers coordinates from the installed layout (candidate-owned only)", () => {
    const altWithNoCoords = buildOption({
      optionId: "alternative-E",
      label: "No coords",
      evidence: { p14: { achievedDb: 95, targetDb: 95 } },
      meta: { quantity: 4, selectedSubModel: "sub3-12", seatingPositions: [{ id: "s1" }], coordinates: [] },
    });
    const view = buildPhysicalAlternativePresentation(altWithNoCoords, BASELINE_OPTION);
    assert.equal(view.reproducible, false);
    assert.equal(view.arrangement.coordinates.length, 0);
  });
});

describe("P0-2: buildPhysicalAlternativePresentations — batch", () => {
  it("builds views for baseline and alternatives with improvement deltas", () => {
    const views = buildPhysicalAlternativePresentations([BASELINE_OPTION, ALT_OPTION]);
    assert.equal(views.length, 2);
    assert.equal(views[0].optionId, "baseline");
    assert.equal(views[1].optionId, "alternative-B");
    // Baseline has no improvements (no baseline to compare against — it IS the baseline).
    // The alt has improvement deltas.
    assert.ok(views[1].improvements);
  });
});

describe("P0-2: coordinatedSearchOptions.describeWhatChanges shows coordinates", () => {
  it("the option meta carries placementId and roomDims for reproducibility", () => {
    const option = buildOption({
      optionId: "test",
      label: "test",
      evidence: {},
      meta: {
        quantity: 4,
        coordinates: [{ x: 1, y: 1 }],
        seatingPositions: [{ id: "s1" }],
        placementId: "finalist-42",
        selectedSubModel: "sub3-12",
        subwooferBottomHeightM: 0.05,
        roomDims: { widthM: 3.5, lengthM: 8 },
        designatedSeatId: "s1",
      },
    });
    assert.equal(option.meta.placementId, "finalist-42");
    assert.deepEqual(option.meta.roomDims, { widthM: 3.5, lengthM: 8 });
    assert.equal(option.meta.selectedSubModel, "sub3-12");
    assert.equal(option.meta.designatedSeatId, "s1");
  });
});