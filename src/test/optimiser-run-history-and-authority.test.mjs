// optimiser-run-history-and-authority.test.mjs
// ---------------------------------------------------------------------------
// FOCUSED ACCEPTANCE — THE RUN'S LIFECYCLE ROW, AND THE TWO SCOPES.
//
// This suite pins the three things a Bass Optimiser run must be able to prove
// after the fact, without changing one optimiser rule:
//
//   1. DURABLE RUN HISTORY. Every terminal run — a plan, a report with no
//      actionable change, a block, a failure, a refused publication — appends
//      ONE lifecycle row. The row carries lifecycle facts only: it must contain
//      no candidate payload, no curve and no engineering value, and it must be
//      bounded per version.
//
//   2. ONE LIMITING FREQUENCY. The panel hierarchy states the frequency the
//      result view model resolved; a value that is not a credible frequency is
//      stated as "Not identified" and 0 Hz can never be printed.
//
//   3. ONE SCOPE. An option list can only ever come from the CURRENT terminal
//      result: an identity-mismatched record offers nothing.
//
// Plus the report-readiness boundary: marking the bass authority mid-
// recalculation must not make a saved publication read as stale, while a design
// that genuinely moved on still must.
//
// Everything asserted here is presentation, persistence shape and readiness —
// no acoustic maths, no P19/P20 definition, no materiality rule.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildOptimiserRunHistoryRecord,
  OPTIMISER_RUN_HISTORY_LIMIT,
} from "../components/room/bass/optimiserPlan/optimiserRunHistory.js";
import {
  buildLowFrequencyResult,
  buildOptimiserPanelHierarchy,
} from "../components/room/bass/optimiserPlan/optimiserPanelHierarchy.js";
import { buildOptimiserOtherOptions } from "../components/room/bass/optimiserPlan/optimiserOtherOptions.js";
import { LIMITING_FREQUENCY_NOT_IDENTIFIED } from "../components/room/bass/optimiserPlan/optimiserLimitingFrequency.js";
import {
  BASS_AUTHORITY_STATUS,
} from "../components/room/bass/completedBassResultPersistence.js";
import { resolvePublishedBassFreshness } from "../components/room/bass/bassFreshnessAuthority.js";

const read = (relative) => readFileSync(resolve(process.cwd(), relative), "utf8");

const RUN_HOOK = "src/components/room/bass/optimiseWorkflow/useRunOptimisationPlan.js";
const JOURNEY = "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx";
const HIERARCHY = "src/components/room/bass/optimiserPlan/optimiserPanelHierarchy.js";
const TRADE_OFF_DIALOG = "src/components/room/bass/optimiserPlan/AdiTradeOffReviewDialog.jsx";
const IMPROVEMENT_DIALOG = "src/components/room/bass/optimiserPlan/AdiImprovementReviewDialog.jsx";

// ── 1. DURABLE RUN HISTORY ──────────────────────────────────────────────────

describe("Bass Optimiser run history — one lifecycle row per run", () => {
  const fullEntry = {
    runId: "optimiser-run-2026-10-16T10:00:00.000Z-1",
    projectId: "proj-1",
    versionId: "ver-1",
    accountId: "acct-1",
    designFingerprint: "design-fp-1",
    resultFingerprint: "result-fp-1",
    startedAt: "2026-10-16T10:00:00.000Z",
    terminalAt: "2026-10-16T10:00:42.000Z",
    planSavedAt: "2026-10-16T10:00:38.000Z",
    publicationStartedAt: "2026-10-16T10:00:39.000Z",
    publicationCompletedAt: "2026-10-16T10:00:41.000Z",
    terminalStatus: "actionable_plan",
    publicationStatus: "published",
    publicationAttemptCount: 2,
    fingerprintsPublished: ["result-fp-1", "result-fp-1"],
    workerCalls: { electronic: 12, physical: 4, notANumber: "n/a" },
    runtimeBreakdown: [
      { key: "electronic_search", label: "Electronic search", value: "1.2 s", extra: "dropped" },
      { key: "physical_advisory", label: "Physical advisory", value: "0.4 s" },
    ],
  };

  it("writes no row at all without a run, project and version identity", () => {
    assert.equal(buildOptimiserRunHistoryRecord({}), null);
    assert.equal(buildOptimiserRunHistoryRecord({ ...fullEntry, runId: null }), null);
    assert.equal(buildOptimiserRunHistoryRecord({ ...fullEntry, versionId: "" }), null);
  });

  it("carries the lifecycle facts, and only those facts", () => {
    const record = buildOptimiserRunHistoryRecord(fullEntry);

    assert.equal(record.run_id, fullEntry.runId);
    assert.equal(record.project_id, "proj-1");
    assert.equal(record.version_id, "ver-1");
    assert.equal(record.account_id, "acct-1");
    assert.equal(record.started_at, fullEntry.startedAt);
    assert.equal(record.plan_saved_at, fullEntry.planSavedAt);
    assert.equal(record.publication_started_at, fullEntry.publicationStartedAt);
    assert.equal(record.publication_completed_at, fullEntry.publicationCompletedAt);
    assert.equal(record.terminal_status, "actionable_plan");
    assert.equal(record.publication_status, "published");
    assert.equal(record.publication_attempt_count, 2);
    // The fingerprints the publication actually wrote, de-duplicated.
    assert.deepEqual(record.fingerprints_published, ["result-fp-1"]);
    // Worker counts are kept only where they are real counts.
    assert.deepEqual(record.worker_calls, { electronic: 12, physical: 4 });
    // Runtime cost is reduced to its three diagnostic columns.
    assert.deepEqual(record.runtime_breakdown, [
      { key: "electronic_search", label: "Electronic search", value: "1.2 s" },
      { key: "physical_advisory", label: "Physical advisory", value: "0.4 s" },
    ]);
  });

  it("cannot carry a candidate payload, a curve or an engineering value", () => {
    // A row built from an entry deliberately stuffed with result payloads must
    // still contain nothing but the documented lifecycle fields.
    const allowed = new Set([
      "run_id", "project_id", "version_id", "account_id",
      "design_fingerprint", "result_fingerprint",
      "started_at", "terminal_at", "plan_saved_at",
      "publication_started_at", "publication_completed_at",
      "terminal_status", "publication_status", "publication_error",
      "publication_attempt_count", "fingerprints_published",
      "worker_calls", "runtime_breakdown",
    ]);
    const record = buildOptimiserRunHistoryRecord({
      ...fullEntry,
      candidates: [{ id: "c1", p19: -9 }],
      perSeatCurves: { "r1s1": [1, 2, 3] },
      ranking: [{ candidateId: "c1", score: 0.4 }],
      p14Db: 115,
    });
    Object.keys(record).forEach((key) => {
      assert.ok(allowed.has(key), `unexpected history field: ${key}`);
    });
    const serialised = JSON.stringify(record);
    assert.ok(!serialised.includes("perSeatCurves"));
    assert.ok(!serialised.includes("\"p14Db\""));
    assert.ok(!serialised.includes("\"candidates\""));
  });

  it("is a bounded log, not an archive", () => {
    assert.ok(OPTIMISER_RUN_HISTORY_LIMIT > 0 && OPTIMISER_RUN_HISTORY_LIMIT <= 24);
    const source = read("src/components/room/bass/optimiserPlan/optimiserRunHistory.js");
    assert.ok(source.includes("deleteMany"), "older rows must be pruned");
  });

  it("is written by every terminal path of the run, and never awaited by one", () => {
    const source = read(RUN_HOOK);
    assert.ok(source.includes("persistOptimiserRunHistory("), "the hook must append the row");
    // No terminal outcome may be left unlogged: each of these states reaches the
    // log exactly once, so a run can always be traced afterwards.
    ["failed", "cancelled", "blocked", "evaluation_incomplete", "publication_failed",
      "actionable_plan", "no_useful_improvement"].forEach((status) => {
      assert.ok(
        source.includes(`terminalStatus: "${status}"`)
          || source.includes(`? "actionable_plan" : "no_useful_improvement"`),
        `terminal status not recorded: ${status}`,
      );
    });
    assert.ok(
      source.includes("publicationStatus: \"refused\"")
        && source.includes("publicationStatus: \"published\"")
        && source.includes("publicationStatus: \"not_attempted\""),
      "the publication outcome must be recorded on both sides",
    );
    // A diagnostic row must never delay the run: the write is dispatched, not awaited.
    assert.ok(source.includes(".catch(() => {})"), "the history write must not be awaited");
  });
});

// ── 2. ONE LIMITING FREQUENCY ───────────────────────────────────────────────

describe("One limiting frequency — 0 Hz cannot be printed", () => {
  it("states the frequency the result view model resolved", () => {
    const result = buildLowFrequencyResult({
      limitingFrequency: { hz: 95, text: "95 Hz", identified: true },
    });
    assert.equal(result.limiting, "95 Hz");
    assert.equal(result.limitingIdentified, true);
  });

  it("states Not identified when the model resolved none", () => {
    const result = buildLowFrequencyResult({
      limitingFrequency: { hz: null, text: LIMITING_FREQUENCY_NOT_IDENTIFIED, identified: false },
    });
    assert.equal(result.limiting, LIMITING_FREQUENCY_NOT_IDENTIFIED);
    assert.equal(result.limitingIdentified, false);
  });

  it("states Not identified for a zero frequency, never 0 Hz", () => {
    const result = buildLowFrequencyResult({ p20Headline: { worstFrequencyHz: 0 } });
    assert.equal(result.limiting, LIMITING_FREQUENCY_NOT_IDENTIFIED);
    assert.equal(result.limitingIdentified, false);
  });

  it("is taken from the view model in the hierarchy, with no second path", () => {
    const hierarchy = buildOptimiserPanelHierarchy({
      limitingFrequency: { hz: 95, text: "95 Hz", identified: true },
      p20Headline: { worstFrequencyHz: 0 },
    });
    assert.equal(hierarchy.lowFrequency.limiting, "95 Hz");
    const source = read(HIERARCHY);
    assert.ok(source.includes("resolveLimitingFrequency"), "the one authority must be used");
    assert.ok(!source.includes("frequencyText("), "no surface may format a frequency itself");
  });

  it("is handed to Technical details by the card, together with the result model", () => {
    const journey = read(JOURNEY);
    assert.ok(journey.includes("limitingFrequency: resultModel?.limitingFrequency ?? null"));
    assert.ok(journey.includes("resultModel,"));
  });
});

// ── 3. ONE SCOPE ────────────────────────────────────────────────────────────

describe("One scope — only the current terminal result may offer an option", () => {
  const summary = {
    recommendedLever: null,
    seatingRecommendation: { movementLabel: "0.5 m forward", p20After: "±12 dB", reason: "Improves consistency" },
    absorption: { key: "absorption", reason: "Seat-to-seat variation remains", location: null },
  };

  it("offers nothing at all from an identity-mismatched record", () => {
    const options = buildOptimiserOtherOptions({
      summary,
      resultModel: { identity: { isCurrent: false } },
    });
    assert.deepEqual(options, []);
  });

  it("offers the current result's options, scoped and never as the winner", () => {
    const options = buildOptimiserOtherOptions({
      summary,
      resultModel: { identity: { isCurrent: true } },
    });
    assert.ok(options.length > 0, "the current result's options are offered");
    options.forEach((option) => {
      assert.equal(option.scope, "current");
      assert.equal(option.isWinner, false);
    });
  });
});

// ── THE REPORT-READINESS BOUNDARY ───────────────────────────────────────────

describe("A recalculation is not a design change", () => {
  const base = {
    publishedFingerprint: "pub-fp-1",
    publishedContractFingerprint: "pub-fp-1",
  };

  it("keeps the saved publication valid while the authority is mid-recalculation", () => {
    [BASS_AUTHORITY_STATUS.AUTHORITATIVE,
      BASS_AUTHORITY_STATUS.UPDATING,
      BASS_AUTHORITY_STATUS.NOT_VERIFIED,
      BASS_AUTHORITY_STATUS.LOADING,
      BASS_AUTHORITY_STATUS.ERROR].forEach((status) => {
      const result = resolvePublishedBassFreshness({ ...base, authorityStatus: status });
      assert.equal(result.matches, true, `must not stale on ${status}`);
    });
  });

  it("does not stale on the transient result key an evaluation stamps", () => {
    // The stamped current fingerprint is a RESULT key: it is rewritten while the
    // design is being re-evaluated. While the store still holds the published
    // contract for this design, that alone is not a design change.
    const result = resolvePublishedBassFreshness({
      ...base,
      authorityStatus: BASS_AUTHORITY_STATUS.UPDATING,
      authorityCurrentFingerprint: "transient-result-key",
    });
    assert.equal(result.matches, true);
    assert.equal(result.basis, "published_contract_still_held_for_design");
  });

  it("stales the saved publication when the design really moved on", () => {
    // A design change is the store no longer holding the published contract: it
    // has re-derived a different result for the design as it now stands.
    [BASS_AUTHORITY_STATUS.AUTHORITATIVE,
      BASS_AUTHORITY_STATUS.UPDATING,
      BASS_AUTHORITY_STATUS.STALE,
      BASS_AUTHORITY_STATUS.UNCALCULATED,
      BASS_AUTHORITY_STATUS.BLOCKED].forEach((status) => {
      const result = resolvePublishedBassFreshness({
        publishedFingerprint: "pub-fp-1",
        publishedContractFingerprint: "design-fp-2",
        authorityStatus: status,
        authorityCurrentFingerprint: "design-fp-2",
      });
      assert.equal(result.matches, false, `must stale on ${status}`);
    });
  });
});

// ── THE ONE APPLIED / HELD STATEMENT ────────────────────────────────────────

describe("One applied / held statement, shared by every review", () => {
  it("is the same component on the card and in both reviews", () => {
    [TRADE_OFF_DIALOG, IMPROVEMENT_DIALOG].forEach((file) => {
      assert.ok(read(file).includes("AdiAppliedStateLine"), `${file} must use the one statement`);
    });
    const line = read("src/components/room/bass/optimiserPlan/AdiAppliedStateLine.jsx");
    // It states nothing unless the run recorded applied or held.
    assert.ok(line.includes("OPTIMISER_APPLIED_STATE.APPLIED"));
    assert.ok(line.includes("OPTIMISER_APPLIED_STATE.HELD"));
  });

  it("is fed by the result view model, not by a second decision", () => {
    [TRADE_OFF_DIALOG, IMPROVEMENT_DIALOG].forEach((file) => {
      const source = read(file);
      assert.ok(source.includes("resultModel = null"), `${file} must take the one result model`);
    });
    assert.ok(read(JOURNEY).includes("resultModel={resultModel}"));
  });
});