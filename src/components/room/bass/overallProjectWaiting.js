// overallProjectWaiting — the real, named items the overall project assessment
// is still waiting for.
//
// WHY THIS EXISTS
// The bass result band used to state one fixed sentence when the completed bass
// assessment was current but a NON-BASS gate held up the overall engineering
// publication: "Overall design assessment is not yet complete." That sentence
// named nothing, so it read the same whether one section was missing or the
// whole design was finished.
//
// This module resolves the items the publication attempt actually recorded and
// names them, using the canonical wording of the authorities that produced
// them: the RP22 parameter titles for parameter items, and the publication
// section labels for section items. Nothing is invented here.
//
// PRESENTATION ONLY. It reads the attempt the publication effect already made.
// It computes no engineering value, adds no gate, removes no gate, and changes
// no grading, maths, readiness rule or publication behaviour.

import { RP22_OFFICIAL_SHORT_TITLES } from "@/components/utils/rp22OfficialTitles";
import { PUBLICATION_SECTION_LABELS } from "@/components/engineering/publicationGateCore";

/**
 * The designer-ASSUMED design values.
 *
 * P15 (background noise floor) and P21 (early reflections) are assumptions the
 * designer states for the project — not calculations the app performs and not
 * work the designer owes. They are terminal as soon as the assumption exists,
 * so they are never named as outstanding, never a blocker to the overall
 * assessment, and never something to go and calculate.
 */
export const ASSUMED_DESIGN_PARAMETER_KEYS = Object.freeze(["p15", "p21"]);

/** The heading shown above two or more real items. */
export const OVERALL_PROJECT_WAITING_HEADING = "Overall project waiting for:";

/**
 * Gates that are not parameter items, named as the designer reads them.
 *
 * The wording is the publication gate's own meaning, kept short. A gate that
 * is not listed here still gets named from its own label, so a new gate is
 * never silently dropped.
 */
const GATE_ITEM_PHRASES = Object.freeze({
  version: "the project and selected version",
  hydration: "the selected version to finish loading",
  bass_current: "Bass Performance publication",
  bass_identity: "the completed bass assessment to match the selected target",
  bass_summary: "the bass results in the engineering summary",
  p20_available: "P20 seat-to-seat bass variance",
  design_rating: "the settled design rating",
  rp22_terminal: null, // Named per parameter from its own detail.
  published_at: "a publication timestamp",
});

const PARAMETER_IN_TEXT = /\bp(\d{1,2})\b/i;

/** The canonical reading of one parameter key: "P12 Screen Speakers SPL…". */
export function parameterItemName(key) {
  const number = Number(String(key).replace(/^p/i, ""));
  const title = RP22_OFFICIAL_SHORT_TITLES[number];
  return title ? `P${number} ${title}` : `P${number}`;
}

/** Every parameter key named in a gate's own key or detail, P15/P21 excluded. */
function parameterKeysIn(gate) {
  const text = `${gate?.key || ""} ${gate?.detail || ""}`;
  const found = new Set();
  for (const match of text.matchAll(new RegExp(PARAMETER_IN_TEXT.source, "gi"))) {
    const key = `p${Number(match[1])}`;
    if (ASSUMED_DESIGN_PARAMETER_KEYS.includes(key)) continue;
    found.add(key);
  }
  return [...found];
}

/**
 * The item one failing gate names: a canonical parameter name for a parameter
 * item, the gate's own known phrase otherwise, and the gate's label as the last
 * resort — never a generic "not complete".
 */
function itemForGate(gate) {
  const key = String(gate?.key || "");
  const parameters = parameterKeysIn(gate);
  if (parameters.length) {
    return parameters.map(parameterItemName);
  }
  if (key === "rp22_terminal") {
    // The gate's own detail listed only assumed parameters: nothing real is
    // outstanding, so it names no item.
    return [];
  }
  if (key === "screen" || key === "rp23_viewing") return ["RP23 screen viewing assessment"];
  if (Object.prototype.hasOwnProperty.call(GATE_ITEM_PHRASES, key)) {
    const phrase = GATE_ITEM_PHRASES[key];
    return phrase ? [phrase] : [];
  }
  if (PUBLICATION_SECTION_LABELS[key]) return [PUBLICATION_SECTION_LABELS[key]];
  const label = typeof gate?.label === "string" ? gate.label.trim() : "";
  return label ? [label] : [];
}

/**
 * Resolve the items the overall project assessment is still waiting for.
 *
 * @param {Object} input
 * @param {Object|null} input.attempt — the engineering publication attempt the
 *   publication effect recorded (its `gates` carry every gate's own verdict).
 * @returns {{ complete: boolean, heading: string|null, items: string[], message: string|null }}
 */
export function resolveOverallProjectWaiting({ attempt = null } = {}) {
  const failedGates = Array.isArray(attempt?.gates) ? attempt.gates.filter((gate) => gate?.ok === false) : [];
  // An attempt records both its failed gates and the items it could not
  // satisfy, and either list may be the one that names a blocker, so both are
  // read. An item named by both is listed once.
  const recorded = Array.isArray(attempt?.missing) ? attempt.missing : [];
  const items = [];
  for (const entry of [...failedGates, ...recorded]) {
    for (const item of itemForGate(entry)) {
      if (!items.includes(item)) items.push(item);
    }
  }

  if (!items.length) {
    return { complete: true, heading: null, items: [], message: null };
  }
  return {
    complete: false,
    heading: OVERALL_PROJECT_WAITING_HEADING,
    items,
    // One item reads as a sentence; several read as a list under the heading.
    message: items.length === 1 ? `Waiting for ${items[0]}.` : null,
  };
}

export default resolveOverallProjectWaiting;