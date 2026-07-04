// bassGraphSmoothing.jsx — display-only fractional-octave smoothing for the Bass Response
// graph. Does NOT touch simulation output, modal calculations, or null-depth raw detection —
// it only reshapes an already-computed { frequency, spl }[] series for plotting.

const SMOOTHING_LABELS = {
  none: 'None',
  sixth: '1/6 octave',
  third: '1/3 octave',
};

function smoothFractionalOctave(data, width) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  return sorted.map(({ frequency }) => {
    const fLow = frequency * Math.pow(2, -0.5 / width);
    const fHigh = frequency * Math.pow(2, 0.5 / width);
    const pts = sorted.filter((p) => p.frequency >= fLow && p.frequency <= fHigh && Number.isFinite(p.spl));
    if (pts.length === 0) return { frequency, spl: null };
    const avg = pts.reduce((s, p) => s + p.spl, 0) / pts.length;
    return { frequency, spl: avg };
  });
}

// mode: 'none' | 'sixth' | 'third'
export function applyBassSmoothing(data, mode) {
  if (!Array.isArray(data) || data.length === 0) return data;
  if (mode === 'sixth') return smoothFractionalOctave(data, 6);
  if (mode === 'third') return smoothFractionalOctave(data, 3);
  return data;
}

export function bassSmoothingLabel(mode) {
  return SMOOTHING_LABELS[mode] || SMOOTHING_LABELS.none;
}