import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { alignSubsToRSP } from "./alignSubsToRSP";
import { scoreB7Markers } from "./b7RewParityReferenceFixture";

// Independent B7 dual-sub reference captured 2026-08-14 from REW Room
// Simulator screenshots. The aligned and unaligned marker sets use the same
// room, RSP and diagonal-corner source positions. Coordinates are constrained
// by REW's displayed 2.98 m and 4.94 m source-to-main distances. The response
// data are not used to choose or adjust geometry.
export const B7_REW_ROOM4_DUAL_CASE = Object.freeze({
  id: "rew-6p2x4p9x2p75-diagonal-dual",
  roomDims: Object.freeze({ widthM: 4.90, lengthM: 6.20, heightM: 2.75 }),
  rspPosition: Object.freeze({ id: "rsp", x: 2.45, y: 4.41, z: 1.08 }),
  sources: Object.freeze([
    Object.freeze({
      id: "rew-room4-sub-1-near-rear-left",
      x: 0.14,
      y: 6.06,
      z: 0.18,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room4-sub-2-far-front-right",
      x: 4.76,
      y: 0.14,
      z: 0.18,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
  ]),
  reportedSourceDistancesM: Object.freeze([2.98, 4.94]),
  reportedAlignmentDelaysMs: Object.freeze([5.7, 0]),
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
  unalignedMarkers: Object.freeze([
    Object.freeze({ hz: 20.0, db: 87.8 }),
    Object.freeze({ hz: 29.9, db: 85.2 }),
    Object.freeze({ hz: 40.3, db: 83.4 }),
    Object.freeze({ hz: 50.2, db: 83.2 }),
    Object.freeze({ hz: 60.0, db: 83.6 }),
    Object.freeze({ hz: 69.8, db: 99.2 }),
    Object.freeze({ hz: 80.1, db: 79.7 }),
  ]),
  alignedMarkers: Object.freeze([
    Object.freeze({ hz: 20.0, db: 88.9 }),
    Object.freeze({ hz: 27.7, db: 100.1 }),
    Object.freeze({ hz: 30.0, db: 96.3 }),
    Object.freeze({ hz: 40.0, db: 86.9 }),
    Object.freeze({ hz: 50.0, db: 85.4 }),
    Object.freeze({ hz: 60.0, db: 83.2 }),
    Object.freeze({ hz: 70.0, db: 99.0 }),
    Object.freeze({ hz: 80.1, db: 92.2 }),
    Object.freeze({ hz: 100.7, db: 94.0 }),
  ]),
});

const ROOM4_BASE_OPTIONS = Object.freeze({
  enableReflections: false,
  enableModes: true,
  surfaceAbsorption: B7_REW_ROOM4_DUAL_CASE.surfaceAbsorption,
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

function distanceM(source, rspPosition) {
  return Math.hypot(
    source.x - rspPosition.x,
    source.y - rspPosition.y,
    source.z - rspPosition.z,
  );
}

function runState(reference, sources, markers, options) {
  const transfer = computeNormalizedRoomTransfer({
    roomDims: reference.roomDims,
    rspPosition: reference.rspPosition,
    seatingPositions: [],
    subsForSimulation: sources,
    physicsOptions: options,
    pointsPerOctave: 96,
  });
  const freqsHz = transfer.rspCurve.map((point) => point.frequency);
  const splDb = transfer.rspCurve.map((point) => point.spl);
  return {
    status: transfer.status,
    sources,
    ...scoreB7Markers(markers, freqsHz, splDb),
  };
}

export function runB7RewRoom4DualFixture(
  optionOverrides = {},
  referenceOverrides = {},
) {
  const reference = {
    ...B7_REW_ROOM4_DUAL_CASE,
    ...referenceOverrides,
    roomDims: referenceOverrides.roomDims || B7_REW_ROOM4_DUAL_CASE.roomDims,
    rspPosition: referenceOverrides.rspPosition || B7_REW_ROOM4_DUAL_CASE.rspPosition,
    sources: referenceOverrides.sources || B7_REW_ROOM4_DUAL_CASE.sources,
    unalignedMarkers: referenceOverrides.unalignedMarkers || B7_REW_ROOM4_DUAL_CASE.unalignedMarkers,
    alignedMarkers: referenceOverrides.alignedMarkers || B7_REW_ROOM4_DUAL_CASE.alignedMarkers,
  };
  const options = { ...ROOM4_BASE_OPTIONS, ...optionOverrides };
  const unalignedSources = reference.sources.map((source) => ({
    ...source,
    tuning: { ...source.tuning, delayMs: 0 },
  }));
  const alignedSources = alignSubsToRSP(unalignedSources, reference.rspPosition);
  const distancesM = unalignedSources.map((source) => distanceM(source, reference.rspPosition));
  const distanceErrorsM = distancesM.map(
    (distance, index) => distance - reference.reportedSourceDistancesM[index],
  );
  const expectedGeometricDelayMs =
    (Math.max(...distancesM) - Math.min(...distancesM)) / 343 * 1000;
  const actualAlignmentDelaysMs = alignedSources.map(
    (source) => source.tuning.delayMs,
  );
  const alignedArrivalsMs = alignedSources.map(
    (source, index) => distancesM[index] / 343 * 1000 + source.tuning.delayMs,
  );
  const alignedArrivalSpreadMs =
    Math.max(...alignedArrivalsMs) - Math.min(...alignedArrivalsMs);
  return {
    caseId: reference.id,
    options,
    distancesM,
    distanceErrorsM,
    expectedGeometricDelayMs,
    actualAlignmentDelaysMs,
    reportedAlignmentDelaysMs: reference.reportedAlignmentDelaysMs,
    alignmentDelayErrorMs:
      actualAlignmentDelaysMs[0] - reference.reportedAlignmentDelaysMs[0],
    alignedArrivalSpreadMs,
    unaligned: runState(
      reference,
      unalignedSources,
      reference.unalignedMarkers,
      options,
    ),
    aligned: runState(
      reference,
      alignedSources,
      reference.alignedMarkers,
      options,
    ),
  };
}

export function runB7RewRoom4DualModeBankMatrix() {
  const cases = [
    { id: "default", overrides: {} },
    { id: "q_1p5", overrides: { abGlobalQScale: 1.5 } },
    { id: "q_1p8", overrides: { abGlobalQScale: 1.8 } },
    { id: "q_2p2", overrides: { abGlobalQScale: 2.2 } },
  ];
  return cases.map(({ id, overrides }) => {
    const report = runB7RewRoom4DualFixture(overrides);
    return {
      id,
      unalignedShapeRmsDb: report.unaligned.shapeRmsDb,
      unalignedShapeMaxDb: report.unaligned.shapeMaxDb,
      alignedShapeRmsDb: report.aligned.shapeRmsDb,
      alignedShapeMaxDb: report.aligned.shapeMaxDb,
    };
  });
}

if (globalThis.process?.env?.B7_REW_ROOM4_DUAL_MATRIX === "1") {
  console.log(JSON.stringify(runB7RewRoom4DualModeBankMatrix(), null, 2));
}

if (globalThis.process?.env?.B7_REW_ROOM4_DUAL_SCORE === "1") {
  const report = runB7RewRoom4DualFixture();
  const compactState = (state) => ({
    status: state.status,
    shapeRmsDb: state.shapeRmsDb,
    shapeMaxDb: state.shapeMaxDb,
    meanDeltaDb: state.meanDeltaDb,
    rows: state.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  });
  console.log(JSON.stringify({
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    expectedGeometricDelayMs: report.expectedGeometricDelayMs,
    actualAlignmentDelaysMs: report.actualAlignmentDelaysMs,
    alignmentDelayErrorMs: report.alignmentDelayErrorMs,
    alignedArrivalSpreadMs: report.alignedArrivalSpreadMs,
    unaligned: compactState(report.unaligned),
    aligned: compactState(report.aligned),
  }, null, 2));
}
