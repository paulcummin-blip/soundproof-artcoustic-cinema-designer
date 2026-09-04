// Experimental checkpoint only. Regrades saved finalist curves; it does not
// rerun field generation, placement enumeration, tuning, EQ, or simulation.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const ROOM_IDS = ["room-b", "room-c"];
const RESULT_DIR = "experiments/phase2-p19-p20/results";
const OUTPUT_DIR = "experiments/phase2-p19-p20/checkpoints";
const OUTPUT_JSON = `${OUTPUT_DIR}/phase1-p18-bounded-p19-p20.json`;
const OUTPUT_CSV = `${OUTPUT_DIR}/phase1-p18-bounded-p19-p20.csv`;
const MAXIMUM_SPL_SAFETY_MARGIN_DB = 2;

const round = (value, digits = 3) => value !== null && value !== "" && Number.isFinite(Number(value))
  ? Number(Number(value).toFixed(digits))
  : null;

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const [assessmentMod, normalisationMod, targetMod, practicalTargetMod, rp22MetricsMod, fitterCoreMod] = await Promise.all([
    server.ssrLoadModule("/src/components/utils/bassAuthoritativeAssessment.js"),
    server.ssrLoadModule("/src/components/utils/p14HouseCurveNormalisation.js"),
    server.ssrLoadModule("/src/components/utils/houseCurveTargetAuthority.js"),
    server.ssrLoadModule("/src/components/utils/practicalCalibrationTarget.js"),
    server.ssrLoadModule("/src/components/utils/rp22BassMetrics.jsx"),
    server.ssrLoadModule("/src/components/utils/houseCurveFitterCore.js"),
  ]);

  const { computeOfficialP19Assessment, computeOfficialP20Assessment } = assessmentMod;
  const { normaliseHouseCurveToP14Total } = normalisationMod;
  const { buildCanonicalAbsoluteHouseCurveTarget } = targetMod;
  const { buildPracticalCalibrationTargetFromCapability } = practicalTargetMod;
  const { artcousticHouseCurveOffsetAt } = rp22MetricsMod;
  const { houseCurveP19Level } = fitterCoreMod;

  const output = {
    authority: {
      smoothing: "production applyBassSmoothing(..., 'third')",
      p19Meaning: "maximum absolute RSP-to-practical-target deviation",
      p20Meaning: "maximum absolute real-seat-to-RSP deviation",
      assessmentStartAuthority: "achieved P18 frequency",
      assessmentEndAuthority: "room transition frequency",
      belowP18AffectsGrade: false,
    },
    generatedAt: new Date().toISOString(),
    rooms: [],
  };

  for (const roomId of ROOM_IDS) {
    const saved = JSON.parse(readFileSync(`${RESULT_DIR}/${roomId}.json`, "utf8"));
    const transitionHz = Number(saved.metadata.transitionHz);
    const selectedP14TargetDb = Number(saved.metadata.target.splDbC);
    const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400]
      .map((frequency) => ({ frequency, offsetDb: artcousticHouseCurveOffsetAt(frequency) }));
    const normalisation = normaliseHouseCurveToP14Total({
      houseCurveShape,
      selectedP14TargetDb,
      requiredExtensionHz: 20,
      upperLfeHz: 120,
    });
    if (!Number.isFinite(normalisation?.operatingCurveOffsetDb)) {
      throw new Error(`No P14 house-curve normalisation for ${roomId}`);
    }

    const rows = saved.rows.map((row) => {
      const achievedP18Hz = Number(row.final?.p18?.cutoffHz);
      const rspPostEqCurve = row.final?.postEq?.rsp || [];
      const perSeatPostEqCurves = row.final?.postEq?.seats || [];
      const rawRspCurve = row.final?.rawUnsmoothed?.rsp || [];
      if (!Number.isFinite(achievedP18Hz) || !rspPostEqCurve.length || !rawRspCurve.length) {
        throw new Error(`Incomplete saved finalist ${roomId} q${row.quantity} ${row.comparison}`);
      }

      const idealTarget = buildCanonicalAbsoluteHouseCurveTarget({
        frequencyGrid: rawRspCurve.map((point) => Number(point.frequency)),
        targetAnchorDb: normalisation.operatingCurveOffsetDb,
        correctionStartHz: Number(rawRspCurve[0].frequency),
        correctionEndHz: Number(rawRspCurve.at(-1).frequency),
      });
      const maximumSplBeforeEq = rawRspCurve.map((point) => ({
        ...point,
        spl: Number(point.spl) - MAXIMUM_SPL_SAFETY_MARGIN_DB,
      }));
      const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
        idealTargetCurve: idealTarget,
        maximumSplCurve: maximumSplBeforeEq,
      });

      // Room B already carries the original target arrays. Exact agreement is
      // a checkpoint that target reconstruction did not invoke the optimiser.
      const persistedTarget = row.final?.targets?.practical || [];
      let targetReconstructionMaxErrorDb = null;
      if (persistedTarget.length) {
        targetReconstructionMaxErrorDb = practicalCalibrationTarget.reduce((maximum, point, index) => {
          const persisted = Number(persistedTarget[index]?.spl);
          return Number.isFinite(persisted) ? Math.max(maximum, Math.abs(point.spl - persisted)) : maximum;
        }, 0);
        if (targetReconstructionMaxErrorDb > 1e-9) {
          throw new Error(`Target reconstruction mismatch ${roomId} q${row.quantity} ${row.comparison}: ${targetReconstructionMaxErrorDb}`);
        }
      }

      const p19 = computeOfficialP19Assessment({
        rspPostEqCurve,
        canonicalTargetCurve: practicalCalibrationTarget,
        assessmentStartHz: achievedP18Hz,
        assessmentEndHz: transitionHz,
      });
      const p20 = computeOfficialP20Assessment({
        rspPostEqCurve,
        perSeatPostEqCurves,
        assessmentStartHz: achievedP18Hz,
        assessmentEndHz: transitionHz,
      });

      const gridBelowP18 = rspPostEqCurve
        .map((point) => Number(point.frequency))
        .filter((frequency) => Number.isFinite(frequency) && frequency < achievedP18Hz - 1e-9);
      const diagnosticEndHz = gridBelowP18.length ? Math.max(...gridBelowP18) : null;
      const diagnosticStartHz = rspPostEqCurve.length ? Number(rspPostEqCurve[0].frequency) : null;
      const p19Below = Number.isFinite(diagnosticEndHz)
        ? computeOfficialP19Assessment({
            rspPostEqCurve,
            canonicalTargetCurve: practicalCalibrationTarget,
            assessmentStartHz: diagnosticStartHz,
            assessmentEndHz: diagnosticEndHz,
          })
        : null;
      const p20Below = Number.isFinite(diagnosticEndHz)
        ? computeOfficialP20Assessment({
            rspPostEqCurve,
            perSeatPostEqCurves,
            assessmentStartHz: diagnosticStartHz,
            assessmentEndHz: diagnosticEndHz,
          })
        : null;

      return {
        quantity: row.quantity,
        finalist: row.comparison,
        achievedP18Hz,
        transitionHz,
        assessmentBandHz: [achievedP18Hz, transitionHz],
        p19: {
          worstFrequencyHz: p19.worstFrequencyHz,
          deviationDb: p19.variationDbRaw,
          level: houseCurveP19Level(p19.variationDbRaw),
        },
        p20: {
          worstFrequencyHz: p20.worstSeat?.worstFrequencyHz ?? null,
          deviationDb: p20.worstSeat?.variationDbRaw ?? null,
          level: p20.worstSeat?.level ?? null,
          worstSeat: p20.worstSeat?.seatId ?? null,
        },
        belowP18DiagnosticOnly: {
          affectsOfficialGrade: false,
          assessedBandHz: Number.isFinite(diagnosticEndHz) ? [diagnosticStartHz, diagnosticEndHz] : null,
          p19WorstFrequencyHz: p19Below?.worstFrequencyHz ?? null,
          p19DeviationDb: p19Below?.variationDbRaw ?? null,
          p20WorstFrequencyHz: p20Below?.worstSeat?.worstFrequencyHz ?? null,
          p20DeviationDb: p20Below?.worstSeat?.variationDbRaw ?? null,
          p20WorstSeat: p20Below?.worstSeat?.seatId ?? null,
        },
        provenance: {
          sourceResult: `${RESULT_DIR}/${roomId}.json`,
          reusedSavedPostEqCurves: true,
          reranRoomSearch: false,
          reranSimulation: false,
          reranOptimiser: false,
          targetReconstructionMaxErrorDb,
        },
      };
    });

    output.rooms.push({
      roomId: saved.metadata.room.id,
      roomName: saved.metadata.room.name,
      transitionHz,
      rows,
    });
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));

  const csvHeader = [
    "Room", "Quantity", "Finalist", "P18 Hz", "Band start Hz", "Band end Hz",
    "P19 worst Hz", "P19 deviation dB", "P19 grade",
    "P20 worst seat", "P20 worst Hz", "P20 deviation dB", "P20 grade",
    "Below P18 P19 worst Hz", "Below P18 P19 dB",
    "Below P18 P20 worst seat", "Below P18 P20 worst Hz", "Below P18 P20 dB",
    "Below P18 affects grade",
  ];
  const csvRows = output.rooms.flatMap((room) => room.rows.map((row) => [
    room.roomName, row.quantity, row.finalist,
    round(row.achievedP18Hz), round(row.assessmentBandHz[0]), round(row.assessmentBandHz[1]),
    round(row.p19.worstFrequencyHz), round(row.p19.deviationDb), `L${row.p19.level}`,
    row.p20.worstSeat, round(row.p20.worstFrequencyHz), round(row.p20.deviationDb), `L${row.p20.level}`,
    round(row.belowP18DiagnosticOnly.p19WorstFrequencyHz), round(row.belowP18DiagnosticOnly.p19DeviationDb),
    row.belowP18DiagnosticOnly.p20WorstSeat, round(row.belowP18DiagnosticOnly.p20WorstFrequencyHz), round(row.belowP18DiagnosticOnly.p20DeviationDb),
    "NO",
  ]));
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  writeFileSync(OUTPUT_CSV, [csvHeader, ...csvRows].map((row) => row.map(escapeCsv).join(",")).join("\n"));

  console.log(JSON.stringify({ outputJson: OUTPUT_JSON, outputCsv: OUTPUT_CSV, rooms: output.rooms }, null, 2));
} finally {
  await server.close();
}
