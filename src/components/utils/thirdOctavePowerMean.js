const finite = (value) => Number.isFinite(Number(value));

export function smoothThirdOctavePowerMean(curve) {
  const sorted = (curve || [])
    .filter((point) => finite(point?.frequency) && finite(point?.spl) && point.frequency > 0)
    .map((point) => ({ ...point, frequency: Number(point.frequency), spl: Number(point.spl) }))
    .sort((a, b) => a.frequency - b.frequency);
  if (!sorted.length) return [];
  const halfBandRatio = Math.pow(2, 1 / 6);
  return sorted.map((centre) => {
    const lowerHz = centre.frequency / halfBandRatio;
    const upperHz = centre.frequency * halfBandRatio;
    const samples = sorted.filter((point) => point.frequency >= lowerHz && point.frequency <= upperHz);
    const meanPower = samples.reduce((sum, point) => sum + Math.pow(10, point.spl / 10), 0) / samples.length;
    return { frequency: centre.frequency, spl: 10 * Math.log10(meanPower), sampleCount: samples.length, lowerHz, upperHz };
  });
}