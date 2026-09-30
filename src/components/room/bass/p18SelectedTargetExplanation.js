// P18 selected-target explanation — presentation only.
//
// The P18 authority already computes, for every P14 operating level of the
// selected target basis:
//   - p14TargetDb          the LFE output target the extension is tested at
//   - cutoffDb             p14TargetDb − 3 dB (the criterion plane)
//   - responseTargetF3Hz   where the room response reaches that plane
//   - capabilityTargetF3Hz where the derated product limit reaches it
//   - responseBounded / capabilityBounded (no crossing above the validity floor)
//   - limitHz              the P18 requirement for that level
//
// The published parameter carried only level/value/designHz, so the pill, the
// tooltip and the graph marker could not say WHICH target the extension was
// measured at, WHICH branch limited it, or WHY a lower output target extends
// deeper. This module derives that explanation from values the authority has
// ALREADY computed. It performs no physics, no grading and no threshold lookup,
// and it never changes the published P18 value.

const finite = (value) => Number.isFinite(Number(value));
const num = (value) => (finite(value) ? Number(value) : null);
const hz = (value) => (finite(value) ? `${Math.round(Number(value))} Hz` : null);

export const P18_BINDING_BASIS = Object.freeze({
  RESPONSE: "response",
  CAPABILITY: "capability",
  BOTH: "both",
  FLOOR_BOUNDED: "floor-bounded",
  UNRESOLVED: "unresolved",
});

export const P18_CRITERION_MODE = Object.freeze({
  SELECTED_TARGET_MINUS_3DB: "selected-target-minus-3db",
  FLOOR_BOUNDED: "floor-bounded",
  UNRESOLVED: "unresolved",
});

// Required client-facing copy: P18 states the calculated -3 dB point itself,
// never a greater-than / less-than threshold.
export const P18_CRITERION_STATEMENT =
  "Bass extension -3 dB point at the selected LFE output target.";

export const P18_TARGET_LINK_STATEMENT =
  "Calculated at the selected P14 LFE output target.";

// Two branches within half a hertz of each other limit the result together.
const BINDING_EQUALITY_HZ = 0.5;

// Short phrase for the pill detail line.
const BINDING_PHRASE = Object.freeze({
  response: "limited by the room response",
  capability: "limited by product capability",
  both: "limited by response and product capability",
  "floor-bounded": "bounded at the product validity floor",
  unresolved: "extension not resolved",
});

// Field value for the detailed rows.
const BINDING_NAME = Object.freeze({
  response: "Room response",
  capability: "Product capability",
  both: "Room response and product capability",
  "floor-bounded": "Floor-bounded (no crossing above the validity floor)",
  unresolved: "Unresolved",
});

/**
 * The authority row whose extension was published. The published P18 value is
 * the winning level's own extension at that level's own target, so the row —
 * not the designer's selected P14 level — identifies the target the number was
 * measured at.
 */
function resolvePublishedRow(authority) {
  const targets = Array.isArray(authority?.targets) ? authority.targets : [];
  if (!targets.length) return null;
  const publishedLevel = num(authority?.level);
  if (publishedLevel != null) {
    const byLevel = targets.find((row) => Number(row?.level) === publishedLevel);
    if (byLevel) return byLevel;
  }
  const publishedValue = num(authority?.value);
  if (publishedValue != null) {
    return targets.find((row) => num(row?.extensionHz) === publishedValue) || null;
  }
  return null;
}

function resolveBindingBasis(responseHz, capabilityHz, capabilityComputed, responseBounded, capabilityBounded) {
  if (!capabilityComputed) {
    return responseHz != null ? P18_BINDING_BASIS.RESPONSE : P18_BINDING_BASIS.UNRESOLVED;
  }
  // A null branch is not a bounded result — it is an unresolved one.
  if (responseHz == null || capabilityHz == null) return P18_BINDING_BASIS.UNRESOLVED;
  if (responseBounded && capabilityBounded) return P18_BINDING_BASIS.FLOOR_BOUNDED;
  if (Math.abs(responseHz - capabilityHz) <= BINDING_EQUALITY_HZ) return P18_BINDING_BASIS.BOTH;
  return capabilityHz > responseHz ? P18_BINDING_BASIS.CAPABILITY : P18_BINDING_BASIS.RESPONSE;
}

/**
 * Derive the published-extension explanation from an authority payload.
 *
 * @param {object|null} authorityP18 - finalSeatVariationData.p18 (wrapper or
 *   the raw Method C result — `.authority` is unwrapped when present)
 * @returns {object|null} explanation, or null when the payload has no targets
 */
export function deriveP18SelectedTargetExplanation(authorityP18) {
  const authority = authorityP18?.authority || authorityP18;
  if (!authority || typeof authority !== "object") return null;

  const row = resolvePublishedRow(authority);
  if (!row) return null;

  const responseHz = num(row?.responseTargetF3Hz);
  const capabilityComputed = Object.prototype.hasOwnProperty.call(row, "capabilityTargetF3Hz");
  const capabilityHz = capabilityComputed ? num(row.capabilityTargetF3Hz) : null;
  const responseBounded = row?.responseBounded === true;
  const capabilityBounded = row?.capabilityBounded === true;

  const bindingBasis = resolveBindingBasis(
    responseHz, capabilityHz, capabilityComputed, responseBounded, capabilityBounded,
  );
  const criterionMode = bindingBasis === P18_BINDING_BASIS.UNRESOLVED
    ? P18_CRITERION_MODE.UNRESOLVED
    : bindingBasis === P18_BINDING_BASIS.FLOOR_BOUNDED
      ? P18_CRITERION_MODE.FLOOR_BOUNDED
      : P18_CRITERION_MODE.SELECTED_TARGET_MINUS_3DB;

  const boundedValues = [responseHz, capabilityHz].filter((value) => finite(value));
  const floorHz = criterionMode === P18_CRITERION_MODE.FLOOR_BOUNDED && boundedValues.length
    ? Math.max(...boundedValues)
    : null;

  return {
    available: true,
    measuredAtLevel: num(row?.level),
    selectedP14TargetDb: num(row?.p14TargetDb) ?? num(row?.targetSplDb),
    cutoffPlaneDb: num(row?.cutoffDb),
    requestedP18ExtensionHz: num(row?.limitHz),
    achievedExtensionHz: num(authorityP18?.extensionHz) ?? num(authority?.value),
    responseTargetF3Hz: responseHz,
    capabilityTargetF3Hz: capabilityHz,
    responseBounded,
    capabilityBounded,
    floorHz: finite(floorHz) ? Number(floorHz) : null,
    bindingBasis,
    criterionMode,
    targetBasis: typeof authority?.p14TargetBasis === "string" ? authority.p14TargetBasis : null,
    source: authority?.source || null,
  };
}

function targetPhrase(explanation) {
  const level = finite(explanation?.measuredAtLevel) ? `L${Math.round(Number(explanation.measuredAtLevel))}` : null;
  const db = finite(explanation?.selectedP14TargetDb) ? `${Math.round(Number(explanation.selectedP14TargetDb))} dBC` : null;
  if (level && db) return `${level} · ${db} target`;
  if (db) return `${db} target`;
  if (level) return `${level} target`;
  return null;
}

/**
 * Pill detail line — the selected-target story in one reading.
 * Example: "Recommended · Bass extension -3 dB point at the selected LFE output
 * target. · limited by product capability · response reaches 15 Hz".
 * Returns null when no explanation is available, so
 * callers keep their existing fallback text.
 */
export function formatP18TargetExplanationDetail(explanation, basisLabel = null) {
  if (!explanation?.available) return null;
  const parts = [];
  if (basisLabel) parts.push(basisLabel);
  parts.push(P18_CRITERION_STATEMENT);
  const target = targetPhrase(explanation);
  if (target) parts.push(`${P18_TARGET_LINK_STATEMENT} (${target})`);
  const phrase = BINDING_PHRASE[explanation.bindingBasis];
  if (phrase) parts.push(phrase);
  const responseHz = hz(explanation.responseTargetF3Hz);
  if (responseHz && explanation.bindingBasis !== P18_BINDING_BASIS.RESPONSE) {
    parts.push(`response reaches ${responseHz}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Criterion rows as [label, value] pairs, for surfaces that render label/value
 * rows (engineering detail, hover tooltips).
 */
export function formatP18CriterionRows(explanation) {
  if (!explanation?.available) return [];
  const rows = [];
  const target = targetPhrase(explanation);
  if (target) rows.push(["Measured at", `${target} (as calculated)`]);
  if (finite(explanation.cutoffPlaneDb)) {
    rows.push(["Criterion", `selected target −3 dB (${Math.round(Number(explanation.cutoffPlaneDb))} dB plane)`]);
  }
  if (explanation.criterionMode === P18_CRITERION_MODE.FLOOR_BOUNDED && finite(explanation.floorHz)) {
    rows.push(["Floor", `${Math.round(Number(explanation.floorHz))} Hz — no -3 dB crossing above the validity floor`]);
  }
  if (finite(explanation.responseTargetF3Hz)) {
    rows.push(["Response branch", `${hz(explanation.responseTargetF3Hz)}`]);
  }
  if (finite(explanation.capabilityTargetF3Hz)) {
    rows.push([
      "Capability branch",
      `${hz(explanation.capabilityTargetF3Hz)} (product limit −3 dB reserve)`,
    ]);
  }
  if (explanation.bindingBasis) rows.push(["Binding branch", BINDING_NAME[explanation.bindingBasis] || null]);
  if (finite(explanation.requestedP18ExtensionHz)) {
    rows.push(["Required for this level", `≤${Math.round(Number(explanation.requestedP18ExtensionHz))} Hz`]);
  }
  return rows.filter(([, value]) => !!value);
}

/** Criterion rows as plain lines, with the -3 dB point statement first. */
export function formatP18CriterionLines(explanation) {
  const rows = formatP18CriterionRows(explanation);
  if (!rows.length) return [];
  const lines = [P18_CRITERION_STATEMENT];
  if (finite(explanation?.selectedP14TargetDb) || finite(explanation?.measuredAtLevel)) {
    lines.push(P18_TARGET_LINK_STATEMENT);
  }
  return [...lines, ...rows.map(([label, value]) => `${label}: ${value}`)];
}

/**
 * Graph marker suffix — target and binding branch beside the achieved Hz.
 * Example: "capability-limited at 120 dBC target".
 */
export function formatP18MarkerSuffix(explanation) {
  if (!explanation?.available) return null;
  const db = finite(explanation.selectedP14TargetDb)
    ? `${Math.round(Number(explanation.selectedP14TargetDb))} dBC target`
    : null;
  if (!db) return null;
  switch (explanation.bindingBasis) {
    case P18_BINDING_BASIS.CAPABILITY:
      return `capability-limited at ${db}`;
    case P18_BINDING_BASIS.RESPONSE:
      return `response-limited at ${db}`;
    case P18_BINDING_BASIS.BOTH:
      return `response and capability limited at ${db}`;
    case P18_BINDING_BASIS.FLOOR_BOUNDED:
      return `bounded at ${db}`;
    default:
      return null;
  }
}