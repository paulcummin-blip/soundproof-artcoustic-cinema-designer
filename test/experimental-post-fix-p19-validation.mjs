// Non-production post-fix P19 validation.
// Reuses fixed saved finalist layouts/tuning only. No placement or tuning search.

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const roomArg = String(process.argv[2] || "B").toUpperCase();
const OUTPUT_DIR = "experiments/post-fix-p19-validation";
const MODEL_KEY = "SUB2-12";
const MODEL_LABEL = "SUB2‑12";
const TARGET_DB = 112;
const TARGET_LEVEL = 2;
const SOURCE_Z_M = 0.35;
const SEAT_Z_M = 1.2;

const pos = (x, y, placement) => ({ x, y, z: SOURCE_Z_M, placement });
const config = (quantity, comparison, sources, delaysMs, gainsDb, oldP19RawDb) => ({
  quantity,
  comparison,
  sources,
  tuning: { delaysMs, gainsDb },
  oldP19RawDb,
  oldP19Grade: "FAIL",
});

const ROOMS = {
  B: {
    id: "room-b",
    name: "Room B",
    roomDims: { widthM: 4.0, lengthM: 6.3, heightM: 2.4 },
    rspPosition: { id: "rsp", x: 2.0, y: 3.5, z: SEAT_Z_M },
    seatingPositions: [
      { id: "primary-left", x: 1.0, y: 3.5, z: SEAT_Z_M, isPrimary: true },
      { id: "primary-centre", x: 2.0, y: 3.5, z: SEAT_Z_M, isPrimary: true },
      { id: "primary-right", x: 3.0, y: 3.5, z: SEAT_Z_M, isPrimary: true },
      { id: "secondary-left", x: 1.0, y: 4.8, z: SEAT_Z_M, isPrimary: false },
      { id: "secondary-centre", x: 2.0, y: 4.8, z: SEAT_Z_M, isPrimary: false },
      { id: "secondary-right", x: 3.0, y: 4.8, z: SEAT_Z_M, isPrimary: false },
    ],
    configs: [
      config(1, "best practical", [pos(2.0, 6.1725, "rear")], [0], [0], 8.153465),
      config(2, "current practical", [pos(1.0, 6.2, "rear"), pos(3.0, 6.2, "rear")], [0, 0], [0, 0], 8.333914),
      config(2, "best delay finalist", [pos(2.0, 6.1725, "rear"), pos(2.0, 0.1275, "front")], [7.977, 0], [0, 0], 8.242043),
      config(4, "current practical", [
        pos(1.0, 0.1, "front"), pos(3.0, 0.1, "front"),
        pos(1.0, 6.2, "rear"), pos(3.0, 6.2, "rear"),
      ], [0, 0, 0, 0], [0, 0, 0, 0], 7.093482),
      config(4, "best credible level/delay finalist", [
        pos(2.0, 0.1275, "front"), pos(1.3, 6.1725, "rear"),
        pos(2.0, 6.1725, "rear"), pos(2.7, 6.1725, "rear"),
      ], [10.807, 0, 7.162, 0], [0, -1.64, -0.902, -1.574], 6.169468),
    ],
  },
  C: {
    id: "room-c",
    name: "Room C",
    roomDims: { widthM: 4.8, lengthM: 7.5, heightM: 2.7 },
    rspPosition: { id: "rsp", x: 2.4, y: 4.0, z: SEAT_Z_M },
    seatingPositions: [
      { id: "primary-left", x: 1.2, y: 4.0, z: SEAT_Z_M, isPrimary: true },
      { id: "primary-centre", x: 2.4, y: 4.0, z: SEAT_Z_M, isPrimary: true },
      { id: "primary-right", x: 3.6, y: 4.0, z: SEAT_Z_M, isPrimary: true },
      { id: "secondary-left", x: 1.2, y: 5.6, z: SEAT_Z_M, isPrimary: false },
      { id: "secondary-centre", x: 2.4, y: 5.6, z: SEAT_Z_M, isPrimary: false },
      { id: "secondary-right", x: 3.6, y: 5.6, z: SEAT_Z_M, isPrimary: false },
    ],
    configs: [
      config(1, "current/best practical", [pos(0.1, 5.625, "left")], [0], [0], 6.820557),
      config(2, "current practical", [pos(1.2, 7.4, "rear"), pos(3.6, 7.4, "rear")], [0, 0], [0, 0], 7.877440),
      config(2, "best delay finalist", [pos(2.4, 7.3725, "rear"), pos(2.4, 0.1275, "front")], [0, 10.846], [0, 0], 6.784881),
      config(4, "current practical", [
        pos(1.2, 0.1, "front"), pos(3.6, 0.1, "front"),
        pos(1.2, 7.4, "rear"), pos(3.6, 7.4, "rear"),
      ], [0, 0, 0, 0], [0, 0, 0, 0], 6.921756),
      config(4, "best credible delay finalist", [
        pos(3.26, 0.1275, "front"), pos(2.4, 0.1275, "front"),
        pos(1.54, 7.3725, "rear"), pos(1.54, 0.1275, "front"),
      ], [0, 10.064, 2.998, 14.514], [0, 0, 0, 0], 6.169254),
    ],
  },
};

if (!ROOMS[roomArg]) throw new Error(`Expected room B or C, got ${roomArg}`);
const room = ROOMS[roomArg];
const transitionHz = 2000 * Math.sqrt(0.4 / (room.roomDims.widthM * room.roomDims.lengthM * room.roomDims.heightM));
const round = (value, digits = 6) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const gradeP19 = (level) => Number(level) > 0 ? `L${level}` : "FAIL";
const gradeP20 = (level) => `L${level}`;

const PHYSICS = Object.freeze({
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  qStrategy: "ab_corrected",
  enableRewCoreReflections: false,
  roomDamping: 20,
  axialQ: 4,
  modalSourceReferenceMode: "existing",
  modalGainScalar: 1,
  modalDistanceBlend: 0.55,
  modalStorageMode: "none",
  propagationPhaseScale: 0,
  disableReflectionPhaseJitter: false,
  disableReflectionCoherenceWeight: false,
  disableLateField: true,
  disableModalPropagationPhase: true,
  mute68HzAxialMode: false,
  debugDisableModalContribution: false,
  rewParityFieldMode: "full_field",
  overrideConstantAxialQ: false,
  overrideAbsorptionAxialQ: false,
  debugMode200Multiplier: 1,
  reflectionGainScale: 1,
  rewParityModalMagnitudeScale: 1,
  modalCoherenceMode: "coherent",
  highOrderAxialScale: 1,
  rewModalBandwidthScale: 0.55,
  rewSourceCurveMode: "product",
  runtimeVectorCapture: false,
});

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [engineMod, optimiserMod, assessmentMod, useAuthorityMod, finalResponseMod, canonicalAuthorityMod] = await Promise.all([
    server.ssrLoadModule("/src/components/room/bass/authoritativeBassResponseEngine.js"),
    server.ssrLoadModule("/src/components/utils/bassOperatingEnvelopeOptimiser.js"),
    server.ssrLoadModule("/src/components/utils/bassAuthoritativeAssessment.js"),
    server.ssrLoadModule("/src/components/room/bass/useAuthoritativeBassResponse.js"),
    server.ssrLoadModule("/src/components/room/bass/finalOptimisedBassResponse.js"),
    server.ssrLoadModule("/src/components/utils/canonicalBassAuthorityEvaluation.js"),
  ]);
  const { simulateAuthoritativeBassResponse } = engineMod;
  const { generateCandidatePool, selectCandidateFromPool } = optimiserMod;
  const { computeOfficialP19Assessment, computeOfficialP20Assessment } = assessmentMod;
  const { buildAuthoritativeResponseCurves } = useAuthorityMod;
  const { buildFinalOptimisedBassResponse } = finalResponseMod;
  const { evaluateCanonicalBassAuthority } = canonicalAuthorityMod;

  const rows = [];
  for (const fixed of room.configs) {
    const sources = fixed.sources.map((position, index) => ({
      id: `${room.id}-q${fixed.quantity}-${fixed.comparison.replaceAll(" ", "-")}-sub-${index + 1}`,
      modelKey: MODEL_KEY,
      subwooferAmplifierPowerW: 1000,
      ...position,
      enabled: true,
      tuning: {
        gainDb: fixed.tuning.gainsDb[index],
        delayMs: fixed.tuning.delaysMs[index],
        polarity: 0,
        requestedOutputDb: TARGET_DB,
      },
    }));

    const simulationStarted = performance.now();
    const simulation = simulateAuthoritativeBassResponse({
      roomDims: room.roomDims,
      seatingPositions: room.seatingPositions,
      rspPosition: room.rspPosition,
      sources,
      physics: PHYSICS,
      qStrategyOverride: "ab_corrected",
    });
    const simulationMs = performance.now() - simulationStarted;

    const curves = buildAuthoritativeResponseCurves(simulation.seatResponses);
    const primaryIds = new Set(room.seatingPositions.filter((seat) => seat.isPrimary).map((seat) => seat.id));
    const perSeatRawCurves = curves.perSeatRawCurves.map((seat) => ({ ...seat, isPrimary: primaryIds.has(seat.seatId) }));

    const optimiserStarted = performance.now();
    const fingerprint = `post-fix-p19:${room.id}:q${fixed.quantity}:${fixed.comparison}`;
    const pool = generateCandidatePool({
      rawCurve: curves.rspRawCurve,
      perSeatRawCurves,
      activeSubs: sources,
      usableLfHz: 22,
      transitionHz,
      correctionEndHz: 200,
      perSourceComplexTransfers: simulation.perSourceRspComplexTransfers,
      normalizedTransferFingerprint: fingerprint,
      calibrationFingerprint: fingerprint,
      selectedP14TargetDb: TARGET_DB,
      p14TargetBasis: "minimum",
      p14TargetLevel: TARGET_LEVEL,
      p18TargetBasis: "minimum",
      collectDiagnostics: false,
    });
    const selectedResult = selectCandidateFromPool(pool);
    const base = selectedResult.selectedCandidate;
    if (!base) throw new Error(`No selected candidate for ${room.name} q${fixed.quantity} ${fixed.comparison}`);
    const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult: selectedResult, selectedLayout: sources });
    const authority = evaluateCanonicalBassAuthority({
      canonicalResult,
      activeSubs: sources,
      usableLfHz: 22,
      p14TargetBasis: "minimum",
      p18TargetBasis: "minimum",
      requestedLevel: TARGET_LEVEL,
    });
    const optimiserMs = performance.now() - optimiserStarted;
    if (!authority?.assessmentBandValid) throw new Error(`Invalid assessment band for ${room.name} q${fixed.quantity} ${fixed.comparison}: ${authority?.limitation}`);

    const target = authority.practicalCalibrationTarget?.length
      ? authority.practicalCalibrationTarget
      : base.productionHouseCurveTarget;
    const diagnosticP19 = computeOfficialP19Assessment({
      rspPostEqCurve: base.finalPostEqCurve,
      canonicalTargetCurve: target,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const diagnosticP20 = computeOfficialP20Assessment({
      rspPostEqCurve: base.finalPostEqCurve,
      perSeatPostEqCurves: base.perSeatPostEqCurves,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const worstP20 = authority.perSeatP20Results?.find((seat) => seat.seatId === authority.worstP20SeatId);
    const correctedP19RawDb = authority.achievedP19VariationDb;
    const row = {
      room: room.name,
      quantity: fixed.quantity,
      comparison: fixed.comparison,
      modelKey: MODEL_KEY,
      modelLabel: MODEL_LABEL,
      positions: fixed.sources,
      delaysMs: fixed.tuning.delaysMs,
      levelTrimsDb: fixed.tuning.gainsDb,
      achievedP18CutoffHz: authority.achievedP18FrequencyHz,
      transitionHz,
      p19AssessmentBandHz: [authority.assessmentStartHz, authority.assessmentEndHz],
      correctedP19: {
        rawDb: correctedP19RawDb,
        grade: gradeP19(authority.achievedP19Level),
        level: authority.achievedP19Level,
        worstFrequencyHz: authority.officialP19WorstFrequencyHz,
      },
      p20: {
        rawDb: authority.achievedP20VariationDb,
        grade: gradeP20(authority.achievedP20Level),
        level: authority.achievedP20Level,
        worstSeat: authority.worstP20SeatId,
        worstFrequencyHz: worstP20?.worstFrequencyHz ?? null,
      },
      diagnostic30To60: {
        p19RawDb: diagnosticP19.variationDbRaw,
        p19Grade: gradeP19(diagnosticP19.level),
        p19WorstFrequencyHz: diagnosticP19.worstFrequencyHz,
        p20RawDb: diagnosticP20.worstSeat?.variationDbRaw ?? null,
        p20Grade: gradeP20(diagnosticP20.worstSeat?.level),
        p20WorstSeat: diagnosticP20.worstSeat?.seatId ?? null,
        p20WorstFrequencyHz: diagnosticP20.worstSeat?.worstFrequencyHz ?? null,
      },
      beforeAfterP19: {
        oldRawDb: fixed.oldP19RawDb,
        oldGrade: fixed.oldP19Grade,
        correctedRawDb: correctedP19RawDb,
        correctedGrade: gradeP19(authority.achievedP19Level),
        deltaDb: correctedP19RawDb - fixed.oldP19RawDb,
        improvementDb: fixed.oldP19RawDb - correctedP19RawDb,
      },
      authority: {
        p14Pass: authority.requestedP14Pass,
        p19TargetIdentity: authority.p19TargetIdentity,
        p18ReferenceConvention: "median 60–200 Hz",
        p19AssessmentStartAuthority: "achieved P18 −3 dB cutoff",
        p19AssessmentEndAuthority: "room transition",
        p20Unchanged: true,
      },
      timingsMs: {
        authoritativeSimulation: simulationMs,
        optimiserAndCanonicalAuthority: optimiserMs,
        total: simulationMs + optimiserMs,
      },
    };
    rows.push(row);
    console.log(`[${room.name}] q${fixed.quantity} ${fixed.comparison}: P18 ${round(row.achievedP18CutoffHz, 2)} Hz; P19 ${round(correctedP19RawDb, 3)} dB ${row.correctedP19.grade} @ ${round(row.correctedP19.worstFrequencyHz, 2)} Hz; P20 ${round(row.p20.rawDb, 3)} dB ${row.p20.grade}`);
  }

  const output = {
    metadata: {
      experiment: "post-fix-p19-validation",
      generatedAt: new Date().toISOString(),
      productionCodeModified: false,
      reranPlacementSearch: false,
      reranTuningSearch: false,
      reusedSavedLayoutsAndTunings: true,
      authoritativePath: "simulateAuthoritativeBassResponse -> generateCandidatePool -> selectCandidateFromPool -> evaluateCanonicalBassAuthority",
      modelKey: MODEL_KEY,
      modelLabel: MODEL_LABEL,
      target: { p14TargetBasis: "minimum", level: TARGET_LEVEL, splDbC: TARGET_DB },
      room: { id: room.id, name: room.name, roomDims: room.roomDims, rspPosition: room.rspPosition, seatingPositions: room.seatingPositions },
      transitionHz,
    },
    rows,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = `${OUTPUT_DIR}/${room.id}.json`;
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  const header = [
    "Room", "Quantity", "Configuration", "Model", "Positions", "Delays ms", "Trims dB",
    "P18 Hz", "Transition Hz", "P19 band", "Old P19 dB", "Corrected P19 dB", "P19 delta dB", "P19 grade", "P19 worst Hz",
    "P20 dB", "P20 grade", "P20 worst seat", "P20 worst Hz",
    "30-60 P19 dB", "30-60 P19 grade", "30-60 P19 worst Hz",
    "30-60 P20 dB", "30-60 P20 grade", "30-60 P20 worst seat", "30-60 P20 worst Hz",
  ];
  const csvRows = rows.map((row) => [
    row.room, row.quantity, row.comparison, row.modelLabel,
    row.positions.map((p) => `${round(p.x, 4)}/${round(p.y, 4)}/${round(p.z, 4)} ${p.placement}`).join("; "),
    row.delaysMs.join("; "), row.levelTrimsDb.join("; "),
    round(row.achievedP18CutoffHz), round(row.transitionHz),
    `${round(row.p19AssessmentBandHz[0])}–${round(row.p19AssessmentBandHz[1])}`,
    round(row.beforeAfterP19.oldRawDb), round(row.correctedP19.rawDb), round(row.beforeAfterP19.deltaDb),
    row.correctedP19.grade, round(row.correctedP19.worstFrequencyHz),
    round(row.p20.rawDb), row.p20.grade, row.p20.worstSeat, round(row.p20.worstFrequencyHz),
    round(row.diagnostic30To60.p19RawDb), row.diagnostic30To60.p19Grade, round(row.diagnostic30To60.p19WorstFrequencyHz),
    round(row.diagnostic30To60.p20RawDb), row.diagnostic30To60.p20Grade, row.diagnostic30To60.p20WorstSeat, round(row.diagnostic30To60.p20WorstFrequencyHz),
  ]);
  const esc = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  writeFileSync(`${OUTPUT_DIR}/${room.id}.csv`, [header, ...csvRows].map((row) => row.map(esc).join(",")).join("\n"));
  console.log(JSON.stringify({ jsonPath, rows: rows.length }, null, 2));
} finally {
  await server.close();
}
