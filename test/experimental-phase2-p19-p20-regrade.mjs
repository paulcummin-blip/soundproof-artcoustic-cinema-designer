// Replays only the unchanged production optimiser + canonical authority over
// saved experimental raw arrays. It does not repeat placement/delay search.

import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const roomArg = String(process.argv[2] || "B").toUpperCase();
const roomId = roomArg === "C" ? "room-c" : "room-b";
const path = `experiments/phase2-p19-p20/results/${roomId}.json`;
const csvPath = `experiments/phase2-p19-p20/results/${roomId}.csv`;
const data = JSON.parse(readFileSync(path, "utf8"));
const TARGET_LEVEL = data.metadata.target.level;
const TARGET_DB = data.metadata.target.splDbC;
const round = (value, digits = 3) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
const configKey = (row) => `${row.sources.map((p) => `${round(p.x, 4)}:${round(p.y, 4)}:${round(p.z, 4)}`).join("|")}|${row.tuning.delaysMs.join(",")}|${row.tuning.gainsDb.join(",")}`;

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [optimiserMod, finalResponseMod, canonicalAuthorityMod, assessmentMod] = await Promise.all([
    server.ssrLoadModule("/src/components/utils/bassOperatingEnvelopeOptimiser.js"),
    server.ssrLoadModule("/src/components/room/bass/finalOptimisedBassResponse.js"),
    server.ssrLoadModule("/src/components/utils/canonicalBassAuthorityEvaluation.js"),
    server.ssrLoadModule("/src/components/utils/bassAuthoritativeAssessment.js"),
  ]);
  const { generateCandidatePool, selectCandidateFromPool } = optimiserMod;
  const { buildFinalOptimisedBassResponse } = finalResponseMod;
  const { evaluateCanonicalBassAuthority } = canonicalAuthorityMod;
  const { computeOfficialP19Assessment, computeOfficialP20Assessment } = assessmentMod;
  const cache = new Map();

  for (const row of data.rows) {
    const key = configKey(row);
    if (cache.has(key)) {
      row.final = cache.get(key);
      continue;
    }
    const old = row.final;
    const started = performance.now();
    const pool = generateCandidatePool({
      rawCurve: old.rawUnsmoothed.rsp,
      perSeatRawCurves: old.rawUnsmoothed.seats,
      activeSubs: old.sources,
      usableLfHz: 22,
      transitionHz: data.metadata.transitionHz,
      correctionEndHz: 200,
      perSourceComplexTransfers: [],
      normalizedTransferFingerprint: `experiment-regrade:${roomId}:${key}`,
      calibrationFingerprint: `experiment-regrade:${roomId}:${key}`,
      selectedP14TargetDb: TARGET_DB,
      p14TargetBasis: "minimum",
      p14TargetLevel: TARGET_LEVEL,
      p18TargetBasis: "minimum",
      collectDiagnostics: false,
    });
    const selectedResult = selectCandidateFromPool(pool);
    const base = selectedResult.selectedCandidate;
    if (!base) throw new Error(`No selected candidate for q${row.quantity} ${row.comparison}`);
    const canonicalResult = buildFinalOptimisedBassResponse({ optimisationResult: selectedResult, selectedLayout: old.sources });
    const authority = evaluateCanonicalBassAuthority({
      canonicalResult,
      activeSubs: old.sources,
      usableLfHz: 22,
      p14TargetBasis: "minimum",
      p18TargetBasis: "minimum",
      requestedLevel: TARGET_LEVEL,
    });
    const target = authority?.practicalCalibrationTarget?.length ? authority.practicalCalibrationTarget : base.productionHouseCurveTarget;
    const p19_30 = computeOfficialP19Assessment({
      rspPostEqCurve: base.finalPostEqCurve,
      canonicalTargetCurve: target,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const p20_30 = computeOfficialP20Assessment({
      rspPostEqCurve: base.finalPostEqCurve,
      perSeatPostEqCurves: base.perSeatPostEqCurves,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const worstP20 = authority?.perSeatP20Results?.find((seat) => seat.seatId === authority?.worstP20SeatId);
    const next = {
      ...old,
      candidateId: base.candidateId,
      timingsMs: { ...old.timingsMs, canonicalRegrade: round(performance.now() - started, 1) },
      p14: { db: authority?.achievedP14Db ?? null, level: authority?.achievedP14Level ?? null, requestedPass: authority?.requestedP14Pass ?? null },
      p18: { cutoffHz: authority?.achievedP18FrequencyHz ?? null, level: authority?.achievedP18Level ?? null, evaluated: authority?.p18Evaluated ?? null },
      p19: { rawDb: authority?.achievedP19VariationDb ?? null, level: authority?.achievedP19Level ?? null, worstFrequencyHz: authority?.officialP19WorstFrequencyHz ?? null, evaluated: authority?.p19Evaluated ?? null },
      p20: { rawDb: authority?.achievedP20VariationDb ?? null, level: authority?.achievedP20Level ?? null, worstSeat: authority?.worstP20SeatId ?? null, worstFrequencyHz: worstP20?.worstFrequencyHz ?? null, evaluated: authority?.p20Evaluated ?? null },
      diagnostic30To60: {
        p19RawDb: p19_30.variationDbRaw,
        p19Level: p19_30.level,
        p19WorstFrequencyHz: p19_30.worstFrequencyHz,
        p20RawDb: p20_30.worstSeat?.variationDbRaw ?? null,
        p20Level: p20_30.worstSeat?.level ?? null,
        p20WorstSeat: p20_30.worstSeat?.seatId ?? null,
        p20WorstFrequencyHz: p20_30.worstSeat?.worstFrequencyHz ?? null,
      },
      commonEqFilters: (base.generatedFilterBank || []).filter((filter) => filter.enabled).map((filter) => ({ frequencyHz: filter.frequencyHz, gainDb: filter.gainDb, q: filter.q ?? filter.Q })),
      assessmentBandHz: [authority?.assessmentStartHz ?? null, authority?.assessmentEndHz ?? null],
      authorityStatus: {
        p14Pass: authority?.requestedP14Pass ?? null,
        assessmentBandValid: authority?.assessmentBandValid ?? false,
        p19TargetIdentity: authority?.p19TargetIdentity ?? null,
        limitation: authority?.limitation ?? null,
        p18NotEvaluatedReason: authority?.p18NotEvaluatedReason ?? null,
        p19NotEvaluatedReason: authority?.p19NotEvaluatedReason ?? null,
        p20NotEvaluatedReason: authority?.p20NotEvaluatedReason ?? null,
      },
      postEq: { rsp: base.finalPostEqCurve, seats: base.perSeatPostEqCurves },
      targets: { ideal: authority?.idealHouseTarget || base.productionHouseCurveTarget, practical: target },
    };
    row.final = next;
    cache.set(key, next);
    console.log(`[${data.metadata.room.name}] regraded q${row.quantity} ${row.comparison}: P14 ${round(next.p14.db, 2)}; P18 ${round(next.p18.cutoffHz, 2)}; P19 ${round(next.p19.rawDb, 2)}; P20 ${round(next.p20.rawDb, 2)}`);
  }

  const frontier = [1, 2, 4].map((quantity) => {
    const row = data.rows.find((item) => item.quantity === quantity && item.comparison === "unrestricted + optimised level/delay");
    return { quantity, p19RawDb: row.final.p19.rawDb, p20RawDb: row.final.p20.rawDb, minimumLevel: Math.min(row.final.p19.level ?? 0, row.final.p20.level ?? 0), configKey: configKey(row) };
  });
  data.monotonicFrontier = {
    rows: frontier,
    nonWorsening: frontier.every((entry, index) => index === 0 || (
      entry.minimumLevel >= frontier[index - 1].minimumLevel
      && (entry.p20RawDb ?? Infinity) <= (frontier[index - 1].p20RawDb ?? Infinity) + 0.05
    )),
  };
  data.metadata.canonicalAuthorityApplied = true;
  data.metadata.regradedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(data, null, 2));

  const header = ["Quantity", "Search type", "Placement", "Levels", "Delays", "30-60 P19", "30-60 P20", "Official P18", "Official P19", "P19 grade", "Worst Hz", "Official P20", "P20 grade", "Worst seat", "Worst Hz", "Practicality", "Simulation ms", "Optimiser ms", "Authority status"];
  const rows = data.rows.map((row) => [
    row.quantity,
    row.comparison,
    row.sources.map((source) => `${round(source.x, 2)}/${round(source.y, 2)}/${round(source.z, 2)}`).join("; "),
    row.tuning.gainsDb.join("; "),
    row.tuning.delaysMs.join("; "),
    round(row.final.diagnostic30To60.p19RawDb, 3),
    round(row.final.diagnostic30To60.p20RawDb, 3),
    round(row.final.p18.cutoffHz, 3),
    round(row.final.p19.rawDb, 3),
    row.final.p19.level == null ? "NOT CALCULATED" : `L${row.final.p19.level}`,
    round(row.final.p19.worstFrequencyHz, 3),
    round(row.final.p20.rawDb, 3),
    row.final.p20.level == null ? "NOT CALCULATED" : `L${row.final.p20.level}`,
    row.final.p20.worstSeat,
    round(row.final.p20.worstFrequencyHz, 3),
    row.practicalityTier,
    row.final.timingsMs.authoritativeSimulation,
    row.final.timingsMs.optimiserAndCommonEq,
    row.final.authorityStatus.limitation,
  ]);
  const esc = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  writeFileSync(csvPath, [header, ...rows].map((row) => row.map(esc).join(",")).join("\n"));
  console.log(JSON.stringify({ room: data.metadata.room.name, uniqueRegrades: cache.size, monotonicFrontier: data.monotonicFrontier }, null, 2));
} finally {
  await server.close();
}
