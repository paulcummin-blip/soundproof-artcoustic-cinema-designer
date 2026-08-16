import { rp22ByNumber } from "@/components/data/rp22Parameters";
import { p14ThresholdsForBasis, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { normalizeP18TargetBasis, p18ThresholdsForBasis } from "@/components/utils/p18ExtensionAuthority";

const LEVEL_KEYS = ["L1", "L2", "L3", "L4"];

// Reads the app's locked RP22 parameter catalogue; no bass thresholds live here.
export function getRp22BassOperatingDefinitions(p14TargetBasis = "recommended", p18TargetBasis = p14TargetBasis) {
  const selectedP14 = p14ThresholdsForBasis(p14TargetBasis);
  const selectedP18 = p18ThresholdsForBasis(p18TargetBasis);
  const p19 = rp22ByNumber[19]?.thresholds || {};
  const p20 = rp22ByNumber[20]?.thresholds || {};
  return LEVEL_KEYS.map((level, index) => ({
    level,
    value: index + 1,
    p14TargetBasis: normalizeP14TargetBasis(p14TargetBasis),
    p18TargetBasis: normalizeP18TargetBasis(p18TargetBasis),
    p14TargetDb: selectedP14[level],
    p14UpperHz: 120,
    p18LimitHz: selectedP18[level],
    // P18 is conditional on extension at the selected P14 basis,
    // not always at the Recommended P14 threshold.
    p18CutoffDb: Number(selectedP14[level]) - 3,
    p19ToleranceDb: p19[level],
    p20ToleranceDb: p20[level],
  }));
}