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
// never a greater-than / less-than threshold. It also states the residual
// headroom the extension carried, because that is what makes the point safe.
export const P18_CRITERION_STATEMENT =
  "Bass extension -3 dB point at the selected P14 LFE target, with 3 dB residual headroom.";

export const P18_TARGET_LINK_STATEMENT =
  "Calculated at the selected P14 LFE output target.";

/**
 * Why the extension walk stopped, in the design engineer's own terms. The
 * reasons are produced by the P18 authority; this module only states them.
 */
export const P18_LIMITING_REASON = Object.freeze({
  PRODUCT_DATA_FLOOR: "product-data-floor",
  OUTPUT_HEADROOM: "output-headroom",
  ROOM_RESPONSE: "room-response",
  UNRESOLVED: "unresolved",
});

export const P18_LIMITING_STATEMENT = Object.freeze({
  "product-data-floor": "Limited by the validated product data floor.",
  "output-headroom": "Limited by available output headroom.",
  "room-response": "Limited by the room response.",
  unresolved: null,
});

export const P18_RESIDUAL_HEADROOM_DB = 3;

// Presentation-only schema of the derived explanation. Stamped onto every new
// contract so a stored result can state whether it carries the selected-target
// explanation at all. A stored contract without this stamp predates the
// explanation and is refreshed by the existing engine (see p14TargetCache).
// v2 adds the residual-headroom criterion and the limiting reason.
export const P18_SELECTED_TARGET_SCHEMA_VERSION = 2;

/**
 * Floor-bounded detail statement. Plain language, no comparator: the headline
 * still states the calculated -3 dB point, this sentence carries the caveat.
 */
export function formatP18FloorBoundedStatement(floorHz) {
  if (!finite(floorHz)) return null;
  // Whole-Hz presentation follows the same favourable flooring rule as every
  // other P18 display, so the caveat sentence can never disagree with the
  // headline figure it explains.
  return `The response remains above the -3 dB criterion at the ${Math.floor(Number(floorHz))} Hz `
    + "product-validity floor, so the exact crossing lies below the validated calculation range.";
}

/** True when a stored contract carries the current explanation schema stamp. */
export function hasP18SelectedTargetSchema(contract) {
  return contract?.productAnalysis?.parameters?.p18?.p18SelectedTargetSchemaVersion
    === P18_SELECTED_TARGET_SCHEMA_VERSION;
}

// Two branches within half a hertz of each other limit the result together.
const BINDING_EQUALITY_HZ = 0.5;

const KNOWN_LIMITING_REASONS = new Set(Object.values(P18_LIMITING_REASON));

/**
 * The authority stamps the limiting reason on every target row. Rows stored
 * before that stamp existed are classified from the branch fields they do
 * carry, so an older contract still explains itself and still names a reason.
 */
function resolveLimitingReason(row, bindingBasis) {
  const stamped = row?.limitingReason;
  if (typeof stamped === "string" && KNOWN_LIMITING_REASONS.has(stamped)) return stamped;
  switch (bindingBasis) {
    case P18_BINDING_BASIS.FLOOR_BOUNDED:
      return P18_LIMITING_REASON.PRODUCT_DATA_FLOOR;
    case P18_BINDING_BASIS.CAPABILITY:
    case P18_BINDING_BASIS.BOTH:
      return row?.capabilityBounded === true
        ? P18_LIMITING_REASON.PRODUCT_DATA_FLOOR
        : P18_LIMITING_REASON.OUTPUT_HEADROOM;
    case P18_BINDING_BASIS.RESPONSE:
      return P18_LIMITING_REASON.ROOM_RESPONSE;
    default:
      return P18_LIMITING_REASON.UNRESOLVED;
  }
}

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
    // The capability criterion plane and the headroom it demands. Rows stored
    // before this rule are given the current requirement so a legacy contract
    // can never imply that P18 was claimed without headroom.
    residualHeadroomDb: num(row?.residualHeadroomDb) ?? P18_RESIDUAL_HEADROOM_DB,
    headroomCutoffPlaneDb: num(row?.headroomCutoffDb)
      ?? (finite(row?.p14TargetDb) ? Number(row.p14TargetDb) + P18_RESIDUAL_HEADROOM_DB : null),
    requestedP18ExtensionHz: num(row?.limitHz),
    achievedExtensionHz: num(authorityP18?.extensionHz) ?? num(authority?.value),
    responseTargetF3Hz: responseHz,
    capabilityTargetF3Hz: capabilityHz,
    responseBounded,
    capabilityBounded,
    floorHz: finite(floorHz) ? Number(floorHz) : null,
    bindingBasis,
    criterionMode,
    limitingReason: resolveLimitingReason(row, bindingBasis),
    limitingStatement: P18_LIMITING_STATEMENT[resolveLimitingReason(row, bindingBasis)] || null,
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
  // Floor-bounded results carry the full caveat sentence instead of the short
  // binding phrase, so the 22 Hz validity-floor plateau is explained in the
  // detail line while the headline stays the plain calculated point.
  const floorBounded = explanation.criterionMode === P18_CRITERION_MODE.FLOOR_BOUNDED
    && finite(explanation.floorHz);
  // The limiting reason is stated in plain language: the designer must be able
  // to tell a data-floor stop from an output stop from a room-response stop.
  if (explanation.limitingStatement) parts.push(explanation.limitingStatement);
  if (floorBounded) {
    // The published point IS the validity floor for a bounded result, so the
    // sentence states that same figure rather than a second, separately rounded one.
    const statement = formatP18FloorBoundedStatement(
      finite(explanation.achievedExtensionHz) ? explanation.achievedExtensionHz : explanation.floorHz,
    );
    if (statement) parts.push(statement);
  }
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
    rows.push(["Floor", `${Math.floor(Number(explanation.floorHz))} Hz — no -3 dB crossing above the validity floor`]);
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