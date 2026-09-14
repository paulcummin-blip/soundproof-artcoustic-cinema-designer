/**
 * p19HeatMapEngine.js
 * -------------------
 * Canonical P19 spatial heat-map generation engine.
 *
 * Computes P19 response quality at each cell of a 30×30 room grid using the
 * SAME validated production authority:
 *   - exact canonical 360-point frequency grid (shared reference, zero drift)
 *   - canonical room field (batch modal evaluator, AB-corrected)
 *   - current subwoofer positions/models/polarity/delay/gain
 *   - current product limits / reserve (derated source curves)
 *   - fixed RSP-derived EQ (post-EQ − raw correction applied to every cell)
 *   - 1/3-octave smoothing (inside computeOfficialP19Assessment)
 *   - achieved P18 → transition assessment band
 *   - P19 half-span authority (residualSpan from house-curve shape)
 *
 * Does NOT touch P19/P20 maths, EQ, bass physics, or grading — it calls the
 * existing canonical assessment functions unchanged.
 */

import { evaluateBatchModalTransfers } from "@/bass/core/batchModalEvaluator";
import { buildFrequencyAxis } from "@/bass/core/rewCorePrimitives";
import { prepareModeBank } from "@/bass/core/rewBassEngine";
import {
  getPerSubwooferAmplifierAuthority,
  DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
} from "@/components/utils/subwooferCapability";
import { getSubwooferCurve, normaliseModelKey } from "@/components/models/speakers/registry";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "@/components/room/bass/bassPhysicsDefaults";
import { bassInputAdapter, deriveCentreZ } from "@/components/utils/subwooferInstanceMigration";
import { computeOfficialP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { resolveGradeToken } from "@/components/utils/rp22Colors";

export const HEATMAP_AUTHORITY_VERSION = 2;
export const DEFAULT_GRID_N = 30;

// ── Linear interpolation of a {frequency, spl} curve at a target frequency ──

function interpolateSpl(curve, frequency) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    const lo = curve[i];
    const hi = curve[i + 1];
    if (frequency >= lo.frequency && frequency <= hi.frequency) {
      const span = hi.frequency - lo.frequency;
      if (span === 0) return lo.spl;
      const ratio = (frequency - lo.frequency) / span;
      return lo.spl + (hi.spl - lo.spl) * ratio;
    }
  }
  return null;
}

// ── Build derated source curves (same logic as authoritativeBassResponseEngine) ──

function buildDeratedCurve(sub, sourceIndex, sources) {
  const subCurve = getSubwooferCurve(sub.modelKey);
  if (!Array.isArray(subCurve) || subCurve.length === 0) return subCurve;
  const amplifierAuthority = getPerSubwooferAmplifierAuthority(sources);
  const deratingDb = amplifierAuthority.sourceAuthorities[sourceIndex]?.deratingDb ?? 0;
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return subCurve;
  return subCurve.map((point) => {
    const spl = Number(point?.spl);
    const db = Number(point?.db);
    if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
    return { ...point };
  });
}

// ── Main engine ────────────────────────────────────────────────────────────

export function generateP19HeatMap({
  roomDims,
  subwooferInstances,
  rspPosition,
  rspPostEqCurve,
  assessmentStartHz = 20,
  assessmentEndHz = 120,
  earHeightM = 1.2,
  gridN = DEFAULT_GRID_N,
  seatPositions = [],
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;
  const z = Number.isFinite(Number(earHeightM)) ? Number(earHeightM) : 1.2;

  // 1. Build sources from subwoofer instances
  const rawSources = bassInputAdapter(subwooferInstances);
  if (!rawSources.length) {
    return { grid: [], gridN, earHeightM: z, assessmentStartHz, assessmentEndHz, error: "no_subwoofers" };
  }

  const sources = rawSources.map((s) => ({
    ...s,
    modelKey: normaliseModelKey(s.model),
    subwooferAmplifierPowerW: DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W,
  }));

  // 2. Build derated source curves
  const sourcesWithCurves = sources.map((src, si) => ({
    ...src,
    sourceCurve: buildDeratedCurve(src, si, sources),
  }));

  // 3. Canonical 360-point frequency array (exact reference, zero drift)
  const canonicalFreqsHz = buildFrequencyAxis(15, 200, undefined);

  // 4. Physics — AB-corrected product curve (same as production path)
  const physics = {
    ...BASS_NORMALIZED_PHYSICS_DEFAULTS,
    rewSourceCurveMode: "product",
    disableLateField: true,
    disableModalPropagationPhase: true,
  };

  // 5. Prepare mode bank (shared across all listeners)
  const precomputedModes = prepareModeBank({ widthM: W, lengthM: L, heightM: roomDims?.heightM || 2.4 }, {
    surfaceAbsorption: physics.surfaceAbsorption,
    freqMinHz: 15,
    freqMaxHz: 200,
    smoothing: "none",
    axialQ: physics.axialQ,
    qStrategy: "ab_corrected",
    abApplyModeMultiplicity: true,
    roomIsSealed: true,
    abMidbandQScale: 1,
    enableModes: true,
  });

  // 6. Build listeners: RSP + 30×30 grid
  const listeners = [];
  if (rspPosition && Number.isFinite(rspPosition.x) && Number.isFinite(rspPosition.y)) {
    listeners.push({ id: "rsp", x: rspPosition.x, y: rspPosition.y, z });
  }
  // Explicit seat probes — evaluated by the heat-map evaluator itself at the
  // exact saved seat coordinates. These are NOT copied from published grades.
  const seatListeners = [];
  for (const seat of (Array.isArray(seatPositions) ? seatPositions : [])) {
    if (!seat?.id || !Number.isFinite(Number(seat.x)) || !Number.isFinite(Number(seat.y))) continue;
    const listenerId = `seat-${seat.id}`;
    // Use the seat's individual Z (ear height) when available, matching the
    // production engine's coordinate convention so the heat-map probe P19
    // is computed at the exact same (x, y, z) as the published per-seat P19.
    const seatZ = Number.isFinite(Number(seat.z)) && Number(seat.z) > 0 ? Number(seat.z) : z;
    listeners.push({ id: listenerId, x: Number(seat.x), y: Number(seat.y), z: seatZ });
    seatListeners.push({ seatId: seat.id, listenerId });
  }
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const x = ((i + 0.5) / gridN) * W;
      const y = ((j + 0.5) / gridN) * L;
      listeners.push({ id: `grid-${i}-${j}`, x, y, z });
    }
  }

  // 7. Run batch evaluator (one call for all listeners)
  const batchResult = evaluateBatchModalTransfers({
    roomDims: { widthM: W, lengthM: L, heightM: roomDims?.heightM || 2.4 },
    sources: sourcesWithCurves,
    listeners,
    precomputedModes,
    physics,
    qStrategyOverride: "ab_corrected",
    precomputedFreqsHz: canonicalFreqsHz,
  });

  // 8. Sum per-source transfers → SPL curve per listener
  const freqsHz = batchResult.freqsHz;
  const byListener = {};
  for (const transfer of batchResult.perSourcePerListenerTransfers) {
    if (!byListener[transfer.listenerId]) byListener[transfer.listenerId] = [];
    byListener[transfer.listenerId].push(transfer);
  }

  const splCurves = {};
  for (const [seatId, transfers] of Object.entries(byListener)) {
    const sumRe = new Float64Array(freqsHz.length);
    const sumIm = new Float64Array(freqsHz.length);
    for (const transfer of transfers) {
      for (let fi = 0; fi < transfer.points.length; fi++) {
        sumRe[fi] += transfer.points[fi].re;
        sumIm[fi] += transfer.points[fi].im;
      }
    }
    splCurves[seatId] = freqsHz.map((f, i) => ({
      frequency: f,
      spl: 20 * Math.log10(Math.max(Math.hypot(sumRe[i], sumIm[i]), 1e-10)),
    }));
  }

  // 9. Fixed RSP-derived EQ correction
  const rspRaw = splCurves["rsp"];
  let eqCorrection = null;
  if (Array.isArray(rspPostEqCurve) && rspPostEqCurve.length > 0 && rspRaw && rspRaw.length > 0) {
    eqCorrection = freqsHz.map((f, i) => {
      const postEqSpl = interpolateSpl(rspPostEqCurve, f);
      if (!Number.isFinite(postEqSpl)) return 0;
      return postEqSpl - rspRaw[i].spl;
    });
  }

  // 10. Compute P19 at each grid cell
  const grid = [];
  for (let j = 0; j < gridN; j++) {
    const row = [];
    for (let i = 0; i < gridN; i++) {
      const seatId = `grid-${i}-${j}`;
      const rawCurve = splCurves[seatId];
      if (!rawCurve || !rawCurve.length) {
        row.push({ grade: "NA", variationDb: null });
        continue;
      }
      const postEqCurve = eqCorrection
        ? freqsHz.map((f, fi) => ({
            frequency: f,
            spl: rawCurve[fi].spl + eqCorrection[fi],
          }))
        : rawCurve;

      const p19 = computeOfficialP19Assessment({
        rspPostEqCurve: postEqCurve,
        canonicalTargetCurve: null,
        assessmentStartHz,
        assessmentEndHz,
      });

      const { key } = resolveGradeToken(p19.level);
      row.push({
        grade: key,
        variationDb: Number.isFinite(p19.variationDbRaw) ? p19.variationDbRaw : null,
      });
    }
    grid.push(row);
  }

  // 11. Compute P19 at each explicit seat probe (heat-map evaluator path)
  const seatProbes = seatListeners.map(({ seatId, listenerId }) => {
    const rawCurve = splCurves[listenerId];
    if (!rawCurve || !rawCurve.length) {
      return { seatId, p19Raw: null, p19Displayed: null, p19Level: null, p19Grade: null };
    }
    const postEqCurve = eqCorrection
      ? freqsHz.map((f, fi) => ({ frequency: f, spl: rawCurve[fi].spl + eqCorrection[fi] }))
      : rawCurve;
    const p19 = computeOfficialP19Assessment({
      rspPostEqCurve: postEqCurve,
      canonicalTargetCurve: null,
      assessmentStartHz,
      assessmentEndHz,
    });
    const { key } = resolveGradeToken(p19.level);
    return {
      seatId,
      p19Raw: Number.isFinite(p19.variationDbRaw) ? p19.variationDbRaw : null,
      p19Displayed: Number.isFinite(p19.displayVariationDb) ? p19.displayVariationDb : null,
      p19Level: p19.level,
      p19Grade: key,
    };
  });

  // 12. Compute P19 at the exact RSP coordinate (heat-map evaluator path)
  let rspProbe = { p19Raw: null, p19Displayed: null, p19Level: null, p19Grade: null };
  if (splCurves["rsp"]) {
    const rspRawCurve = splCurves["rsp"];
    const rspPostEq = eqCorrection
      ? freqsHz.map((f, fi) => ({ frequency: f, spl: rspRawCurve[fi].spl + eqCorrection[fi] }))
      : rspRawCurve;
    const p19 = computeOfficialP19Assessment({
      rspPostEqCurve: rspPostEq,
      canonicalTargetCurve: null,
      assessmentStartHz,
      assessmentEndHz,
    });
    const { key } = resolveGradeToken(p19.level);
    rspProbe = {
      p19Raw: Number.isFinite(p19.variationDbRaw) ? p19.variationDbRaw : null,
      p19Displayed: Number.isFinite(p19.displayVariationDb) ? p19.displayVariationDb : null,
      p19Level: p19.level,
      p19Grade: key,
    };
  }

  return { grid, gridN, earHeightM: z, assessmentStartHz, assessmentEndHz, seatProbes, rspProbe, error: null };
}

// ── Summary sentence builder (neutral, factual) ───────────────────────────

export function buildHeatMapSummary(grid, rspPosition, roomDims) {
  if (!Array.isArray(grid) || grid.length === 0) return null;
  const gridN = grid.length;
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  // Divide cells into central vs boundary regions
  let centralVariation = 0;
  let centralCount = 0;
  let boundaryVariation = 0;
  let boundaryCount = 0;

  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < grid[0]?.length || 0; i++) {
      const cell = grid[j]?.[i];
      if (!cell || cell.variationDb == null) continue;
      const x = ((i + 0.5) / gridN) * W;
      const y = ((j + 0.5) / gridN) * L;
      const distFromCenter = rspPosition
        ? Math.hypot(x - rspPosition.x, y - rspPosition.y)
        : Math.hypot(x - W / 2, y - L / 2);
      const maxDist = Math.hypot(W / 2, L / 2);
      if (distFromCenter < maxDist * 0.4) {
        centralVariation += cell.variationDb;
        centralCount++;
      } else {
        boundaryVariation += cell.variationDb;
        boundaryCount++;
      }
    }
  }

  if (centralCount === 0 || boundaryCount === 0) {
    return "Bass response varies across the listening area as shown above.";
  }

  const centralAvg = centralVariation / centralCount;
  const boundaryAvg = boundaryVariation / boundaryCount;

  if (centralAvg < boundaryAvg - 0.3) {
    return "Bass response is most consistent around the central listening area, with greater variation toward the room boundaries.";
  }
  if (boundaryAvg < centralAvg - 0.3) {
    return "Bass response is most consistent toward the room boundaries, with greater variation around the central listening area.";
  }
  return "Bass response remains broadly consistent across the listening area.";
}