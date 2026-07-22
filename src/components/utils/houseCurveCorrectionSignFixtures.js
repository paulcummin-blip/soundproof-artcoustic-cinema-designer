import { resolveRequiredCorrectionDb } from "@/components/utils/houseCurveTargetAuthority";

export function runHouseCurveCorrectionSignFixtures() {
  const peak = resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 108 });
  const valley = resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 96 });
  const protectedNull = resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 80, protectedNull: true });
  const onTarget = resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 100 });
  const initialResidual = Math.abs(resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 108 }));
  const reappliedResidual = Math.abs(resolveRequiredCorrectionDb({ targetSplDb: 100, currentPostEqSplDb: 108 + peak }));
  const checks = [
    ["8 dB peak produces cut", peak === -8],
    ["4 dB valley produces boost", valley === 4],
    ["protected null suppresses boost", protectedNull === 0],
    ["on-target point produces zero", Math.abs(onTarget) <= 1e-12],
    ["reapplying correction reduces residual", reappliedResidual < initialResidual],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return { checks, passed: checks.filter((check) => check.passed).length, total: checks.length, allPassed: checks.every((check) => check.passed) };
}