import { roundDbValue } from "@/components/utils/splDisplayFormatter";

// Conventional whole-number dB display (round half away from zero).
// Display only — callers retain full-precision values for all calculations.
export function formatDb(value) {
  const whole = roundDbValue(value);
  return whole === null ? '—' : `${whole} dB`;
}