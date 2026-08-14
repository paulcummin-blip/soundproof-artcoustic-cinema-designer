import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";
import { scoreB7Markers } from "./b7RewParityReferenceFixture";

// Independent B7 room-two reference captured 2026-08-14 from REW Room
// Simulator screenshots. Dimensions, absorption, enclosure and marker levels
// are shown directly by REW. Main/sub coordinates are digitised from the
// scaled plan/elevation and constrained by REW's displayed 3.57 m distance.
export const B7_REW_ROOM2_CASE = Object.freeze({
  id: "rew-6x3p5x2p4-front-centre-single",
  roomDims: Object.freeze({ widthM: 3.5, lengthM: 6.0, heightM: 2.4 }),
  rspPosition: Object.freeze({ id: "rsp", x: 1.75, y: 3.70, z: 1.08 }),
  source: Object.freeze({
    id: "rew-room2-sub-1",
    x: 1.75,
    y: 0.25,
    z: 0.18,
    tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
  }),
  reportedSourceDistanceM: 3.57,
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
    Object.freeze({ hz: 20.0, db: 95.2 }),
    Object.freeze({ hz: 28.0, db: 102.7 }),
    Object.freeze({ hz: 30.0, db: 98.9 }),
    Object.freeze({ hz: 40.0, db: 72.7 }),
    Object.freeze({ hz: 50.0, db: 87.8 }),
    Object.freeze({ hz: 57.1, db: 102.3 }),
    Object.freeze({ hz: 60.0, db: 97.0 }),
    Object.freeze({ hz: 70.0, db: 88.6 }),
    Object.freeze({ hz: 80.1, db: 91.6 }),
    Object.freeze({ hz: 85.6, db: 100.1 }),
    Object.freeze({ hz: 92.8, db: 77.3 }),
  ]),
});

const ROOM2_BASE_OPTIONS = Object.freeze({
  enableReflections: false,
  enableModes: true,
  surfaceAbsorption: B7_REW_ROOM2_CASE.surfaceAbsorption,
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

export function runB7RewRoom2Fixture(
  optionOverrides = {},
  referenceOverrides = {},
) {
  const reference = {
    ...B7_REW_ROOM2_CASE,
    ...referenceOverrides,
    roomDims: referenceOverrides.roomDims || B7_REW_ROOM2_CASE.roomDims,
    rspPosition: referenceOverrides.rspPosition || B7_REW_ROOM2_CASE.rspPosition,
    source: referenceOverrides.source || B7_REW_ROOM2_CASE.source,
    markers: referenceOverrides.markers || B7_REW_ROOM2_CASE.markers,
  };
  const options = { ...ROOM2_BASE_OPTIONS, ...optionOverrides };
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

export function runB7RewRoom2GeometrySweep() {
  const reference = B7_REW_ROOM2_CASE;
  const offsets = [-reference.coordinateToleranceM, 0, reference.coordinateToleranceM];
  const rows = [];
  offsets.forEach((sourceYDelta) => offsets.forEach((sourceZDelta) => offsets.forEach((rspYDelta) => {
    const source = {
      ...reference.source,
      y: reference.source.y + sourceYDelta,
      z: reference.source.z + sourceZDelta,
    };
    const rspPosition = {
      ...reference.rspPosition,
      y: reference.rspPosition.y + rspYDelta,
    };
    const report = runB7RewRoom2Fixture({}, { source, rspPosition });
    rows.push({
      sourceYDelta,
      sourceZDelta,
      rspYDelta,
      distanceM: report.distanceM,
      shapeRmsDb: report.shapeRmsDb,
      shapeMaxDb: report.shapeMaxDb,
      meanDeltaDb: report.meanDeltaDb,
    });
  })));
  return {
    count: rows.length,
    minShapeRmsDb: Math.min(...rows.map((row) => row.shapeRmsDb)),
    maxShapeRmsDb: Math.max(...rows.map((row) => row.shapeRmsDb)),
    maxShapeErrorDb: Math.max(...rows.map((row) => row.shapeMaxDb)),
    minDistanceM: Math.min(...rows.map((row) => row.distanceM)),
    maxDistanceM: Math.max(...rows.map((row) => row.distanceM)),
    rows,
  };
}

export function runB7RewRoom2GeneralPhysicsMatrix() {
  const candidates = [
    { id: "production_corrected", overrides: {} },
    { id: "without_multiplicity", overrides: { abApplyModeMultiplicity: false } },
    { id: "without_sealed_zero_mode", overrides: { roomIsSealed: false } },
    {
      id: "legacy_additive_direct_images",
      overrides: {
        abUseLegacyAdditiveField: true,
        enableReflections: true,
        rewParityFieldMode: "direct_plus_reflections_and_modes",
      },
    },
    ...[0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5].map((abGlobalQScale) => ({
      id: `global_q_${abGlobalQScale.toFixed(2)}`,
      overrides: { abGlobalQScale },
    })),
    ...[150, 200, 300, 500].map((modeGenerationFMaxHz) => ({
      id: `mode_bank_${modeGenerationFMaxHz}`,
      overrides: { modeGenerationFMaxHz },
    })),
  ];
  return candidates.map(({ id, overrides }) => {
    const report = runB7RewRoom2Fixture(overrides);
    return {
      id,
      distanceM: report.distanceM,
      distanceErrorM: report.distanceErrorM,
      meanDeltaDb: report.meanDeltaDb,
      shapeRmsDb: report.shapeRmsDb,
      shapeMaxDb: report.shapeMaxDb,
      rows: report.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
        hz,
        rewDb: db,
        predictedDb,
        shapeDeltaDb,
      })),
    };
  });
}

if (globalThis.process?.env?.B7_REW_ROOM2 === "1") {
  console.log(JSON.stringify({
    production: runB7RewRoom2Fixture(),
    geometrySweep: runB7RewRoom2GeometrySweep(),
    matrix: runB7RewRoom2GeneralPhysicsMatrix(),
  }, null, 2));
}
