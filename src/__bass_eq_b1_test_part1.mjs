import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

register(pathToFileURL('./src/__bass_eq_b1_loader.mjs').href);

const { generateCanonicalCandidatePool } = await import('./components/utils/canonicalBassOptimiser.js');
const { selectCandidateFromPool } = await import('./components/utils/bassCandidatePoolSelection.js');

const frequencies = Array.from({ length: 181 }, (_, i) => 20 + i);
const gaussian = (f, c, w, g) => g * Math.exp(-0.5 * ((f - c) / w) ** 2);

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
function val(c, freq) { return c?.find(p => p.frequency === freq)?.spl ?? null; }
function envelopeExceedances(finalCurve, envelopeCurve) {
  const out = [];
  for (const p of (Array.isArray(finalCurve) ? finalCurve : [])) {
    const env = envelopeCurve?.find(e => e.frequency === p.frequency);
    if (!env) continue;
    if (Number.isFinite(p.spl) && Number.isFinite(env.spl) && p.spl > env.spl + 0.05)
      out.push({ frequency: p.frequency, finalSpl: Math.round(p.spl * 100) / 100, envelopeSpl: Math.round(env.spl * 100) / 100, excessDb: Math.round((p.spl - env.spl) * 100) / 100 });
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
      if (Number.isFinite(p.spl) && Number.isFinite(env.spl) && p.spl > env.spl + 0.05)
        out.push({ seatId: seat.seatId, frequency: p.frequency, finalSpl: Math.round(p.spl * 100) / 100, envelopeSpl: Math.round(env.spl * 100) / 100, excessDb: Math.round((p.spl - env.spl) * 100) / 100 });
    }
  }
  return out;
}

// ─── TEST 1 ───
const rc1 = frequencies.map(f => ({ frequency: f, spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 42, 7, 7) + gaussian(f, 73, 9, -4) + gaussian(f, 118, 1.5, -15) }));
const sc1 = (id, s) => ({ seatId: id, responseData: rc1.map(p => ({ ...p, spl: p.spl + s })) });
const p1 = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
const c1 = selectCandidateFromPool(p1).selectedCandidate;
const f1 = fb(c1);
const bd1 = dev(c1.rspBeforePeqAtOperatingLevel, c1.productionHouseCurveTarget);
const ad1 = dev(c1.finalPostEqCurve, c1.productionHouseCurveTarget);

// ─── TEST 2 ───
const rc2 = frequencies.map(f => ({ frequency: f, spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 80, 10, -4) }));
const p2 = generateCanonicalCandidatePool({ rawCurve: rc2, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc2.map(p => ({ ...p })) }], selectedP14TargetDb: 105, p14TargetBasis: "minimum", p14TargetLevel: 1 });
const c2 = selectCandidateFromPool(p2).selectedCandidate;
const f2 = fb(c2);

// ─── TEST 3 ───
const rc3 = frequencies.map(f => ({ frequency: f, spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 95, 1.0, -15) }));
const p3 = generateCanonicalCandidatePool({ rawCurve: rc3, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc3.map(p => ({ ...p })) }], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
const c3 = selectCandidateFromPool(p3).selectedCandidate;
const f3 = fb(c3);
const pn3 = c3.protectedNullRegions || [];
const boostInNull3 = f3.filter(f => f.gain > 0.1 && pn3.some(r => f.freq >= r.startHz && f.freq <= r.endHz));

// ─── TEST 4 ───
const p4 = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 125, p14TargetBasis: "recommended", p14TargetLevel: 4 });
const c4 = selectCandidateFromPool(p4).selectedCandidate;
const f4 = fb(c4);

const result = {
  test1: {
    filters: f1, beforeDev: bd1, afterDev: ad1,
    null118: { before: val(c1.rspBeforePeqAtOperatingLevel, 118), after: val(c1.finalPostEqCurve, 118), target: val(c1.productionHouseCurveTarget, 118) },
    peak42: { before: val(c1.rspBeforePeqAtOperatingLevel, 42), after: val(c1.finalPostEqCurve, 42) },
    dip73: { before: val(c1.rspBeforePeqAtOperatingLevel, 73), after: val(c1.finalPostEqCurve, 73), target: val(c1.productionHouseCurveTarget, 73) },
    protectedNulls: (c1.protectedNullRegions || []).map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    physPass: c1.physicalValidation?.passed, bankLimits: c1.aggregateBankLimits,
    envelopeExceedances: envelopeExceedances(c1.finalPostEqCurve, c1.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c1.rspBeforePeqAtOperatingLevel, c1.finalPostEqCurve, c1.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c1.perSeatPostEqCurves, c1.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f1.map(f => f.gain)), maxCutDb: Math.min(0, ...f1.map(f => f.gain)),
    p14HeadroomDb: c1.productOperatingHeadroomDb,
  },
  test2: {
    filters: f2,
    dip80: { before: val(c2.rspBeforePeqAtOperatingLevel, 80), after: val(c2.finalPostEqCurve, 80), target: val(c2.productionHouseCurveTarget, 80) },
    protNullCount: (c2.protectedNullRegions || []).length, physPass: c2.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c2.finalPostEqCurve, c2.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c2.rspBeforePeqAtOperatingLevel, c2.finalPostEqCurve, c2.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c2.perSeatPostEqCurves, c2.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f2.map(f => f.gain)),
  },
  test3: {
    filters: f3,
    null95: { before: val(c3.rspBeforePeqAtOperatingLevel, 95), after: val(c3.finalPostEqCurve, 95), target: val(c3.productionHouseCurveTarget, 95) },
    protNulls: pn3.map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    boostInNullCount: boostInNull3.length, physPass: c3.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c3.finalPostEqCurve, c3.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c3.rspBeforePeqAtOperatingLevel, c3.finalPostEqCurve, c3.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c3.perSeatPostEqCurves, c3.productOperatingEnvelopeCurve),
  },
  test4: {
    filters: f4, capLimitedPts: c4.capabilityLimitedPointCount,
    capRegions: (c4.capabilityLimitedRegions || []).map(r => ({ start: r.startHz, end: r.endHz, worst: r.worstFrequencyHz, shortfall: r.maximumShortfallDb })),
    freq60: { target: val(c4.productionHouseCurveTarget, 60), before: val(c4.rspBeforePeqAtOperatingLevel, 60), after: val(c4.finalPostEqCurve, 60), envelope: val(c4.productOperatingEnvelopeCurve, 60) },
    physPass: c4.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c4.finalPostEqCurve, c4.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c4.rspBeforePeqAtOperatingLevel, c4.finalPostEqCurve, c4.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c4.perSeatPostEqCurves, c4.productOperatingEnvelopeCurve),
    p14HeadroomDb: c4.productOperatingHeadroomDb, p14ShortfallDb: c4.productOperatingShortfallDb,
  },
};

const output = JSON.stringify(result, null, 2);
writeFileSync('./src/__bass_eq_b1_results_part1.json', output, 'utf8');
console.log(output);
console.log('\n[Saved to ./src/__bass_eq_b1_results_part1.json]');