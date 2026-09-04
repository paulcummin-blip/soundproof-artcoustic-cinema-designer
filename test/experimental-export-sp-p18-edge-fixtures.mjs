// Experimental export only. Reads saved Room B/C finalists and executes the
// current production Sound Proof smoother; no search, simulation, or optimiser.

import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const ROOT = "experiments/phase2-p19-p20";
const manifest = JSON.parse(readFileSync(`${ROOT}/rew-inputs/manifest.json`, "utf8"));
const rooms = {
  "room-b": JSON.parse(readFileSync(`${ROOT}/results/room-b.json`, "utf8")),
  "room-c": JSON.parse(readFileSync(`${ROOT}/results/room-c.json`, "utf8")),
};

function parseRewInput(path) {
  return readFileSync(path, "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("*"))
    .map((line) => line.split(/\s+/).map(Number))
    .filter(([frequency, spl]) => Number.isFinite(frequency) && Number.isFinite(spl))
    .map(([frequency, spl]) => ({ frequency, spl }));
}

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [smoothingMod, normalisationMod, targetMod, practicalTargetMod, houseCurveMod] = await Promise.all([
    server.ssrLoadModule("/src/components/room/bass/bassGraphSmoothing.jsx"),
    server.ssrLoadModule("/src/components/utils/p14HouseCurveNormalisation.js"),
    server.ssrLoadModule("/src/components/utils/houseCurveTargetAuthority.js"),
    server.ssrLoadModule("/src/components/utils/practicalCalibrationTarget.js"),
    server.ssrLoadModule("/src/components/utils/artcousticHouseCurve.js"),
  ]);
  const { applyBassSmoothing } = smoothingMod;
  const { normaliseHouseCurveToP14Total } = normalisationMod;
  const { buildCanonicalAbsoluteHouseCurveTarget } = targetMod;
  const { buildPracticalCalibrationTargetFromCapability } = practicalTargetMod;
  const { artcousticHouseCurveOffsetAt } = houseCurveMod;

  const fixtures = manifest.fixtures.map((fixture) => {
    const room = rooms[fixture.source.roomId];
    const row = room.rows.find((candidate) => candidate.quantity === fixture.source.quantity
      && candidate.comparison === fixture.source.comparison);
    if (!row) throw new Error(`Missing saved finalist for ${fixture.fixtureId}`);
    const rawRsp = row.final.rawUnsmoothed.rsp;
    const sourceCurve = fixture.source.isRsp
      ? rawRsp
      : row.final.rawUnsmoothed.seats.find((seat) => seat.seatId === fixture.source.seatId)?.responseData;
    if (!sourceCurve?.length) throw new Error(`Missing source curve for ${fixture.fixtureId}`);

    const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400]
      .map((frequency) => ({ frequency, offsetDb: artcousticHouseCurveOffsetAt(frequency) }));
    const normalisation = normaliseHouseCurveToP14Total({
      houseCurveShape,
      selectedP14TargetDb: Number(room.metadata.target.splDbC),
      requiredExtensionHz: 20,
      upperLfeHz: 120,
    });
    const idealTarget = buildCanonicalAbsoluteHouseCurveTarget({
      frequencyGrid: rawRsp.map((point) => Number(point.frequency)),
      targetAnchorDb: normalisation.operatingCurveOffsetDb,
      correctionStartHz: Number(rawRsp[0].frequency),
      correctionEndHz: Number(rawRsp.at(-1).frequency),
    });
    const maximumSplBeforeEq = rawRsp.map((point) => ({ ...point, spl: Number(point.spl) - 2 }));
    const { practicalCalibrationTarget } = buildPracticalCalibrationTargetFromCapability({
      idealTargetCurve: idealTarget,
      maximumSplCurve: maximumSplBeforeEq,
    });
    const persisted = row.final.targets?.practical || [];
    const persistedTargetMaxErrorDb = persisted.length
      ? practicalCalibrationTarget.reduce((max, point, index) => Math.max(max, Math.abs(point.spl - persisted[index].spl)), 0)
      : null;

    const importedInput = parseRewInput(`${ROOT}/rew-inputs/${fixture.filename}`);
    if (importedInput.length !== sourceCurve.length) throw new Error(`Input length mismatch for ${fixture.fixtureId}`);
    const inputMaxFrequencyErrorHz = sourceCurve.reduce((max, point, index) => Math.max(max, Math.abs(point.frequency - importedInput[index].frequency)), 0);
    const inputMaxSplErrorDb = sourceCurve.reduce((max, point, index) => Math.max(max, Math.abs(point.spl - importedInput[index].spl)), 0);
    if (inputMaxFrequencyErrorHz > 1e-9 || inputMaxSplErrorDb > 1e-9) {
      throw new Error(`REW input mismatch for ${fixture.fixtureId}: ${inputMaxFrequencyErrorHz} Hz, ${inputMaxSplErrorDb} dB`);
    }

    return {
      fixtureId: fixture.fixtureId,
      purpose: fixture.purpose,
      source: fixture.source,
      achievedP18Hz: row.final.p18.cutoffHz,
      transitionHz: room.metadata.transitionHz,
      officialRole: fixture.source.isRsp ? "P19 RSP authority" : "seat-to-target smoothing diagnostic",
      soundProofSmoothed: applyBassSmoothing(sourceCurve, "third"),
      practicalCalibrationTarget,
      provenance: {
        resultPath: `${ROOT}/results/${fixture.source.roomId}.json`,
        inputPath: `${ROOT}/rew-inputs/${fixture.filename}`,
        productionSmootherModule: "src/components/room/bass/bassGraphSmoothing.jsx",
        inputMaxFrequencyErrorHz,
        inputMaxSplErrorDb,
        persistedTargetMaxErrorDb,
        reranSearch: false,
        reranSimulation: false,
        reranOptimiser: false,
      },
    };
  });
  const outputPath = `${ROOT}/exports/sp-p18-edge-fixtures.json`;
  writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    smoothing: "production 1/3 octave",
    fixtures,
  }, null, 2));
  console.log(JSON.stringify({ outputPath, fixtures: fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    points: fixture.soundProofSmoothed.length,
    achievedP18Hz: fixture.achievedP18Hz,
    transitionHz: fixture.transitionHz,
    inputMaxFrequencyErrorHz: fixture.provenance.inputMaxFrequencyErrorHz,
    inputMaxSplErrorDb: fixture.provenance.inputMaxSplErrorDb,
    persistedTargetMaxErrorDb: fixture.provenance.persistedTargetMaxErrorDb,
  })) }, null, 2));
} finally {
  await server.close();
}
