import { computeOfficialP19Assessment } from "@/components/utils/bassAuthoritativeAssessment";

const FREQUENCIES = [20, 25, 31.5, 40, 50, 63, 80, 100, 120];
const flat = (spl) => FREQUENCIES.map((f) => ({ frequency: f, spl }));
const TARGET = flat(100);

const result = computeOfficialP19Assessment({
  rspPostEqCurve: flat(102.9),
  canonicalTargetCurve: TARGET,
  assessmentStartHz: 20,
  assessmentEndHz: 120,
});

console.log(JSON.stringify({
  variationDbRaw: result.variationDbRaw,
  displayVariationDb: result.displayVariationDb,
  level: result.level,
  worstFrequencyHz: result.worstFrequencyHz,
  residualCurve: result.residualCurve?.map((p) => ({
    f: Math.round(p.frequency * 10) / 10,
    spl: Math.round(p.spl * 100) / 100,
    target: Math.round(p.targetDb * 100) / 100,
    residual: Math.round(p.residualDb * 100) / 100,
    protected: p.protected,
  })),
}, null, 2));