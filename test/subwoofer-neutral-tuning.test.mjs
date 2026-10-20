import { describe, it, expect } from "vitest";
import { applyCountChange } from "../src/components/utils/subwooferInstanceCompatibility";
import { neutraliseSubwooferTuning, neutraliseDesignStateForNewVersion } from "../src/components/utils/subwooferNeutralTuning";
import { extractAppliedCalibrationValues } from "../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority.js";

const tuned = { id: "s1", model: "SUB2-12", enabled: true, legacyGroup: "front", position: { x: 1, y: 0.3 }, bottomHeightM: 0, rotationDeg: 0, gainDb: -4.5, delayMs: 7.2, polarity: -1, phaseControlDeg: 90 };

describe("neutral subwoofer tuning", () => {
  it("one to two subs: both neutral, position kept", () => {
    const next = applyCountChange([tuned], "front", 2, { model: "SUB2-12" }, { widthM: 5, lengthM: 7, heightM: 2.8 });
    expect(next.filter((s) => s.enabled !== false)).toHaveLength(2);
    const out = neutraliseSubwooferTuning(next);
    for (const s of out) expect([s.gainDb, s.delayMs, s.polarity, s.phaseControlDeg]).toEqual([0, 0, 1, 0]);
    expect(out[0].position).toEqual(tuned.position);
    expect(extractAppliedCalibrationValues(out).every((v) => v.gainDb === 0 && v.delayMs === 0 && v.polarity === 1 && v.phaseControlDeg === 0)).toBe(true);
  });
  it("new version clears tuning and applied calibration; geometry/crossover kept", () => {
    const ds = neutraliseDesignStateForNewVersion({ subwooferInstances: [tuned], applied_calibration: { a: 1 }, crossover: { hz: 80 } });
    expect(ds.applied_calibration).toBeNull();
    expect(ds.crossover).toEqual({ hz: 80 });
    expect(ds.subwooferInstances[0]).toMatchObject({ gainDb: 0, delayMs: 0, polarity: 1, phaseControlDeg: 0, position: tuned.position });
  });
});
