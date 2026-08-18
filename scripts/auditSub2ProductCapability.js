import { getSystemSourceCapability } from "../src/components/utils/subwooferCapability.js";

const subs = (count) => Array.from({ length: count }, (_, index) => ({
  id: `sub2-12-${index + 1}`,
  modelKey: "sub2-12",
}));

const frequenciesHz = [15, 18, 20, 25, 30, 31.5, 40, 50, 63, 80, 100, 120];
const rows = frequenciesHz.map((frequency) => {
  const oneSubDb = getSystemSourceCapability(subs(1), frequency);
  const fourSubsDb = getSystemSourceCapability(subs(4), frequency);
  return {
    frequency,
    oneSubDb,
    fourSubsDb,
    quantityGainDb: fourSubsDb - oneSubDb,
  };
});

const exactPowerSum = rows.every((row) => Math.abs(row.quantityGainDb - 10 * Math.log10(4)) < 1e-9);
console.log(JSON.stringify({
  model: "SUB2-12",
  authority: "approved continuous maximum SPL engineering trace at 1 m, half-space",
  summation: "power-summed product-domain quantity gain",
  exactPowerSum,
  rows,
}, null, 2));

if (!exactPowerSum) process.exitCode = 1;
