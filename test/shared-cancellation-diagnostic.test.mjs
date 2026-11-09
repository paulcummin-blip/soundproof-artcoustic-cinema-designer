// test/shared-cancellation-diagnostic.test.mjs
// Source tests for the shared cancellation diagnostic.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { diagnoseSharedCancellations } from "../src/components/room/bass/improveBassV2/sharedCancellationDiagnostic.js";

describe("shared cancellation diagnostic", () => {
  it("reports no shared cancellations when no priority seats share a deficit", () => {
    const confirmation = {
      perSeatP20: [
        { seatId: "s1", isPrimary: true, variationDbRaw: 2.8, worstFrequencyHz: 35 },
        { seatId: "s2", isPrimary: true, variationDbRaw: 3.1, worstFrequencyHz: 50 },
      ],
      assessmentStartHz: 20,
      assessmentEndHz: 200,
    };

    const result = diagnoseSharedCancellations(confirmation, {
      assessmentStartHz: 20, assessmentEndHz: 200,
    });

    assert.equal(result.diagnosticOnly, true);
    assert.equal(result.primarySeatCount, 2);
    assert.equal(result.hasSharedCancellations, false);
    assert.equal(result.hasSeriousSharedCancellations, false);
  });

  it("reports a shared cancellation when 2+ priority seats have a deficit at the same frequency", () => {
    const confirmation = {
      perSeatP20: [
        { seatId: "s1", isPrimary: true, variationDbRaw: 8.5, worstFrequencyHz: 42 },
        { seatId: "s2", isPrimary: true, variationDbRaw: 7.9, worstFrequencyHz: 42 },
        { seatId: "s3", isPrimary: false, variationDbRaw: 3.2, worstFrequencyHz: 55 },
      ],
      assessmentStartHz: 20,
      assessmentEndHz: 200,
    };

    const result = diagnoseSharedCancellations(confirmation, {
      assessmentStartHz: 20, assessmentEndHz: 200,
    });

    assert.equal(result.hasSharedCancellations, true);
    assert.equal(result.hasSeriousSharedCancellations, true);
    assert.ok(result.sharedDeficits.length >= 1);
    // The shared deficit at 42 Hz is within the assessment band
    const deficitAt42 = result.sharedDeficits.find((d) => d.frequencyHz === 42);
    assert.ok(deficitAt42, "Expected a shared deficit at 42 Hz");
    assert.equal(deficitAt42.seatCount, 2);
    assert.equal(deficitAt42.inAssessmentBand, true);
  });

  it("does not report a shared cancellation when only one priority seat has a deficit", () => {
    const confirmation = {
      perSeatP20: [
        { seatId: "s1", isPrimary: true, variationDbRaw: 8.5, worstFrequencyHz: 42 },
        { seatId: "s2", isPrimary: true, variationDbRaw: 2.1, worstFrequencyHz: 55 },
      ],
      assessmentStartHz: 20,
      assessmentEndHz: 200,
    };

    const result = diagnoseSharedCancellations(confirmation, {
      assessmentStartHz: 20, assessmentEndHz: 200,
    });

    assert.equal(result.hasSharedCancellations, false);
  });

  it("is diagnostic-only — never a grade or parameter", () => {
    const confirmation = {
      perSeatP20: [
        { seatId: "s1", isPrimary: true, variationDbRaw: 9.0, worstFrequencyHz: 42 },
        { seatId: "s2", isPrimary: true, variationDbRaw: 8.0, worstFrequencyHz: 42 },
      ],
    };

    const result = diagnoseSharedCancellations(confirmation);
    assert.equal(result.diagnosticOnly, true);
    // No grade, no level, no numerical score — only evidence
    assert.equal("level" in result, false);
    assert.equal("score" in result, false);
  });

  it("marks out-of-band deficits as outside the assessment band", () => {
    const confirmation = {
      perSeatP20: [
        { seatId: "s1", isPrimary: true, variationDbRaw: 9.0, worstFrequencyHz: 250 },
        { seatId: "s2", isPrimary: true, variationDbRaw: 8.5, worstFrequencyHz: 250 },
      ],
      assessmentStartHz: 20,
      assessmentEndHz: 200,
    };

    const result = diagnoseSharedCancellations(confirmation, {
      assessmentStartHz: 20, assessmentEndHz: 200,
    });

    if (result.sharedDeficits.length > 0) {
      const deficit = result.sharedDeficits[0];
      assert.equal(deficit.inAssessmentBand, false);
    }
  });
});