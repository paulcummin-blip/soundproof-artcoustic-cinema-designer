// modelKeyNormaliser.js
// Deterministic speaker/subwoofer model-key normalisation.
// Extracted from registry.jsx as a Node-compatible .js helper so that
// V2 modules (and Node tests) can import it without pulling in JSX or
// @/ aliases. registry.jsx re-exports this for existing consumers.

/**
 * Normalise a speaker/subwoofer model name to a canonical lowercase key.
 *
 * @param {string} name - raw model name (e.g. "SUB2-12", "Spitfire Q4-3")
 * @returns {string} canonical key (e.g. "sub2-12", "q4-3")
 */
export function normaliseModelKey(name = "") {
  const raw = String(name).toLowerCase();
  // STEP 1: Preserve underscores in the sanitiser
  let s = raw.replace(/[()]/g, " ").replace(/[^a-z0-9_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  // unify known families
  s = s.replace(/^spitfire-q-(\d+)-(\d+)$/, "q$1-$2");
  s = s.replace(/^spitfire-q(\d+)-(\d+)$/, "q$1-$2"); // handle "spitfire-q4-3" -> "q4-3"
  s = s.replace(/^evolve-(\d+)-(\d+)$/, "evolve-$1-$2");
  s = s.replace(/^architect-(pas2-2)$/, "architect-$1");
  s = s.replace(/^architect-mikro$/, "architect-mikro");

  // Safety net: normalise a trailing "-s" back to "_s"
  // NOTE: this preserves the legacy registry variant keys used for ACOUSTIC
  // lookup. It must not be used for commercial product identity — use
  // canonicalProductId() for that.
  if (s.endsWith("-s")) {
    s = s.slice(0, -2) + "_s";
  }

  return s;
}

/**
 * Canonical PRODUCT ID for a speaker/subwoofer.
 *
 * Product identity never encodes role. A surround placement of an Evolve 2-1 is
 * still the Evolve 2-1 product; the surround is expressed by the speaker's role,
 * never by a "_s" suffix. Legacy designs stored the suffix as product identity,
 * so every identity boundary (pricing, persistence, reports, proposals)
 * canonicalises through here.
 *
 * The registry keeps its "_s" rows as legacy aliases, and they are acoustically
 * identical to their base model, so canonicalising identity moves no acoustic,
 * RP22 or SPL result.
 *
 * @param {string} name - raw model name (e.g. "evolve-2-1_s", "Evolve 2-1")
 * @returns {string} canonical base product key (e.g. "evolve-2-1")
 */
export function canonicalProductId(name = "") {
  const key = normaliseModelKey(name);
  return key.endsWith("_s") ? key.slice(0, -2) : key;
}

/**
 * True when a key still carries the legacy role-encoded "_s" product suffix.
 */
export function hasLegacySurroundSuffix(name = "") {
  return normaliseModelKey(name).endsWith("_s");
}

/**
 * Canonicalise a role → model map (e.g. selected_speakers_by_role).
 *
 * Values are either a model string or an object carrying { model }. Shape is
 * preserved exactly; only the product identity inside it is canonicalised, so
 * the role keys (surround, rear_surround, lcr, …) are never touched.
 */
export function canonicaliseRoleModelMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return map;
  const out = {};
  for (const [role, value] of Object.entries(map)) {
    if (typeof value === "string") {
      out[role] = canonicalProductId(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[role] = value.model
        ? { ...value, model: canonicalProductId(value.model) }
        : value;
    } else {
      out[role] = value;
    }
  }
  return out;
}