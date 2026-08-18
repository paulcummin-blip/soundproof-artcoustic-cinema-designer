import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register the @/ alias loader before importing source files.
register(pathToFileURL('./src/__bass_eq_b1_loader.mjs').href);

const { generateCanonicalCandidatePool } = await import('./components/utils/canonicalBassOptimiser.js');
const { selectCandidateFromPool } = await import('./components/utils/bassCandidatePoolSelection.js');

const frequencies = Array.from({ length: 181 }, (_, i) => 20 + i);
const gaussian = (f, c, w, g) => g * Math.exp(-0.5 * ((f - c) / w) ** 2);

function fb(c) {
  return (c?.generatedFilterBank || []).filter(f => f?.enabled).map(f => ({
    freq: Math.round(f.frequencyHz * 10) / 10,
    gain: Math.round(f.gainDb * 100) / 100,
    q: Math.round(f.q * 100) / 100,
  }));
}
function dev(curve, target) {
  const pts = curve.filter(p => p.frequency >= 20 && p.frequency <= 120);
  let mx = 0, ss = 0;
  for (const p of pts) {
    const t = target.find(tp => tp.frequency === p.frequency);
    if (!t) continue;
    const d = p.spl - t.spl;
    mx = Math.max(mx, Math.abs(d));
    ss += d * d;
  }
  return { maxDev: Math.round(mx * 100) / 100, rmsDev: Math.round(Math.sqrt(ss / pts.length) * 100) / 100 };
}
function val(c, freq) {
  return c?.find(p => p.frequency === freq)?.spl ?? null;
}

// ─── TEST 1: Current room — deep null ~118 Hz, broad peak 42 Hz, broad dip 73 Hz ───
const rc1 = frequencies.map(f => ({
  frequency: f,
  spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 42, 7, 7) + gaussian(f, 73, 9, -4) + gaussian(f, 118, 1.5, -15),
}));
const sc1 = (id, s) => ({ seatId: id, responseData: rc1.map(p => ({ ...p, spl: p.spl + s })) });
const p1 = generateCanonicalCandidatePool({
  rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c1 = selectCandidateFromPool(p1).selectedCandidate;
const f1 = fb(c1);
const bd1 = dev(c1.rspBeforePeqAtOperatingLevel, c1.productionHouseCurveTarget);
const ad1 = dev(c1.finalPostEqCurve, c1.productionHouseCurveTarget);

// ─── TEST 2: Broad dip 80 Hz, no protected null, low target for headroom ───
const rc2 = frequencies.map(f => ({
  frequency: f,
  spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 80, 10, -4),
}));
const p2 = generateCanonicalCandidatePool({
  rawCurve: rc2, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [{ seatId: "s1", responseData: rc2.map(p => ({ ...p })) }],
  selectedP14TargetDb: 105, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c2 = selectCandidateFromPool(p2).selectedCandidate;
const f2 = fb(c2);

// ─── TEST 3: Protected null -15 dB at 95 Hz ───
const rc3 = frequencies.map(f => ({
  frequency: f,
  spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 95, 1.0, -15),
}));
const p3 = generateCanonicalCandidatePool({
  rawCurve: rc3, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [{ seatId: "s1", responseData: rc3.map(p => ({ ...p })) }],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c3 = selectCandidateFromPool(p3).selectedCandidate;
const f3 = fb(c3);
const pn3 = c3.protectedNullRegions || [];
const boostInNull3 = f3.filter(f => f.gain > 0.1 && pn3.some(r => f.freq >= r.startHz && f.freq <= r.endHz));

// ─── TEST 4: Product-capability ceiling — target 125 dB (above sub capability) ───
const p4 = generateCanonicalCandidatePool({
  rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)],
  selectedP14TargetDb: 125, p14TargetBasis: "recommended", p14TargetLevel: 4,
});
const c4 = selectCandidateFromPool(p4).selectedCandidate;
const f4 = fb(c4);

// ─── TEST 5: L1 vs L4 same room ───
const p5L1 = generateCanonicalCandidatePool({
  rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c5L1 = selectCandidateFromPool(p5L1).selectedCandidate;
const f5L1 = fb(c5L1);

const p5L4 = generateCanonicalCandidatePool({
  rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)],
  selectedP14TargetDb: 118, p14TargetBasis: "recommended", p14TargetLevel: 4,
});
const c5L4 = selectCandidateFromPool(p5L4).selectedCandidate;
const f5L4 = fb(c5L4);

// ─── TEST 6: Different rooms ───
const rc6a = frequencies.map(f => ({
  frequency: f,
  spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 45, 6, 6) + gaussian(f, 85, 8, -3),
}));
const rc6b = frequencies.map(f => ({
  frequency: f,
  spl: 113 + 3.5 * Math.log10(120 / f) + gaussian(f, 55, 5, -5) + gaussian(f, 100, 7, 5),
}));
const p6a = generateCanonicalCandidatePool({
  rawCurve: rc6a, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [{ seatId: "s1", responseData: rc6a.map(p => ({ ...p })) }],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c6a = selectCandidateFromPool(p6a).selectedCandidate;
const f6a = fb(c6a);
const p6b = generateCanonicalCandidatePool({
  rawCurve: rc6b, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [{ seatId: "s1", responseData: rc6b.map(p => ({ ...p })) }],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c6b = selectCandidateFromPool(p6b).selectedCandidate;
const f6b = fb(c6b);

// ─── TEST 7: Safety — aggregate across all tests ───
const allFilters = [...f1, ...f2, ...f3, ...f4, ...f5L1, ...f5L4, ...f6a, ...f6b];
const maxBoost = Math.max(0, ...allFilters.map(f => f.gain));
const maxCut = Math.min(0, ...allFilters.map(f => f.gain));

const result = {
  test1: {
    filters: f1,
    beforeDev: bd1, afterDev: ad1,
    null118: { before: val(c1.rspBeforePeqAtOperatingLevel, 118), after: val(c1.finalPostEqCurve, 118), target: val(c1.productionHouseCurveTarget, 118) },
    peak42: { before: val(c1.rspBeforePeqAtOperatingLevel, 42), after: val(c1.finalPostEqCurve, 42) },
    dip73: { before: val(c1.rspBeforePeqAtOperatingLevel, 73), after: val(c1.finalPostEqCurve, 73), target: val(c1.productionHouseCurveTarget, 73) },
    protectedNulls: (c1.protectedNullRegions || []).map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    physPass: c1.physicalValidation?.passed,
    bankLimits: c1.aggregateBankLimits,
  },
  test2: {
    filters: f2,
    dip80: { before: val(c2.rspBeforePeqAtOperatingLevel, 80), after: val(c2.finalPostEqCurve, 80), target: val(c2.productionHouseCurveTarget, 80) },
    protNullCount: (c2.protectedNullRegions || []).length,
    physPass: c2.physicalValidation?.passed,
  },
  test3: {
    filters: f3,
    null95: { before: val(c3.rspBeforePeqAtOperatingLevel, 95), after: val(c3.finalPostEqCurve, 95), target: val(c3.productionHouseCurveTarget, 95) },
    protNulls: pn3.map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    boostInNullCount: boostInNull3.length,
    physPass: c3.physicalValidation?.passed,
  },
  test4: {
    filters: f4,
    capLimitedPts: c4.capabilityLimitedPointCount,
    capRegions: (c4.capabilityLimitedRegions || []).map(r => ({ start: r.startHz, end: r.endHz, worst: r.worstFrequencyHz, shortfall: r.maximumShortfallDb })),
    freq60: { target: val(c4.productionHouseCurveTarget, 60), before: val(c4.rspBeforePeqAtOperatingLevel, 60), after: val(c4.finalPostEqCurve, 60), envelope: val(c4.productOperatingEnvelopeCurve, 60) },
    physPass: c4.physicalValidation?.passed,
  },
  test5: {
    L1: { filters: f5L1, capLimitedPts: c5L1.capabilityLimitedPointCount, headroomDb: c5L1.productOperatingHeadroomDb, bankLimits: c5L1.aggregateBankLimits },
    L4: { filters: f5L4, capLimitedPts: c5L4.capabilityLimitedPointCount, headroomDb: c5L4.productOperatingHeadroomDb, bankLimits: c5L4.aggregateBankLimits },
    filterBanksDiffer: JSON.stringify(f5L1) !== JSON.stringify(f5L4),
  },
  test6: {
    roomA: { filters: f6a, peak45before: val(c6a.rspBeforePeqAtOperatingLevel, 45), peak45after: val(c6a.finalPostEqCurve, 45), dip85before: val(c6a.rspBeforePeqAtOperatingLevel, 85), dip85after: val(c6a.finalPostEqCurve, 85) },
    roomB: { filters: f6b, dip55before: val(c6b.rspBeforePeqAtOperatingLevel, 55), dip55after: val(c6b.finalPostEqCurve, 55), peak100before: val(c6b.rspBeforePeqAtOperatingLevel, 100), peak100after: val(c6b.finalPostEqCurve, 100) },
    filterBanksDiffer: JSON.stringify(f6a) !== JSON.stringify(f6b),
  },
  test7: {
    maxBoostDb: Math.round(maxBoost * 100) / 100,
    maxCutDb: Math.round(maxCut * 100) / 100,
    boostWithinLimit: maxBoost <= 6.05,
    cutWithinLimit: maxCut >= -15.05,
    allPhysPass: [c1, c2, c3, c4, c5L1, c5L4, c6a, c6b].every(c => c.physicalValidation?.passed === true),
  },
};

console.log(JSON.stringify(result, null, 2));