import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";
import { scoreB7Markers } from "./b7RewParityReferenceFixture";

// Independent B7 room-three reference captured 2026-08-14 from REW Room
// Simulator screenshots. Dimensions, absorption, enclosure and marker levels
// are shown directly by REW. Main coordinates come from the plan/elevation
// percentages. The rear-left source acoustic centre is constrained by REW's
// displayed 3.49 m source-to-main distance, not by response-curve fitting.
export const B7_REW_ROOM3_CASE = Object.freeze({
  id: "rew-7p56x3p85x2p95-rear-left-single",
  roomDims: Object.freeze({ widthM: 3.85, lengthM: 7.56, heightM: 2.95 }),
  rspPosition: Object.freeze({ id: "rsp", x: 1.90, y: 4.72, z: 1.08 }),
  source: Object.freeze({
    id: "rew-room3-sub-1",
    x: 0.09,
    y: 7.56,
    z: 0.18,
    tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
  }),
  reportedSourceDistanceM: 3.49,
  coordinateToleranceM: 0.05,
  roomIsSealed: true,
  surfaceAbsorption: Object.freeze({
    front: 0.30,
    back: 0.30,
    left: 0.30,
    right: 0.30,
    ceiling: 0.30,
    floor: 0.30,
  }),
  sourceDefinition: Object.freeze({ lfMinus3DbHz: 20, enclosure: "ported" }),
  markers: Object.freeze([
    Object.freeze({ hz: 20.0, db: 90.6 }),
    Object.freeze({ hz: 22.6, db: 102.7 }),
    Object.freeze({ hz: 30.0, db: 94.8 }),
    Object.freeze({ hz: 40.0, db: 95.4 }),
    Object.freeze({ hz: 45.0, db: 103.9 }),
    Object.freeze({ hz: 50.0, db: 89.6 }),
    Object.freeze({ hz: 60.0, db: 91.4 }),
    Object.freeze({ hz: 67.7, db: 103.1 }),
    Object.freeze({ hz: 80.8, db: 82.3 }),
  ]),
});

const ROOM3_BASE_OPTIONS = Object.freeze({
  enableReflections: false,
  enableModes: true,
  surfaceAbsorption: B7_REW_ROOM3_CASE.surfaceAbsorption,
  freqMinHz: 15,
  freqMaxHz: 200,
  pointsPerOctave: 96,
  smoothing: "none",
  modalSourceReferenceMode: "distance_normalized",
  modalGainScalar: 1,
  axialQ: 4,
  modalStorageMode: "none",
  propagationPhaseScale: 0,
  pureDeterministicModalSum: true,
  disableReflectionPhaseJitter: true,
  disableReflectionCoherenceWeight: false,
  disableLateField: true,
  disableModalPropagationPhase: true,
  debugMode200Multiplier: 1,
  debugReflectionOrder: 1,
  reflectionGainScale: 1,
  rewParityModalMagnitudeScale: 1,
  modalCoherenceMode: "coherent",
  highOrderAxialScale: 1,
  qStrategy: "ab_corrected",
  rewModalBandwidthScale: 1,
  rewParityFieldMode: "modes_only",
  roomIsSealed: true,
  abApplyModeMultiplicity: true,
  abMidbandQScale: 1,
  rewSourceCurveMode: "flat_rew_reference",
});

export function runB7RewRoom3Fixture(
  optionOverrides = {},
  referenceOverrides = {},
) {
  const reference = {
    ...B7_REW_ROOM3_CASE,
    ...referenceOverrides,
    roomDims: referenceOverrides.roomDims || B7_REW_ROOM3_CASE.roomDims,
    rspPosition: referenceOverrides.rspPosition || B7_REW_ROOM3_CASE.rspPosition,
    source: referenceOverrides.source || B7_REW_ROOM3_CASE.source,
    markers: referenceOverrides.markers || B7_REW_ROOM3_CASE.markers,
  };
  const options = { ...ROOM3_BASE_OPTIONS, ...optionOverrides };
  const result = simulateBassResponseRewCore(
    reference.roomDims,
    reference.rspPosition,
    reference.source,
    REW_SOURCE_CURVES.flat_rew_reference,
    options,
  );
  const distanceM = Math.hypot(
    reference.source.x - reference.rspPosition.x,
    reference.source.y - reference.rspPosition.y,
    reference.source.z - reference.rspPosition.z,
  );
  return {
    caseId: reference.id,
    options,
    distanceM,
    distanceErrorM: distanceM - reference.reportedSourceDistanceM,
    ...scoreB7Markers(reference.markers, result.freqsHz, result.splDbRaw),
  };
}

export function runB7RewRoom3GeometrySweep() {
  const reference = B7_REW_ROOM3_CASE;
  const offsets = [-reference.coordinateToleranceM, 0, reference.coordinateToleranceM];
  const rows = [];
  offsets.forEach((sourceXDelta) => offsets.forEach((sourceZDelta) =>
    offsets.forEach((rspXDelta) => offsets.forEach((rspYDelta) => {
      const source = {
        ...reference.source,
        x: reference.source.x + sourceXDelta,
        z: reference.source.z + sourceZDelta,
      };
      const rspPosition = {
        ...reference.rspPosition,
        x: reference.rspPosition.x + rspXDelta,
        y: reference.rspPosition.y + rspYDelta,
      };
      const report = runB7RewRoom3Fixture({}, { source, rspPosition });
      rows.push({
        sourceXDelta,
        sourceZDelta,
        rspXDelta,
        rspYDelta,
        distanceM: report.distanceM,
        distanceErrorM: report.distanceErrorM,
        shapeRmsDb: report.shapeRmsDb,
        shapeMaxDb: report.shapeMaxDb,
      });
    }))));
  return {
    count: rows.length,
    minShapeRmsDb: Math.min(...rows.map((row) => row.shapeRmsDb)),
    maxShapeRmsDb: Math.max(...rows.map((row) => row.shapeRmsDb)),
    minShapeMaxDb: Math.min(...rows.map((row) => row.shapeMaxDb)),
    maxShapeMaxDb: Math.max(...rows.map((row) => row.shapeMaxDb)),
    minDistanceM: Math.min(...rows.map((row) => row.distanceM)),
    maxDistanceM: Math.max(...rows.map((row) => row.distanceM)),
    rows,
  };
}

if (globalThis.process?.env?.B7_REW_ROOM3_SCORE === "1") {
  const report = runB7RewRoom3Fixture();
  console.log(JSON.stringify({
    distanceM: report.distanceM,
    distanceErrorM: report.distanceErrorM,
    shapeRmsDb: report.shapeRmsDb,
    shapeMaxDb: report.shapeMaxDb,
    meanDeltaDb: report.meanDeltaDb,
    rows: report.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  }, null, 2));
}

if (globalThis.process?.env?.B7_REW_ROOM3_GEOMETRY === "1") {
  console.log(JSON.stringify(runB7RewRoom3GeometrySweep(), null, 2));
}
