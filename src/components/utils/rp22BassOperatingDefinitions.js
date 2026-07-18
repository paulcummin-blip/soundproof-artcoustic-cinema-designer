import { rp22ByNumber } from "@/components/data/rp22Parameters";

const LEVEL_KEYS = ["L1", "L2", "L3", "L4"];

// Reads the app's locked RP22 parameter catalogue; no bass thresholds live here.
export function getRp22BassOperatingDefinitions() {
  const p14 = rp22ByNumber[14]?.thresholds || {};
  const p18 = rp22ByNumber[18]?.thresholds || {};
  const p19 = rp22ByNumber[19]?.thresholds || {};
  return LEVEL_KEYS.map((level, index) => ({
    level,
    value: index + 1,
    p14TargetDb: p14[level],
    p14UpperHz: 120,
    p18LimitHz: p18[level],
    p18CutoffDb: Number(p14[level]) - 3,
    p19ToleranceDb: p19[level],
  }));
}