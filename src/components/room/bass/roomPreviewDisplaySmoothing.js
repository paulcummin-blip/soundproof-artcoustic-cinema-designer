// Room-only graph display: one existing 1/3-octave power average.
// On a 96-points/octave grid the closed window includes i-16 through i+16.
// Floating-point frequency construction can otherwise drop either boundary,
// alternating 31/32/33 samples and introducing visible ripples after refinement.
// This tolerance covers arithmetic roundoff only (about 7e-13 Hz at 200 Hz).
// Authoritative bassGraphSmoothing and all RP22 consumers remain unchanged.
const BOUNDARY_ROUNDOFF = 16 * Number.EPSILON;
const HALF_BAND = Math.pow(2, 1 / 6);

export function applyRoomPreviewDisplaySmoothing(data) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  const powers = sorted.map(p => Number.isFinite(p.spl) ? Math.pow(10, p.spl / 10) : null);
  let start = 0;
  let end = 0;
  return sorted.map(({ frequency }) => {
    const low = frequency / HALF_BAND;
    const high = frequency * HALF_BAND;
    while (start < sorted.length && sorted[start].frequency < low * (1 - BOUNDARY_ROUNDOFF)) start++;
    if (end < start) end = start;
    while (end < sorted.length && sorted[end].frequency <= high * (1 + BOUNDARY_ROUNDOFF)) end++;
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      if (powers[i] === null) continue;
      sum += powers[i];
      count++;
    }
    return { frequency, spl: count ? 10 * Math.log10(sum / count) : null };
  });
}
