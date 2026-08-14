import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "./normalizedPhysicsOptionsBuilder";
import { alignSubsToRSP } from "./alignSubsToRSP";
import {
  B7_REW_REFERENCE_CASE,
  scoreB7Markers,
} from "./b7RewParityReferenceFixture";
import { runB7RewRoom2Fixture } from "./b7RewParityRoom2Fixture";
import { runB7RewRoom3Fixture } from "./b7RewParityRoom3Fixture";

function runReferenceParityFixture() {
  const reference = B7_REW_REFERENCE_CASE;
  const physicsOptions = buildNormalizedPhysicsOptions({
    qStrategy: "ab_corrected",
    surfaceAbsorption: reference.surfaceAbsorption,
    roomDamping: 20,
    axialQ: 4,
    enableRewCoreReflections: true,
    modalSourceReferenceMode: "distance_normalized",
    modalGainScalar: 1,
    modalDistanceBlend: 0.55,
    modalStorageMode: "none",
    propagationPhaseScale: 0,
    disableReflectionPhaseJitter: true,
    disableReflectionCoherenceWeight: false,
    mute68HzAxialMode: false,
    debugDisableModalContribution: false,
    rewParityFieldMode: "full_field",
    overrideConstantAxialQ: false,
    overrideAbsorptionAxialQ: false,
    debugMode200Multiplier: 1,
    reflectionGainScale: 1,
    modalCoherenceMode: "coherent",
    highOrderAxialScale: 1,
    rewModalBandwidthScale: 1,
  });
  const transfer = computeNormalizedRoomTransfer({
    roomDims: reference.roomDims,
    rspPosition: reference.rspPosition,
    seatingPositions: [],
    subsForSimulation: [reference.source],
    physicsOptions,
    pointsPerOctave: 96,
  });
  const freqsHz = transfer.rspCurve.map((point) => point.frequency);
  const splDb = transfer.rspCurve.map((point) => point.spl);
  const score = scoreB7Markers(reference.markers, freqsHz, splDb);
  const passed =
    transfer.status === "complete" &&
    physicsOptions.enableReflections === false &&
    physicsOptions.rewParityFieldMode === "modes_only" &&
    physicsOptions.abApplyModeMultiplicity === true &&
    physicsOptions.roomIsSealed === true &&
    physicsOptions.abMidbandQScale === 1 &&
    score.shapeRmsDb <= 2 &&
    score.shapeMaxDb <= 3;
  return {
    name: "B7 REW 4x3x2.4 normalized room-transfer parity",
    passed,
    status: transfer.status,
    shapeRmsDb: score.shapeRmsDb,
    shapeMaxDb: score.shapeMaxDb,
    meanDeltaDb: score.meanDeltaDb,
    physics: {
      enableReflections: physicsOptions.enableReflections,
      rewParityFieldMode: physicsOptions.rewParityFieldMode,
      abApplyModeMultiplicity: physicsOptions.abApplyModeMultiplicity,
      roomIsSealed: physicsOptions.roomIsSealed,
      abMidbandQScale: physicsOptions.abMidbandQScale,
    },
    rows: score.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  };
}

function runRoom2ParityFixture() {
  const report = runB7RewRoom2Fixture();
  const passed =
    Math.abs(report.distanceErrorM) <= 0.01 &&
    report.shapeRmsDb <= 2 &&
    report.shapeMaxDb <= 3.5;
  return {
    name: "B7 REW 6x3.5x2.4 front-centre single-sub parity",
    passed,
    provisional: true,
    reason: "Second independent screenshot room; retain provisional status until the 5–6 room suite passes.",
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
  };
}

function runRoom3ParityFixture() {
  const report = runB7RewRoom3Fixture();
  const passed =
    Math.abs(report.distanceErrorM) <= 0.01 &&
    report.shapeRmsDb <= 2 &&
    report.shapeMaxDb <= 3;
  return {
    name: "B7 REW 7.56x3.85x2.95 rear-left single-sub parity",
    passed,
    provisional: true,
    reason: "Third independent screenshot room; retain provisional status until the 5–6 room suite passes.",
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
  };
}

function runEffectiveArrivalAlignmentFixture() {
  const rsp = { x: 0, y: 0, z: 0 };
  const distancesM = [2.75, 2.73, 2.00, 2.04];
  const manualDelaysMs = [0, 4, 1.5, 0.2];
  const sources = distancesM.map((x, index) => ({
    id: `sub-${index + 1}`,
    x,
    y: 0,
    z: 0,
    tuning: {
      gainDb: 0,
      delayMs: manualDelaysMs[index],
      polarity: 0,
    },
  }));
  const aligned = alignSubsToRSP(sources, rsp);
  const arrivalsMs = aligned.map((source) =>
    (Math.hypot(source.x - rsp.x, source.y - rsp.y, source.z - rsp.z) / 343 * 1000) +
    source.tuning.delayMs
  );
  const spreadMs = Math.max(...arrivalsMs) - Math.min(...arrivalsMs);
  return {
    name: "B7 effective RSP arrivals remain aligned with manual delays",
    passed: spreadMs <= 1e-9,
    spreadMs,
    arrivalsMs,
    finalDelaysMs: aligned.map((source) => source.tuning.delayMs),
  };
}

export function runB7RewParityAcceptanceFixtures() {
  const results = [
    runReferenceParityFixture(),
    runRoom2ParityFixture(),
    runRoom3ParityFixture(),
    runEffectiveArrivalAlignmentFixture(),
  ];
  return {
    passed: results.every((result) => result.passed),
    results,
  };
}

if (globalThis.process?.env?.B7_REW_ACCEPTANCE === "1") {
  console.log(JSON.stringify(runB7RewParityAcceptanceFixtures(), null, 2));
}
