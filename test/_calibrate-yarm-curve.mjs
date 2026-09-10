import { integrateRawResponseLevelDbC, cWeightingCorrectionDb } from "../src/components/utils/p14HouseCurveNormalisation.js";

const bands = [20, 25, 31.5, 40, 50, 63, 80, 100];
const cWeight = {};
bands.forEach(f => { cWeight[f] = cWeightingCorrectionDb(f); });

// Target: 20-120 ≈ 111.8 dBC (valid), 30-120 ≈ 111.1 dBC (invalid)
const curve = [
  { frequency: 15, spl: 80.5 },
  { frequency: 18, spl: 90.5 },
  { frequency: 20, spl: 104.5 },
  { frequency: 22, spl: 105.5 },
  { frequency: 25, spl: 106.0 },
  { frequency: 28, spl: 105.5 },
  { frequency: 30, spl: 105.0 },
  { frequency: 31.5, spl: 104.8 },
  { frequency: 35, spl: 104.5 },
  { frequency: 40, spl: 104.5 },
  { frequency: 50, spl: 104.7 },
  { frequency: 63, spl: 104.8 },
  { frequency: 80, spl: 104.7 },
  { frequency: 100, spl: 104.5 },
  { frequency: 120, spl: 104.0 },
];

const r20 = integrateRawResponseLevelDbC({ rawCurve: curve, lowerHz: 20, upperHz: 120 });
const r30 = integrateRawResponseLevelDbC({ rawCurve: curve, lowerHz: 30, upperHz: 120 });

console.log(`C-weightings: ${JSON.stringify(cWeight)}`);
console.log(`20-120: ${r20?.toFixed(6)} dBC (error ${(r20-112).toFixed(6)}, valid ${Math.abs(r20-112) <= 0.5})`);
console.log(`30-120: ${r30?.toFixed(6)} dBC (error ${(r30-112).toFixed(6)}, valid ${Math.abs(r30-112) <= 0.5})`);
console.log(`diff: ${(r20-r30).toFixed(6)} dB`);