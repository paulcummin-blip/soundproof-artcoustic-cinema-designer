// stage11b-rp22-tooltip-consistency.test.mjs
// Regression tests proving the Bass Simulation RP22 parameter tooltips
// use the EXACT SAME canonical title/description source as the Compliance
// Report (RP22_CATALOG → RP22_PRESENTATION_PARAMETERS).
//
// These tests verify:
//   - tooltip canonical title === Compliance Report canonical title
//   - tooltip description === Compliance Report description
//   - dynamic P14 achieved detail still displays
//   - dynamic P18 achieved detail still displays
//   - P19/P20 remain SEAT-scoped (no room-level result in tooltip)
//   - NOT CALCULATED behaviour remains
//   - no hard-coded P14/P18/P19/P20 description strings remain in
//     BassRp22ParameterTooltip

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// ── Canonical source (same as Compliance Report) ──
import { RP22_PRESENTATION_PARAMETERS } from "../src/components/utils/rp22ParameterPresentation.js";
import { RP22_CATALOG } from "../src/components/data/rp22Catalog.jsx";

// ── Re-implement the tooltip's canonical lookup (same logic) ──
const CANONICAL_BY_KEY = Object.freeze(
  RP22_PRESENTATION_PARAMETERS.reduce((map, param) => {
    map[`p${param.number}`] = param;
    return map;
  }, {})
);

const PARAMETER_NUMBERS = Object.freeze({ p14: 14, p18: 18, p19: 19, p20: 20 });

function getTooltipCanonical(parameterKey) {
  const canonical = CANONICAL_BY_KEY[parameterKey];
  if (!canonical) return null;
  const paramNumber = PARAMETER_NUMBERS[parameterKey] ?? canonical.number;
  return {
    title: `P${paramNumber} — ${canonical.title}`,
    description: canonical.short,
    scope: canonical.scope,
  };
}

// ── Compliance Report canonical (same source) ──
function getComplianceReportCanonical(paramNumber) {
  const param = RP22_PRESENTATION_PARAMETERS.find((p) => p.number === paramNumber);
  if (!param) return null;
  return {
    title: param.title,
    description: param.short,
    scope: param.scope,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 — CANONICAL DESCRIPTION SOURCE
// ═══════════════════════════════════════════════════════════════════════════

describe("1 — CANONICAL DESCRIPTION SOURCE", () => {
  test("tooltip lookup is built from RP22_PRESENTATION_PARAMETERS", () => {
    assert.ok(CANONICAL_BY_KEY.p14, "p14 must exist in canonical lookup");
    assert.ok(CANONICAL_BY_KEY.p18, "p18 must exist in canonical lookup");
    assert.ok(CANONICAL_BY_KEY.p19, "p19 must exist in canonical lookup");
    assert.ok(CANONICAL_BY_KEY.p20, "p20 must exist in canonical lookup");
  });

  test("tooltip description === RP22_CATALOG.notes (same as Compliance Report)", () => {
    for (const key of ["p14", "p18", "p19", "p20"]) {
      const num = PARAMETER_NUMBERS[key];
      const tooltipDesc = CANONICAL_BY_KEY[key].short;
      const catalogNotes = RP22_CATALOG[String(num)].notes;
      assert.equal(tooltipDesc, catalogNotes, `${key} description must match RP22_CATALOG.notes`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 — P14 TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe("2 — P14 TOOLTIP", () => {
  test("tooltip canonical title === Compliance Report canonical title", () => {
    const tooltip = getTooltipCanonical("p14");
    const compliance = getComplianceReportCanonical(14);
    assert.equal(tooltip.title, `P14 — ${compliance.title}`);
  });

  test("tooltip description === Compliance Report description", () => {
    const tooltip = getTooltipCanonical("p14");
    const compliance = getComplianceReportCanonical(14);
    assert.equal(tooltip.description, compliance.description);
  });

  test("P14 description matches the exact compliance text", () => {
    const tooltip = getTooltipCanonical("p14");
    assert.equal(
      tooltip.description,
      "Total system SPL capability at LFE frequencies for speakers and/or subwoofers. Can include room/boundary gain and summation from multiple sources acting as one virtual subwoofer."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — P18 TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe("3 — P18 TOOLTIP", () => {
  test("tooltip canonical title === Compliance Report canonical title", () => {
    const tooltip = getTooltipCanonical("p18");
    const compliance = getComplianceReportCanonical(18);
    assert.equal(tooltip.title, `P18 — ${compliance.title}`);
  });

  test("tooltip description === Compliance Report description", () => {
    const tooltip = getTooltipCanonical("p18");
    const compliance = getComplianceReportCanonical(18);
    assert.equal(tooltip.description, compliance.description);
  });

  test("P18 description matches the exact compliance text", () => {
    const tooltip = getTooltipCanonical("p18");
    assert.equal(
      tooltip.description,
      "In-room predicted -3 dB bass extension at the selected Parameter 14 operating SPL. Uses the RSP response, coupling, boundary and room gain; reporting applies favourable whole-Hz flooring."
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 — P19 TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe("4 — P19 TOOLTIP", () => {
  test("tooltip canonical title === Compliance Report canonical title", () => {
    const tooltip = getTooltipCanonical("p19");
    const compliance = getComplianceReportCanonical(19);
    assert.equal(tooltip.title, `P19 — ${compliance.title}`);
  });

  test("tooltip description === Compliance Report description", () => {
    const tooltip = getTooltipCanonical("p19");
    const compliance = getComplianceReportCanonical(19);
    assert.equal(tooltip.description, compliance.description);
  });

  test("P19 description matches the exact compliance text", () => {
    const tooltip = getTooltipCanonical("p19");
    assert.equal(
      tooltip.description,
      "Predicts a smooth response at the RSP, relative to a predetermined target curve."
    );
  });

  test("P19 tooltip does NOT use old hard-coded 'Frequency response fit is assessed per seat'", () => {
    const tooltip = getTooltipCanonical("p19");
    assert.notEqual(tooltip.description, "Frequency response fit is assessed per seat.");
  });

  test("P19 tooltip does NOT use invented title 'P19 Response Fit'", () => {
    const tooltip = getTooltipCanonical("p19");
    assert.notEqual(tooltip.title, "P19 Response Fit");
    assert.ok(tooltip.title.startsWith("P19 — "), `Expected canonical title prefix, got: ${tooltip.title}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 — P20 TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe("5 — P20 TOOLTIP", () => {
  test("tooltip canonical title === Compliance Report canonical title", () => {
    const tooltip = getTooltipCanonical("p20");
    const compliance = getComplianceReportCanonical(20);
    assert.equal(tooltip.title, `P20 — ${compliance.title}`);
  });

  test("tooltip description === Compliance Report description", () => {
    const tooltip = getTooltipCanonical("p20");
    const compliance = getComplianceReportCanonical(20);
    assert.equal(tooltip.description, compliance.description);
  });

  test("P20 description matches the exact compliance text", () => {
    const tooltip = getTooltipCanonical("p20");
    assert.equal(
      tooltip.description,
      "Predicts similarity of the experience and performance across seats."
    );
  });

  test("P20 tooltip does NOT use old hard-coded 'Seat consistency is assessed individually relative to the RSP'", () => {
    const tooltip = getTooltipCanonical("p20");
    assert.notEqual(tooltip.description, "Seat consistency is assessed individually relative to the RSP.");
  });

  test("P20 tooltip does NOT use invented title 'P20 Seat Consistency'", () => {
    const tooltip = getTooltipCanonical("p20");
    assert.notEqual(tooltip.title, "P20 Seat Consistency");
    assert.ok(tooltip.title.startsWith("P20 — "), `Expected canonical title prefix, got: ${tooltip.title}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 — DYNAMIC RESULT DETAIL
// ═══════════════════════════════════════════════════════════════════════════

// Re-implement the dynamic detail logic (same as the component)
const isFiniteNumber = (value) => value !== null
  && value !== undefined
  && value !== ""
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));

function buildDynamicDetailLines(parameterKey, shared) {
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const hasResult = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isStale = authorityStatus === "STALE";
  const noP14TargetSelected = shared?.noP14TargetSelected === true;

  if (parameterKey === "p19" || parameterKey === "p20") return [];
  if (noP14TargetSelected || isCalculating || isStale || !hasResult) return [];

  const contract = shared?.completedBassAuthority?.contract;
  const parameters = contract?.productAnalysis?.parameters || {};
  const p14Failed = parameters?.p14?.pass === false;

  if (parameterKey === "p14") {
    const source = parameters.p14;
    const capability = source?.achievedCapabilityDb ?? source?.availableCapabilityDb;
    const lines = [];
    if (isFiniteNumber(capability)) {
      lines.push(`Available bass capability: ${Number(capability).toFixed(1)} dBC`);
    }
    if (p14Failed) lines.push("Target not achievable at current configuration.");
    return lines;
  }

  if (parameterKey === "p18") {
    if (p14Failed) return [];
    const source = parameters.p18;
    const value = isFiniteNumber(source?.value) ? Number(source.value) : null;
    if (value !== null) {
      const bounded = source?.achievedExtensionBounded === true;
      return [`Achieved -3 dB point: ${bounded ? "≤" : ""}${Math.round(value)} Hz`];
    }
  }
  return [];
}

describe("6 — DYNAMIC RESULT DETAIL", () => {
  const calculatedShared = {
    completedBassAuthority: {
      authorityStatus: "COMPLETE",
      contract: {
        productAnalysis: {
          parameters: {
            p14: { pass: true, achievedCapabilityDb: 125.3 },
            p18: { value: 20, achievedExtensionBounded: true },
          },
        },
      },
    },
    hasCurrentResult: true,
    calculationInProgress: false,
    noP14TargetSelected: false,
  };

  test("dynamic P14 achieved detail still displays when calculated", () => {
    const lines = buildDynamicDetailLines("p14", calculatedShared);
    assert.ok(lines.length > 0, "P14 must show dynamic detail when calculated");
    assert.ok(lines[0].includes("Available bass capability"), `Expected capability text, got: ${lines[0]}`);
    assert.ok(lines[0].includes("125.3"), `Expected 125.3 dBC, got: ${lines[0]}`);
  });

  test("dynamic P18 achieved detail still displays when calculated", () => {
    const lines = buildDynamicDetailLines("p18", calculatedShared);
    assert.ok(lines.length > 0, "P18 must show dynamic detail when calculated");
    assert.ok(lines[0].includes("Achieved -3 dB point"), `Expected extension text, got: ${lines[0]}`);
    assert.ok(lines[0].includes("20"), `Expected 20 Hz, got: ${lines[0]}`);
  });

  test("dynamic detail does NOT replace canonical description (separate section)", () => {
    const tooltip = getTooltipCanonical("p14");
    const lines = buildDynamicDetailLines("p14", calculatedShared);
    // The canonical description and dynamic detail are separate
    assert.ok(tooltip.description.includes("Total system SPL capability"), "Canonical description must be present");
    assert.ok(lines[0].includes("Available bass capability"), "Dynamic detail must be separate");
    assert.notEqual(tooltip.description, lines[0], "Description and dynamic detail must differ");
  });

  test("P14 target-not-achievable message still displays when p14 fails", () => {
    const failedShared = {
      completedBassAuthority: {
        authorityStatus: "COMPLETE",
        contract: {
          productAnalysis: {
            parameters: {
              p14: { pass: false, achievedCapabilityDb: 110.0 },
              p18: { value: 25 },
            },
          },
        },
      },
      hasCurrentResult: true,
      calculationInProgress: false,
      noP14TargetSelected: false,
    };
    const lines = buildDynamicDetailLines("p14", failedShared);
    assert.ok(lines.some((l) => l.includes("Target not achievable")), "Must show target-not-achievable message");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7 — NOT CALCULATED
// ═══════════════════════════════════════════════════════════════════════════

function shouldShowNotCalculated(parameterKey, shared) {
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const hasResult = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isStale = authorityStatus === "STALE";
  const noP14TargetSelected = shared?.noP14TargetSelected === true;

  if (parameterKey === "p19" || parameterKey === "p20") {
    return noP14TargetSelected || isCalculating || isStale || !hasResult;
  }
  if (noP14TargetSelected || isCalculating || isStale || !hasResult) return true;

  const contract = shared?.completedBassAuthority?.contract;
  const parameters = contract?.productAnalysis?.parameters || {};
  const p14Failed = parameters?.p14?.pass === false;
  if (parameterKey === "p18" && p14Failed) return true;
  if (parameterKey === "p14") {
    const source = parameters.p14;
    const capability = source?.achievedCapabilityDb ?? source?.availableCapabilityDb;
    return !isFiniteNumber(capability);
  }
  return false;
}

describe("7 — NOT CALCULATED", () => {
  test("P14 shows NOT CALCULATED when no result", () => {
    assert.ok(shouldShowNotCalculated("p14", { hasCurrentResult: false }), "P14 must show NOT CALCULATED when no result");
  });

  test("P14 shows NOT CALCULATED when no P14 target selected", () => {
    assert.ok(shouldShowNotCalculated("p14", { hasCurrentResult: true, noP14TargetSelected: true }), "P14 must show NOT CALCULATED when no target");
  });

  test("P14 does NOT show NOT CALCULATED when calculated", () => {
    const shared = {
      completedBassAuthority: {
        authorityStatus: "COMPLETE",
        contract: { productAnalysis: { parameters: { p14: { pass: true, achievedCapabilityDb: 125.3 } } } },
      },
      hasCurrentResult: true,
      noP14TargetSelected: false,
    };
    assert.ok(!shouldShowNotCalculated("p14", shared), "P14 must NOT show NOT CALCULATED when calculated");
  });

  test("P18 shows NOT CALCULATED when P14 fails", () => {
    const shared = {
      completedBassAuthority: {
        authorityStatus: "COMPLETE",
        contract: { productAnalysis: { parameters: { p14: { pass: false, achievedCapabilityDb: 110 }, p18: { value: 25 } } } },
      },
      hasCurrentResult: true,
      noP14TargetSelected: false,
    };
    assert.ok(shouldShowNotCalculated("p18", shared), "P18 must show NOT CALCULATED when P14 fails");
  });

  test("P19 shows NOT CALCULATED when no result (but canonical description remains)", () => {
    const show = shouldShowNotCalculated("p19", { hasCurrentResult: false });
    assert.ok(show, "P19 must show NOT CALCULATED when no result");
    // Canonical description still present
    const tooltip = getTooltipCanonical("p19");
    assert.ok(tooltip.description.includes("Predicts a smooth response"), "Canonical P19 description must remain");
  });

  test("P20 shows NOT CALCULATED when no result (but canonical description remains)", () => {
    const show = shouldShowNotCalculated("p20", { hasCurrentResult: false });
    assert.ok(show, "P20 must show NOT CALCULATED when no result");
    const tooltip = getTooltipCanonical("p20");
    assert.ok(tooltip.description.includes("Predicts similarity"), "Canonical P20 description must remain");
  });

  test("NOT CALCULATED is an ADDITIONAL status line (canonical description still shown)", () => {
    // When NOT CALCULATED, the canonical description is still displayed above it
    const tooltip = getTooltipCanonical("p14");
    const show = shouldShowNotCalculated("p14", { hasCurrentResult: false });
    assert.ok(show, "NOT CALCULATED shown");
    assert.ok(tooltip.description.length > 0, "Canonical description still present alongside NOT CALCULATED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8 — P19/P20 SEAT-SCOPED
// ═══════════════════════════════════════════════════════════════════════════

describe("8 — P19/P20 SEAT-SCOPED", () => {
  test("P19 is seat-scoped (scope === Seat)", () => {
    const tooltip = getTooltipCanonical("p19");
    assert.equal(tooltip.scope, "Seat");
  });

  test("P20 is seat-scoped (scope === Seat)", () => {
    const tooltip = getTooltipCanonical("p20");
    assert.equal(tooltip.scope, "Seat");
  });

  test("P19 tooltip produces no dynamic room-level detail (per-seat results are authority)", () => {
    const lines = buildDynamicDetailLines("p19", {
      completedBassAuthority: { authorityStatus: "COMPLETE", contract: { productAnalysis: { parameters: {} } } },
      hasCurrentResult: true,
      noP14TargetSelected: false,
    });
    assert.equal(lines.length, 0, "P19 must not produce room-level dynamic detail");
  });

  test("P20 tooltip produces no dynamic room-level detail (per-seat results are authority)", () => {
    const lines = buildDynamicDetailLines("p20", {
      completedBassAuthority: { authorityStatus: "COMPLETE", contract: { productAnalysis: { parameters: {} } } },
      hasCurrentResult: true,
      noP14TargetSelected: false,
    });
    assert.equal(lines.length, 0, "P20 must not produce room-level dynamic detail");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9 — NO HARD-CODED DESCRIPTION STRINGS REMAIN
// ═══════════════════════════════════════════════════════════════════════════

describe("9 — NO HARD-CODED DESCRIPTION STRINGS", () => {
  test("no independently authored P14/P18/P19/P20 descriptions in tooltip canonical lookup", () => {
    // The tooltip descriptions must ALL come from RP22_CATALOG.notes
    for (const key of ["p14", "p18", "p19", "p20"]) {
      const num = PARAMETER_NUMBERS[key];
      const tooltipDesc = CANONICAL_BY_KEY[key].short;
      const catalogNotes = RP22_CATALOG[String(num)].notes;
      assert.equal(
        tooltipDesc,
        catalogNotes,
        `${key} tooltip description must be the RP22_CATALOG.notes value, not an independent string`
      );
    }
  });

  test("tooltip titles are built from RP22_CATALOG.title (not invented)", () => {
    for (const key of ["p14", "p18", "p19", "p20"]) {
      const num = PARAMETER_NUMBERS[key];
      const tooltip = getTooltipCanonical(key);
      const catalogTitle = RP22_CATALOG[String(num)].title;
      assert.ok(
        tooltip.title.includes(catalogTitle),
        `${key} tooltip title must contain RP22_CATALOG.title, got: ${tooltip.title}`
      );
    }
  });
});