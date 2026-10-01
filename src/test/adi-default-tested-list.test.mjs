// adi-default-tested-list.test.mjs
// ---------------------------------------------------------------------------
// The default "What ADI tested" table shows ONLY the families ADI genuinely
// evaluates in the current run.
//
// Verified here:
//   • phase / crossover-region alignment is not a row while the model has no
//     crossover region (the switch is read from its own authority)
//   • subwoofer model / quantity is not a row — the optimiser never compares them
//   • the rows that remain are the evaluated families, in the fixed order, with
//     placement after every electronic option and absorption last
//   • no row states "Not yet supported" in the designer's view
//   • the two capabilities are stated once, in the collapsed Engineer details
//   • a saved ledger carrying only non-live families produces no rows at all
//
// Presentation only: no bass maths, scoring, RP22 definition or grading is
// touched by anything asserted here.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ADI_LIVE_STATUS,
  ADI_LIVE_ROW_KEYS,
  buildLiveFamilyRows,
} from "@/components/room/bass/optimiserPlan/optimiserLiveProgress.js";
import {
  ADI_LEDGER_FAMILY_KEYS,
  buildFamilyLedgerRows,
} from "@/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  buildAdiDesignerSummary,
  buildTestedOptionRows,
} from "@/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import {
  FUTURE_CAPABILITY_TITLE,
  OPTIMISER_FUTURE_CAPABILITY,
  OPTIMISER_LIVE_FAMILIES,
  buildFutureCapabilityNotes,
  isLiveFamily,
} from "@/components/room/bass/optimiserPlan/optimiserLiveFamilies.js";
import { CROSSOVER_REGION_PHASE_SUPPORTED } from "@/components/room/bass/optimiserPlan/crossoverRegionPhaseAuthority.js";
import { OPTIMISER_FAMILY_SEQUENCE } from "@/components/room/bass/optimiserPlan/optimiserLeverOrder.js";
import { OPTIMISER_PRESENTATION_STATE } from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

/** The families ADI evaluates, in the fixed order. */
const LIVE_KEYS = ["delay", "gain", "polarity", "placement", "layout", "seating"];

/** A saved run ledger that records every family the run knows about. */
const SAVED_FAMILIES = [
  { family: "placement", status: "rejected", tested: true, candidatesEvaluated: 4,
    bestAttempt: { candidateId: "p1", p20VariationDb: -9.4, p20Level: 1, p19VariationDb: -3.1, p19Level: 4 },
    reason: "Evaluated, but no candidate from this family was confirmed as a winner." },
  { family: "delay", status: "rejected", tested: true, candidatesEvaluated: 3,
    bestAttempt: { candidateId: "d1", p20VariationDb: -9, p20Level: 1, p19VariationDb: -3 },
    reason: "Evaluated, but no candidate from this family was confirmed as a winner." },
  { family: "gain", status: "rejected", tested: true, candidatesEvaluated: 3,
    bestAttempt: { candidateId: "g1", p20VariationDb: -8.7, p20Level: 1, p19VariationDb: -3 },
    reason: "Evaluated, but no candidate from this family was confirmed as a winner." },
  { family: "phase", status: "not_tested", tested: false, candidatesEvaluated: 9, bestAttempt: null,
    reason: "Not yet supported. The current optimiser does not model crossover-region phase between the main speakers and subwoofers." },
  { family: "polarity", status: "not_tested_separately", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: "No standalone search — evaluated inside the combined candidate" },
  { family: "additional_positions", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: null },
  { family: "subwoofer_option", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: "Not searched by the optimiser." },
  { family: "seat_movement", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: null },
];

const keysOf = (rows) => rows.map((row) => row.key);
const labelOf = (rows, key) => rows.find((row) => row.key === key)?.label || null;

describe("which families are live", () => {
  it("names the evaluated families, in order", () => {
    expect(OPTIMISER_LIVE_FAMILIES).toEqual(LIVE_KEYS);
  });

  it("reads phase liveness from the crossover authority, never by hand", () => {
    // Phase joins the tested table only when the engine models the crossover
    // region. Until then the tested table must not claim it.
    expect(isLiveFamily("phase")).toBe(CROSSOVER_REGION_PHASE_SUPPORTED);
    expect(isLiveFamily("phase")).toBe(false);
    // The lever keeps its position 3 either way.
    expect(OPTIMISER_FAMILY_SEQUENCE.indexOf("phase")).toBe(2);
  });

  it("never treats the subwoofer model / quantity as evaluated", () => {
    expect(isLiveFamily("subwoofer_option")).toBe(false);
    expect(isLiveFamily("layout")).toBe(true);
    expect(isLiveFamily("seating")).toBe(true);
  });
});

describe("the default tested table", () => {
  it("lists only evaluated families while a run is in progress", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "calibrating" });
    expect(keysOf(rows)).toEqual([...LIVE_KEYS, "absorption"]);
    expect(ADI_LIVE_ROW_KEYS).toEqual([...LIVE_KEYS, "absorption"]);
    expect(keysOf(rows)).not.toContain("phase");
    expect(keysOf(rows)).not.toContain("subwoofer_option");
  });

  it("keeps placement after every electronic option and absorption last", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    const placement = rows.findIndex((row) => row.key === "placement");
    ["delay", "gain", "polarity"].forEach((key) => {
      expect(rows.findIndex((row) => row.key === key)).toBeLessThan(placement);
    });
    expect(rows[rows.length - 1].key).toBe("absorption");
    expect(rows[rows.length - 1].label).toBe("Low-frequency absorption");
  });

  it("carries no row for a capability the optimiser does not evaluate", () => {
    const rows = buildTestedOptionRows(
      { levers: [], run: { families: SAVED_FAMILIES }, baseline: null },
      {},
    );
    expect(keysOf(rows)).toEqual(LIVE_KEYS);
    expect(rows.map((row) => row.label)).not.toContain("Phase");
    expect(rows.map((row) => row.label)).not.toContain("Sub option");

    // The saved ledger still records those families — they are simply not rows.
    const ledger = buildFamilyLedgerRows({ families: SAVED_FAMILIES, baseline: null });
    expect(Object.keys(ledger)).toEqual(LIVE_KEYS);
    expect(ADI_LEDGER_FAMILY_KEYS).toEqual(LIVE_KEYS);
  });

  it("states no unsupported capability anywhere in the table", () => {
    const rows = buildTestedOptionRows(
      { levers: [], run: { families: SAVED_FAMILIES }, baseline: null },
      {},
    );
    rows.forEach((row) => {
      // No row may claim a capability the optimiser lacks. A row about a saved
      // run that skipped a live search says so about the RUN, never the engine.
      expect(row.status).not.toBe("Not yet supported");
      expect(`${row.status} ${row.outcome || ""}`)
        .not.toMatch(/crossover|not currently|subwoofer model/i);
    });
  });

  it("produces no rows at all when the saved ledger holds only non-live families", () => {
    const ledger = buildFamilyLedgerRows({
      families: SAVED_FAMILIES.filter(
        (entry) => entry.family === "phase" || entry.family === "subwoofer_option",
      ),
      baseline: null,
    });
    expect(ledger).toBe(null, "no false tested row is invented for an unevaluated capability");
  });

  it("keeps the absorption advice row, named the same before and after a run", () => {
    const live = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    expect(labelOf(live, "absorption")).toBe("Low-frequency absorption");
    const rows = buildTestedOptionRows(
      { levers: [], run: { families: SAVED_FAMILIES }, baseline: null },
      {},
    );
    expect(rows.some((row) => row.key === "absorption")).toBe(false);
  });
});

describe("the card's tested table", () => {
  const summaryFor = (overrides = {}) => buildAdiDesignerSummary({
    planView: { status: "current", levers: [], baseline: null, run: { families: SAVED_FAMILIES } },
    presentation: { state: OPTIMISER_PRESENTATION_STATE.OPTIMISATION_REQUIRED, statusLabel: "Optimisation required" },
    instances: [],
    ...overrides,
  });

  it("renders only the evaluated families", () => {
    const summary = summaryFor();
    expect(keysOf(summary.rows).slice(0, LIVE_KEYS.length)).toEqual(LIVE_KEYS);
    expect(keysOf(summary.rows)).not.toContain("phase");
    expect(keysOf(summary.rows)).not.toContain("subwoofer_option");
  });

  it("never shows an unsupported-capability row in the designer view", () => {
    const summary = summaryFor();
    summary.rows.forEach((row) => {
      // The capability-missing word may never appear in the designer's view: a
      // live lever the saved run skipped is stated as a run-scope fact instead.
      expect(row.status).not.toBe("Not yet supported");
      expect(`${row.status} ${row.outcome || ""}`)
        .not.toMatch(/crossover|not currently|subwoofer model/i);
    });
  });

  it("hands the future capabilities to the collapsed Engineer details", () => {
    const summary = summaryFor();
    expect(summary.futureCapability.map((note) => note.key)).toEqual(["phase", "subwoofer_option"]);
    expect(summary.futureCapability[0].statement).toBe(OPTIMISER_FUTURE_CAPABILITY.phase.statement);
    expect(summary.futureCapability[1].statement)
      .toBe(OPTIMISER_FUTURE_CAPABILITY.subwoofer_option.statement);
    expect(buildFutureCapabilityNotes().map((note) => note.key))
      .toEqual(["phase", "subwoofer_option"]);
  });
});

describe("the Engineer details disclosure", () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), "src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx"),
    "utf8",
  );

  it("collapses the future-capability note by default", () => {
    const tag = card.match(/<details[^>]*data-adi-engineer-details="true"[^>]*>/)?.[0] || "";
    expect(tag).toBeTruthy();
    expect(tag).not.toMatch(/\sopen[\s=>]/);
  });

  it("states each outstanding capability once, from the one authority", () => {
    expect(card).toMatch(/data-adi-future-capability=\{note\.key\}/);
    expect(card).toMatch(/\{FUTURE_CAPABILITY_TITLE\}/);
    expect(card).toMatch(/summary\.futureCapability/);
    expect(card).toMatch(/note\.statement/);
    expect(FUTURE_CAPABILITY_TITLE).toBe("Future / not currently evaluated");
  });

  it("states the mandated wording for both capabilities", () => {
    expect(OPTIMISER_FUTURE_CAPABILITY.phase.statement).toBe(
      "Phase / crossover-region alignment is not currently evaluated. This requires modelling "
      + "main speaker and subwoofer summation through the crossover region.",
    );
    expect(OPTIMISER_FUTURE_CAPABILITY.subwoofer_option.statement).toBe(
      "Subwoofer model and quantity comparison is not currently part of this optimisation run.",
    );
  });
});

describe("no false tested claims", () => {
  it("keeps the tested table to the families the run evaluated", () => {
    const rows = buildTestedOptionRows(
      { levers: [], run: { families: SAVED_FAMILIES }, baseline: null },
      {},
    );
    const tested = rows
      .filter((row) => row.status === "Tested")
      .map((row) => row.label);
    tested.forEach((label) => {
      expect(label).not.toMatch(/phase|sub option|subwoofer option/i);
    });
  });

  it("leaves the live-progress statuses to real work only", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    rows.forEach((row) => {
      expect([
        ADI_LIVE_STATUS.WAITING,
        ADI_LIVE_STATUS.TESTING,
        ADI_LIVE_STATUS.TESTED,
      ]).toContain(row.status);
    });
  });
});