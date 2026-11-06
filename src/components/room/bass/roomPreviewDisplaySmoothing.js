// Display-only 1/3-octave averaging for advisory room-response curves.
// Integrate power over an exact log-frequency window, including fractional
// edge segments. Counting whole samples makes the effective window jump when
// an edge crosses a sample. No second pass, resampling, or acoustic calculation.
// RP22 / optimiser smoothing remains in bassGraphSmoothing.jsx, unchanged.
export function smoothRoomPreviewThirdOctave(data) {
  if (!Array.isArray(data)) return [];
  const points = data.filter(p => Number.isFinite(p?.frequency) && p.frequency > 0 && Number.isFinite(p?.spl))
    .slice().sort((a, b) => a.frequency - b.frequency)
    .filter((p, i, sorted) => i === 0 || p.frequency !== sorted[i - 1].frequency);
  if (points.length < 2) return points.map(p => ({ frequency: p.frequency, spl: p.spl }));
  const xs = points.map(p => Math.log2(p.frequency));
  const reference = Math.max(...points.map(p => p.spl));
  const powers = points.map(p => Math.pow(10, (p.spl - reference) / 10));
  const area = [0];
  for (let i = 1; i < points.length; i++) {
    area[i] = area[i - 1] + (powers[i - 1] + powers[i]) * 0.5 * (xs[i] - xs[i - 1]);
  }
  const integralAt = x => {
    if (x <= xs[0]) return 0;
    if (x >= xs[xs.length - 1]) return area[area.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const dx = x - xs[lo];
    const powerAtEdge = powers[lo] + (powers[hi] - powers[lo]) * dx / (xs[hi] - xs[lo]);
    return area[lo] + (powers[lo] + powerAtEdge) * 0.5 * dx;
  };
  return points.map((p, i) => {
    // Truncate at measured support; never invent response beyond either end.
    const low = Math.max(xs[0], xs[i] - 1 / 6);
    const high = Math.min(xs[xs.length - 1], xs[i] + 1 / 6);
    const meanPower = (integralAt(high) - integralAt(low)) / (high - low);
    return { frequency: p.frequency, spl: reference + 10 * Math.log10(Math.max(Number.MIN_VALUE, meanPower)) };
  });
}
