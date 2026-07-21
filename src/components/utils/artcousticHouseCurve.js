export const ARTCOUSTIC_HOUSE_CURVE = [
  { frequency: 15, offsetDb: 6.0 },
  { frequency: 20, offsetDb: 6.0 },
  { frequency: 30, offsetDb: 6.0 },
  { frequency: 40, offsetDb: 5.0 },
  { frequency: 50, offsetDb: 4.0 },
  { frequency: 63, offsetDb: 3.0 },
  { frequency: 80, offsetDb: 2.5 },
  { frequency: 100, offsetDb: 2.0 },
  { frequency: 120, offsetDb: 1.5 },
  { frequency: 150, offsetDb: 1.2 },
  { frequency: 200, offsetDb: 0.8 },
  { frequency: 400, offsetDb: 0.0 },
];

export function artcousticHouseCurveOffsetAt(frequency) {
  if (!Number.isFinite(Number(frequency)) || frequency <= ARTCOUSTIC_HOUSE_CURVE[0].frequency) return 6.0;
  const last = ARTCOUSTIC_HOUSE_CURVE[ARTCOUSTIC_HOUSE_CURVE.length - 1];
  if (frequency >= last.frequency) return 0.0;
  for (let index = 0; index < ARTCOUSTIC_HOUSE_CURVE.length - 1; index += 1) {
    const low = ARTCOUSTIC_HOUSE_CURVE[index];
    const high = ARTCOUSTIC_HOUSE_CURVE[index + 1];
    if (frequency >= low.frequency && frequency <= high.frequency) {
      const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
      return low.offsetDb + (high.offsetDb - low.offsetDb) * ratio;
    }
  }
  return 0.0;
}