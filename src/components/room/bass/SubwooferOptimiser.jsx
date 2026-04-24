import { BassResponseEngine } from '@/components/room/bass/BassResponseEngine';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

const engine = new BassResponseEngine();

const WALL_BUFFER_M = 0.01;
const FLOOR_BOTTOM_M = 0.10;
const WALL_BOTTOM_M = 0.80;
const DEFAULT_SEAT_Z = 1.2;
const DEFAULT_SUB_MODEL = 'SUB2-12';
const DEFAULT_SUB_HEIGHT_M = 0.5;
const DEFAULT_SUB_DEPTH_M = 0.255;

const USEFUL_QTY_BY_PLACEMENT_MODE = {
  quarter: 2,
  sixth: 2,
  corners: 2,
  midpoint: 1,
  asymmetric: 2,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getQuantityOptions(count, placementMode) {
  const explicit = Number(count);
  const maxUseful = USEFUL_QTY_BY_PLACEMENT_MODE[placementMode] || 4;
  const allowed = [1, 2, 3, 4].filter((qty) => qty <= maxUseful);
  if (Number.isFinite(explicit) && explicit > 0) {
    return [Math.min(explicit, maxUseful)];
  }
  return allowed;
}

function getModelHeightM(model, orientation) {
  const meta = getSpeakerModelMeta(model, orientation) || {};
  const heightM = Number(meta.heightM);
  return Number.isFinite(heightM) && heightM > 0 ? heightM : DEFAULT_SUB_HEIGHT_M;
}

function getSubDepthM(model, orientation) {
  const meta = getSpeakerModelMeta(model, orientation) || {};
  const depthM = Number(meta.depthM);
  return Number.isFinite(depthM) && depthM > 0 ? depthM : DEFAULT_SUB_DEPTH_M;
}

function getSubWidthM(model, orientation) {
  const meta = getSpeakerModelMeta(model, orientation) || {};
  const widthM = Number(meta.widthM);
  return Number.isFinite(widthM) && widthM > 0 ? widthM : 0.5;
}

function getZPosition(cfg) {
  const model = cfg?.model || DEFAULT_SUB_MODEL;
  const orientation = cfg?.orientation;
  const mountMode = cfg?.mountMode === 'wall' ? 'wall' : 'floor';
  const heightM = getModelHeightM(model, orientation);
  const bottom = mountMode === 'wall' ? WALL_BOTTOM_M : FLOOR_BOTTOM_M;
  return bottom + (heightM / 2);
}

function getWallY(group, roomLength, model, orientation) {
  const depthM = getSubDepthM(model, orientation);
  const halfDepth = depthM / 2;
  if (group === 'front') return halfDepth + WALL_BUFFER_M;
  return Math.max(halfDepth + WALL_BUFFER_M, roomLength - halfDepth - WALL_BUFFER_M);
}

function makePlacementXs({ qty, placementMode, roomWidth, model, orientation }) {
  if (qty <= 0) return [];
  const subWidth = getSubWidthM(model, orientation);
  const minX = WALL_BUFFER_M + subWidth / 2;
  const maxX = roomWidth - WALL_BUFFER_M - subWidth / 2;
  const left = minX;
  const right = maxX;

  if (placementMode === 'default') {
    if (qty === 1) return [roomWidth * 0.5];
    const margin = roomWidth * 0.15;
    const span = Math.max(0.01, roomWidth - margin * 2);
    return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1))).map((x) => clamp(x, minX, maxX));
  }

  const safeQty = Math.max(1, Math.min(qty, USEFUL_QTY_BY_PLACEMENT_MODE[placementMode] || 2));

  const patterns = {
    quarter: safeQty === 1
      ? [roomWidth * 0.5]
      : [roomWidth * 0.25, roomWidth * 0.75],
    corners: safeQty === 1
      ? [left]
      : [left, right],
    midpoint: [roomWidth * 0.5],
    sixth: safeQty === 1
      ? [roomWidth * 0.5]
      : [roomWidth / 6, roomWidth * 5 / 6],
    asymmetric: safeQty === 1
      ? [roomWidth * 0.38]
      : [roomWidth * 0.32, roomWidth * 0.78],
  };

  const selected = patterns[placementMode] || patterns.quarter;
  return selected.map((x) => clamp(x, minX, maxX));
}

function buildVirtualSubsForGroup({ cfg, group, qty, placementMode, roomDimensions }) {
  const roomWidth = Number(roomDimensions?.width) || Number(roomDimensions?.widthM) || 4.5;
  const roomLength = Number(roomDimensions?.length) || Number(roomDimensions?.lengthM) || 6.0;
  const model = cfg?.model || DEFAULT_SUB_MODEL;
  const orientation = cfg?.orientation;
  const z = getZPosition(cfg);
  const y = getWallY(group, roomLength, model, orientation);
  const xs = makePlacementXs({ qty, placementMode, roomWidth, model, orientation });
  const tuning = Array.isArray(cfg?.tuning) ? cfg.tuning : [];

  return xs.map((x, index) => ({
    position: { x, y, z },
    model,
    gainDb: Number.isFinite(Number(tuning[index]?.gainDb)) ? Number(tuning[index].gainDb) : 0,
    delay: Number.isFinite(Number(tuning[index]?.delayMs)) ? Number(tuning[index].delayMs) : 0,
    phaseAdjust: 0,
    polarity: Number(tuning[index]?.polarity) === 180 ? -1 : 1,
  }));
}

function getSeatPoint(seat) {
  return {
    x: Number(seat?.x ?? seat?.position?.x),
    y: Number(seat?.y ?? seat?.position?.y),
    z: Number.isFinite(Number(seat?.z ?? seat?.position?.z)) ? Number(seat?.z ?? seat?.position?.z) : DEFAULT_SEAT_Z,
  };
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function countNulls(responseData) {
  if (!Array.isArray(responseData) || responseData.length === 0) return 0;
  const spls = responseData.map((point) => Number(point?.spl)).filter(Number.isFinite);
  if (spls.length === 0) return 0;

  let nullCount = 0;
  for (let index = 0; index < spls.length; index += 1) {
    const left = spls[Math.max(0, index - 1)];
    const center = spls[index];
    const right = spls[Math.min(spls.length - 1, index + 1)];
    const localAverage = (left + center + right) / 3;
    if ((localAverage - center) > 10) {
      nullCount += 1;
    }
  }
  return nullCount;
}

function computeSeatVariance(seatResponses) {
  if (!Array.isArray(seatResponses) || seatResponses.length === 0) return 0;
  const responseLength = seatResponses[0]?.responseData?.length || 0;
  if (responseLength === 0) return 0;

  const perFrequencyDiffs = [];
  for (let index = 0; index < responseLength; index += 1) {
    const spls = seatResponses
      .map((seatResponse) => Number(seatResponse?.responseData?.[index]?.spl))
      .filter(Number.isFinite);
    if (spls.length === 0) continue;
    perFrequencyDiffs.push(Math.max(...spls) - Math.min(...spls));
  }

  return average(perFrequencyDiffs);
}

function buildSummary(candidate) {
  const wallText = candidate.wallConfig === 'front+rear'
    ? 'Front + Rear'
    : candidate.wallConfig === 'front'
      ? 'Front only'
      : 'Rear only';

  const placementMap = {
    quarter: '1/4 points',
    corners: 'corners',
    midpoint: 'midpoints',
    sixth: '1/6 points',
    asymmetric: 'asymmetric points',
  };

  return `${wallText} ${placementMap[candidate.placementMode] || candidate.placementMode} gives lowest seat variation and avoids major nulls`;
}

export function optimiseSubwooferLayout({
  roomDimensions,
  seats,
  frontSubsCfg,
  rearSubsCfg,
}) {
  const seatList = Array.isArray(seats) ? seats.map(getSeatPoint).filter((seat) => Number.isFinite(seat.x) && Number.isFinite(seat.y) && Number.isFinite(seat.z)) : [];
  if (seatList.length === 0) {
    const emptyResult = {
      bestLayout: null,
      score: null,
      summary: 'No seats available for optimisation',
    };
    console.log('[SubwooferOptimiser] No seats available', emptyResult);
    return emptyResult;
  }

  const placementModes = ['quarter', 'corners', 'midpoint', 'sixth', 'asymmetric'];
  const candidates = [];

  placementModes.forEach((placementMode) => {
    const frontQuantity = USEFUL_QTY_BY_PLACEMENT_MODE[placementMode] || 1;
    const rearQuantity = USEFUL_QTY_BY_PLACEMENT_MODE[placementMode] || 1;

    candidates.push({ placementMode, quantity: frontQuantity, wallConfig: 'front' });
    candidates.push({ placementMode, quantity: rearQuantity, wallConfig: 'rear' });
    candidates.push({
      placementMode,
      quantity: { front: frontQuantity, rear: rearQuantity },
      wallConfig: 'front+rear',
    });
  });

  const evaluated = candidates.map((candidate) => {
    let subwoofers = [];
    let actualQuantity = candidate.quantity;

    if (candidate.wallConfig === 'front') {
      subwoofers = buildVirtualSubsForGroup({
        cfg: frontSubsCfg,
        group: 'front',
        qty: candidate.quantity,
        placementMode: candidate.placementMode,
        roomDimensions,
      });
      actualQuantity = subwoofers.length;
    }

    if (candidate.wallConfig === 'rear') {
      subwoofers = buildVirtualSubsForGroup({
        cfg: rearSubsCfg,
        group: 'rear',
        qty: candidate.quantity,
        placementMode: candidate.placementMode,
        roomDimensions,
      });
      actualQuantity = subwoofers.length;
    }

    if (candidate.wallConfig === 'front+rear') {
      const frontGroup = buildVirtualSubsForGroup({
        cfg: frontSubsCfg,
        group: 'front',
        qty: candidate.quantity.front,
        placementMode: candidate.placementMode,
        roomDimensions,
      });
      const rearGroup = buildVirtualSubsForGroup({
        cfg: rearSubsCfg,
        group: 'rear',
        qty: candidate.quantity.rear,
        placementMode: candidate.placementMode,
        roomDimensions,
      });
      subwoofers = [
        ...frontGroup,
        ...rearGroup,
      ];
      actualQuantity = { front: frontGroup.length, rear: rearGroup.length };
    }

    const seatResponses = seatList.map((seat) => ({
      seat,
      ...engine.simulateResponseWithExtras(subwoofers, seat, roomDimensions),
    }));

    const rspResponse = seatResponses[0]?.responseData || [];
    const seatVariance = computeSeatVariance(seatResponses);
    const nullPenalty = seatResponses.reduce((sum, seatResponse) => sum + countNulls(seatResponse.responseData), 0);
    const smoothness = standardDeviation(
      rspResponse.map((point) => Number(point?.spl)).filter(Number.isFinite)
    );
    const outputScore = rspResponse.length > 0
      ? Math.max(...rspResponse.map((point) => Number(point?.spl)).filter(Number.isFinite))
      : 0;

    const score =
      (seatVariance * 2.0) +
      (nullPenalty * 3.0) +
      (smoothness * 1.0) -
      (outputScore * 0.1);

    return {
      candidate: {
        ...candidate,
        quantity: actualQuantity,
      },
      subwoofers,
      seatResponses,
      seatVariance,
      nullPenalty,
      smoothness,
      outputScore,
      score,
    };
  });

  evaluated.forEach((result) => {
    console.log('[SubwooferOptimiser] Candidate result', {
      candidate: result.candidate,
      seatVariance: result.seatVariance,
      nullPenalty: result.nullPenalty,
      smoothness: result.smoothness,
      outputScore: result.outputScore,
      score: result.score,
    });
  });

  const best = evaluated.reduce((currentBest, result) => {
    if (!currentBest) return result;
    return result.score < currentBest.score ? result : currentBest;
  }, null);

  const finalResult = {
    bestLayout: best
      ? {
          ...best.candidate,
          subwoofers: best.subwoofers,
          seatVariance: best.seatVariance,
          nullPenalty: best.nullPenalty,
          smoothness: best.smoothness,
          outputScore: best.outputScore,
        }
      : null,
    score: best ? best.score : null,
    summary: best ? buildSummary(best.candidate) : 'No valid layout found',
  };

  console.log('[SubwooferOptimiser] Best result', finalResult);
  return finalResult;
}

export default optimiseSubwooferLayout;