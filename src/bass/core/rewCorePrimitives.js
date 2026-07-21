export function buildFrequencyAxis(freqMinHz, freqMaxHz, pointsPerOctave) {
  const ppo = Number.isFinite(Number(pointsPerOctave)) && Number(pointsPerOctave) > 0
    ? Math.round(Number(pointsPerOctave))
    : 96;
  const minHz = Math.max(1, Number(freqMinHz) || 15);
  const maxHz = Math.max(minHz, Number(freqMaxHz) || 200);
  const freqsHz = [];
  const totalPoints = Math.ceil(Math.log2(maxHz / minHz) * ppo);
  for (let index = 0; index <= totalPoints; index += 1) {
    const hz = minHz * Math.pow(2, index / ppo);
    if (hz > maxHz) break;
    freqsHz.push(hz);
  }
  if (freqsHz[freqsHz.length - 1] !== maxHz) freqsHz.push(maxHz);
  return freqsHz;
}

export function interpolateCurveDb(curvePoints, hz) {
  if (!Array.isArray(curvePoints) || curvePoints.length === 0) return 90;
  const points = curvePoints
    .map((point) => ({ hz: Number(point?.hz ?? point?.frequency ?? point?.[0]), db: Number(point?.db ?? point?.spl ?? point?.[1]) }))
    .filter((point) => Number.isFinite(point.hz) && Number.isFinite(point.db))
    .sort((a, b) => a.hz - b.hz);
  if (points.length === 0) return 90;
  if (hz <= points[0].hz) return points[0].db;
  if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (hz >= left.hz && hz <= right.hz) return left.db + ((hz - left.hz) / (right.hz - left.hz)) * (right.db - left.db);
  }
  return points[0].db;
}

export function buildImageSources(sx, sy, sz, widthM, lengthM, heightM, absorption, maxOrder) {
  if (maxOrder < 1) return [];
  const sources = [];
  for (let rx = -maxOrder; rx <= maxOrder; rx += 1) {
    for (let ry = -maxOrder; ry <= maxOrder; ry += 1) {
      for (let rz = -maxOrder; rz <= maxOrder; rz += 1) {
        const order = Math.abs(rx) + Math.abs(ry) + Math.abs(rz);
        if (order === 0 || order > maxOrder) continue;
        const x = rx % 2 === 0 ? rx * widthM + sx : rx * widthM + (widthM - sx);
        const y = ry % 2 === 0 ? ry * lengthM + sy : ry * lengthM + (lengthM - sy);
        const z = rz % 2 === 0 ? rz * heightM + sz : rz * heightM + (heightM - sz);
        const hits = (index) => index >= 0 ? [Math.floor(Math.abs(index) / 2), Math.ceil(Math.abs(index) / 2)] : [Math.ceil(Math.abs(index) / 2), Math.floor(Math.abs(index) / 2)];
        const [leftHits, rightHits] = hits(rx);
        const [frontHits, backHits] = hits(ry);
        const [floorHits, ceilingHits] = hits(rz);
        const reflectionCoefficient =
          Math.pow(Math.sqrt(1 - absorption.left), leftHits) * Math.pow(Math.sqrt(1 - absorption.right), rightHits) *
          Math.pow(Math.sqrt(1 - absorption.front), frontHits) * Math.pow(Math.sqrt(1 - absorption.back), backHits) *
          Math.pow(Math.sqrt(1 - absorption.floor), floorHits) * Math.pow(Math.sqrt(1 - absorption.ceiling), ceilingHits);
        sources.push({ x, y, z, reflectionCoefficient, order, boundary: rx < 0 ? 'left' : rx > 0 ? 'right' : ry < 0 ? 'front' : ry > 0 ? 'rear' : rz < 0 ? 'floor' : 'ceiling' });
      }
    }
  }
  return sources;
}