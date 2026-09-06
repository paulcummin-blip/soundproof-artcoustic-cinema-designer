// Non-production Improve Bass Response v2 validation harness.
// Isolated under test/: production source files and frozen bass authority are unchanged.

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const roomKey = String(process.argv[2] || "B").toUpperCase();
const quantity = Number(process.argv[3] || 2);
const phase = String(process.argv[4] || "baseline").toLowerCase();
const variant = String(process.argv[5] || "default").toLowerCase();
if (!["B", "C"].includes(roomKey) || ![2, 4].includes(quantity) || !["baseline", "placement", "tuning", "polarity", "seating", "allpass"].includes(phase)) {
  throw new Error("Usage: node test/experimental-improve-bass-v2.mjs <B|C> <2|4> <baseline|placement|tuning|polarity|seating|allpass>");
}

const MODEL = "SUB2-12";
const AMP_W = 1000;
const SOURCE_BOTTOM_M = 0.10;
const TARGET = Object.freeze({
  p14TargetBasis: "minimum",
  p14TargetLevel: 2,
  p14TargetDb: 112,
  p18TargetBasis: "minimum",
});

const ROOMS = Object.freeze({
  B: {
    name: "Room B",
    roomDims: { widthM: 4.0, lengthM: 6.3, heightM: 2.4 },
    rspPosition: { id: "rsp", x: 2.0, y: 3.5, z: 1.2 },
    seatingPositions: [
      { id: "primary-left", x: 1.0, y: 3.5, z: 1.2, priority: "primary" },
      { id: "primary-centre", x: 2.0, y: 3.5, z: 1.2, priority: "primary" },
      { id: "primary-right", x: 3.0, y: 3.5, z: 1.2, priority: "primary" },
      { id: "secondary-left", x: 1.0, y: 4.8, z: 1.2, priority: "secondary" },
      { id: "secondary-centre", x: 2.0, y: 4.8, z: 1.2, priority: "secondary" },
      { id: "secondary-right", x: 3.0, y: 4.8, z: 1.2, priority: "secondary" },
    ],
    layouts: {
      2: {
        current: [[1.0, 6.2], [3.0, 6.2]],
        trusted: [[2.0, 6.1725], [2.0, 0.1275]],
        tuning: [[7.977, 0], [0, 0]],
      },
      4: {
        current: [[1.0, 0.1], [3.0, 0.1], [1.0, 6.2], [3.0, 6.2]],
        trusted: [[2.0, 0.1275], [1.3, 6.1725], [2.0, 6.1725], [2.7, 6.1725]],
        tuning: [[10.807, 0], [0, -1.64], [7.162, -0.902], [0, -1.574]],
      },
    },
  },
  C: {
    name: "Room C",
    roomDims: { widthM: 4.8, lengthM: 7.5, heightM: 2.7 },
    rspPosition: { id: "rsp", x: 2.4, y: 4.0, z: 1.2 },
    seatingPositions: [
      { id: "primary-left", x: 1.2, y: 4.0, z: 1.2, priority: "primary" },
      { id: "primary-centre", x: 2.4, y: 4.0, z: 1.2, priority: "primary" },
      { id: "primary-right", x: 3.6, y: 4.0, z: 1.2, priority: "primary" },
      { id: "secondary-left", x: 1.2, y: 5.6, z: 1.2, priority: "secondary" },
      { id: "secondary-centre", x: 2.4, y: 5.6, z: 1.2, priority: "secondary" },
      { id: "secondary-right", x: 3.6, y: 5.6, z: 1.2, priority: "secondary" },
    ],
    layouts: {
      2: {
        current: [[1.2, 7.4], [3.6, 7.4]],
        trusted: [[2.4, 7.3725], [2.4, 0.1275]],
        tuning: [[0, 0], [10.846, 0]],
      },
      4: {
        current: [[1.2, 0.1], [3.6, 0.1], [1.2, 7.4], [3.6, 7.4]],
        trusted: [[3.26, 0.1275], [2.4, 0.1275], [1.54, 7.3725], [1.54, 0.1275]],
        tuning: [[0, 0], [10.064, 0], [2.998, 0], [14.514, 0]],
      },
    },
  },
});

const room = ROOMS[roomKey];
const layoutData = room.layouts[quantity];
const transitionHz = 2000 * Math.sqrt(0.4 / (
  room.roomDims.widthM * room.roomDims.lengthM * room.roomDims.heightM
));
const round = (value, digits = 3) => Number.isFinite(Number(value))
  ? Number(Number(value).toFixed(digits))
  : null;
const now = () => performance.now();
const zeros = (n) => Array.from({ length: n }, () => ({ delayMs: 0, gainDb: 0, polarity: 0 }));
const savedTuning = layoutData.tuning.map(([delayMs, gainDb]) => ({ delayMs, gainDb, polarity: 0 }));

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const [
    stage2Mod,
    tuningMod,
    stage1Mod,
    physicsMod,
    canonicalOptimiserMod,
    poolSelectionMod,
    finalResponseMod,
    authorityMod,
    officialAssessmentMod,
    normalizedTransferMod,
  ] = await Promise.all([
    server.ssrLoadModule("/src/components/room/bass/stage2/stage2CanonicalEvaluation.js"),
    server.ssrLoadModule("/src/components/room/bass/stage2/stage2TuningSearch.js"),
    server.ssrLoadModule("/src/components/room/bass/stage1/stage1PlacementEngine.js"),
    server.ssrLoadModule("/src/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot.js"),
    server.ssrLoadModule("/src/components/utils/canonicalBassOptimiser.js"),
    server.ssrLoadModule("/src/components/utils/bassCandidatePoolSelection.js"),
    server.ssrLoadModule("/src/components/room/bass/finalOptimisedBassResponse.js"),
    server.ssrLoadModule("/src/components/utils/canonicalBassAuthorityEvaluation.js"),
    server.ssrLoadModule("/src/components/utils/bassAuthoritativeAssessment.js"),
    server.ssrLoadModule("/src/components/room/bass/normalizedRoomTransferEngine.js"),
  ]);

  const { evaluateStage2Placement } = stage2Mod;
  const { searchDelayOnly, searchLevelAndDelay, resumWithTuning } = tuningMod;
  const { runStage1SearchForQuantity } = stage1Mod;
  const { DEFAULT_BEST_SUB_LAYOUT_PHYSICS } = physicsMod;
  const { generateCanonicalCandidatePool } = canonicalOptimiserMod;
  const { selectCandidateFromPool } = poolSelectionMod;
  const { buildFinalOptimisedBassResponse } = finalResponseMod;
  const { evaluateCanonicalBassAuthority } = authorityMod;
  const { computeOfficialP19Assessment, computeOfficialP20Assessment } = officialAssessmentMod;
  const { computeNormalizedRoomTransfer } = normalizedTransferMod;

  function finalistFromPositions(id, positions, familyId = id) {
    return {
      id,
      familyId,
      sources: positions.map(([x, y]) => ({
        xNorm: x / room.roomDims.widthM,
        yNorm: y / room.roomDims.lengthM,
      })),
    };
  }

  function simulatePlacement(finalist, geometry = room) {
    const started = now();
    const raw = evaluateStage2Placement({
      finalist,
      roomDims: geometry.roomDims,
      rspPosition: geometry.rspPosition,
      seatingPositions: geometry.seatingPositions,
      selectedSubModel: MODEL,
      amplifierPowerPerSubW: AMP_W,
      subwooferBottomHeightM: SOURCE_BOTTOM_M,
    });
    if (!raw) throw new Error("Stage 2 placement returned null for " + finalist.id);
    return { raw, runtimeMs: now() - started };
  }

  function responseCurve(response) {
    return (response?.freqsHz || []).map((frequency, index) => ({
      frequency,
      spl: Number(response?.splDb?.[index]),
    })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.spl));
  }

  function canonical(raw, tuning, label) {
    const started = now();
    const tuned = tuning || raw.autoAlignTuning || zeros(raw.quantity);
    const responses = resumWithTuning(raw.perSourcePerSeatComplexTransfers, tuned, raw.seatIds);
    const rspRawCurve = responseCurve(responses.rsp);
    const seatPriorityMap = new Map(raw.seatPriorityMap || []);
    const perSeatRawCurves = Object.entries(responses)
      .filter(([seatId]) => seatId !== "rsp")
      .map(([seatId, response]) => ({
        seatId,
        isPrimary: seatPriorityMap.get(String(seatId)) === "primary",
        responseData: responseCurve(response),
      }));

    const sources = raw.sources.map((source, index) => ({
      ...source,
      tuning: tuned[index] || { delayMs: 0, gainDb: 0, polarity: 0 },
    }));
    const pool = generateCanonicalCandidatePool({
      rawCurve: rspRawCurve,
      activeSubs: sources,
      usableLfHz: raw.usableLfHz,
      transitionHz: raw.transitionHz,
      correctionEndHz: 200,
      perSeatRawCurves,
      selectedP14TargetDb: TARGET.p14TargetDb,
      p14TargetBasis: TARGET.p14TargetBasis,
      p14TargetLevel: TARGET.p14TargetLevel,
      p18TargetBasis: TARGET.p18TargetBasis,
      perSourceComplexTransfers: [],
      normalizedTransferFingerprint: null,
      calibrationFingerprint: null,
    });
    const selection = selectCandidateFromPool(pool);
    if (!selection?.selectedCandidate) throw new Error("No canonical candidate for " + label);
    const canonicalResult = buildFinalOptimisedBassResponse({
      optimisationResult: selection,
      selectedLayout: sources,
    });
    const authority = evaluateCanonicalBassAuthority({
      canonicalResult,
      activeSubs: sources,
      usableLfHz: raw.usableLfHz,
      p14TargetBasis: TARGET.p14TargetBasis,
      p18TargetBasis: TARGET.p18TargetBasis,
      requestedLevel: TARGET.p14TargetLevel,
    });
    if (!authority) throw new Error("No canonical authority for " + label);

    const p20Worst = (authority.perSeatP20Results || [])
      .find((seat) => seat.seatId === authority.worstP20SeatId);
    const p19Target = authority.practicalCalibrationTarget?.length
      ? authority.practicalCalibrationTarget
      : selection.selectedCandidate.productionHouseCurveTarget;
    const diagnosticP19 = computeOfficialP19Assessment({
      rspPostEqCurve: selection.selectedCandidate.finalPostEqCurve,
      canonicalTargetCurve: p19Target,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const diagnosticP20 = computeOfficialP20Assessment({
      rspPostEqCurve: selection.selectedCandidate.finalPostEqCurve,
      perSeatPostEqCurves: selection.selectedCandidate.perSeatPostEqCurves,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });

    return {
      label,
      positions: raw.sources.map((source) => ({
        x: round(source.x, 4), y: round(source.y, 4), z: round(source.z, 4),
      })),
      tuning: tuned.map((entry) => ({
        delayMs: round(entry.delayMs, 3),
        gainDb: round(entry.gainDb, 3),
        polarity: Number(entry.polarity) < 0 ? "inverted" : "normal",
      })),
      p14: {
        db: round(authority.achievedP14Db),
        level: authority.achievedP14Level,
        requestedPass: authority.requestedP14Pass,
      },
      p18: {
        cutoffHz: round(authority.achievedP18FrequencyHz),
        level: authority.achievedP18Level,
        requestedPass: authority.requestedP18Pass,
      },
      p19: {
        rawDb: round(authority.achievedP19VariationDb),
        level: authority.achievedP19Level,
        worstFrequencyHz: round(authority.officialP19WorstFrequencyHz),
      },
      p20: {
        rawDb: round(authority.achievedP20VariationDb),
        level: authority.achievedP20Level,
        worstSeat: authority.worstP20SeatId,
        worstFrequencyHz: round(p20Worst?.worstFrequencyHz),
      },
      diagnostic30To60: {
        p19RawDb: round(diagnosticP19?.variationDbRaw),
        p19Level: diagnosticP19?.level ?? null,
        p19WorstFrequencyHz: round(diagnosticP19?.worstFrequencyHz),
        p20RawDb: round(diagnosticP20?.worstSeat?.variationDbRaw),
        p20Level: diagnosticP20?.worstSeat?.level ?? null,
        p20WorstSeat: diagnosticP20?.worstSeat?.seatId ?? null,
        p20WorstFrequencyHz: round(diagnosticP20?.worstSeat?.worstFrequencyHz),
      },
      assessmentBandHz: [
        round(authority.assessmentStartHz),
        round(authority.assessmentEndHz),
      ],
      enabledEqFilters: (selection.selectedCandidate.generatedFilterBank || [])
        .filter((filter) => filter.enabled)
        .map((filter) => ({
          frequencyHz: round(filter.frequencyHz),
          gainDb: round(filter.gainDb),
          q: round(filter.q ?? filter.Q, 4),
        })),
      runtimeMs: round(now() - started, 1),
    };
  }

  function proxy(raw, tuning) {
    const responses = resumWithTuning(raw.perSourcePerSeatComplexTransfers, tuning, raw.seatIds);
    const rsp = responses.rsp;
    if (!rsp?.freqsHz?.length) return { score: Infinity };
    const indices = rsp.freqsHz.map((frequency, index) =>
      frequency >= 20 && frequency <= transitionHz ? index : -1
    ).filter((index) => index >= 0);
    const rspValues = indices.map((index) => rsp.splDb[index]).filter(Number.isFinite);
    const rspPeakToPeakDb = Math.max(...rspValues) - Math.min(...rspValues);
    let worstSeatDifferenceDb = 0;
    let worstSeat = null;
    let worstFrequencyHz = null;
    for (const [seatId, response] of Object.entries(responses)) {
      if (seatId === "rsp") continue;
      for (const index of indices) {
        const difference = Math.abs(Number(response.splDb[index]) - Number(rsp.splDb[index]));
        if (difference > worstSeatDifferenceDb) {
          worstSeatDifferenceDb = difference;
          worstSeat = seatId;
          worstFrequencyHz = rsp.freqsHz[index];
        }
      }
    }
    return {
      score: rspPeakToPeakDb + 2 * worstSeatDifferenceDb,
      rspPeakToPeakDb,
      worstSeatDifferenceDb,
      worstSeat,
      worstFrequencyHz,
    };
  }

  function withPolarity(tuning, pattern) {
    return tuning.map((entry, index) => ({
      delayMs: Number(entry.delayMs) || 0,
      gainDb: Math.min(0, Number(entry.gainDb) || 0),
      polarity: pattern[index] < 0 ? -1 : 0,
    }));
  }

  function polarityPatterns(count) {
    const patterns = [];
    for (let mask = 0; mask < 2 ** (count - 1); mask += 1) {
      patterns.push(Array.from({ length: count }, (_, index) =>
        index === 0 ? 1 : ((mask >> (index - 1)) & 1 ? -1 : 1)
      ));
    }
    return patterns;
  }

  function flipRawForSearch(raw, pattern) {
    return raw.perSourcePerSeatComplexTransfers.map((transfer) => {
      const sourceIndex = Number(transfer.sourceIndex) || 0;
      const sign = pattern[sourceIndex] < 0 ? -1 : 1;
      return {
        ...transfer,
        points: transfer.points.map((point) => ({
          ...point,
          re: Number(point.re) * sign,
          im: Number(point.im) * sign,
        })),
      };
    });
  }

  function searchPolarity(raw) {
    const started = now();
    const variants = { polarity: [], polarityDelay: [], polarityDelayTrim: [] };
    for (const pattern of polarityPatterns(raw.quantity)) {
      const alone = withPolarity(zeros(raw.quantity), pattern);
      variants.polarity.push({ pattern, tuning: alone, proxy: proxy(raw, alone) });

      const flipped = flipRawForSearch(raw, pattern);
      const rspTransfers = flipped.filter((transfer) => transfer.seatId === "rsp");
      const sources = raw.sources.map((source) => ({ yNorm: source.yNorm }));

      const delayResult = searchDelayOnly(rspTransfers, sources);
      for (const finalist of delayResult.finalists || []) {
        const tuning = withPolarity(finalist.tuning, pattern);
        variants.polarityDelay.push({ pattern, tuning, proxy: proxy(raw, tuning) });
      }

      const trimResult = searchLevelAndDelay(rspTransfers, sources);
      for (const finalist of trimResult.finalists || []) {
        const tuning = withPolarity(finalist.tuning, pattern);
        variants.polarityDelayTrim.push({ pattern, tuning, proxy: proxy(raw, tuning) });
      }
    }
    for (const key of Object.keys(variants)) {
      variants[key].sort((a, b) => a.proxy.score - b.proxy.score);
    }
    return {
      best: Object.fromEntries(Object.entries(variants).map(([key, list]) => [key, list[0]])),
      counts: Object.fromEntries(Object.entries(variants).map(([key, list]) => [key, list.length])),
      runtimeMs: now() - started,
    };
  }

  function rotateTransferPoints(points, option) {
    if (!option || !Number.isFinite(option.frequencyHz)) return points;
    const fc = Number(option.frequencyHz);
    const direction = Number(option.direction) < 0 ? -1 : 1;
    return points.map((point) => {
      const x = Number(point.frequency) / fc;
      const denominator = 1 + x * x;
      const hRe = (1 - x * x) / denominator;
      const hIm = direction * (-2 * x / denominator);
      return {
        ...point,
        re: Number(point.re) * hRe - Number(point.im) * hIm,
        im: Number(point.re) * hIm + Number(point.im) * hRe,
      };
    });
  }

  function rawWithAllPass(raw, settings) {
    return {
      ...raw,
      perSourcePerSeatComplexTransfers: raw.perSourcePerSeatComplexTransfers.map((transfer) => {
        const index = Number(transfer.sourceIndex) || 0;
        return {
          ...transfer,
          points: rotateTransferPoints(transfer.points, settings[index]),
        };
      }),
    };
  }

  function searchAllPass(raw, baseTuning) {
    const started = now();
    const options = [
      null,
      { frequencyHz: 25, direction: 1 }, { frequencyHz: 25, direction: -1 },
      { frequencyHz: 40, direction: 1 }, { frequencyHz: 40, direction: -1 },
      { frequencyHz: 63, direction: 1 }, { frequencyHz: 63, direction: -1 },
      { frequencyHz: 100, direction: 1 }, { frequencyHz: 100, direction: -1 },
      { frequencyHz: 160, direction: 1 }, { frequencyHz: 160, direction: -1 },
    ];
    let settings = Array(raw.quantity).fill(null);
    let bestRaw = raw;
    let bestProxy = proxy(raw, baseTuning);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let sourceIndex = 1; sourceIndex < raw.quantity; sourceIndex += 1) {
        for (const option of options) {
          const candidateSettings = [...settings];
          candidateSettings[sourceIndex] = option;
          const candidateRaw = rawWithAllPass(raw, candidateSettings);
          const candidateProxy = proxy(candidateRaw, baseTuning);
          if (candidateProxy.score < bestProxy.score - 1e-9) {
            settings = candidateSettings;
            bestRaw = candidateRaw;
            bestProxy = candidateProxy;
          }
        }
      }
    }
    return { settings, raw: bestRaw, proxy: bestProxy, runtimeMs: now() - started };
  }

  function movedGeometry(offsetM) {
    return {
      roomDims: room.roomDims,
      rspPosition: { ...room.rspPosition, y: room.rspPosition.y + offsetM },
      seatingPositions: room.seatingPositions.map((seat) => ({ ...seat, y: seat.y + offsetM })),
    };
  }

  function validOffset(offsetM) {
    const geometry = movedGeometry(offsetM);
    const yValues = [
      geometry.rspPosition.y,
      ...geometry.seatingPositions.map((seat) => seat.y),
    ];
    return yValues.every((y) => y >= 0.3 && y <= room.roomDims.lengthM - 0.3);
  }

  function scoreNormalizedTransfer(transfer) {
    const rsp = transfer.rspCurve || [];
    const indices = rsp.map((point, index) =>
      point.frequency >= 20 && point.frequency <= transitionHz ? index : -1
    ).filter((index) => index >= 0);
    const rspValues = indices.map((index) => rsp[index]?.spl).filter(Number.isFinite);
    const rspPeakToPeakDb = Math.max(...rspValues) - Math.min(...rspValues);
    let worstSeatDifferenceDb = 0;
    let worstSeat = null;
    let worstFrequencyHz = null;
    for (const seat of transfer.seatCurves || []) {
      for (const index of indices) {
        const difference = Math.abs(Number(seat.responseData[index]?.spl) - Number(rsp[index]?.spl));
        if (difference > worstSeatDifferenceDb) {
          worstSeatDifferenceDb = difference;
          worstSeat = seat.originalSeatId;
          worstFrequencyHz = rsp[index]?.frequency;
        }
      }
    }
    return {
      score: rspPeakToPeakDb + 2 * worstSeatDifferenceDb,
      rspPeakToPeakDb,
      worstSeatDifferenceDb,
      worstSeat,
      worstFrequencyHz,
    };
  }

  function searchSeatBlock(finalist, fixedTuning, confirmBest = true) {
    const started = now();
    const physicalSources = finalist.sources.map((source, index) => ({
      id: "seat-screen-" + index,
      x: source.xNorm * room.roomDims.widthM,
      y: source.yNorm * room.roomDims.lengthM,
      z: 0.35,
      tuning: fixedTuning[index] || { delayMs: 0, gainDb: 0, polarity: 0 },
    }));

    function screen(offsetM) {
      const geometry = movedGeometry(offsetM);
      const transfer = computeNormalizedRoomTransfer({
        roomDims: geometry.roomDims,
        rspPosition: geometry.rspPosition,
        seatingPositions: geometry.seatingPositions,
        subsForSimulation: physicalSources,
        physicsOptions: DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
        pointsPerOctave: 8,
      });
      if (transfer.status !== "complete") return null;
      return {
        offsetM,
        proxy: scoreNormalizedTransfer(transfer),
        screeningMs: transfer.calculationDurationMs,
      };
    }

    const coarse = [];
    for (let step = -5; step <= 5; step += 1) {
      const offsetM = round(step * 0.2, 3);
      if (!validOffset(offsetM)) continue;
      const entry = screen(offsetM);
      if (entry) coarse.push(entry);
    }
    coarse.sort((a, b) => a.proxy.score - b.proxy.score);
    const centre = coarse[0].offsetM;
    const seen = new Set(coarse.map((entry) => entry.offsetM));
    const refined = [];
    for (let step = -4; step <= 4; step += 1) {
      const offsetM = round(centre + step * 0.05, 3);
      if (Math.abs(offsetM) > 1 || !validOffset(offsetM) || seen.has(offsetM)) continue;
      const entry = screen(offsetM);
      if (entry) refined.push(entry);
    }
    const ranked = [...coarse, ...refined].sort((a, b) => a.proxy.score - b.proxy.score);
    const placement = confirmBest
      ? simulatePlacement(finalist, movedGeometry(ranked[0].offsetM))
      : null;
    const best = {
      ...ranked[0],
      raw: placement?.raw || null,
      simulationMs: placement?.runtimeMs || 0,
    };
    return {
      best,
      top: ranked.slice(0, 5).map((entry) => ({
        offsetM: entry.offsetM,
        proxy: entry.proxy,
        screeningMs: round(entry.screeningMs, 1),
      })),
      coarseCount: coarse.length,
      refineCount: refined.length,
      runtimeMs: now() - started,
    };
  }

  function bestExistingTuning(raw) {
    const started = now();
    const rspTransfers = raw.perSourcePerSeatComplexTransfers
      .filter((transfer) => transfer.seatId === "rsp");
    const sources = raw.sources.map((source) => ({ yNorm: source.yNorm }));
    const delay = searchDelayOnly(rspTransfers, sources);
    const trim = searchLevelAndDelay(rspTransfers, sources);
    const all = [
      ...(delay.finalists || []).map((entry) => ({ kind: "delay", ...entry, proxy: proxy(raw, entry.tuning) })),
      ...(trim.finalists || []).map((entry) => ({ kind: "delay-trim", ...entry, proxy: proxy(raw, entry.tuning) })),
    ].sort((a, b) => a.proxy.score - b.proxy.score);
    return {
      delayBest: delay.finalists?.[0] || null,
      trimBest: trim.finalists?.[0] || null,
      proxyBest: all[0] || null,
      runtimeMs: now() - started,
    };
  }

  const currentFinalist = finalistFromPositions(
    "current-control-" + roomKey + "-q" + quantity,
    layoutData.current,
    "CURRENT_CONTROL",
  );
  const trustedFinalist = finalistFromPositions(
    "trusted-finalist-" + roomKey + "-q" + quantity,
    layoutData.trusted,
    "TRUSTED_PREVIOUS_FINALIST",
  );

  const phaseStarted = now();
  function savePhase(data) {
    const outputDir = "experiments/improve-bass-v2";
    mkdirSync(outputDir, { recursive: true });
    const path = outputDir + "/room-" + roomKey.toLowerCase() + "-q" + quantity + "-" + phase + "-" + variant + ".json";
    const output = {
      metadata: {
        experiment: "improve-bass-response-v2-read-only-sandbox",
        productionCodeModified: false,
        generatedAt: new Date().toISOString(),
        room: room.name,
        quantity,
        phase,
        variant,
        model: MODEL,
        target: TARGET,
        transitionHz: round(transitionHz),
      },
      geometry: {
        roomDims: room.roomDims,
        rspPosition: room.rspPosition,
        seatingPositions: room.seatingPositions,
      },
      ...data,
      totalPhaseRuntimeMs: round(now() - phaseStarted, 1),
    };
    writeFileSync(path, JSON.stringify(output, null, 2));
    console.log("RESULT " + path);
    console.log(JSON.stringify({ metadata: output.metadata, result: output.result || null, totalPhaseRuntimeMs: output.totalPhaseRuntimeMs }, null, 2));
  }

  if (phase === "baseline") {
    const useTrusted = variant === "trusted";
    const finalist = useTrusted ? trustedFinalist : currentFinalist;
    const tuning = useTrusted ? savedTuning : zeros(quantity);
    const placement = simulatePlacement(finalist);
    const result = canonical(
      placement.raw,
      tuning,
      useTrusted ? "trusted saved finalist" : "current control",
    );
    savePhase({
      result,
      simulationMs: round(placement.runtimeMs, 1),
    });
    await server.close();
    process.exit(0);
  }

  if (phase === "placement") {
    const stage1Started = now();
    const stage1 = runStage1SearchForQuantity({
      roomDims: room.roomDims,
      rspPosition: room.rspPosition,
      seatingPositions: room.seatingPositions,
      physicsOptions: DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
      quantity,
    });
    const stage1RuntimeMs = now() - stage1Started;
    if (variant === "screen") {
      savePhase({
        result: null,
        stage1: {
          runtimeMs: round(stage1RuntimeMs, 1),
          candidateCount: stage1.candidateCount,
          finalists: stage1.finalists.map((entry) => ({
            id: entry.id,
            familyId: entry.familyId,
            positions: entry.sources.map((source) => ({ x: source.x, y: source.y })),
          })),
        },
      });
      await server.close();
      process.exit(0);
    }
    const finalist = stage1.finalists[0];
    const placement = simulatePlacement(finalist);
    const tuningSearch = bestExistingTuning(placement.raw);
    const useTuned = variant === "tuned";
    const result = canonical(
      placement.raw,
      useTuned ? tuningSearch.proxyBest.tuning : placement.raw.autoAlignTuning,
      useTuned
        ? "production Stage 1 top placement + " + tuningSearch.proxyBest.kind
        : "production Stage 1 top placement + auto-align",
    );
    savePhase({
      stage1: {
        runtimeMs: round(stage1RuntimeMs, 1),
        candidateCount: stage1.candidateCount,
        finalists: stage1.finalists.map((entry) => ({
          id: entry.id,
          familyId: entry.familyId,
          positions: entry.sources.map((source) => ({ x: source.x, y: source.y })),
        })),
      },
      simulationMs: round(placement.runtimeMs, 1),
      tuningSearchMs: round(tuningSearch.runtimeMs, 1),
      delayBest: tuningSearch.delayBest,
      trimBest: tuningSearch.trimBest,
      result,
      selectedVariant: useTuned ? tuningSearch.proxyBest.kind : "auto-align",
    });
    await server.close();
    process.exit(0);
  }

  if (phase === "tuning") {
    const placement = simulatePlacement(trustedFinalist);
    const search = bestExistingTuning(placement.raw);
    const selected = variant === "delay" ? search.delayBest : search.trimBest;
    const result = canonical(
      placement.raw,
      selected.tuning,
      variant === "delay" ? "independent delay only" : "independent delay + trim",
    );
    savePhase({
      result,
      simulationMs: round(placement.runtimeMs, 1),
      searchRuntimeMs: round(search.runtimeMs, 1),
      selectedSearch: selected,
    });
    await server.close();
    process.exit(0);
  }

  if (phase === "polarity") {
    const placement = simulatePlacement(trustedFinalist);
    const search = searchPolarity(placement.raw);
    const key = variant === "alone"
      ? "polarity"
      : variant === "delay"
        ? "polarityDelay"
        : "polarityDelayTrim";
    const labels = {
      polarity: "polarity alone",
      polarityDelay: "polarity + delay",
      polarityDelayTrim: "polarity + delay + trim",
    };
    const result = canonical(placement.raw, search.best[key].tuning, labels[key]);
    savePhase({
      result,
      simulationMs: round(placement.runtimeMs, 1),
      searchRuntimeMs: round(search.runtimeMs, 1),
      combinations: search.counts,
      selectedSearch: search.best[key],
    });
    await server.close();
    process.exit(0);
  }

  if (phase === "seating") {
    if (variant === "screen") {
      const search = searchSeatBlock(trustedFinalist, savedTuning, false);
      savePhase({
        result: null,
        search: {
          runtimeMs: round(search.runtimeMs, 1),
          coarseCount: search.coarseCount,
          refineCount: search.refineCount,
          bestOffsetMm: round(search.best.offsetM * 1000, 0),
          top: search.top,
        },
      });
      await server.close();
      process.exit(0);
    }

    const directMatch = variant.match(/^(fixed|retuned)-(-?\d+)$/);
    if (directMatch) {
      const directKind = directMatch[1];
      const offsetMm = Number(directMatch[2]);
      const placement = simulatePlacement(trustedFinalist, movedGeometry(offsetMm / 1000));
      const retune = directKind === "retuned" ? searchPolarity(placement.raw) : null;
      const tuning = retune ? retune.best.polarityDelayTrim.tuning : savedTuning;
      const result = canonical(
        placement.raw,
        tuning,
        "seat moved " + offsetMm + " mm; "
          + (retune ? "polarity/delay/trim retuned" : "fixed prior tuning"),
      );
      savePhase({
        result,
        tuning,
        directAuthoritativeOffsetMm: offsetMm,
        simulationMs: round(placement.runtimeMs, 1),
        retuneSearchMs: round(retune?.runtimeMs || 0, 1),
      });
      await server.close();
      process.exit(0);
    }

    const search = searchSeatBlock(trustedFinalist, savedTuning);
    const result = canonical(
      search.best.raw,
      savedTuning,
      "seat moved " + round(search.best.offsetM * 1000, 0) + " mm; fixed prior tuning",
    );
    savePhase({
      result,
      tuning: savedTuning,
      search: {
        runtimeMs: round(search.runtimeMs, 1),
        coarseCount: search.coarseCount,
        refineCount: search.refineCount,
        bestOffsetMm: round(search.best.offsetM * 1000, 0),
        top: search.top,
        bestFullSimulationMs: round(search.best.simulationMs, 1),
      },
      retuneSearchMs: 0,
    });
    await server.close();
    process.exit(0);
  }

  if (phase === "allpass") {
    const placement = simulatePlacement(trustedFinalist);
    const polarity = searchPolarity(placement.raw);
    const baseTuning = polarity.best.polarityDelayTrim.tuning;
    const search = searchAllPass(placement.raw, baseTuning);
    const result = canonical(
      search.raw,
      baseTuning,
      "one first-order all-pass per non-reference sub",
    );
    savePhase({
      result,
      baseTuning,
      simulationMs: round(placement.runtimeMs, 1),
      polaritySearchMs: round(polarity.runtimeMs, 1),
      allPassSearchMs: round(search.runtimeMs, 1),
      settings: search.settings,
      proxy: search.proxy,
    });
    await server.close();
    process.exit(0);
  }

  console.log("[" + room.name + " q" + quantity + "] current control");
  const currentPlacement = simulatePlacement(currentFinalist);
  const current = canonical(currentPlacement.raw, zeros(quantity), "current control");

  console.log("[" + room.name + " q" + quantity + "] trusted saved finalist");
  const trustedPlacement = simulatePlacement(trustedFinalist);
  const trusted = canonical(trustedPlacement.raw, savedTuning, "trusted saved finalist");

  if (phase === "baseline") {
    savePhase({
      controls: {
        current,
        currentSimulationMs: round(currentPlacement.runtimeMs, 1),
        trusted,
        trustedSimulationMs: round(trustedPlacement.runtimeMs, 1),
      },
    });
    await server.close();
    process.exit(0);
  }

  console.log("[" + room.name + " q" + quantity + "] production Stage 1/2");
  const stage1Started = now();
  const stage1 = runStage1SearchForQuantity({
    roomDims: room.roomDims,
    rspPosition: room.rspPosition,
    seatingPositions: room.seatingPositions,
    physicsOptions: DEFAULT_BEST_SUB_LAYOUT_PHYSICS,
    quantity,
  });
  const stage1RuntimeMs = now() - stage1Started;
  const stage1Finalist = stage1.finalists[0];
  const stage1Placement = simulatePlacement(stage1Finalist);
  const stage1TuningSearch = bestExistingTuning(stage1Placement.raw);
  const stage1PlacementResult = canonical(
    stage1Placement.raw,
    stage1Placement.raw.autoAlignTuning,
    "production Stage 1 top placement + auto-align",
  );
  const stage1TunedResult = canonical(
    stage1Placement.raw,
    stage1TuningSearch.proxyBest.tuning,
    "production Stage 1 top placement + " + stage1TuningSearch.proxyBest.kind,
  );

  if (phase === "baseline") {
    savePhase({
      controls: {
        current,
        currentSimulationMs: round(currentPlacement.runtimeMs, 1),
        trusted,
        trustedSimulationMs: round(trustedPlacement.runtimeMs, 1),
      },
      productionPlacement: {
        stage1: {
          runtimeMs: round(stage1RuntimeMs, 1),
          candidateCount: stage1.candidateCount,
          finalists: stage1.finalists.map((entry) => ({
            id: entry.id,
            familyId: entry.familyId,
            positions: entry.sources.map((source) => ({ x: source.x, y: source.y })),
          })),
        },
        topPlacement: stage1PlacementResult,
        topTuned: stage1TunedResult,
        simulationMs: round(stage1Placement.runtimeMs, 1),
        tuningSearchMs: round(stage1TuningSearch.runtimeMs, 1),
        delayBest: stage1TuningSearch.delayBest,
        trimBest: stage1TuningSearch.trimBest,
      },
    });
    await server.close();
    process.exit(0);
  }

  const seedOptions = [
    { name: "trusted", raw: trustedPlacement.raw, tuning: savedTuning, result: trusted },
    {
      name: "production",
      raw: stage1Placement.raw,
      tuning: stage1TuningSearch.proxyBest.tuning,
      result: stage1TunedResult,
    },
  ].sort((a, b) => (
    Math.min(b.result.p19.level, b.result.p20.level)
      - Math.min(a.result.p19.level, a.result.p20.level)
    || (a.result.p19.rawDb + a.result.p20.rawDb)
      - (b.result.p19.rawDb + b.result.p20.rawDb)
  ));
  const seed = seedOptions[0];

  console.log("[" + room.name + " q" + quantity + "] polarity");
  const polaritySearch = searchPolarity(seed.raw);
  const polarityAlone = canonical(
    seed.raw,
    polaritySearch.best.polarity.tuning,
    "polarity alone",
  );
  const polarityDelay = canonical(
    seed.raw,
    polaritySearch.best.polarityDelay.tuning,
    "polarity + delay",
  );
  const polarityDelayTrim = canonical(
    seed.raw,
    polaritySearch.best.polarityDelayTrim.tuning,
    "polarity + delay + trim",
  );

  const tuningCandidates = [
    { name: seed.name, raw: seed.raw, tuning: seed.tuning, result: seed.result },
    { name: "polarity", raw: seed.raw, tuning: polaritySearch.best.polarity.tuning, result: polarityAlone },
    { name: "polarity-delay", raw: seed.raw, tuning: polaritySearch.best.polarityDelay.tuning, result: polarityDelay },
    { name: "polarity-delay-trim", raw: seed.raw, tuning: polaritySearch.best.polarityDelayTrim.tuning, result: polarityDelayTrim },
  ].sort((a, b) => (
    Math.min(b.result.p19.level, b.result.p20.level)
      - Math.min(a.result.p19.level, a.result.p20.level)
    || (a.result.p19.rawDb + a.result.p20.rawDb)
      - (b.result.p19.rawDb + b.result.p20.rawDb)
  ));
  const tunedBest = tuningCandidates[0];

  console.log("[" + room.name + " q" + quantity + "] seating block");
  const seatSearch = searchSeatBlock(
    finalistFromPositions("seat-search-layout", tunedBest.result.positions.map((p) => [p.x, p.y]), "SEAT_SEARCH"),
    tunedBest.tuning,
  );
  const movedRaw = seatSearch.best.raw;
  const movedFixed = canonical(
    movedRaw,
    tunedBest.tuning,
    "seat moved " + round(seatSearch.best.offsetM * 1000, 0) + " mm; fixed prior tuning",
  );
  const movedPolaritySearch = searchPolarity(movedRaw);
  const movedTuning = movedPolaritySearch.best.polarityDelayTrim.tuning;
  const movedRetuned = canonical(
    movedRaw,
    movedTuning,
    "seat moved " + round(seatSearch.best.offsetM * 1000, 0) + " mm; retuned",
  );

  const beforeSeat = tunedBest.result;
  const seatWinner = [
    { name: "before-seat", raw: tunedBest.raw, tuning: tunedBest.tuning, result: beforeSeat, offsetM: 0 },
    { name: "moved-fixed", raw: movedRaw, tuning: tunedBest.tuning, result: movedFixed, offsetM: seatSearch.best.offsetM },
    { name: "moved-retuned", raw: movedRaw, tuning: movedTuning, result: movedRetuned, offsetM: seatSearch.best.offsetM },
  ].sort((a, b) => (
    Math.min(b.result.p19.level, b.result.p20.level)
      - Math.min(a.result.p19.level, a.result.p20.level)
    || (a.result.p19.rawDb + a.result.p20.rawDb)
      - (b.result.p19.rawDb + b.result.p20.rawDb)
  ))[0];

  console.log("[" + room.name + " q" + quantity + "] one-filter all-pass proof");
  const allPassSearch = searchAllPass(seatWinner.raw, seatWinner.tuning);
  const allPass = canonical(
    allPassSearch.raw,
    seatWinner.tuning,
    "one first-order all-pass per non-reference sub",
  );

  const finalCandidates = [
    ...tuningCandidates,
    { name: "moved-fixed", raw: movedRaw, tuning: tunedBest.tuning, result: movedFixed, offsetM: seatSearch.best.offsetM },
    { name: "moved-retuned", raw: movedRaw, tuning: movedTuning, result: movedRetuned, offsetM: seatSearch.best.offsetM },
    { name: "all-pass", raw: allPassSearch.raw, tuning: seatWinner.tuning, result: allPass, offsetM: seatWinner.offsetM, allPass: allPassSearch.settings },
  ].sort((a, b) => (
    Math.min(b.result.p19.level, b.result.p20.level)
      - Math.min(a.result.p19.level, a.result.p20.level)
    || (a.result.p19.rawDb + a.result.p20.rawDb)
      - (b.result.p19.rawDb + b.result.p20.rawDb)
  ));
  const finalBest = finalCandidates[0];

  const output = {
    metadata: {
      experiment: "improve-bass-response-v2-read-only-sandbox",
      generatedAt: new Date().toISOString(),
      productionCodeModified: false,
      room: room.name,
      quantity,
      model: MODEL,
      target: TARGET,
      transitionHz: round(transitionHz),
      allPassProofModel: "first-order magnitude-unity H(s)=(1-s/w0)/(1+s/w0), one optional section per non-reference sub",
    },
    geometry: {
      roomDims: room.roomDims,
      rspPosition: room.rspPosition,
      seatingPositions: room.seatingPositions,
    },
    controls: {
      current,
      currentSimulationMs: round(currentPlacement.runtimeMs, 1),
      trusted,
      trustedSimulationMs: round(trustedPlacement.runtimeMs, 1),
    },
    productionPlacement: {
      stage1: {
        runtimeMs: round(stage1RuntimeMs, 1),
        candidateCount: stage1.candidateCount,
        finalists: stage1.finalists.map((entry) => ({
          id: entry.id,
          familyId: entry.familyId,
          positions: entry.sources.map((source) => ({ x: source.x, y: source.y })),
        })),
      },
      topPlacement: stage1PlacementResult,
      topTuned: stage1TunedResult,
      simulationMs: round(stage1Placement.runtimeMs, 1),
      tuningSearchMs: round(stage1TuningSearch.runtimeMs, 1),
      delayBest: stage1TuningSearch.delayBest,
      trimBest: stage1TuningSearch.trimBest,
    },
    polarity: {
      seed: seed.name,
      combinations: polaritySearch.counts,
      searchRuntimeMs: round(polaritySearch.runtimeMs, 1),
      bestProxy: polaritySearch.best,
      authoritative: { alone: polarityAlone, delay: polarityDelay, delayTrim: polarityDelayTrim },
    },
    seating: {
      seed: tunedBest.name,
      searchRuntimeMs: round(seatSearch.runtimeMs, 1),
      coarseCount: seatSearch.coarseCount,
      refineCount: seatSearch.refineCount,
      bestOffsetMm: round(seatSearch.best.offsetM * 1000, 0),
      proxyTop: seatSearch.top,
      fixedPriorTuning: movedFixed,
      retuned: movedRetuned,
      retuneSearchMs: round(movedPolaritySearch.runtimeMs, 1),
    },
    allPass: {
      seed: seatWinner.name,
      searchRuntimeMs: round(allPassSearch.runtimeMs, 1),
      settings: allPassSearch.settings,
      proxy: allPassSearch.proxy,
      authoritative: allPass,
    },
    selection: {
      rule: "maximise weaker P19/P20 grade, then minimise P19+P20 raw deviation; no authority changes",
      ranked: finalCandidates.map((entry) => ({
        name: entry.name,
        offsetMm: round((entry.offsetM || 0) * 1000, 0),
        allPass: entry.allPass || null,
        p14: entry.result.p14,
        p18: entry.result.p18,
        p19: entry.result.p19,
        p20: entry.result.p20,
      })),
      winner: {
        name: finalBest.name,
        offsetMm: round((finalBest.offsetM || 0) * 1000, 0),
        allPass: finalBest.allPass || null,
        result: finalBest.result,
      },
    },
    timings: {
      totalHarnessMs: null,
      placementSearchMs: round(stage1RuntimeMs, 1),
      placementCanonicalMs: stage1PlacementResult.runtimeMs,
      delayTrimSearchMs: round(stage1TuningSearch.runtimeMs, 1),
      polaritySearchMs: round(polaritySearch.runtimeMs, 1),
      seatBlockSearchMs: round(seatSearch.runtimeMs, 1),
      movedRetuneSearchMs: round(movedPolaritySearch.runtimeMs, 1),
      allPassSearchMs: round(allPassSearch.runtimeMs, 1),
      canonicalConfirmations: [
        current, trusted, stage1PlacementResult, stage1TunedResult,
        polarityAlone, polarityDelay, polarityDelayTrim,
        movedFixed, movedRetuned, allPass,
      ].map((entry) => ({ label: entry.label, runtimeMs: entry.runtimeMs })),
    },
  };

  output.timings.totalHarnessMs = round(
    currentPlacement.runtimeMs + trustedPlacement.runtimeMs
    + stage1RuntimeMs + stage1Placement.runtimeMs
    + stage1TuningSearch.runtimeMs + polaritySearch.runtimeMs
    + seatSearch.runtimeMs + movedPolaritySearch.runtimeMs
    + allPassSearch.runtimeMs
    + output.timings.canonicalConfirmations.reduce((sum, entry) => sum + Number(entry.runtimeMs || 0), 0),
    1,
  );

  const outputDir = "experiments/improve-bass-v2";
  mkdirSync(outputDir, { recursive: true });
  const path = outputDir + "/room-" + roomKey.toLowerCase() + "-q" + quantity + ".json";
  writeFileSync(path, JSON.stringify(output, null, 2));
  console.log("RESULT " + path);
  console.log(JSON.stringify({
    room: room.name,
    quantity,
    current: { p19: current.p19, p20: current.p20 },
    winner: output.selection.winner,
    seatBestOffsetMm: output.seating.bestOffsetMm,
    polarity: output.polarity.authoritative,
    allPass: output.allPass.authoritative,
    timings: output.timings,
  }, null, 2));
} finally {
  await server.close();
}
