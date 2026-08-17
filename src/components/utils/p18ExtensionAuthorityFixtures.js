import { assessP18AgainstRequiredExtension } from "@/components/utils/bassDesignPhilosophyAuthority";
import { deriveRequestedCalibrationConfig } from "@/components/room/bass/requestedCalibrationConfig";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";
import {
  assessP18Extension,
  gradeP18ForBasis,
  p18PerformanceMultiplier,
  resolveP18DesignHz,
} from "@/components/utils/p18ExtensionAuthority";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runP18ExtensionAuthorityFixtures() {
  const boundaries = [
    { raw: 36, design: 36, band: 0, multiplier: -5 },
    { raw: 35.99, design: 35, band: 1, multiplier: 2 },
    { raw: 35, design: 35, band: 1, multiplier: 2 },
    { raw: 30.99, design: 30, band: 2, multiplier: 4 },
    { raw: 30, design: 30, band: 2, multiplier: 4 },
    { raw: 25.99, design: 25, band: 3, multiplier: 6 },
    { raw: 25, design: 25, band: 3, multiplier: 6 },
    { raw: 20.99, design: 20, band: 4, multiplier: 8 },
    { raw: 20, design: 20, band: 4, multiplier: 8 },
    { raw: 18.99, design: 18, band: 5, multiplier: 10 },
    { raw: 18, design: 18, band: 5, multiplier: 10 },
    { raw: 15.99, design: 15, band: 6, multiplier: 12 },
    { raw: 15, design: 15, band: 6, multiplier: 12 },
  ];
  for (const fixture of boundaries) {
    const result = assessP18Extension(fixture.raw, "minimum");
    assert(resolveP18DesignHz(fixture.raw) === fixture.design, `${fixture.raw} Hz flooring`);
    assert(result.performanceBand === fixture.band, `${fixture.raw} Hz band`);
    assert(p18PerformanceMultiplier(fixture.raw) === fixture.multiplier, `${fixture.raw} Hz multiplier`);
  }

  const minimum = [
    [36, 0], [35.99, 1], [30.99, 2], [20.99, 3], [18.99, 4],
  ];
  const recommended = [
    [36, 0], [35.99, 0], [30.99, 1], [25.99, 2], [18.99, 3], [15.99, 4],
  ];
  for (const [raw, level] of minimum) assert(gradeP18ForBasis(raw, "minimum") === level, `Minimum ${raw} Hz => L${level}`);
  for (const [raw, level] of recommended) assert(gradeP18ForBasis(raw, "recommended") === level, `Recommended ${raw} Hz => L${level}`);

  assert(p18PerformanceMultiplier(30) === 4, "30 Hz must use shared physical score");
  assert(p18PerformanceMultiplier(18) === 10, "18 Hz must use shared physical score");

  const calibrationArgs = {
    optimisationTransitionHz: 163.3,
    designEqSystemLimits: { usableLfHz: 22 },
  };
  const recommendedL3 = deriveRequestedCalibrationConfig({
    ...calibrationArgs,
    splConfig: {
      selectedP14TargetBasis: "recommended",
      selectedP18TargetBasis: "recommended",
      selectedP14Level: 3,
    },
  });
  const recommendedL1 = deriveRequestedCalibrationConfig({
    ...calibrationArgs,
    splConfig: {
      selectedP14TargetBasis: "recommended",
      selectedP18TargetBasis: "recommended",
      selectedP14Level: 1,
    },
  });
  const recommendedL4 = deriveRequestedCalibrationConfig({
    ...calibrationArgs,
    splConfig: {
      selectedP14TargetBasis: "recommended",
      selectedP18TargetBasis: "recommended",
      selectedP14Level: 4,
    },
  });
  assert(recommendedL3.selectedP14TargetDb === 120, "Recommended L3 must remain the fixed 120 dBC P14 request");
  assert(recommendedL3.selectedP14RequiredExtensionHz === 20, "P14 must always assess the fixed 20–120 Hz band");
  assert(recommendedL3.selectedP18RequiredExtensionHz === 30, "Recommended P18 L1 boundary must be 30 Hz");
  assert(recommendedL1.selectedP18RequiredExtensionHz === 30, "P18 floor must not follow a P14 L1 selection");
  assert(recommendedL4.selectedP18RequiredExtensionHz === 30, "P18 floor must not follow a P14 L4 selection");

  const independentP18Pass = buildPostEqBassCapabilityOutcome({
    authority: {
      requested: { level: "L3", targetSplDb: 120 },
      selectedTargetBasis: "recommended",
      achieved: { levelNumber: 3 },
      assessments: { recommended: { levels: { L3: { status: "PASS", worstCapabilityDb: 121 } } } },
    },
    requestedLevel: 3,
    targetAnchorDb: 120,
    scalarP14: { value: 121, level: 3 },
    achievedP18Level: 1,
    achievedP18FrequencyHz: 30,
    p18RequiredExtensionAssessment: { passes: true, requiredExtensionHz: 30, achievedExtensionHz: 30 },
  });
  assert(independentP18Pass.passesRequestedLevel, "P14 Recommended L3 plus P18 Recommended L1 must be a valid independent result");
  assert(independentP18Pass.parameterLevels.P18 === 1, "P18 must publish its achieved L1, not inherit P14 L3");
  assert(independentP18Pass.limitingParameter == null, "Achieved P18 L1 must not create a false P18 limitation");

  const independentP18Fail = buildPostEqBassCapabilityOutcome({
    authority: {
      requested: { level: "L3", targetSplDb: 120 },
      selectedTargetBasis: "recommended",
      achieved: { levelNumber: 3 },
      assessments: { recommended: { levels: { L3: { status: "PASS", worstCapabilityDb: 121 } } } },
    },
    requestedLevel: 3,
    targetAnchorDb: 120,
    scalarP14: { value: 121, level: 3 },
    achievedP18Level: 0,
    achievedP18FrequencyHz: 36,
    p18RequiredExtensionAssessment: { passes: false, requiredExtensionHz: 30, achievedExtensionHz: 36, shortfallHz: 6 },
  });
  assert(!independentP18Fail.passesRequestedLevel, "P18 below the selected basis L1 boundary must still fail");
  assert(independentP18Fail.limitingParameter === "P18", "A genuine P18 floor miss must remain an explicit P18 limitation");

  const extensionFrequencies = [15, 18, 20, 22, 25, 30, 40, 60, 80, 100, 120];
  const targetCurve = extensionFrequencies.map((frequency) => ({ frequency, spl: 100 }));
  const lowOutputCurve = extensionFrequencies.map((frequency) => ({
    frequency,
    spl: frequency < 18 ? 95 : frequency === 18 ? 97 : 100,
  }));
  const highOutputCurve = extensionFrequencies.map((frequency) => ({
    frequency,
    spl: frequency < 25 ? 92 : frequency === 25 ? 95 : frequency === 30 ? 97 : 100,
  }));
  const lowOutputP18 = assessP18AgainstRequiredExtension({
    rspPostEqCurve: lowOutputCurve,
    canonicalTargetCurve: targetCurve,
    selectedP14TargetDb: 109,
    requiredExtensionHz: 20,
    configuredUsableLfHz: 22,
  });
  const highOutputP18 = assessP18AgainstRequiredExtension({
    rspPostEqCurve: highOutputCurve,
    canonicalTargetCurve: targetCurve,
    selectedP14TargetDb: 120,
    requiredExtensionHz: 20,
    configuredUsableLfHz: 22,
  });
  assert(lowOutputP18.achievedExtensionHz < 22, "In-room P18 must be allowed below the nominal product -6 dB point");
  assert(highOutputP18.achievedExtensionHz === 30, "Higher-output P18 fixture must expose the shallower extension");
  assert(lowOutputP18.achievedExtensionHz < highOutputP18.achievedExtensionHz, "Lower P14 output must be able to earn deeper P18 extension");
  return { passed: boundaries.length + minimum.length + recommended.length + 15 };
}
