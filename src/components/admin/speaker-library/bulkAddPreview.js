// bulkAddPreview.js
// ---------------------------------------------------------------------------
// Preview logic shared by the paste and XLSX paths of "+ Add Multiple": given
// the combined raw rows, compute an outcome per row, merge within-workbook
// duplicates into the first new/incomplete occurrence, and produce the
// actionable set passed to bulkAddSpeakers. Kept separate from the dialog so
// it stays testable and the dialog stays lean.
// ---------------------------------------------------------------------------

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const TECH_FIELDS = [
  "source_url", "sensitivity_db", "sensitivity_reference",
  "impedance_ohm", "power_w", "max_spl_db", "price",
];

export const OUTCOME_META = {
  new: { label: "New", color: "#213428" },
  incomplete: { label: "Incomplete", color: "#9A6E00" },
  existing: { label: "Existing", color: "#3E4349" },
  duplicate: { label: "Duplicate exact match", color: "#625143" },
  "brand-only": { label: "Manufacturer only", color: "#625143" },
  invalid: { label: "—", color: "#7A1E19" },
};

/**
 * @param {Array} rawRows   combined rows from paste + workbook
 * @param {Set<string>} existingKeys  identity keys already in the database
 * @param {(row) => string} keyFor  identity key function
 */
export function buildPreview(rawRows, existingKeys, keyFor) {
  const seen = new Map();
  const items = [];
  const actionableMap = new Map();
  const brandOnlyRows = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const key = keyFor(row);
    const hasBrand = hasValue(row.manufacturer);
    const hasProduct = hasValue(row.model);
    let outcome;
    if (!hasProduct && hasBrand) {
      outcome = "brand-only";
      brandOnlyRows.push(row);
    } else if (!hasProduct) {
      outcome = "invalid";
    } else if (existingKeys.has(key)) {
      outcome = "existing";
    } else if (seen.has(key)) {
      outcome = "duplicate";
    } else {
      seen.set(key, i);
      const hasTech = hasValue(row.sensitivity_db) || hasValue(row.impedance_ohm)
        || hasValue(row.power_w) || hasValue(row.max_spl_db);
      outcome = hasTech ? "new" : "incomplete";
      actionableMap.set(key, { ...row });
    }
    items.push({ row, outcome, key, index: i });
  }
  // Merge within-workbook duplicate rows' non-conflicting fields into the first
  // new/incomplete occurrence of the same identity.
  for (const it of items) {
    if (it.outcome === "duplicate") {
      const target = actionableMap.get(it.key);
      if (target) for (const f of TECH_FIELDS) if (!hasValue(target[f]) && hasValue(it.row[f])) target[f] = it.row[f];
    }
  }
  const actionable = Array.from(actionableMap.values());
  return {
    items,
    actionable,
    brandOnlyRows,
    toAdd: [...actionable, ...brandOnlyRows],
    actionableCount: actionable.length,
  };
}