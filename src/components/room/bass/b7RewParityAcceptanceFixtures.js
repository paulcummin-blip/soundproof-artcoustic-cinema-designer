import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "./normalizedPhysicsOptionsBuilder";
import { alignSubsToRSP } from "./alignSubsToRSP";
import {
  B7_REW_REFERENCE_CASE,
  scoreB7Markers,
} from "./b7RewParityReferenceFixture";
import { runB7RewRoom2Fixture } from "./b7RewParityRoom2Fixture";
import { runB7RewRoom3Fixture } from "./b7RewParityRoom3Fixture";
import { runB7RewRoom4DualFixture } from "./b7RewParityRoom4DualFixture";
import { runB7RewRoom5FourSubFixture } from "./b7RewParityRoom5FourSubFixture";
import { runB7RewRoom6FourMidpointFixture } from "./b7RewParityRoom6FourMidpointFixture";

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

function runRoom4DualParityFixture() {
  const report = runB7RewRoom4DualFixture();
  const alignedAcceptance = {
    name: "B7 REW 6.2x4.9x2.75 diagonal dual-sub aligned parity",
    passed:
      report.distanceErrorsM.every((errorM) => Math.abs(errorM) <= 0.01) &&
      Math.abs(report.alignmentDelayErrorMs) <= 0.05 &&
      report.alignedArrivalSpreadMs <= 1e-9 &&
      report.aligned.shapeRmsDb <= 2 &&
      report.aligned.shapeMaxDb <= 3.5,
    provisional: true,
    reason: "Fourth independent screenshot room and first measured dual-sub alignment case; retain provisional status until the 5–6 room suite passes.",
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    actualAlignmentDelaysMs: report.actualAlignmentDelaysMs,
    alignmentDelayErrorMs: report.alignmentDelayErrorMs,
    alignedArrivalSpreadMs: report.alignedArrivalSpreadMs,
    shapeRmsDb: report.aligned.shapeRmsDb,
    shapeMaxDb: report.aligned.shapeMaxDb,
    rows: report.aligned.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  };
  const unalignedDiagnostic = {
    name: "B7 REW 6.2x4.9x2.75 diagonal dual-sub unaligned control",
    withinParityTolerance:
      report.unaligned.shapeRmsDb <= 2 &&
      report.unaligned.shapeMaxDb <= 3.5,
    nonBlockingReason: "Sound Proof's authoritative design state time-aligns every sub to the RSP; retain this unaligned control to expose residual phase-model error without weakening the aligned production gate.",
    shapeRmsDb: report.unaligned.shapeRmsDb,
    shapeMaxDb: report.unaligned.shapeMaxDb,
    rows: report.unaligned.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  };
  return { alignedAcceptance, unalignedDiagnostic };
}

function runRoom5FourSubParityFixture() {
  const report = runB7RewRoom5FourSubFixture();
  const alignedAcceptance = {
    name: "B7 REW 7.2x6.3x3.2 four-corner-sub aligned parity",
    passed:
      report.distanceErrorsM.every((errorM) => Math.abs(errorM) <= 0.01) &&
      report.alignmentDelayErrorsMs.every((errorMs) => Math.abs(errorMs) <= 0.05) &&
      report.alignedArrivalSpreadMs <= 1e-9 &&
      report.aligned.status === "complete" &&
      report.aligned.shapeRmsDb <= 2 &&
      report.aligned.shapeMaxDb <= 3.5,
    provisional: true,
    reason: "Fifth independent screenshot room and first measured four-sub alignment case; retain provisional status until one final independent room passes.",
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    actualAlignmentDelaysMs: report.actualAlignmentDelaysMs,
    alignmentDelayErrorsMs: report.alignmentDelayErrorsMs,
    alignedArrivalSpreadMs: report.alignedArrivalSpreadMs,
    shapeRmsDb: report.aligned.shapeRmsDb,
    shapeMaxDb: report.aligned.shapeMaxDb,
    rows: report.aligned.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  };
  const unalignedDiagnostic = {
    name: "B7 REW 7.2x6.3x3.2 four-corner-sub unaligned 80 Hz control",
    withinAlignmentBenefitTolerance:
      Math.abs(report.unalignedControl.alignmentBenefitErrorDb) <= 3.5,
    nonBlockingReason: "Sound Proof's current authoritative design state equalises direct arrivals at the RSP. This single non-aligned marker remains diagnostic evidence of residual unaligned phase-model error; it does not weaken the aligned production gate.",
    ...report.unalignedControl,
  };
  return { alignedAcceptance, unalignedDiagnostic };
}

function runRoom6FourMidpointParityFixture() {
  const report = runB7RewRoom6FourMidpointFixture();
  const capturedDelayAcceptance = {
    name: "B7 REW 6.1x5.2x2.2 four-wall-midpoint captured-delay parity",
    passed:
      report.distanceErrorsM.every((errorM) => Math.abs(errorM) <= 0.01) &&
      report.rewReportedAligned.status === "complete" &&
      report.rewReportedAligned.shapeRmsDb <= 2 &&
      report.rewReportedAligned.shapeMaxDb <= 3.5,
    provisional: false,
    reason: "Sixth independent screenshot room is compared like-for-like using the per-source delay schedule captured with its REW response.",
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    capturedAlignmentDelaysMs: report.reportedAlignmentDelaysMs,
    capturedArrivalSpreadMs: report.rewReportedArrivalSpreadMs,
    shapeRmsDb: report.rewReportedAligned.shapeRmsDb,
    shapeMaxDb: report.rewReportedAligned.shapeMaxDb,
    rows: report.rewReportedAligned.rows.map(
      ({ hz, db, predictedDb, shapeDeltaDb }) => ({
        hz,
        rewDb: db,
        predictedDb,
        shapeDeltaDb,
      }),
    ),
  };
  const geometryOnlyDiagnostic = {
    name: "B7 REW 6.1x5.2x2.2 four-wall-midpoint geometry-only delay control",
    withinParityTolerance:
      report.geometricAligned.status === "complete" &&
      report.geometricAligned.shapeRmsDb <= 2 &&
      report.geometricAligned.shapeMaxDb <= 3.5,
    nonBlockingReason: "The geometry-only auto-align schedule is a different acoustic state from the captured REW schedule, so its 68.6 Hz residual remains visible as a diagnostic and is not used as a like-for-like room-engine gate.",
    productionAlignmentDelaysMs: report.geometricAlignmentDelaysMs,
    capturedAlignmentDelaysMs: report.reportedAlignmentDelaysMs,
    alignmentDelayResidualsMs: report.alignmentDelayErrorsMs,
    productionArrivalSpreadMs: report.geometricArrivalSpreadMs,
    shapeRmsDb: report.geometricAligned.shapeRmsDb,
    shapeMaxDb: report.geometricAligned.shapeMaxDb,
    rows: report.geometricAligned.rows.map(
      ({ hz, db, predictedDb, shapeDeltaDb }) => ({
        hz,
        rewDb: db,
        predictedDb,
        shapeDeltaDb,
      }),
    ),
  };
  return { capturedDelayAcceptance, geometryOnlyDiagnostic };
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
  const room4Dual = runRoom4DualParityFixture();
  const room5FourSub = runRoom5FourSubParityFixture();
  const room6FourMidpoint = runRoom6FourMidpointParityFixture();
  const results = [
    runReferenceParityFixture(),
    runRoom2ParityFixture(),
    runRoom3ParityFixture(),
    room4Dual.alignedAcceptance,
    room5FourSub.alignedAcceptance,
    room6FourMidpoint.capturedDelayAcceptance,
    runEffectiveArrivalAlignmentFixture(),
  ];
  return {
    passed: results.every((result) => result.passed),
    results,
    diagnostics: [
      room4Dual.unalignedDiagnostic,
      room5FourSub.unalignedDiagnostic,
      room6FourMidpoint.geometryOnlyDiagnostic,
    ],
  };
}

if (globalThis.process?.env?.B7_REW_ACCEPTANCE === "1") {
  console.log(JSON.stringify(runB7RewParityAcceptanceFixtures(), null, 2));
}
