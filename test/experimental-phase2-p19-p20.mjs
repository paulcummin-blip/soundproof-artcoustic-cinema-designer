// Non-production experimental harness for the Sound Proof Phase 2 P19/P20 audit.
// It is intentionally isolated from src/ and loads the unchanged app modules through Vite SSR.

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const roomArg = String(process.argv[2] || "B").toUpperCase();
const OUTPUT_DIR = "experiments/phase2-p19-p20/results";
const MODEL_KEY = "SUB2-12";
const TARGET_DB = 112;
const TARGET_LEVEL = 2;
const SOURCE_Z_M = 0.35;
const SEAT_Z_M = 1.2;
const DELAY_MIN_MS = 0;
const DELAY_MAX_MS = 20;
const TRIM_MIN_DB = -12;
const TRIM_MAX_DB = 0;
const EFFECTIVE_MUTE_DB = -40;
const SEARCH_PPO = 16;
const CABINET = Object.freeze({ widthM: 0.5, depthM: 0.255, minSeparationM: 0.6 });

const ROOMS = Object.freeze({
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
  },
});

if (!ROOMS[roomArg]) throw new Error(`Expected room B or C, got ${roomArg}`);
const room = ROOMS[roomArg];

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [engineMod, coreMod, curvesMod, physicsMod, optimiserMod, authorityMod, useAuthorityMod, layoutMod, alignMod] = await Promise.all([
    server.ssrLoadModule("/src/components/room/bass/authoritativeBassResponseEngine.js"),
    server.ssrLoadModule("/src/bass/core/rewBassEngine.js"),
    server.ssrLoadModule("/src/components/room/bass/rewSourceCurves.js"),
    server.ssrLoadModule("/src/components/room/bass/normalizedPhysicsOptionsBuilder.js"),
    server.ssrLoadModule("/src/components/utils/bassOperatingEnvelopeOptimiser.js"),
    server.ssrLoadModule("/src/components/utils/bassAuthoritativeAssessment.js"),
    server.ssrLoadModule("/src/components/room/bass/useAuthoritativeBassResponse.js"),
    server.ssrLoadModule("/src/components/room/bass/best-layout/bestSubLayoutEngine.js"),
    server.ssrLoadModule("/src/components/room/bass/alignSubsToRSP.jsx"),
  ]);

  const { simulateAuthoritativeBassResponse } = engineMod;
  const { simulateBassResponseRewCore, prepareModeBank } = coreMod;
  const { REW_SOURCE_CURVES } = curvesMod;
  const { buildNormalizedPhysicsOptions } = physicsMod;
  const { generateCandidatePool, selectCandidateFromPool } = optimiserMod;
  const { computeOfficialP19Assessment, computeOfficialP20Assessment } = authorityMod;
  const { buildAuthoritativeResponseCurves } = useAuthorityMod;
  const { runBestSubLayoutRecommendation } = layoutMod;
  const { alignSubsToRSP } = alignMod;

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

  const transitionHz = 2000 * Math.sqrt(0.4 / (room.roomDims.widthM * room.roomDims.lengthM * room.roomDims.heightM));
  const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const finite = (value) => Number.isFinite(Number(value));
  const positionKey = (p) => `${round(p.x, 4)}:${round(p.y, 4)}:${round(p.z ?? SOURCE_Z_M, 4)}`;
  const tuningKey = (t) => `${t.delaysMs.map((v) => round(v, 3)).join(",")}|${t.gainsDb.map((v) => round(v, 3)).join(",")}`;
  const configKey = (c) => `${c.sources.map(positionKey).join("|")}|${tuningKey(c.tuning)}`;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const halton = (index, base) => {
    let result = 0;
    let fraction = 1 / base;
    let i = index;
    while (i > 0) {
      result += fraction * (i % base);
      i = Math.floor(i / base);
      fraction /= base;
    }
    return result;
  };
  const dedupe = (items, keyFn) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const placementFor = (p) => {
    const { widthM: w, lengthM: l } = room.roomDims;
    const distances = [
      [p.y, "front"], [l - p.y, "rear"], [p.x, "left"], [w - p.x, "right"],
    ].sort((a, b) => a[0] - b[0]);
    return distances[0][0] <= 0.35 ? distances[0][1] : "free";
  };
  const makePosition = (x, y) => ({ x: round(x, 4), y: round(y, 4), z: SOURCE_Z_M, placement: placementFor({ x, y }) });
  const makeLayout = (id, searchType, tier, sources) => ({ id, searchType, practicalTier: tier, sources });
  const validLayout = (sources) => sources.every((source, index) => sources.slice(index + 1).every((other) => distance(source, other) >= CABINET.minSeparationM));

  function buildPositionGrid() {
    const { widthM: w, lengthM: l } = room.roomDims;
    const halfW = CABINET.widthM / 2;
    const halfD = CABINET.depthM / 2;
    const x = [0, 0.14, 0.30, 0.50, 0.70, 0.86, 1].map((f) => halfW + f * (w - 2 * halfW));
    const y = [0, 0.12, 0.28, 0.50, 0.72, 0.88, 1].map((f) => halfD + f * (l - 2 * halfD));
    return { x, y, all: x.flatMap((px) => y.map((py) => makePosition(px, py))) };
  }

  function sampleCombinations(pool, quantity, count, startIndex = 1) {
    const layouts = [];
    const primes = [2, 3, 5, 7, 11, 13];
    let attempt = 0;
    while (layouts.length < count && attempt < count * 30) {
      attempt += 1;
      const picked = [];
      for (let i = 0; i < quantity; i += 1) {
        const raw = Math.floor(halton(startIndex + attempt, primes[i]) * pool.length);
        let index = raw;
        for (let guard = 0; guard < pool.length; guard += 1) {
          const candidate = pool[index % pool.length];
          if (!picked.some((existing) => positionKey(existing) === positionKey(candidate))) {
            picked.push(candidate);
            break;
          }
          index += 1;
        }
      }
      if (picked.length === quantity && validLayout(picked)) layouts.push(picked);
    }
    return dedupe(layouts, (sources) => sources.map(positionKey).sort().join("|"));
  }

  function buildExperimentalLayouts(quantity) {
    const grid = buildPositionGrid();
    const frontRear = grid.all.filter((p) => p.placement === "front" || p.placement === "rear");
    const side = grid.all.filter((p) => p.placement === "left" || p.placement === "right");
    const layouts = [];
    if (quantity === 1) {
      frontRear.forEach((sources, i) => layouts.push(makeLayout(`practical-1-${i}`, "practical-front-rear", 1, [sources])));
      side.forEach((sources, i) => layouts.push(makeLayout(`boundary-1-${i}`, "other-boundary", 3, [sources])));
      grid.all.forEach((sources, i) => layouts.push(makeLayout(`free-1-${i}`, "unrestricted", 4, [sources])));
    } else {
      sampleCombinations(frontRear, quantity, quantity === 2 ? 100 : 140, 17 + quantity)
        .forEach((sources, i) => layouts.push(makeLayout(`practical-${quantity}-${i}`, "practical-front-rear", 2, sources)));
      sampleCombinations(side, quantity, quantity === 2 ? 55 : 75, 71 + quantity)
        .forEach((sources, i) => layouts.push(makeLayout(`boundary-${quantity}-${i}`, "other-boundary", 3, sources)));
      sampleCombinations(grid.all, quantity, quantity === 2 ? 180 : 260, 131 + quantity)
        .forEach((sources, i) => layouts.push(makeLayout(`free-${quantity}-${i}`, "unrestricted", 4, sources)));
    }
    return dedupe(layouts, (layout) => layout.sources.map(positionKey).sort().join("|"));
  }

  const listeners = [room.rspPosition, ...room.seatingPositions];
  const grid = buildPositionGrid();
  const searchPhysics = {
    ...buildNormalizedPhysicsOptions(PHYSICS),
    freqMinHz: 15,
    freqMaxHz: 200,
    smoothing: "none",
    pointsPerOctave: SEARCH_PPO,
  };
  const preparedModes = prepareModeBank(room.roomDims, searchPhysics);
  const flatCurve = REW_SOURCE_CURVES.flat_rew_reference;
  const fieldCache = new Map();
  let searchFrequencies = null;
  const fieldStarted = performance.now();

  function computeField(position) {
    const key = positionKey(position);
    if (fieldCache.has(key)) return fieldCache.get(key);
    const source = { id: `field-${key}`, ...position, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
    const byListener = listeners.map((listener) => {
      const result = simulateBassResponseRewCore(room.roomDims, listener, source, flatCurve, { ...searchPhysics, precomputedModes: preparedModes });
      if (!searchFrequencies) searchFrequencies = result.freqsHz;
      return result.complexPressure.map((point) => ({ re: point.re, im: point.im }));
    });
    fieldCache.set(key, byListener);
    return byListener;
  }

  grid.all.forEach(computeField);
  console.log(`[${room.name}] cached ${fieldCache.size} position fields in ${round(performance.now() - fieldStarted, 0)} ms`);

  const band30 = () => searchFrequencies.map((f, i) => (f >= 30 && f <= 60 ? i : -1)).filter((i) => i >= 0);
  const fullBand = () => searchFrequencies.map((f, i) => (f >= 20 && f <= transitionHz ? i : -1)).filter((i) => i >= 0);
  const BAND_30_60 = band30();
  const BAND_FULL = fullBand();

  function normaliseTuning(delaysMs, gainsDb) {
    const finiteDelays = delaysMs.map((value) => clamp(finite(value) ? Number(value) : 0, DELAY_MIN_MS, DELAY_MAX_MS));
    const minDelay = Math.min(...finiteDelays);
    const normalizedDelays = finiteDelays.map((value) => round(clamp(value - minDelay, DELAY_MIN_MS, DELAY_MAX_MS), 3));
    const rawGains = gainsDb.map((value) => finite(value) ? Number(value) : 0);
    const audible = rawGains.filter((value) => value > EFFECTIVE_MUTE_DB + 1);
    const gainAnchor = audible.length ? Math.max(...audible) : 0;
    const normalizedGains = rawGains.map((value) => value <= EFFECTIVE_MUTE_DB + 1 ? EFFECTIVE_MUTE_DB : round(clamp(value - gainAnchor, TRIM_MIN_DB, TRIM_MAX_DB), 3));
    return { delaysMs: normalizedDelays, gainsDb: normalizedGains };
  }

  function smoothPower(values) {
    return values.map((_, index) => {
      const points = values.slice(Math.max(0, index - 1), index + 2).filter(finite);
      return points.length ? 10 * Math.log10(mean(points.map((value) => Math.pow(10, value / 10)))) : null;
    });
  }

  function shapeDeviation(values, indices) {
    const points = indices.map((index) => ({ x: Math.log2(searchFrequencies[index]), y: values[index] })).filter((p) => finite(p.y));
    if (points.length < 2) return Infinity;
    const mx = mean(points.map((p) => p.x));
    const my = mean(points.map((p) => p.y));
    const den = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
    const slope = den > 0 ? points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / den : 0;
    return Math.max(...points.map((p) => Math.abs(p.y - (my + slope * (p.x - mx)))));
  }

  function broadNullSeverity(values, indices) {
    const local = indices.map((index) => values[index]);
    const depths = local.map((value, i) => {
      const shoulder = local.slice(Math.max(0, i - 4), Math.max(0, i - 1)).concat(local.slice(i + 2, i + 5)).filter(finite);
      return shoulder.length >= 2 ? Math.max(0, mean(shoulder) - value) : 0;
    });
    let best = 0;
    let group = [];
    const flush = () => {
      if (group.length >= 2) best = Math.max(best, Math.max(...group));
      group = [];
    };
    depths.forEach((depth) => { if (depth >= 2) group.push(depth); else flush(); });
    flush();
    return best;
  }

  function combine(layout, tuning) {
    const normalized = normaliseTuning(tuning.delaysMs, tuning.gainsDb);
    const fields = layout.sources.map(computeField);
    const curves = listeners.map((_, listenerIndex) => {
      const db = searchFrequencies.map((frequency, fi) => {
        let re = 0;
        let im = 0;
        fields.forEach((field, sourceIndex) => {
          const base = field[listenerIndex][fi];
          const amplitude = Math.pow(10, normalized.gainsDb[sourceIndex] / 20);
          const phase = -2 * Math.PI * frequency * normalized.delaysMs[sourceIndex] / 1000;
          const c = Math.cos(phase);
          const s = Math.sin(phase);
          re += amplitude * (base.re * c - base.im * s);
          im += amplitude * (base.re * s + base.im * c);
        });
        return 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-10));
      });
      return smoothPower(db);
    });
    return { curves, tuning: normalized };
  }

  function maxSeatDifference(curves, seatIndices, bandIndices) {
    let worst = 0;
    let worstSeat = null;
    let worstFrequencyHz = null;
    seatIndices.forEach((listenerIndex) => {
      bandIndices.forEach((fi) => {
        const diff = Math.abs(curves[listenerIndex][fi] - curves[0][fi]);
        if (diff > worst) {
          worst = diff;
          worstSeat = listeners[listenerIndex].id;
          worstFrequencyHz = searchFrequencies[fi];
        }
      });
    });
    return { value: worst, worstSeat, worstFrequencyHz };
  }

  function assess(layout, tuning) {
    const combined = combine(layout, tuning);
    const primaryIndices = room.seatingPositions.map((seat, index) => seat.isPrimary ? index + 1 : -1).filter((index) => index >= 0);
    const allSeatIndices = room.seatingPositions.map((_, index) => index + 1);
    const rsp = combined.curves[0];
    const primaryNullDb = Math.max(...primaryIndices.map((index) => broadNullSeverity(combined.curves[index], BAND_30_60)));
    const p20Primary = maxSeatDifference(combined.curves, primaryIndices, BAND_30_60);
    const p20All = maxSeatDifference(combined.curves, allSeatIndices, BAND_30_60);
    const p20Full = maxSeatDifference(combined.curves, allSeatIndices, BAND_FULL);
    const metrics = {
      rspBroadNullDb: broadNullSeverity(rsp, BAND_30_60),
      primaryBroadNullDb: primaryNullDb,
      rsp30To60ShapeDeviationDb: shapeDeviation(rsp, BAND_30_60),
      primary30To60VariationDb: p20Primary.value,
      allSeat30To60VariationDb: p20All.value,
      fullBandVariationDb: p20Full.value,
      worst30To60Seat: p20All.worstSeat,
      worst30To60FrequencyHz: p20All.worstFrequencyHz,
      worstFullBandSeat: p20Full.worstSeat,
      worstFullBandFrequencyHz: p20Full.worstFrequencyHz,
    };
    const score = metrics.rspBroadNullDb * 500
      + metrics.primaryBroadNullDb * 240
      + metrics.rsp30To60ShapeDeviationDb * 100
      + metrics.primary30To60VariationDb * 55
      + metrics.allSeat30To60VariationDb * 35
      + metrics.fullBandVariationDb * 5;
    return { layout, tuning: combined.tuning, metrics, score };
  }

  function geometricTuning(layout) {
    const sources = layout.sources.map((source, index) => ({ id: `geo-${index}`, ...source, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }));
    const aligned = alignSubsToRSP(sources, room.rspPosition);
    return normaliseTuning(aligned.map((source) => Number(source.tuning.delayMs) || 0), sources.map(() => 0));
  }

  function improveCoordinates(layout, seed, mode) {
    let best = assess(layout, seed);
    const delaySteps = [2, 1, 0.25];
    for (const step of delaySteps) {
      let changed = true;
      let loops = 0;
      while (changed && loops < 3) {
        changed = false;
        loops += 1;
        for (let i = 0; i < layout.sources.length; i += 1) {
          for (const delta of [-step, step]) {
            const delays = [...best.tuning.delaysMs];
            delays[i] = clamp(delays[i] + delta, DELAY_MIN_MS, DELAY_MAX_MS);
            const candidate = assess(layout, normaliseTuning(delays, best.tuning.gainsDb));
            if (candidate.score < best.score - 1e-7) { best = candidate; changed = true; }
          }
        }
      }
    }
    if (mode === "level-delay") {
      for (const step of [3, 1, 0.25]) {
        let changed = true;
        let loops = 0;
        while (changed && loops < 3) {
          changed = false;
          loops += 1;
          for (let i = 0; i < layout.sources.length; i += 1) {
            const options = [best.tuning.gainsDb[i] - step, best.tuning.gainsDb[i] + step, EFFECTIVE_MUTE_DB];
            for (const value of options) {
              const gains = [...best.tuning.gainsDb];
              gains[i] = value;
              const candidate = assess(layout, normaliseTuning(best.tuning.delaysMs, gains));
              if (candidate.score < best.score - 1e-7) { best = candidate; changed = true; }
            }
          }
        }
      }
    }
    return best;
  }

  function optimise(layout, mode) {
    if (layout.sources.length === 1) return assess(layout, { delaysMs: [0], gainsDb: [0] });
    const quantity = layout.sources.length;
    const seeds = [
      { delaysMs: Array(quantity).fill(0), gainsDb: Array(quantity).fill(0) },
      geometricTuning(layout),
    ];
    const sampleCount = mode === "delay" ? (quantity === 2 ? 50 : 110) : (quantity === 2 ? 110 : 240);
    const primes = [2, 3, 5, 7, 11, 13, 17, 19];
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      const delays = Array.from({ length: quantity }, (_, i) => round(halton(sample + 19, primes[i]) * DELAY_MAX_MS * 2) / 2);
      const gains = mode === "level-delay"
        ? Array.from({ length: quantity }, (_, i) => {
            const h = halton(sample + 37, primes[i + quantity]);
            if (h < 0.06) return EFFECTIVE_MUTE_DB;
            return round((TRIM_MIN_DB + h * (TRIM_MAX_DB - TRIM_MIN_DB)) * 2) / 2;
          })
        : Array(quantity).fill(0);
      seeds.push(normaliseTuning(delays, gains));
    }
    const ranked = seeds.map((seed) => assess(layout, seed)).sort((a, b) => a.score - b.score).slice(0, 4);
    return ranked.map((entry) => improveCoordinates(layout, entry.tuning, mode)).sort((a, b) => a.score - b.score)[0];
  }

  function retainBroadFinalists(rows, limit) {
    const metricNames = ["rspBroadNullDb", "primaryBroadNullDb", "rsp30To60ShapeDeviationDb", "primary30To60VariationDb", "allSeat30To60VariationDb", "fullBandVariationDb"];
    const pareto = rows.filter((row, index) => !rows.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const noWorse = metricNames.every((key) => other.metrics[key] <= row.metrics[key] + 1e-9);
      const better = metricNames.some((key) => other.metrics[key] < row.metrics[key] - 1e-9);
      return noWorse && better;
    }));
    const extras = metricNames.flatMap((key) => [...rows].sort((a, b) => a.metrics[key] - b.metrics[key]).slice(0, 4));
    const retained = dedupe([...pareto, ...extras, ...[...rows].sort((a, b) => a.score - b.score).slice(0, limit)], (row) => row.layout.id)
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.max(limit, Math.min(pareto.length, limit + 12)));
    return { paretoCount: pareto.length, retained };
  }

  const productionPreview = runBestSubLayoutRecommendation({
    roomDims: room.roomDims,
    seatingPositions: room.seatingPositions,
    rspPosition: room.rspPosition,
    physicsOptions: buildNormalizedPhysicsOptions(PHYSICS),
    sourceHeights: { front: SOURCE_Z_M, rear: SOURCE_Z_M },
    roomElements: [],
    currentSubs: [],
    cabinetHalfExtents: { halfWidthM: CABINET.widthM / 2, halfDepthM: CABINET.depthM / 2 },
  });

  const productionByQuantity = Object.fromEntries([1, 2, 4].map((quantity) => {
    const found = productionPreview.allCandidates.find((candidate) => candidate.sources.length === quantity);
    const sources = found.sources.map((source) => ({ ...source, z: SOURCE_Z_M }));
    const tuning = normaliseTuning(sources.map((source) => Number(source.tuning?.delayMs) || 0), sources.map(() => 0));
    return [quantity, { layout: makeLayout(`production-${quantity}`, "current-production", found.practicalTier ?? 1, sources), tuning, previewMetrics: found.metrics }];
  }));

  const searchResults = {};
  let nestedBest = null;
  for (const quantity of [1, 2, 4]) {
    const layouts = buildExperimentalLayouts(quantity);
    const zeroRows = layouts.map((layout) => assess(layout, { delaysMs: Array(quantity).fill(0), gainsDb: Array(quantity).fill(0) }));
    const practicalRows = zeroRows.filter((row) => row.layout.practicalTier <= 2);
    const practicalRetained = retainBroadFinalists(practicalRows, quantity === 1 ? 18 : quantity === 2 ? 26 : 32);
    const unrestrictedRetained = retainBroadFinalists(zeroRows, quantity === 1 ? 26 : quantity === 2 ? 36 : 44);
    const practicalPlacement = [...practicalRows].sort((a, b) => a.score - b.score)[0];
    const practicalDelay = practicalRetained.retained.map((row) => optimise(row.layout, "delay")).sort((a, b) => a.score - b.score)[0];
    let practicalLevelDelay = practicalRetained.retained.map((row) => optimise(row.layout, "level-delay")).sort((a, b) => a.score - b.score)[0];
    let unrestrictedLevelDelay = unrestrictedRetained.retained.map((row) => optimise(row.layout, "level-delay")).sort((a, b) => a.score - b.score)[0];

    if (quantity === 2 && nestedBest) {
      const spare = grid.all.find((p) => nestedBest.layout.sources.every((source) => distance(source, p) >= CABINET.minSeparationM));
      if (spare) {
        const embeddedLayout = makeLayout("embedded-1-in-2", "nested-control", 4, [...nestedBest.layout.sources, spare]);
        const embedded = assess(embeddedLayout, normaliseTuning([...nestedBest.tuning.delaysMs, 0], [...nestedBest.tuning.gainsDb, EFFECTIVE_MUTE_DB]));
        if (embedded.score < unrestrictedLevelDelay.score) unrestrictedLevelDelay = embedded;
      }
    }
    if (quantity === 4 && nestedBest) {
      const spare = grid.all.filter((p) => nestedBest.layout.sources.every((source) => distance(source, p) >= CABINET.minSeparationM));
      const extras = sampleCombinations(spare, 2, 1, 991)[0];
      if (extras?.length === 2 && validLayout([...nestedBest.layout.sources, ...extras])) {
        const embeddedLayout = makeLayout("embedded-2-in-4", "nested-control", 4, [...nestedBest.layout.sources, ...extras]);
        const embedded = assess(embeddedLayout, normaliseTuning([...nestedBest.tuning.delaysMs, 0, 0], [...nestedBest.tuning.gainsDb, EFFECTIVE_MUTE_DB, EFFECTIVE_MUTE_DB]));
        if (embedded.score < unrestrictedLevelDelay.score) unrestrictedLevelDelay = embedded;
      }
    }
    nestedBest = unrestrictedLevelDelay;
    searchResults[quantity] = {
      layoutsGenerated: layouts.length,
      practicalParetoCount: practicalRetained.paretoCount,
      practicalFinalistsTuned: practicalRetained.retained.length,
      unrestrictedParetoCount: unrestrictedRetained.paretoCount,
      unrestrictedFinalistsTuned: unrestrictedRetained.retained.length,
      practicalPlacement,
      practicalDelay,
      practicalLevelDelay,
      unrestrictedLevelDelay,
    };
    console.log(`[${room.name}] q${quantity}: ${layouts.length} layouts, practical Pareto ${practicalRetained.paretoCount}, unrestricted Pareto ${unrestrictedRetained.paretoCount}`);
  }

  function asConfig(quantity, comparison, entry) {
    return {
      quantity,
      comparison,
      searchType: entry.layout.searchType,
      practicalityTier: entry.layout.practicalTier,
      sources: entry.layout.sources,
      tuning: entry.tuning,
      searchMetrics: entry.metrics || entry.previewMetrics || null,
      searchScore: entry.score ?? null,
    };
  }

  const requestedConfigs = [];
  for (const quantity of [1, 2, 4]) {
    requestedConfigs.push(asConfig(quantity, "current production", productionByQuantity[quantity]));
    requestedConfigs.push(asConfig(quantity, "practical placement only", searchResults[quantity].practicalPlacement));
    requestedConfigs.push(asConfig(quantity, "practical + optimised delay", searchResults[quantity].practicalDelay));
    requestedConfigs.push(asConfig(quantity, "practical + optimised level/delay", searchResults[quantity].practicalLevelDelay));
    requestedConfigs.push(asConfig(quantity, "unrestricted + optimised level/delay", searchResults[quantity].unrestrictedLevelDelay));
  }

  function makeSources(config) {
    return config.sources.map((position, index) => ({
      id: `${room.id}-q${config.quantity}-sub-${index + 1}`,
      modelKey: MODEL_KEY,
      subwooferAmplifierPowerW: 1000,
      x: position.x,
      y: position.y,
      z: position.z,
      placement: position.placement,
      enabled: config.tuning.gainsDb[index] > EFFECTIVE_MUTE_DB + 1,
      tuning: {
        gainDb: config.tuning.gainsDb[index],
        delayMs: config.tuning.delaysMs[index],
        polarity: 0,
        requestedOutputDb: TARGET_DB,
      },
    }));
  }

  const evaluationCache = new Map();
  async function evaluateFinal(config) {
    const key = configKey(config);
    if (evaluationCache.has(key)) return evaluationCache.get(key);
    const sources = makeSources(config);
    const simStarted = performance.now();
    const simulation = simulateAuthoritativeBassResponse({
      roomDims: room.roomDims,
      seatingPositions: room.seatingPositions,
      rspPosition: room.rspPosition,
      sources,
      physics: PHYSICS,
      qStrategyOverride: "ab_corrected",
    });
    const simulationMs = performance.now() - simStarted;
    const curves = buildAuthoritativeResponseCurves(simulation.seatResponses);
    const primaryIds = new Set(room.seatingPositions.filter((seat) => seat.isPrimary).map((seat) => seat.id));
    const perSeatRawCurves = curves.perSeatRawCurves.map((seat) => ({ ...seat, isPrimary: primaryIds.has(seat.seatId) }));
    const eqStarted = performance.now();
    const pool = generateCandidatePool({
      rawCurve: curves.rspRawCurve,
      perSeatRawCurves,
      activeSubs: sources,
      usableLfHz: 22,
      transitionHz,
      correctionEndHz: 200,
      perSourceComplexTransfers: simulation.perSourceRspComplexTransfers,
      normalizedTransferFingerprint: `experiment:${room.id}:${key}`,
      calibrationFingerprint: `experiment:${room.id}:${key}`,
      selectedP14TargetDb: TARGET_DB,
      p14TargetBasis: "minimum",
      p14TargetLevel: TARGET_LEVEL,
      p18TargetBasis: "minimum",
      collectDiagnostics: false,
    });
    const selected = selectCandidateFromPool(pool).selectedCandidate;
    const optimiserMs = performance.now() - eqStarted;
    if (!selected) throw new Error(`No selected production candidate for ${config.comparison} q${config.quantity}`);
    const diagnosticP19 = computeOfficialP19Assessment({
      rspPostEqCurve: selected.finalPostEqCurve,
      canonicalTargetCurve: selected.productionHouseCurveTarget,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const diagnosticP20 = computeOfficialP20Assessment({
      rspPostEqCurve: selected.finalPostEqCurve,
      perSeatPostEqCurves: selected.perSeatPostEqCurves,
      assessmentStartHz: 30,
      assessmentEndHz: 60,
    });
    const result = {
      sources,
      candidateId: selected.candidateId,
      timingsMs: { authoritativeSimulation: round(simulationMs, 1), optimiserAndCommonEq: round(optimiserMs, 1), total: round(simulationMs + optimiserMs, 1) },
      p14: { db: selected.achievedP14Db ?? null, level: selected.achievedP14Level ?? null },
      p18: { cutoffHz: selected.achievedP18FrequencyHz ?? null, level: selected.achievedP18Level ?? null },
      p19: { rawDb: selected.achievedP19VariationDb ?? null, level: selected.achievedP19Level ?? null, worstFrequencyHz: selected.officialP19WorstFrequencyHz ?? null },
      p20: { rawDb: selected.achievedP20VariationDb ?? null, level: selected.achievedP20Level ?? null, worstSeat: selected.worstP20SeatId ?? null, worstFrequencyHz: selected.perSeatP20Results?.find((seat) => seat.seatId === selected.worstP20SeatId)?.worstFrequencyHz ?? null },
      diagnostic30To60: {
        p19RawDb: diagnosticP19.variationDbRaw,
        p19Level: diagnosticP19.level,
        p19WorstFrequencyHz: diagnosticP19.worstFrequencyHz,
        p20RawDb: diagnosticP20.worstSeat?.variationDbRaw ?? null,
        p20Level: diagnosticP20.worstSeat?.level ?? null,
        p20WorstSeat: diagnosticP20.worstSeat?.seatId ?? null,
        p20WorstFrequencyHz: diagnosticP20.worstSeat?.worstFrequencyHz ?? null,
      },
      commonEqFilters: (selected.generatedFilterBank || []).filter((filter) => filter.enabled).map((filter) => ({ frequencyHz: filter.frequencyHz, gainDb: filter.gainDb, q: filter.q ?? filter.Q })),
      assessmentBandHz: [selected.assessmentStartHz, selected.assessmentEndHz],
      rawUnsmoothed: { rsp: curves.rspRawCurve, seats: perSeatRawCurves },
      postEq: { rsp: selected.finalPostEqCurve, seats: selected.perSeatPostEqCurves },
    };
    evaluationCache.set(key, result);
    console.log(`[${room.name}] final q${config.quantity} ${config.comparison}: P19 ${round(result.p19.rawDb, 2)} dB L${result.p19.level}; P20 ${round(result.p20.rawDb, 2)} dB L${result.p20.level}; ${round(result.timingsMs.total / 1000, 1)} s`);
    return result;
  }

  const finalRows = [];
  for (const config of requestedConfigs) {
    const final = await evaluateFinal(config);
    finalRows.push({ ...config, final });
  }

  const frontier = [1, 2, 4].map((quantity) => {
    const row = finalRows.find((item) => item.quantity === quantity && item.comparison === "unrestricted + optimised level/delay");
    return { quantity, p19RawDb: row.final.p19.rawDb, p20RawDb: row.final.p20.rawDb, minimumLevel: Math.min(row.final.p19.level ?? 0, row.final.p20.level ?? 0), configKey: configKey(row) };
  });
  const nonWorsening = frontier.every((entry, index) => index === 0 || (
    entry.minimumLevel >= frontier[index - 1].minimumLevel
    && entry.p20RawDb <= frontier[index - 1].p20RawDb + 0.05
  ));
  const result = {
    metadata: {
      experiment: "phase2-p19-p20-optimiser-prototype-v1",
      productionCodeModified: false,
      generatedAt: new Date().toISOString(),
      room,
      model: MODEL_KEY,
      target: { p14TargetBasis: "minimum", level: TARGET_LEVEL, splDbC: TARGET_DB },
      heightsM: { seatedEar: SEAT_Z_M, sourceAcousticCentre: SOURCE_Z_M },
      bounds: { delayMs: [DELAY_MIN_MS, DELAY_MAX_MS], relativeTrimDb: [TRIM_MIN_DB, TRIM_MAX_DB], effectiveMuteDb: EFFECTIVE_MUTE_DB },
      cabinet: CABINET,
      transitionHz,
      searchPointsPerOctave: SEARCH_PPO,
      finalPointsPerOctave: 96,
      officialFinalAuthority: "unchanged simulateAuthoritativeBassResponse -> generateCandidatePool -> selectCandidateFromPool",
      commonEqRule: "one selected production EQ bank applied identically to RSP and every real seat",
    },
    searchDiagnostics: {
      cachedPositionCount: fieldCache.size,
      cachedPositionTimeMs: round(performance.now() - fieldStarted, 1),
      byQuantity: Object.fromEntries(Object.entries(searchResults).map(([quantity, value]) => [quantity, {
        layoutsGenerated: value.layoutsGenerated,
        practicalParetoCount: value.practicalParetoCount,
        practicalFinalistsTuned: value.practicalFinalistsTuned,
        unrestrictedParetoCount: value.unrestrictedParetoCount,
        unrestrictedFinalistsTuned: value.unrestrictedFinalistsTuned,
      }])),
      objective: "RSP broad-null > primary broad-null > RSP 30-60 shape > primary 30-60 consistency > all-seat 30-60 consistency > official-band consistency; practicality evaluated after acoustic ranking",
    },
    productionPreview: {
      workerCalculationTimeMs: productionPreview.workerCalculationTimeMs,
      candidateCount: productionPreview.candidateCount,
      byQuantity: Object.fromEntries([1, 2, 4].map((quantity) => [quantity, productionByQuantity[quantity].previewMetrics])),
    },
    rows: finalRows,
    monotonicFrontier: { rows: frontier, nonWorsening },
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = `${OUTPUT_DIR}/${room.id}.json`;
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  const csvHeader = ["Quantity", "Search type", "Placement", "Levels", "Delays", "30-60 P19", "30-60 P20", "Official P18", "Official P19", "P19 grade", "Worst Hz", "Official P20", "P20 grade", "Worst seat", "Worst Hz", "Practicality", "Simulation ms", "Optimiser ms"];
  const csvRows = finalRows.map((row) => [
    row.quantity,
    row.comparison,
    row.sources.map((source) => `${round(source.x, 2)}/${round(source.y, 2)}/${round(source.z, 2)}`).join("; "),
    row.tuning.gainsDb.join("; "),
    row.tuning.delaysMs.join("; "),
    round(row.final.diagnostic30To60.p19RawDb, 3),
    round(row.final.diagnostic30To60.p20RawDb, 3),
    round(row.final.p18.cutoffHz, 3),
    round(row.final.p19.rawDb, 3),
    `L${row.final.p19.level}`,
    round(row.final.p19.worstFrequencyHz, 3),
    round(row.final.p20.rawDb, 3),
    `L${row.final.p20.level}`,
    row.final.p20.worstSeat,
    round(row.final.p20.worstFrequencyHz, 3),
    row.practicalityTier,
    row.final.timingsMs.authoritativeSimulation,
    row.final.timingsMs.optimiserAndCommonEq,
  ]);
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  writeFileSync(`${OUTPUT_DIR}/${room.id}.csv`, [csvHeader, ...csvRows].map((row) => row.map(escapeCsv).join(",")).join("\n"));
  console.log(JSON.stringify({ room: room.name, jsonPath, rows: finalRows.length, uniqueFinalEvaluations: evaluationCache.size, monotonicFrontier: result.monotonicFrontier }, null, 2));
} finally {
  await server.close();
}
