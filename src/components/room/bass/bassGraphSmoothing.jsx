// bassGraphSmoothing.jsx — display-only fractional-octave smoothing for the Bass Response
// graph. Does NOT touch simulation output, modal calculations, or null-depth raw detection —
// it only reshapes an already-computed { frequency, spl }[] series for plotting.

const SMOOTHING_LABELS = {
  none: 'None',
  sixth: '1/6 octave',
  third: '1/3 octave',
  octave: '1 octave',
};

const WINDOW_CACHE_LIMIT = 8;
const windowBoundsCache = new Map();

function fractionalWindowBounds(sorted, width) {
  const key = `${width}:${sorted.map((point) => point.frequency).join(",")}`;
  const cached = windowBoundsCache.get(key);
  if (cached) return cached;
  let lowIndex = 0;
  let highIndex = 0;
  const bounds = sorted.map(({ frequency }) => {
    const fLow = frequency * Math.pow(2, -0.5 / width);
    const fHigh = frequency * Math.pow(2, 0.5 / width);
    while (lowIndex < sorted.length && sorted[lowIndex].frequency < fLow) lowIndex++;
    if (highIndex < lowIndex) highIndex = lowIndex;
    while (highIndex < sorted.length && sorted[highIndex].frequency <= fHigh) highIndex++;
    return [lowIndex, highIndex];
  });
  windowBoundsCache.set(key, bounds);
  while (windowBoundsCache.size > WINDOW_CACHE_LIMIT) windowBoundsCache.delete(windowBoundsCache.keys().next().value);
  return bounds;
}

function smoothFractionalOctave(data, width) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  const bounds = fractionalWindowBounds(sorted, width);
  return sorted.map(({ frequency }, pointIndex) => {
    const [start, end] = bounds[pointIndex];
    let sum = 0;
    let count = 0;
    for (let index = start; index < end; index++) {
      if (!Number.isFinite(sorted[index].spl)) continue;
      sum += sorted[index].spl;
      count++;
    }
    return { frequency, spl: count === 0 ? null : sum / count };
  });
}

// mode: 'none' | 'sixth' | 'third' | 'octave'
export function applyBassSmoothing(data, mode) {
  if (!Array.isArray(data) || data.length === 0) return data;
  if (mode === 'sixth') return smoothFractionalOctave(data, 6);
  if (mode === 'third') return smoothFractionalOctave(data, 3);
  if (mode === 'octave') return smoothFractionalOctave(data, 1);
  return data;
}

export function bassSmoothingLabel(mode) {
  return SMOOTHING_LABELS[mode] || SMOOTHING_LABELS.none;
}