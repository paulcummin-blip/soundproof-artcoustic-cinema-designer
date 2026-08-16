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
  return { passed: boundaries.length + minimum.length + recommended.length + 2 };
}
