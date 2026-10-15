// The Bass Optimisation result panel offers ONE re-test action.
// ---------------------------------------------------------------------------
// The re-test outcomes (Re-test Needed · Evaluation Could Not Complete) word the
// panel's own run control as the re-test itself. While that control is drawn it
// IS the re-test, so it is the only re-test control on the card, it owns the
// dark-green primary, and the helper line sits directly under it. These are
// source-level presentation checks: no optimiser logic, no retest behaviour, no
// stale detection and no P19/P20 definition is asserted or changed here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OPTIMISER_PRESENTATION_ACTION,
  OPTIMISER_RETEST_HELPER_SENTENCE,
  OPTIMISER_RETEST_LABEL,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";


const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const journey = read("src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");
const control = read("src/components/room/bass/optimiserPlan/ReoptimiseCalibrationAction.jsx");

describe("one re-test control", () => {
  it("stands the calibration control down while the run control is the re-test", () => {
    // The rule reads the re-test WORDING as well as the action, so a run control
    // that says "Re-test Bass Optimisation" always owns that one re-test.
    expect(journey).toMatch(/const runControlIsRetest = journey\.action === OPTIMISER_PRESENTATION_ACTION\.RETEST/);
    expect(journey).toMatch(/\|\| journey\.actionLabel === OPTIMISER_RETEST_LABEL/);
    expect(journey).toMatch(
      /const retestOwnsPrimary = runControlIsRetest[\s\S]*?showAction[\s\S]*?!panelShowsRerun/,
    );
    // The re-test STATE stands the calibration control down too: in the re-test
    // state the panel draws one control and nothing else.
    expect(journey).toMatch(
      /onReoptimise=\{retestNeeded \|\| isRunning \|\| retestOwnsPrimary[\s\S]*?onReoptimiseCalibration\}/,
    );
    expect(journey).toMatch(/\|\| retestNeeded;/);
    // The re-test is never a second primary for the layout model either.
    expect(journey).toMatch(/&& !retestOwnsPrimary,/);
  });

  it("draws that one control as the dark-green primary", () => {
    expect(journey).toMatch(/const runIsPrimary = retestOwnsPrimary/);
    expect(journey).toMatch(
      /const ADI_RUN_PRIMARY_CLASS = "[^"]*bg-\[#213428\][^"]*"/,
    );
    expect(journey).toMatch(/className=\{runIsPrimary \? ADI_RUN_PRIMARY_CLASS : ADI_RUN_SECONDARY_CLASS\}/);
  });

  it("keeps the helper text directly under that control", () => {
    expect(OPTIMISER_RETEST_HELPER_SENTENCE).toBe(
      "ADI re-checks the current design and only proposes a change where it improves the result.",
    );
    const controlBlockAt = journey.indexOf("{showAction && !panelShowsRerun && (");
    const helperAt = journey.indexOf("{OPTIMISER_RETEST_HELPER_SENTENCE},");
    const helperUse = journey.indexOf("{OPTIMISER_RETEST_HELPER_SENTENCE}");
    const detailsAt = journey.indexOf("data-adi-engineer-details");
    expect(controlBlockAt).toBeGreaterThan(-1);
    expect(helperUse).toBeGreaterThan(controlBlockAt);
    expect(helperUse).toBeLessThan(detailsAt);
    expect(helperAt).toBe(-1);
  });
});

describe("the re-test itself is unchanged", () => {
  it("still resolves the same one control and wording", () => {
    const failed = resolveOptimiserPresentationState({ planView: null, runStatus: "failed" });
    expect(failed.action).toBe(OPTIMISER_PRESENTATION_ACTION.RETEST);
    expect(failed.actionLabel).toBe(OPTIMISER_RETEST_LABEL);
  });

  it("keeps the calibration control's own action and copy intact", () => {
    expect(control).toContain('export const CALIBRATION_APPLY_BUTTON_LABEL = "Re-test Bass Optimisation";');
    expect(control).toContain('export const CALIBRATION_APPLY_BUSY_LABEL = "Re-testing Bass Optimisation…";');
    expect(control).toContain("CALIBRATION_APPLY_SCOPE_SENTENCE");
    expect(control).toContain("onReoptimise");
  });
});