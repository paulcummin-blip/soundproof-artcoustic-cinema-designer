// adi-default-tested-list.test.mjs
// ---------------------------------------------------------------------------
// The default "What ADI tested" table.
//
// Product rule verified here:
//   • every lever is a row, in the fixed least-intrusive order — delay, gain,
//     phase, polarity, placement, layout, seating — with absorption advice last
//   • a lever the optimiser searches is NEVER described as unsupported: an
//     evaluated one reports its own outcome (Tested · Recommended · Rejected ·
//     Trade-off · Combined only), and seating reports its last-resort policy
//   • "Not yet supported" is reserved for a capability the model genuinely
//     lacks, and it carries the reason: phase / crossover-region alignment
//   • a search that RAN (the engine's own stage counters) is Tested even when it
//     confirmed no candidate — the Marquee "Not yet supported in this run"
//     defect
//   • the subwoofer model / quantity decision is not a table row; it is stated
//     once in the collapsed Engineer details
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
  ADI_ROW_OUTCOME,
  ADI_ROW_STATUS,
  buildFamilyLedgerRows,
} from "@/components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  buildAdiDesignerSummary,
  buildTestedOptionRows,
} from "@/components/room/bass/optimiserPlan/adiDesignerSummary.js";
import { buildFamilyLedger } from "@/components/room/bass/optimiserPlan/optimiserRunFamilies.js";
import {
  FUTURE_CAPABILITY_TITLE,
  OPTIMISER_FUTURE_CAPABILITY,
  OPTIMISER_LIVE_FAMILIES,
  buildFutureCapabilityNotes,
  isLiveFamily,
} from "@/components/room/bass/optimiserPlan/optimiserLiveFamilies.js";
import { OPTIMISER_FAMILY_SEQUENCE } from "@/components/room/bass/optimiserPlan/optimiserLeverOrder.js";
import { OPTIMISER_PRESENTATION_STATE } from "@/components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";

/** The levers the tested table states, in the fixed order. */
const TABLE_KEYS = ["delay", "gain", "phase", "polarity", "placement", "layout", "seating"];

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
  { family: "polarity", status: "not_tested_separately", tested: false, candidatesEvaluated: null,
    bestAttempt: { candidateId: "c1", p20VariationDb: -9.2, p20Level: 1 },
    reason: "No standalone search — evaluated inside the combined candidate" },
  { family: "additional_positions", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: null },
  { family: "subwoofer_option", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: "Not searched by the optimiser." },
  { family: "seat_movement", status: "not_tested", tested: false, candidatesEvaluated: null, bestAttempt: null,
    reason: null },
];

/** The plan-shaped view the card reads: no lever rows, the run's family ledger. */
const planViewFor = (families) => ({ status: "current", levers: [], baseline: null, run: { families } });

const keysOf = (rows) => rows.map((row) => row.key);
const rowFor = (rows, key) => rows.find((row) => row.key === key) || null;
const labelOf = (rows, key) => rowFor(rows, key)?.label || null;
const rowText = (row) => `${row.status} ${row.outcome || ""}`;

describe("which levers the tested table states", () => {
  it("names them, in the fixed order, with phase third", () => {
    expect(OPTIMISER_LIVE_FAMILIES).toEqual(TABLE_KEYS);
    expect(OPTIMISER_FAMILY_SEQUENCE.indexOf("phase")).toBe(2);
    expect(OPTIMISER_LIVE_FAMILIES.indexOf("phase")).toBe(2);
  });

  it("never treats the subwoofer model / quantity as a table lever", () => {
    expect(isLiveFamily("subwoofer_option")).toBe(false);
    expect(isLiveFamily("phase")).toBe(true);
    expect(isLiveFamily("layout")).toBe(true);
    expect(isLiveFamily("seating")).toBe(true);
  });
});

describe("the default tested table", () => {
  const rows = () => buildTestedOptionRows(planViewFor(SAVED_FAMILIES), {});

  it("lists every lever in the fixed order, and never the subwoofer option", () => {
    expect(keysOf(rows())).toEqual(TABLE_KEYS);
    expect(labelOf(rows(), "phase")).toBe("Phase");
    expect(rows().map((row) => row.label)).not.toContain("Sub option");
    expect(keysOf(buildLiveFamilyRows({ status: "running", phase: "calibrating" })))
      .toEqual([...TABLE_KEYS.slice(0, 7), "absorption"]);
    expect(ADI_LIVE_ROW_KEYS).toEqual([...TABLE_KEYS.slice(0, 7), "absorption"]);
  });

  it("reports an evaluated lever as tested, never as unsupported", () => {
    const byKey = Object.fromEntries(rows().map((row) => [row.key, row]));
    // Delay, gain and placement were searched by this run.
    expect(byKey.delay.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(byKey.gain.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(byKey.placement.status).toBe(ADI_ROW_STATUS.TESTED);
    ["delay", "gain", "placement"].forEach((key) => {
      expect(byKey[key].status).not.toBe(ADI_ROW_STATUS.NOT_YET_SUPPORTED);
    });
  });

  it("states polarity as combined-only when the run kept a combined attempt", () => {
    const polarity = rowFor(rows(), "polarity");
    expect(polarity.status).toBe(ADI_ROW_STATUS.COMBINED_ONLY);
    expect(polarity.outcome).toBe(ADI_ROW_OUTCOME.COMBINED_ONLY);
    expect(polarity.status).not.toBe(ADI_ROW_STATUS.NOT_YET_SUPPORTED);
  });

  it("reports layout as checked through the placement search", () => {
    const layout = rowFor(rows(), "layout");
    expect(layout.status).toBe(ADI_ROW_STATUS.TESTED);
    expect(layout.outcome).toBe(ADI_ROW_OUTCOME.NO_BETTER_LAYOUT);
  });

  it("states seating's last-resort policy, never a missing capability", () => {
    const seating = rowFor(rows(), "seating");
    expect(seating.status).toBe(ADI_ROW_STATUS.LAST_RESORT);
    expect(seating.outcome).toBe(ADI_ROW_OUTCOME.SEATING_LAST_RESORT);
  });

  it("keeps 'Not yet supported' for the crossover region alone, with its reason", () => {
    const unsupported = rows().filter((row) => row.status === ADI_ROW_STATUS.NOT_YET_SUPPORTED);
    expect(unsupported.map((row) => row.key)).toEqual(["phase"]);
    expect(unsupported[0].outcome).toBe(ADI_ROW_OUTCOME.PHASE_NOT_MODELLED);
    expect(unsupported[0].outcome).toMatch(/crossover-region model not available/i);
  });

  it("never says 'Not yet supported in this run', and never claims phase as tested", () => {
    rows().forEach((row) => {
      expect(rowText(row)).not.toMatch(/not yet supported in this run/i);
    });
    expect(rowFor(rows(), "phase").status).not.toBe(ADI_ROW_STATUS.TESTED);
  });

  it("keeps the ledger to the stated levers", () => {
    const ledger = buildFamilyLedgerRows({ families: SAVED_FAMILIES, baseline: null });
    expect(Object.keys(ledger)).toEqual(TABLE_KEYS);
    expect(ADI_LEDGER_FAMILY_KEYS).toEqual(TABLE_KEYS);
  });
});

describe("a search that ran is Tested, however many candidates it confirmed", () => {
  // The engine's own diagnostics for a completed run: every stage ran and
  // recorded its operations, and none of them confirmed a candidate. This is the
  // Marquee shape, and no row may read as a missing capability.
  const diagnostics = {
    stages: [
      { name: "Placement", candidatesEvaluated: { generated: 24, screened: 12, promotedToV2: 6, confirmed: 0 } },
      { name: "Delay", candidatesEvaluated: { coarse: 8, fine: 4, retained: 3, confirmed: 0, valid: 0 } },
      { name: "Gain", candidatesEvaluated: { coarse: 6, fine: 3, retained: 2, confirmed: 0, valid: 0 },
        gainAdjustable: true },
      { name: "Phase", candidatesEvaluated: { tested: 5, retained: 0, confirmed: 0, valid: 0 } },
    ],
  };
  const families = buildFamilyLedger({
    selection: null,
    diagnostics,
    current: { p20VariationDb: 16, p19VariationDb: 6 },
  });
  const rows = buildTestedOptionRows(planViewFor(families), {});

  it("marks the searched levers as tested", () => {
    ["delay", "gain", "placement", "layout"].forEach((key) => {
      expect(rowFor(rows, key).status).toBe(ADI_ROW_STATUS.TESTED);
    });
  });

  it("states no 'in this run' wording for any supported lever", () => {
    rows.forEach((row) => {
      expect(rowText(row)).not.toMatch(/not yet supported in this run/i);
    });
  });

  it("still states seating's policy and the crossover region's limit", () => {
    expect(rowFor(rows, "seating").status).toBe(ADI_ROW_STATUS.LAST_RESORT);
    const phase = rowFor(rows, "phase");
    expect(phase.status).toBe(ADI_ROW_STATUS.NOT_YET_SUPPORTED);
    expect(phase.outcome).toBe(ADI_ROW_OUTCOME.PHASE_NOT_MODELLED);
  });
});

describe("the card's tested table", () => {
  const summaryFor = (overrides = {}) => buildAdiDesignerSummary({
    planView: planViewFor(SAVED_FAMILIES),
    presentation: {
      state: OPTIMISER_PRESENTATION_STATE.OPTIMISATION_REQUIRED,
      statusLabel: "Optimisation required",
    },
    instances: [],
    ...overrides,
  });

  it("renders every lever, with no unsupported claim for a searched one", () => {
    const summary = summaryFor();
    expect(keysOf(summary.rows).slice(0, TABLE_KEYS.length)).toEqual(TABLE_KEYS);
    summary.rows.forEach((row) => {
      expect(rowText(row)).not.toMatch(/not yet supported in this run/i);
      if (row.status === ADI_ROW_STATUS.NOT_YET_SUPPORTED) {
        expect(row.key).toBe("phase");
      }
    });
  });

  it("hands the subwoofer decision to the collapsed Engineer details", () => {
    const summary = summaryFor();
    expect(keysOf(summary.rows)).not.toContain("subwoofer_option");
    expect(summary.futureCapability.map((note) => note.key)).toEqual(["subwoofer_option"]);
    expect(summary.futureCapability[0].statement)
      .toBe(OPTIMISER_FUTURE_CAPABILITY.subwoofer_option.statement);
    expect(buildFutureCapabilityNotes().map((note) => note.key)).toEqual(["subwoofer_option"]);
  });

  it("states no decimal dB anywhere in the table", () => {
    summaryFor().rows.forEach((row) => {
      expect(rowText(row)).not.toMatch(/\d+\.\d+\s*dB/);
    });
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
});

describe("no false tested claims", () => {
  it("leaves the live-progress statuses to real work, and to the crossover region", () => {
    const rows = buildLiveFamilyRows({ status: "running", phase: "reviewing" });
    rows.forEach((row) => {
      expect([
        ADI_LIVE_STATUS.WAITING,
        ADI_LIVE_STATUS.TESTING,
        ADI_LIVE_STATUS.TESTED,
        ADI_LIVE_STATUS.NOT_YET_SUPPORTED,
      ]).toContain(row.status);
      if (row.status === ADI_LIVE_STATUS.NOT_YET_SUPPORTED) {
        expect(row.key).toBe("phase");
      }
    });
  });
});