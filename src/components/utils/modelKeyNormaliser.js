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
  if (s.endsWith("-s")) {
    s = s.slice(0, -2) + "_s";
  }

  return s;
}