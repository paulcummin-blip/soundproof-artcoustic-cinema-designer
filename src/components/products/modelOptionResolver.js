// products/modelOptionResolver.js
// ---------------------------------------------------------------------------
// ONE resolver for "which catalogue option is this installed model?".
//
// The equipment authority is the installed speaker record: `placedSpeakers[].model`.
// Its stored value is the canonical product KEY (e.g. "q4-3"), because the save
// path canonicalises it. A catalogue option is displayed under its product LABEL
// (e.g. "Q4-3", sometimes suffixed by the catalogue itself), so comparing the two
// strings directly is what made a selector read "Select LCR model" while the
// speakers were installed, drawn and calculated.
//
// Resolution is key-first and tolerant:
//   1. canonical key equality     "q4-3"      → option key "q4-3"
//   2. option value/label as key  "Q4-3"      → normalises to "q4-3"
//   3. legacy role-encoded key    "q4-3_s"    → canonical "q4-3"
//   4. exact label equality       "Q4-3"      → option label "Q4-3"
//
// Read-only: it never invents an option and never assigns a model to a role.
// Every selector that shows an installed model resolves the value through here,
// so one model is recognised identically in the LCR, soundbar, surround,
// overhead and subwoofer controls.
// ---------------------------------------------------------------------------

import { canonicalProductId, normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

const optionKey = (option) => option?.key ?? option?.value ?? "";

/**
 * Resolve a stored model value to the catalogue option that represents it.
 * @param {Array} options - catalogue options ({ key|value, label })
 * @param {string} storedModel - the installed speaker's stored model value
 * @returns {Object|null} the matching option, or null when nothing matches
 */
export function resolveModelOption(options, storedModel) {
  const list = Array.isArray(options) ? options : [];
  const raw = String(storedModel ?? "").trim();
  if (!raw || list.length === 0) return null;

  // 1 + 3: canonical product key equality (legacy "_s" keys included).
  const canonical = canonicalProductId(raw);
  if (canonical) {
    const byKey = list.find((option) => canonicalProductId(optionKey(option)) === canonical);
    if (byKey) return byKey;
  }

  // 2: the stored value may be the display label (or a suffixed catalogue label).
  const normalised = normaliseModelKey(raw);
  if (normalised) {
    const byValueOrLabel = list.find((option) => normaliseModelKey(optionKey(option)) === normalised)
      || list.find((option) => normaliseModelKey(option?.label) === normalised);
    if (byValueOrLabel) return byValueOrLabel;
  }

  // 4: last resort — the raw stored value is literally an option label.
  return list.find((option) => String(option?.label ?? "").trim() === raw) || null;
}

/**
 * The catalogue option's own key (its SelectItem value) for a stored model,
 * or "" when the model is not in the catalogue. Use for key-valued selectors.
 */
export function resolveModelOptionKey(options, storedModel) {
  const option = resolveModelOption(options, storedModel);
  return option ? String(optionKey(option) ?? "") : "";
}

/**
 * The catalogue option's own label (what the designer sees) for a stored model,
 * or null when the model is not in the catalogue. Use for label-valued selectors
 * so the bound value always matches a rendered item exactly.
 */
export function resolveModelOptionLabel(options, storedModel) {
  const option = resolveModelOption(options, storedModel);
  return option ? (option.label || optionKey(option)) : null;
}