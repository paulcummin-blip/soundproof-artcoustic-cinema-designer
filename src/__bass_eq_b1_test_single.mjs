import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

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
    mx = Math.max(mx, Math.abs(d)); ss += d * d;
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

const testNum = process.argv[2];
const outPath = `./src/__bass_eq_b1_results_test${testNum}.json`;

const rc1 = frequencies.map(f => ({ frequency: f, spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 42, 7, 7) + gaussian(f, 73, 9, -4) + gaussian(f, 118, 1.5, -15) }));
const sc1 = (id, s) => ({ seatId: id, responseData: rc1.map(p => ({ ...p, spl: p.spl + s })) });

let result = {};

if (testNum === "1") {
  const p = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const c = selectCandidateFromPool(p).selectedCandidate;
  const f = fb(c);
  result = {
    filters: f, beforeDev: dev(c.rspBeforePeqAtOperatingLevel, c.productionHouseCurveTarget), afterDev: dev(c.finalPostEqCurve, c.productionHouseCurveTarget),
    null118: { before: val(c.rspBeforePeqAtOperatingLevel, 118), after: val(c.finalPostEqCurve, 118), target: val(c.productionHouseCurveTarget, 118) },
    peak42: { before: val(c.rspBeforePeqAtOperatingLevel, 42), after: val(c.finalPostEqCurve, 42) },
    dip73: { before: val(c.rspBeforePeqAtOperatingLevel, 73), after: val(c.finalPostEqCurve, 73), target: val(c.productionHouseCurveTarget, 73) },
    protectedNulls: (c.protectedNullRegions || []).map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    physPass: c.physicalValidation?.passed, bankLimits: c.aggregateBankLimits,
    envelopeExceedances: envelopeExceedances(c.finalPostEqCurve, c.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c.rspBeforePeqAtOperatingLevel, c.finalPostEqCurve, c.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c.perSeatPostEqCurves, c.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f.map(x => x.gain)), maxCutDb: Math.min(0, ...f.map(x => x.gain)),
    p14HeadroomDb: c.productOperatingHeadroomDb,
  };
} else if (testNum === "2") {
  const rc = frequencies.map(f => ({ frequency: f, spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 80, 10, -4) }));
  const p = generateCanonicalCandidatePool({ rawCurve: rc, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc.map(x => ({ ...x })) }], selectedP14TargetDb: 105, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const c = selectCandidateFromPool(p).selectedCandidate;
  const f = fb(c);
  result = {
    filters: f,
    dip80: { before: val(c.rspBeforePeqAtOperatingLevel, 80), after: val(c.finalPostEqCurve, 80), target: val(c.productionHouseCurveTarget, 80) },
    protNullCount: (c.protectedNullRegions || []).length, physPass: c.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c.finalPostEqCurve, c.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c.rspBeforePeqAtOperatingLevel, c.finalPostEqCurve, c.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c.perSeatPostEqCurves, c.productOperatingEnvelopeCurve),
    maxBoostDb: Math.max(0, ...f.map(x => x.gain)),
  };
} else if (testNum === "3") {
  const rc = frequencies.map(f => ({ frequency: f, spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 95, 1.0, -15) }));
  const p = generateCanonicalCandidatePool({ rawCurve: rc, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc.map(x => ({ ...x })) }], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const c = selectCandidateFromPool(p).selectedCandidate;
  const f = fb(c);
  const pn = c.protectedNullRegions || [];
  const boostInNull = f.filter(x => x.gain > 0.1 && pn.some(r => x.freq >= r.startHz && x.freq <= r.endHz));
  result = {
    filters: f,
    null95: { before: val(c.rspBeforePeqAtOperatingLevel, 95), after: val(c.finalPostEqCurve, 95), target: val(c.productionHouseCurveTarget, 95) },
    protNulls: pn.map(r => ({ start: r.startHz, end: r.endHz, depth: r.depthDb })),
    boostInNullCount: boostInNull.length, physPass: c.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c.finalPostEqCurve, c.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c.rspBeforePeqAtOperatingLevel, c.finalPostEqCurve, c.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c.perSeatPostEqCurves, c.productOperatingEnvelopeCurve),
  };
} else if (testNum === "4") {
  const p = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 125, p14TargetBasis: "recommended", p14TargetLevel: 4 });
  const c = selectCandidateFromPool(p).selectedCandidate;
  const f = fb(c);
  result = {
    filters: f, capLimitedPts: c.capabilityLimitedPointCount,
    capRegions: (c.capabilityLimitedRegions || []).map(r => ({ start: r.startHz, end: r.endHz, worst: r.worstFrequencyHz, shortfall: r.maximumShortfallDb })),
    freq60: { target: val(c.productionHouseCurveTarget, 60), before: val(c.rspBeforePeqAtOperatingLevel, 60), after: val(c.finalPostEqCurve, 60), envelope: val(c.productOperatingEnvelopeCurve, 60) },
    physPass: c.physicalValidation?.passed,
    envelopeExceedances: envelopeExceedances(c.finalPostEqCurve, c.productOperatingEnvelopeCurve),
    protectedNullBoostViolations: protectedNullBoostViolations(c.rspBeforePeqAtOperatingLevel, c.finalPostEqCurve, c.protectedNullRegions),
    perSeatEnvelopeExceedances: perSeatEnvelopeExceedances(c.perSeatPostEqCurves, c.productOperatingEnvelopeCurve),
    p14HeadroomDb: c.productOperatingHeadroomDb, p14ShortfallDb: c.productOperatingShortfallDb,
  };
} else if (testNum === "5") {
  const pL1 = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const cL1 = selectCandidateFromPool(pL1).selectedCandidate;
  const fL1 = fb(cL1);
  const pL4 = generateCanonicalCandidatePool({ rawCurve: rc1, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [sc1("s1", -0.6), sc1("s2", 0.8)], selectedP14TargetDb: 118, p14TargetBasis: "recommended", p14TargetLevel: 4 });
  const cL4 = selectCandidateFromPool(pL4).selectedCandidate;
  const fL4 = fb(cL4);
  result = {
    L1: { filters: fL1, capLimitedPts: cL1.capabilityLimitedPointCount, headroomDb: cL1.productOperatingHeadroomDb, bankLimits: cL1.aggregateBankLimits, maxBoostDb: Math.max(0, ...fL1.map(x => x.gain)), maxCutDb: Math.min(0, ...fL1.map(x => x.gain)) },
    L4: { filters: fL4, capLimitedPts: cL4.capabilityLimitedPointCount, headroomDb: cL4.productOperatingHeadroomDb, bankLimits: cL4.aggregateBankLimits, maxBoostDb: Math.max(0, ...fL4.map(x => x.gain)), maxCutDb: Math.min(0, ...fL4.map(x => x.gain)) },
    filterBanksDiffer: JSON.stringify(fL1) !== JSON.stringify(fL4),
    L1envelopeExceedances: envelopeExceedances(cL1.finalPostEqCurve, cL1.productOperatingEnvelopeCurve),
    L4envelopeExceedances: envelopeExceedances(cL4.finalPostEqCurve, cL4.productOperatingEnvelopeCurve),
  };
} else if (testNum === "6") {
  const rc6a = frequencies.map(f => ({ frequency: f, spl: 112 + 3 * Math.log10(120 / f) + gaussian(f, 45, 6, 6) + gaussian(f, 85, 8, -3) }));
  const rc6b = frequencies.map(f => ({ frequency: f, spl: 113 + 3.5 * Math.log10(120 / f) + gaussian(f, 55, 5, -5) + gaussian(f, 100, 7, 5) }));
  const pa = generateCanonicalCandidatePool({ rawCurve: rc6a, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc6a.map(x => ({ ...x })) }], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const ca = selectCandidateFromPool(pa).selectedCandidate;
  const fa = fb(ca);
  const pb = generateCanonicalCandidatePool({ rawCurve: rc6b, activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }], usableLfHz: 20, transitionHz: 163.3, correctionEndHz: 200, perSeatRawCurves: [{ seatId: "s1", responseData: rc6b.map(x => ({ ...x })) }], selectedP14TargetDb: 109, p14TargetBasis: "minimum", p14TargetLevel: 1 });
  const cb = selectCandidateFromPool(pb).selectedCandidate;
  const fbb = fb(cb);
  result = {
    roomA: { filters: fa, peak45before: val(ca.rspBeforePeqAtOperatingLevel, 45), peak45after: val(ca.finalPostEqCurve, 45), dip85before: val(ca.rspBeforePeqAtOperatingLevel, 85), dip85after: val(ca.finalPostEqCurve, 85) },
    roomB: { filters: fbb, dip55before: val(cb.rspBeforePeqAtOperatingLevel, 55), dip55after: val(cb.finalPostEqCurve, 55), peak100before: val(cb.rspBeforePeqAtOperatingLevel, 100), peak100after: val(cb.finalPostEqCurve, 100) },
    filterBanksDiffer: JSON.stringify(fa) !== JSON.stringify(fbb),
    roomAEnvelopeExceedances: envelopeExceedances(ca.finalPostEqCurve, ca.productOperatingEnvelopeCurve),
    roomBEnvelopeExceedances: envelopeExceedances(cb.finalPostEqCurve, cb.productOperatingEnvelopeCurve),
  };
}

const output = JSON.stringify(result, null, 2);
writeFileSync(outPath, output, 'utf8');
console.log(output);
console.log(`\n[Saved to ${outPath}]`);