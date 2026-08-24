// bassGraphSmoothing.jsx — fractional-octave smoothing for the Bass Response graph and
// authoritative P19/P20 assessment. Reshapes an already-computed { frequency, spl }[] series
// using a logarithmic fractional-octave window with power-domain (energy) averaging, matching
// REW 1/3-octave behaviour. Does NOT touch simulation output, modal calculations, or null-depth
// raw detection.

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

export function prepareBassSmoothingGrid(data, mode) {
  if (!Array.isArray(data) || data.length < 3 || mode === "none") return { sorted: data, bounds: null };
  const width = mode === "sixth" ? 6 : mode === "third" ? 3 : mode === "octave" ? 1 : null;
  if (!width) return { sorted: data, bounds: null };
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  return { sorted, bounds: fractionalWindowBounds(sorted, width) };
}

function smoothFractionalOctave(data, width) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const mode = width === 6 ? "sixth" : width === 3 ? "third" : "octave";
  const { sorted, bounds } = prepareBassSmoothingGrid(data, mode);
  return sorted.map(({ frequency }, pointIndex) => {
    const [start, end] = bounds[pointIndex];
    // Power-domain (energy) averaging: convert dB to linear power, average, convert back.
    // This matches REW fractional-octave smoothing and prevents narrow dips from being
    // over-weighted relative to the acoustic energy they represent.
    let powerSum = 0;
    let count = 0;
    for (let index = start; index < end; index++) {
      const spl = sorted[index].spl;
      if (!Number.isFinite(spl)) continue;
      powerSum += Math.pow(10, spl / 10);
      count++;
    }
    return { frequency, spl: count === 0 ? null : 10 * Math.log10(powerSum / count) };
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