import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

// Register the @/ alias loader before importing source files.
register(pathToFileURL('./src/__bass_eq_b1_loader.mjs').href);

const { generateCanonicalCandidatePool } = await import('./components/utils/canonicalBassOptimiser.js');
const { selectCandidateFromPool } = await import('./components/utils/bassCandidatePoolSelection.js');

const frequencies = Array.from({ length: 181 }, (_, i) => 20 + i);
const gaussian = (f, c, w, g) => g * Math.exp(-0.5 * ((f - c) / w) ** 2);

// FIX: filter objects store Q as an uppercase property (f.Q), not f.q.
// The previous harness read f.q (undefined), producing null Q values.
function fb(c) {
  return (c?.generatedFilterBank || []).filter(f => f?.enabled).map(f => ({
    freq: Math.round(f.frequencyHz * 10) / 10,
    gain: Math.round(f.gainDb * 100) / 100,
    q: Math.round((f.Q ?? f.q) * 100) / 100,
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
// Safety assertion helpers: final post-EQ must not exceed product operating
// envelope at any frequency; protected nulls must not be boosted; per-seat
// post-EQ must not exceed the per-seat product operating envelope.
function envelopeExceedances(finalCurve, envelopeCurve) {
  const out = [];
  for (const p of (Array.isArray(finalCurve) ? finalCurve : [])) {
    const env = envelopeCurve?.find(e => e.frequency === p.frequency);
    if (!env) continue;
    if (Number.isFinite(p.spl) && Number.isFinite(env.spl) && p.spl > env.spl + 0.05) {
      out.push({ frequency: p.frequency, finalSpl: Math.round(p.spl * 100) / 100, envelopeSpl: Math.round(env.spl * 100) / 100, excessDb: Math.round((p.spl - env.spl) * 100) / 100 });
    }
  }
  return out;
}
function protectedNullBoostViolations(beforeCurve, afterCurve, protectedNulls) {
  const out = [];
  for (const p of (Array.isArray(afterCurve) ? afterCurve : [])) {
    const region = (Array.isArray(protectedNulls) ? protectedNulls : []).find(r => p.frequency >= r.startHz && p.frequency <= r.endHz);
    if (!region) continue;
    const before = beforeCurve?.find(b => b.frequency === p.frequency)?.spl;
    if (!Number.isFinite(before) || !Number.isFinite(p.spl)) continue;
    const boost = p.spl - before;
    if (boost > 0.05) out.push({ frequency: p.frequency, beforeSpl: Math.round(before * 100) / 100, afterSpl: Math.round(p.spl * 100) / 100, boostDb: Math.round(boost * 100) / 100 });
  }
  return out;
}
function perSeatEnvelopeExceedances(perSeatPostEq, envelopeCurve) {
  const out = [];
  for (const seat of (Array.isArray(perSeatPostEq) ? perSeatPostEq : [])) {
    for (const p of (Array.isArray(seat?.responseData) ? seat.responseData : [])) {
      const env = envelopeCurve?.find(e => e.frequency === p.frequency);
      if (!env) continue;
      if (Number.isFinite(p.spl) && Number.isFinite(env.spl) && p.spl > env.spl + 0.05) {
        out.push({ seatId: seat.seatId, frequency: p.frequency, finalSpl: Math.round(p.spl * 100) / 100, envelopeSpl: Math.round(env.spl * 100) / 100, excessDb: Math.round((p.spl - env.spl) * 100) / 100 });
      }
    }
  }
  return out;
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

// ─── TEST 8: Regression — broad valley centred at 195 Hz (above approved range) ───
const rc8 = frequencies.map(f => ({
  frequency: f,
  spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 195, 12, -5),
}));
const p8 = generateCanonicalCandidatePool({
  rawCurve: rc8, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200,
  perSeatRawCurves: [{ seatId: "s1", responseData: rc8.map(p => ({ ...p })) }],
  selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1,
});
const c8 = selectCandidateFromPool(p8).selectedCandidate;
const f8 = fb(c8);
const boostAboveRange8 = f8.filter(f => f.gain > 0.1 && f.freq > 170);

// ─── TEST 7: Safety — aggregate across all tests ───
const allFilters = [...f1, ...f2, ...f3, ...f4, ...f5L1, ...f5L4, ...f6a, ...f6b, ...f8];
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
    envelopeExceedances: envelopeExceedances(c1.finalPostEqCurve, c1.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c1.rspBeforePeqAtOperatingLevel, c1.finalPostEqCurve, c1.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c1.perSeatPostEqCurves, c1.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f1.map(f => f.gain)),
    maxCutDb: Math.min(0, ...f1.map(f => f.gain)),
    p14HeadroomDb: c1.productOperatingHeadroomDb,
  },
  test2: {
    filters: f2,
    dip80: { before: val(c2.rspBeforePeqAtOperatingLevel, 80), after: val(c2.finalPostEqCurve, 80), target: val(c2.productionHouseCurveTarget, 80) },
    protNullCount: (c2.protectedNullRegions || []).length,
    physPass: c2.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c2.finalPostEqCurve, c2.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c2.rspBeforePeqAtOperatingLevel, c2.finalPostEqCurve, c2.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c2.perSeatPostEqCurves, c2.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f2.map(f => f.gain)),
  },
  test3: {
    filters: f3,
    null95: { before: val(c3.rspBeforePeqAtOperatingLevel, 95), after: val(c3.finalPostEqCurve, 95), target: val(c3.productionHouseCurveTarget, 95) },
    protNulls: pn3.map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    boostInNullCount: boostInNull3.length,
    physPass: c3.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c3.finalPostEqCurve, c3.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c3.rspBeforePeqAtOperatingLevel, c3.finalPostEqCurve, c3.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c3.perSeatPostEqCurves, c3.productOperatingEnvelopeCurve),
  },
  test4: {
    filters: f4,
    capLimitedPts: c4.capabilityLimitedPointCount,
    capRegions: (c4.capabilityLimitedRegions || []).map(r => ({ start: r.startHz, end: r.endHz, worst: r.worstFrequencyHz, shortfall: r.maximumShortfallDb })),
    freq60: { target: val(c4.productionHouseCurveTarget, 60), before: val(c4.rspBeforePeqAtOperatingLevel, 60), after: val(c4.finalPostEqCurve, 60), envelope: val(c4.productOperatingEnvelopeCurve, 60) },
    physPass: c4.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c4.finalPostEqCurve, c4.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c4.rspBeforePeqAtOperatingLevel, c4.finalPostEqCurve, c4.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c4.perSeatPostEqCurves, c4.productOperatingEnvelopeCurve),
    p14HeadroomDb: c4.productOperatingHeadroomDb,
    p14ShortfallDb: c4.productOperatingShortfallDb,
  },
  test5: {
    L1: { filters: f5L1, capLimitedPts: c5L1.capabilityLimitedPointCount, headroomDb: c5L1.productOperatingHeadroomDb, bankLimits: c5L1.aggregateBankLimits, maxBoostDb: Math.max(0, ...f5L1.map(f => f.gain)), maxCutDb: Math.min(0, ...f5L1.map(f => f.gain)) },
    L4: { filters: f5L4, capLimitedPts: c5L4.capabilityLimitedPointCount, headroomDb: c5L4.productOperatingHeadroomDb, bankLimits: c5L4.aggregateBankLimits, maxBoostDb: Math.max(0, ...f5L4.map(f => f.gain)), maxCutDb: Math.min(0, ...f5L4.map(f => f.gain)) },
    filterBanksDiffer: JSON.stringify(f5L1) !== JSON.stringify(f5L4),
    L1envelopeExceedances: envelopeExceedances(c5L1.finalPostEqCurve, c5L1.productOperatingEnvelopeCurve),
    L4envelopeExceedances: envelopeExceedances(c5L4.finalPostEqCurve, c5L4.productOperatingEnvelopeCurve),
  },
  test6: {
    roomA: { filters: f6a, peak45before: val(c6a.rspBeforePeqAtOperatingLevel, 45), peak45after: val(c6a.finalPostEqCurve, 45), dip85before: val(c6a.rspBeforePeqAtOperatingLevel, 85), dip85after: val(c6a.finalPostEqCurve, 85) },
    roomB: { filters: f6b, dip55before: val(c6b.rspBeforePeqAtOperatingLevel, 55), dip55after: val(c6b.finalPostEqCurve, 55), peak100before: val(c6b.rspBeforePeqAtOperatingLevel, 100), peak100after: val(c6b.finalPostEqCurve, 100) },
    filterBanksDiffer: JSON.stringify(f6a) !== JSON.stringify(f6b),
    roomAEnvelopeExceedances: envelopeExceedances(c6a.finalPostEqCurve, c6a.productOperatingEnvelopeCurve),
    roomBEnvelopeExceedances: envelopeExceedances(c6b.finalPostEqCurve, c6b.productOperatingEnvelopeCurve),
  },
  test7: {
    maxBoostDb: Math.round(maxBoost * 100) / 100,
    maxCutDb: Math.round(maxCut * 100) / 100,
    boostWithinLimit: maxBoost <= 6.05,
    cutWithinLimit: maxCut >= -15.05,
    allPhysPass: [c1, c2, c3, c4, c5L1, c5L4, c6a, c6b, c8].every(c => c.physicalValidation?.passed === true),
  },
  test8: {
    filters: f8,
    boostAboveRangeCount: boostAboveRange8.length,
    boostAboveRange: boostAboveRange8,
    valley195: { before: val(c8.rspBeforePeqAtOperatingLevel, 195), after: val(c8.finalPostEqCurve, 195), target: val(c8.productionHouseCurveTarget, 195) },
    physPass: c8.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c8.finalPostEqCurve, c8.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c8.rspBeforePeqAtOperatingLevel, c8.finalPostEqCurve, c8.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c8.perSeatPostEqCurves, c8.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f8.map(f => f.gain)),
  },
  safetyAssertions: {
    finalPostEqLeEnvelope: [
      ...envelopeExceedances(c1.finalPostEqCurve, c1.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c2.finalPostEqCurve, c2.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c3.finalPostEqCurve, c3.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c4.finalPostEqCurve, c4.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c5L1.finalPostEqCurve, c5L1.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c5L4.finalPostEqCurve, c5L4.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c6a.finalPostEqCurve, c6a.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c6b.finalPostEqCurve, c6b.productOperatingEnvelopeCurve),
      ...envelopeExceedances(c8.finalPostEqCurve, c8.productOperatingEnvelopeCurve),
    ],
    protectedNullBoostLeAllowed: [
      ...protectedNullBoostViolations(c1.rspBeforePeqAtOperatingLevel, c1.finalPostEqCurve, c1.protectedNullRegions),
      ...protectedNullBoostViolations(c2.rspBeforePeqAtOperatingLevel, c2.finalPostEqCurve, c2.protectedNullRegions),
      ...protectedNullBoostViolations(c3.rspBeforePeqAtOperatingLevel, c3.finalPostEqCurve, c3.protectedNullRegions),
      ...protectedNullBoostViolations(c4.rspBeforePeqAtOperatingLevel, c4.finalPostEqCurve, c4.protectedNullRegions),
    ],
    perSeatFinalPostEqLeEnvelope: [
      ...perSeatEnvelopeExceedances(c1.perSeatPostEqCurves, c1.productOperatingEnvelopeCurve),
      ...perSeatEnvelopeExceedances(c2.perSeatPostEqCurves, c2.productOperatingEnvelopeCurve),
      ...perSeatEnvelopeExceedances(c3.perSeatPostEqCurves, c3.productOperatingEnvelopeCurve),
      ...perSeatEnvelopeExceedances(c4.perSeatPostEqCurves, c4.productOperatingEnvelopeCurve),
    ],
  },
};

const output = JSON.stringify(result, null, 2);
const outPath = './src/__bass_eq_b1_results.json';
writeFileSync(outPath, output, 'utf8');
console.log(output);
console.log(`\n[Saved to ${outPath}]`);