// adi-two-stage-summary.test.mjs
// ---------------------------------------------------------------------------
// Acceptance for the two-stage ADI report process and the evidence rules.
//
//   A  a 5.1 design reads as a simple, credible surround system
//   B  a 9.2.4 design has its design story identified before any writing
//   C  a comparison report explains what stays the same, what changes and what
//      the client gains
//   D  the highlights table carries only useful client-facing rows
//   E  P8 is never used
//   F  P15 is never used
//   G  P20 is never used
//   H  no assumed parameter is referenced
//   I  Dynamic Range is evidenced by P12 and P13
//   J  Spatial Resolution is evidenced by P2/P4/P5/P6/P7/P9/P10 only where useful
//   K  Timbre Matching is evidenced by P16/P17 and by P18/P19 where reliable
//   L  unreliable bass results are omitted
//   M  the report is written story-first, not parameter by parameter
//   N  the templates the model reads contain no em dash
//   O  the interpretation object is complete, logged and saved with the report
//
// The two stages are exercised as pure logic against fixture snapshots. No
// engineering value, level or grading rule is calculated or changed here: the
// fixtures supply results and the rules decide whether they may be used.
// ---------------------------------------------------------------------------

import { describe, test, expect } from "vitest";
import fs from "node:fs";

import {
  EXCLUDED_PARAMETERS,
  HIGHLIGHT_ROW_LIMIT,
  isReliableResult,
  splitParameterEvidence,
  resolveBassEvidence,
} from "../base44/shared/adiReportEvidenceRules.js";
import {
  buildProjectInterpretation,
  formatInterpretationForPrompt,
  formatInterpretationForLog,
} from "../base44/shared/adiProjectInterpretation.js";
import {
  compareInterpretations,
  formatComparisonInterpretationForPrompt,
} from "../base44/shared/adiReportComparison.js";
import {
  buildEngineeringEvidence,
  selectHighlightRows,
  buildHighlightsPrompt,
} from "../base44/shared/engineeringSnapshotEvidence.js";
import { buildWritingStyleContract } from "../base44/shared/reportWritingStyleContract.js";
import { SYSTEM_SUMMARY_SECTION_PROMPTS } from "../base44/shared/systemDesignSummarySections.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function parameter(id, level, value) {
  return { parameter_id: id, title: `P${id}`, achieved_level: level, formatted_value: value, raw_value: value };
}

function category(label, level) {
  return { label, floor: level, designation: null, index: null };
}

function scope(categories) {
  return { available: categories.length > 0, categories };
}

function makeSnapshot({
  config = "5.1",
  bed = 5,
  overhead = 0,
  subCount = 1,
  dimensions = { width_m: 4.2, length_m: 5.4, height_m: 2.6 },
  volume = 59,
  seating = { row_count: 1, total_seats: 3, mlp_basis: "middle" },
  screen = {
    size_inches: 100,
    aspect_ratio: "16:9",
    computed_width_m: 2.21,
    mount_mode: "baffle",
    manual_dimensions: false,
  },
  params = [],
  floors = [],
  allSeatFloors = [],
  viewing = null,
  bass = {},
} = {}) {
  return {
    available: true,
    identity: { projectId: "project-1", versionId: "version-1" },
    room: {
      dimensions,
      dimensions_text: `${dimensions.length_m}m x ${dimensions.width_m}m x ${dimensions.height_m}m`,
      volume_m3: volume,
      classification: { statement: "rectangular room" },
      screen,
      seating: { ...seating, interpretation: "fixture seating" },
    },
    system: {
      configuration: {
        dolby_config: config,
        text: `${config} Dolby Atmos configuration`,
        bed_channels: bed,
        overhead_channels: overhead,
        total_discrete_channels: bed + overhead,
      },
      channel_layout: { total_discrete: bed + overhead },
      product_roles: [
        { role: "lcr", role_description: "Left/Centre/Right (screen wall)", model_key: "evolve-2-1", model_label: "Evolve 2-1", category: "LCR" },
      ],
      subwoofer_strategy: { count: subCount, models: ["sub2"], strategy_text: "fixture subwoofers" },
      amplification: { specified: true, text: "800W amplifier power specified" },
    },
    rp22: {
      categories: {
        primary: scope(floors),
        secondary: scope(floors),
        all_seat: scope(allSeatFloors.length > 0 ? allSeatFloors : floors),
      },
      dpi: { primary: { available: true, index: 71, designation: "Strong", percentage: 71 } },
      parameter_headlines: params,
      strengths: [{ parameter_id: 9, achieved_level: "L4" }],
      weaknesses: [{ parameter_id: 12, achieved_level: "L2" }],
      assumed: { p15_noise_floor: { level: "L2", value: "NCB 22" }, p21_early_reflections: { level: "L2" } },
      assessment_basis: { p12_mode: "minimum", p13_mode: "minimum" },
    },
    bass,
    viewing,
    product_coherence: { text: "Evolve and Spitfire families" },
  };
}

/** Evidence lines look like "    Screen consistency (P4): L3 · 1.0 dB". */
function evidenceByStructure(evidenceText) {
  const out = {};
  let current = null;
  for (const line of evidenceText.split("\n")) {
    const header = /^ {2}(Spatial Resolution|Dynamic Range|Timbre Matching):\s*$/.exec(line);
    if (header) {
      current = header[1];
      out[current] = out[current] || [];
      continue;
    }
    const entry = /\(P(\d+)\):/.exec(line);
    if (entry && current) out[current].push(Number(entry[1]));
  }
  return out;
}

const SIMPLE_ROOM = makeSnapshot({
  config: "5.1",
  bed: 5,
  overhead: 0,
  subCount: 1,
  params: [
    parameter(2, "L2", 5),
    parameter(3, "L4", 0),
    parameter(4, "L3", "1.0 dB"),
    parameter(5, "L3", "48 deg"),
    parameter(8, "L1", "Yes"),
    parameter(11, "L3", 0),
    parameter(12, "L2", "105 dB SPL"),
    parameter(13, "L2", "103 dB SPL"),
    parameter(16, "L3", "1.2 dB"),
    parameter(17, "L3", "1.6 dB"),
  ],
  floors: [category("Spatial Resolution", "L2"), category("Dynamic Range", "L2"), category("Timbre Matching", "L3")],
  viewing: { available: true, summary: "3.9m viewing distance, 33 deg horizontal angle", primary_floor: "L2", secondary_floor: "L2" },
  bass: {
    p14: { achieved_level: "L2", formatted_value: "108 dB" },
    p18: { achieved_level: "N/A", formatted_value: null },
    p19: { rsp: { level: "L2", display_value: "-3.0 dB" } },
    p20: { project_floor: "L1", per_seat: [{ raw_value: -4 }, { raw_value: -8 }] },
  },
});

const REFERENCE_ROOM = makeSnapshot({
  config: "9.2.4",
  bed: 9,
  overhead: 4,
  subCount: 4,
  dimensions: { width_m: 5.4, length_m: 7.8, height_m: 2.5 },
  volume: 105,
  seating: { row_count: 2, total_seats: 6, mlp_basis: "middle" },
  screen: {
    size_inches: 150,
    aspect_ratio: "2.35:1",
    computed_width_m: 3.5,
    mount_mode: "baffle",
    manual_dimensions: false,
  },
  params: [
    parameter(2, "L4", 13),
    parameter(4, "L3", "0.8 dB"),
    parameter(5, "L4", "32 deg"),
    parameter(6, "L3", "1.1 dB"),
    parameter(7, "L3", "4 deg"),
    parameter(9, "L4", "28 deg"),
    parameter(10, "L3", "1.0 dB"),
    parameter(12, "L3", "112 dB SPL"),
    parameter(13, "L3", "110 dB SPL"),
    parameter(16, "L3", "0.9 dB"),
    parameter(17, "L3", "1.3 dB"),
  ],
  floors: [category("Spatial Resolution", "L4"), category("Dynamic Range", "L3"), category("Timbre Matching", "L3")],
  viewing: { available: true, summary: "4.6m viewing distance, 42 deg horizontal angle", primary_floor: "L4", secondary_floor: "L3" },
  bass: {
    p14: { achieved_level: "L3", formatted_value: "115 dB" },
    p18: { achieved_level: "L3", formatted_value: "24 Hz" },
    p19: { rsp: { level: "L2", display_value: "-3.5 dB" } },
    p20: { project_floor: "L1", per_seat: [{ raw_value: -3 }, { raw_value: -9 }] },
  },
});

const UNRELIABLE_BASS_ROOM = makeSnapshot({
  config: "7.2.4",
  bed: 7,
  overhead: 4,
  subCount: 2,
  params: [
    parameter(2, "L3", 11),
    parameter(12, "L3", "110 dB SPL"),
    parameter(13, "L2", "106 dB SPL"),
    parameter(16, "L3", "1.0 dB"),
    parameter(17, "L3", "1.4 dB"),
  ],
  floors: [category("Spatial Resolution", "L3"), category("Dynamic Range", "L3"), category("Timbre Matching", "L3")],
  bass: {
    p14: { achieved_level: "L3", formatted_value: "114 dB", status: "PROVISIONAL" },
    p18: { achieved_level: "N/A", formatted_value: null },
    p19: { rsp: { level: null, display_value: null } },
    p20: { project_floor: "L2", per_seat: [] },
  },
});

function interpretationFor(snapshot, overrides = {}) {
  return buildProjectInterpretation({
    snapshot,
    project: { name: "Fixture Cinema", client_name: "Client" },
    reportType: "system_summary",
    versions: [{ id: "version-1", label: "Version 1" }],
    ...overrides,
  });
}

const PROMPT_TEMPLATES = [
  ...Object.entries(SYSTEM_SUMMARY_SECTION_PROMPTS).map(([key, value]) => [key, value]),
  ["writing_style_contract", buildWritingStyleContract()],
];

// ── A. A 5.1 design reads as a simple, credible surround system ──────────────

describe("Stage 1: the design story is identified before writing", () => {
  const interpretation = interpretationFor(SIMPLE_ROOM);

  test("A 5.1 design is read as a simple surround system and does not overclaim", () => {
    expect(interpretation.primary_design_intent).toBe("Clean, simple surround system");
    expect(interpretation.room_type).toBe("Dedicated cinema");
    expect(interpretation.reliable_evidence.system.discrete_channels).toBe(5);
    expect(interpretation.reliable_evidence.system.subwoofer_count).toBe(1);
    expect(interpretation.primary_design_intent).not.toMatch(/reference|perfect|ultimate/i);
    expect(interpretation.important_design_decisions.join(" | ")).toMatch(/5\.1 chosen for simplicity and cost/);
    expect(interpretation.important_design_decisions.join(" | ")).toMatch(/Single subwoofer chosen/);
    expect(interpretation.main_constraints).toContain("Single-sub bass compromise");
  });

  test("B a 9.2.4 design has its story captured before any writing", () => {
    const reference = interpretationFor(REFERENCE_ROOM);
    expect(reference.room_type).toBe("Multi-row cinema");
    expect(reference.primary_design_intent).toBe("Reference-style dedicated cinema");
    expect(reference.defining_feature).toBe("Large projection screen");
    expect(reference.presentation).toBe("Projection");
    expect(reference.primary_seating_story).toBeTruthy();
    expect(reference.important_design_decisions.join(" | ")).toMatch(/9\.2\.4 chosen for front wides/);
    expect(reference.important_design_decisions.join(" | ")).toMatch(/Four subs chosen for seat-to-seat consistency/);
    expect(reference.main_constraints.join(" | ")).toMatch(/Rear row geometry/);
    expect(reference.strongest_areas.map((entry) => entry.area)).toEqual(
      expect.arrayContaining(["Spatial Resolution", "Viewing geometry", "Screen scale"]),
    );

    // The story block leads with the story, not with a parameter list.
    const block = formatInterpretationForPrompt(reference);
    expect(block).toMatch(/ADI PROJECT INTERPRETATION \(Stage 1 of 2/);
    expect(block).toMatch(/Primary design intent: Reference-style dedicated cinema/);
    expect(block.indexOf("Primary design intent")).toBeLessThan(block.indexOf("Reliable evidence by structure"));
  });

  test("Stage 1 covers the ten required fields", () => {
    for (const key of [
      "room_type", "primary_design_intent", "defining_feature", "primary_seating_story",
      "strongest_areas", "main_constraints", "important_design_decisions",
      "reliable_evidence", "excluded_or_unreliable_evidence", "designer_emphasis",
    ]) {
      expect(interpretation).toHaveProperty(key);
    }
    expect(interpretation.designer_emphasis_rule).toMatch(/never changes an engineering result/i);
  });

  test("designer emphasis is carried as emphasis only", () => {
    const withNotes = interpretationFor(REFERENCE_ROOM, { clientBrief: "Lead with the family experience." });
    expect(withNotes.designer_emphasis).toBe("Lead with the family experience.");
    expect(withNotes.reliable_evidence.structures).toEqual(interpretationFor(REFERENCE_ROOM).reliable_evidence.structures);
  });
});

// ── C. Comparison reports ───────────────────────────────────────────────────

describe("Stage 1: comparison reading", () => {
  const entries = [
    { label: "Version 1", interpretation: interpretationFor(SIMPLE_ROOM) },
    { label: "Version 2", interpretation: interpretationFor(REFERENCE_ROOM) },
  ];
  const comparison = compareInterpretations(entries);
  const block = formatComparisonInterpretationForPrompt(comparison);

  test("C explains what stays the same, what changes and what the client gains", () => {
    expect(comparison.shared.join(" | ")).toMatch(/Timbre Matching/);
    expect(comparison.changes.join(" | ")).toMatch(/Design intent/);
    expect(comparison.changes.join(" | ")).toMatch(/Discrete channels/);
    expect(block).toMatch(/What stays the same/i);
    expect(block).toMatch(/What changes/i);
    expect(block).toMatch(/what the client gains from the change/i);
    expect(block).toMatch(/Compare the experience, not the equipment/);
  });

  test("a comparison reading needs two interpretations", () => {
    expect(compareInterpretations([entries[0]]).shared).toEqual([]);
    expect(compareInterpretations([entries[0]]).changes).toEqual([]);
  });
});

// ── D–L. Evidence rules ─────────────────────────────────────────────────────

describe("Evidence rules", () => {
  const simpleEvidence = buildEngineeringEvidence(SIMPLE_ROOM);
  const referenceEvidence = buildEngineeringEvidence(REFERENCE_ROOM);
  const simpleRows = selectHighlightRows(SIMPLE_ROOM);
  const referenceRows = selectHighlightRows(REFERENCE_ROOM);

  test("D the highlights table carries only useful client-facing rows", () => {
    const allowed = new Set([
      "screen_size", "rp23_viewing", "system_layout", "p2", "p4", "p5", "p6", "p7",
      "p9", "p10", "p12", "p13", "p14", "p16", "p17", "p18", "p19",
    ]);
    for (const row of [...simpleRows, ...referenceRows]) {
      expect(allowed.has(row.key)).toBe(true);
      expect(String(row.area || "").length).toBeGreaterThan(0);
      expect(String(row.result || "").length).toBeGreaterThan(0);
      expect(row.key).not.toMatch(/^dpi_/);
    }
    expect(referenceRows.length).toBeLessThanOrEqual(HIGHLIGHT_ROW_LIMIT);
    expect(referenceRows.length).toBeGreaterThanOrEqual(8);
    // The most useful rows lead, so the table opens with the room the client sees.
    expect(referenceRows[0].key).toBe("screen_size");
    expect(referenceRows.map((row) => row.key)).toContain("p12");
    expect(referenceRows.map((row) => row.key)).toContain("p13");
  });

  test("E, F, G, H  P8, P15, P20 and the assumed parameters are never used", () => {
    const byStructure = evidenceByStructure(referenceEvidence);
    const usedIds = Object.values(byStructure).flat();
    for (const excluded of [8, 15, 20, 21]) {
      expect(usedIds).not.toContain(excluded);
    }
    // Never presented as a result line in any structure.
    for (const evidence of [simpleEvidence, referenceEvidence]) {
      expect(evidence).not.toMatch(/\((?:P)?(?:8|15|20|21)\):/);
    }
    // Stated as not used, with the reason, so the writer cannot reach for them.
    expect(referenceEvidence).toMatch(/Not used in this report \(never reference these\)/);
    // Readable, decision-oriented labels, and no parameter code for the writer
    // to echo into client-facing text.
    expect(referenceEvidence).toMatch(/Upfiring speaker allowance - not used/);
    expect(referenceEvidence).toMatch(/Background noise assumption - not used/);
    expect(referenceEvidence).toMatch(/Bass seat-to-seat consistency - not used in this client summary/);
    expect(referenceEvidence).toMatch(/Early reflection assumption - not used/);
    expect(referenceEvidence).not.toMatch(/\(P8\)|\(P15\)|\(P20\)|\(P21\)/);
    expect(simpleEvidence).toMatch(/Assumed parameters, never referenced in this report/);

    const excludedIds = interpretationFor(REFERENCE_ROOM).excluded_or_unreliable_evidence.map((entry) => entry.parameter_id);
    expect(excludedIds).toEqual(expect.arrayContaining([8, 15, 20, 21]));
    expect(Object.keys(EXCLUDED_PARAMETERS).map(Number)).toEqual([8, 15, 20, 21]);
  });

  test("I Dynamic Range is evidenced by P12 and P13", () => {
    const byStructure = evidenceByStructure(referenceEvidence);
    expect(byStructure["Dynamic Range"]).toEqual(expect.arrayContaining([12, 13]));
    expect(byStructure["Dynamic Range"]).not.toContain(15);
    expect(referenceEvidence).toMatch(/Screen Dynamic Range \(P12\): L3/);
    expect(referenceEvidence).toMatch(/Non-screen Dynamic Range \(P13\): L3/);
    expect(referenceEvidence).toMatch(/LFE and subwoofer Dynamic Range \(P14\): L3/);
  });

  test("J Spatial Resolution is evidenced by the useful spatial results only", () => {
    const byStructure = evidenceByStructure(referenceEvidence);
    expect(byStructure["Spatial Resolution"]).toEqual(expect.arrayContaining([2, 4, 5, 6, 7, 9, 10]));
    expect(byStructure["Spatial Resolution"]).not.toContain(8);
    // p1, p3 and p11 are assessed but are not needed to tell this room's story.
    expect(byStructure["Spatial Resolution"]).not.toContain(1);
    expect(byStructure["Spatial Resolution"]).not.toContain(3);
    expect(byStructure["Spatial Resolution"]).not.toContain(11);
  });

  test("K Timbre Matching is evidenced by P16/P17, and by P18/P19 where reliable", () => {
    const byStructure = evidenceByStructure(referenceEvidence);
    expect(byStructure["Timbre Matching"]).toEqual(expect.arrayContaining([16, 17, 18, 19]));
    expect(byStructure["Timbre Matching"]).not.toContain(20);
    expect(referenceEvidence).toMatch(/Bass extension \(P18\): L3/);

    // Where the bass is not reliable, only the timbre results remain.
    const unreliable = evidenceByStructure(buildEngineeringEvidence(UNRELIABLE_BASS_ROOM));
    expect(unreliable["Timbre Matching"]).toEqual(expect.arrayContaining([16, 17]));
    expect(unreliable["Timbre Matching"]).not.toContain(18);
    expect(unreliable["Timbre Matching"]).not.toContain(19);
  });

  test("L unreliable bass results are omitted and the gap is stated", () => {
    const bass = resolveBassEvidence(UNRELIABLE_BASS_ROOM);
    expect(bass.usable).toEqual([]);
    expect(bass.omitted.map((entry) => entry.parameter_id)).toEqual(expect.arrayContaining([14, 18, 20]));
    const evidence = buildEngineeringEvidence(UNRELIABLE_BASS_ROOM);
    expect(evidence).toMatch(/no reliable bass result for this design/);
    expect(selectHighlightRows(UNRELIABLE_BASS_ROOM).map((row) => row.key)).not.toContain("p14");
    expect(isReliableResult({ achieved_level: "L3", status: "PROVISIONAL" })).toBe(false);
    expect(isReliableResult({ achieved_level: "N/A" })).toBe(false);
    expect(isReliableResult({ achieved_level: "L3" })).toBe(true);
  });

  test("a partial bass picture keeps only what is reliable", () => {
    const split = splitParameterEvidence(SIMPLE_ROOM);
    const ids = split.used.map((entry) => entry.parameter_id);
    expect(ids).not.toContain(8);
    expect(ids).not.toContain(15);
    expect(resolveBassEvidence(SIMPLE_ROOM).p18).toBeNull();
    expect(resolveBassEvidence(SIMPLE_ROOM).p14).not.toBeNull();
  });
});

// ── M, N, O. The writing process and its audit trail ─────────────────────────

describe("Stage 2 and the audit trail", () => {
  test("M the writer is told to tell the story first, not to translate parameters", () => {
    const block = formatInterpretationForPrompt(interpretationFor(REFERENCE_ROOM));
    expect(block).toMatch(/Write the story first, then support it with the results/);
    expect(block).toMatch(/Do not work through the results one by one/);
    expect(block).toMatch(/Evidence inside this story, never the subject of it|evidence inside this story/);
    const evidence = buildEngineeringEvidence(REFERENCE_ROOM);
    expect(evidence).toMatch(/Design structures \(write around these, not around the parameters\)/);
    expect(SYSTEM_SUMMARY_SECTION_PROMPTS.spatial_resolution).toMatch(/Do not list parameters mechanically/);
    expect(SYSTEM_SUMMARY_SECTION_PROMPTS.dynamic_range).toMatch(/not simply about playing louder/);
    expect(SYSTEM_SUMMARY_SECTION_PROMPTS.timbre_matching).toMatch(/Never reference P20/);
    expect(buildHighlightsPrompt(evidence, selectHighlightRows(REFERENCE_ROOM)))
      .toMatch(/Say what the result means for the client, not what the parameter is called/);
  });

  test("the writer is given the design story ahead of the evidence", () => {
    const source = fs.readFileSync(new URL("../base44/functions/generateProposal/entry.ts", import.meta.url), "utf8");
    // Compare the two points inside the SECTION PROMPT itself: the story block
    // leads, the evidence follows, and the style contract is read last. (An
    // earlier version of this check compared a contract call from the
    // highlights prompt with a position inside this function.)
    // Match the actual array entries, not the parameter list: inside the return
    // array the story block is immediately followed by the evidence context.
    const body = source.slice(source.indexOf("function buildSectionPrompt("));
    const story = body.indexOf("interpretationBlock,\n    '',\n    projectContext,");
    const contract = body.indexOf("buildWritingStyleContract(),");
    expect(story).toBeGreaterThan(-1);
    expect(contract).toBeGreaterThan(story);
    // The highlights prompt leads with the story too.
    expect(source).toMatch(/\[\s*interpretationBlock,\s*buildHighlightsPrompt/);
    expect(source).toMatch(/buildProjectInterpretation\(\{/);
    expect(source).toMatch(/COMPARISON_STRUCTURE_INSTRUCTION/);
  });

  test("N the text the model reads contains no em dash", () => {
    // Fixture-derived prompt templates only: snapshot prose is the dealer's own
    // data and is not a template this contract controls.
    const strings = [
      ...PROMPT_TEMPLATES.map(([key, value]) => [key, value]),
      ["evidence", buildEngineeringEvidence(REFERENCE_ROOM)],
      ["interpretation", formatInterpretationForPrompt(interpretationFor(REFERENCE_ROOM))],
      ["comparison", formatComparisonInterpretationForPrompt(
        compareInterpretations([
          { label: "V1", interpretation: interpretationFor(SIMPLE_ROOM) },
          { label: "V2", interpretation: interpretationFor(REFERENCE_ROOM) },
        ]),
      )],
      ["highlights", buildHighlightsPrompt(buildEngineeringEvidence(REFERENCE_ROOM), selectHighlightRows(REFERENCE_ROOM))],
    ];
    for (const [name, value] of strings) {
      expect({ name, hasEmDash: /[\u2014\u2013]/.test(value) }).toEqual({ name, hasEmDash: false });
    }
  });

  test("O the interpretation is complete, loggable and saved with the report", () => {
    const interpretation = interpretationFor(REFERENCE_ROOM);
    const log = formatInterpretationForLog(interpretation);
    for (const label of [
      "room_type=", "intent=", "defining_feature=", "seating_story=", "strongest=",
      "constraints=", "decisions=", "structures=", "evidence=", "bass_usable=", "excluded=",
      "design_index=", "emphasis=",
    ]) {
      expect(log).toContain(label);
    }
    expect(interpretation.reliable_evidence.design_index.internal_only).toBe(true);
    expect(interpretation.reliable_evidence.design_index.client_facing).toBe(false);
    expect(interpretation.stage).toBe("adi_project_interpretation");

    const source = fs.readFileSync(new URL("../base44/functions/generateProposal/entry.ts", import.meta.url), "utf8");
    expect(source).toMatch(/project_interpretation: primaryInterpretation/);
    expect(source).toMatch(/ADI stage 1 interpretation/);
    const regenerateSource = fs.readFileSync(new URL("../base44/functions/regenerateProposalSection/entry.ts", import.meta.url), "utf8");
    expect(regenerateSource).toMatch(/proposal\.metadata\?\.project_interpretation/);
    const duplicateSource = fs.readFileSync(new URL("../base44/functions/duplicateProposal/entry.ts", import.meta.url), "utf8");
    expect(duplicateSource).toMatch(/'project_interpretation'/);
  });

  test("the style contract carries the role, the structures and the banned phrasing", () => {
    const contract = buildWritingStyleContract();
    expect(contract).toMatch(/Write as the cinema designer responsible for this project/);
    expect(contract).toMatch(/Keep the narrative on the three RP22 design structures/);
    expect(contract).toMatch(/Never translate parameters one by one/);
    for (const banned of ["Next level", "Premium experience", "Ultimate experience", "Unparalleled", "State of the art", "It is important to note", "In conclusion", "To sum up"]) {
      expect(contract).toContain(banned);
    }
    expect(contract).toMatch(/Check that no assumed parameter is referenced anywhere/);
  });
});