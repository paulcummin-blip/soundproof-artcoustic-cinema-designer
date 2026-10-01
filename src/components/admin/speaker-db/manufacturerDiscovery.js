// manufacturerDiscovery.js
// ---------------------------------------------------------------------------
// The registry of dedicated, site-specific discovery runs.
//
// Most manufacturers are discovered through the generic index crawler
// (discoverCandidateModels). A manufacturer whose site is structured in its own
// way — or whose range needs range-guarded extraction from its own pages — is
// registered here with its official domain and its dedicated backend function.
// Registration is deliberate: an entry is added only when the official domain and
// the reading rules have been established, so nothing here is guessed.
//
// An entry also states the manufacturer identity, so a registered manufacturer
// that is not in the database yet can be created from this one declaration rather
// than retyped (and mistyped) into the Add Manufacturer form.
// ---------------------------------------------------------------------------

export const DEDICATED_DISCOVERY_TARGETS = [
  {
    key: "krix",
    manufacturer_name: "Krix",
    website: "https://www.krix.com.au",
    function_name: "discoverKrixSpeakers",
    scope_label: "Krix dedicated home cinema range — official category page and each model's own page",
    notes:
      "Registered for dedicated discovery: the dedicated-home-cinema category page lists the range, "
      + "and each model's own page carries the specification block that is read verbatim. "
      + "Subwoofers, amplifiers, wireless kits and accessories are excluded from the P12/P13 comparison.",
  },
];

const nameKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The dedicated discovery registered for a manufacturer, or null for the generic crawler. */
export function dedicatedDiscoveryFor(manufacturerName) {
  const key = nameKey(manufacturerName);
  if (!key) return null;
  return DEDICATED_DISCOVERY_TARGETS.find((target) => nameKey(target.manufacturer_name) === key) || null;
}

/**
 * Registered manufacturers that have no record yet.
 * @param {string[]} existingNames names already in the Speaker Database
 */
export function missingDedicatedTargets(existingNames) {
  const present = new Set((existingNames || []).map((name) => nameKey(name)).filter(Boolean));
  return DEDICATED_DISCOVERY_TARGETS.filter((target) => !present.has(nameKey(target.manufacturer_name)));
}