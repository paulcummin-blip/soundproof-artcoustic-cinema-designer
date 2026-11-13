import { extractAuthorityForComparison } from "../improveBassV2/currentAuthorityComparison";

export function recommendationResultMatches(authority, expected, tolerance = 0.1) {
  const actual = extractAuthorityForComparison(authority);
  if (!actual || !expected) return false;
  for (const field of ["achievedP19VariationDb","achievedP20VariationDb","p14AchievedDb","achievedP18Hz"]) {
    if (![actual[field], expected[field]].every(Number.isFinite) || Math.abs(actual[field]-expected[field]) > tolerance) return false;
  }
  const before = expected.perSeatP20 || [];
  const after = actual.perSeatP20 || [];
  return before.length > 0 && before.length === after.length && before.every(seat => {
    const match = after.find(s => s.seatId === seat.seatId);
    return match && match.isPrimary === seat.isPrimary && Number.isFinite(match.variationDbRaw)
      && Math.abs(match.variationDbRaw-seat.variationDbRaw) <= tolerance;
  });
}

export function recommendationSettingsMatch(authoritative, expected) {
  if (!authoritative || !expected?.crossover || !Array.isArray(expected.tuning)) return false;
  const a=authoritative.crossover,b=expected.crossover;
  if (!a || a.linkFrequencies!==b.linkFrequencies || a.frequencyHz!==b.frequencyHz || (a.subwooferFrequencyHz??a.frequencyHz)!==(b.subwooferFrequencyHz??b.frequencyHz)
    || a.speakerHpSlopeDbPerOct!==b.speakerHpSlopeDbPerOct || a.subwooferLpSlopeDbPerOct!==b.subwooferLpSlopeDbPerOct) return false;
  const sources=authoritative.sources||[];
  return new Set(sources.map(s=>s.id)).size===sources.length && new Set(expected.tuning.map(t=>t.sourceId)).size===expected.tuning.length && sources.length===expected.tuning.length && expected.tuning.every(t=>{
    const source=sources.find(s=>s.id===t.sourceId);
    return source && ["gainDb","delayMs","phaseControlDeg"].every(k=>Number.isFinite(source.tuning?.[k]) && Number.isFinite(t[k]) && Math.abs(source.tuning[k]-t[k])<0.001)
      && (source.tuning?.polarity===-1||source.tuning?.polarity===180)===(t.polarity===-1||t.polarity===180);
  });
}
