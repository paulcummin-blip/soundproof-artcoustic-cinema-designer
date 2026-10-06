/**
 * proposalProductGrounding.js (shared)
 * ------------------------------------
 * THE product-grounding authority for proposal narrative.
 *
 * HARD RULE: a proposal may name only the products that are actually selected in
 * the specific design version the proposal is about. Anything else — another
 * version's products, a remembered product family, a previous proposal, a
 * catalogue product that was not chosen, an AI assumption, a report example or
 * old generated copy — must not appear, however plausible it reads.
 *
 * SOURCE OF TRUTH — the same frozen, version-specific system/product authority
 * the At a Glance package table is built from, on the proposal's own snapshot:
 *   - system.product_roles[].model_label | model_key  (At a Glance: buildPackageRows)
 *   - system.subwoofer_strategy.models                (At a Glance: subwooferGlanceStatement)
 *   - room.acoustic_treatment                        (Abfuser, only when enabled)
 * A comparison adds each version's own At a Glance comparison rows (lcr,
 * surrounds, overheads, subwoofers) and that version's frozen evidence, so no
 * version's products can leak into another version's copy.
 *
 * Nothing is inferred: a product is allowed only because the frozen authority for
 * that version states it. The product and role vocabulary lives in
 * proposalProductCatalogue.js; the post-generation sentence rewrite lives in
 * proposalProductSentenceRewriter.js, re-exported here so consumers have one
 * import for grounding.
 *
 * Provides:
 *   1. buildProductGrounding()       — the allowed vocabulary, per version
 *   2. buildProductVocabularyRule()  — the prompt constraint the writer must obey
 *   3. groundProductMentions()       — the deterministic post-generation pass: a
 *      sentence naming an unselected product is rewritten whole, in clean
 *      role-based wording, and a mention that cannot be removed is reported so
 *      the section is rejected instead of stored
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import { catalogueProductsInText } from './proposalProductCatalogue.js';

export { groundProductMentions } from './proposalProductSentenceRewriter.js';

/** An allowed product as the report states it. */
function allowedProduct(name, product = null, roleLabel = null) {
  return {
    name: String(name),
    roleLabel: roleLabel || null,
    kind: product?.kind || 'any',
    family: product?.family || null,
    catalogueKey: product?.key || null,
  };
}

/**
 * The products selected in ONE version, from the strings its own frozen
 * authority publishes — the same strings the At a Glance table prints.
 */
function productsFromAuthorityStrings(strings) {
  const products = [];
  for (const entry of strings) {
    if (!entry?.name) continue;
    // A value that names a product is grounded as that product; a value that
    // names none the catalogue knows is still allowed verbatim, because the
    // report's own table states it.
    const found = catalogueProductsInText(entry.name);
    const list = found.length > 0 ? found : [null];
    for (const product of list) {
      const name = product?.label || entry.name;
      const identity = product?.key || `raw:${String(entry.name).toLowerCase()}`;
      if (products.some((existing) => (existing.catalogueKey || `raw:${existing.name.toLowerCase()}`) === identity)) continue;
      products.push(allowedProduct(name, product, entry.roleLabel));
    }
  }
  return products;
}

/** The role strings of a version's frozen snapshot: what At a Glance prints. */
function authorityStringsFromSnapshot(snapshot) {
  const system = snapshot?.system || {};
  const strings = [];
  for (const role of Array.isArray(system.product_roles) ? system.product_roles : []) {
    const name = role?.model_label || role?.model_key;
    if (name) strings.push({ name, roleLabel: role?.role_description || role?.role || null });
  }
  const strategy = system.subwoofer_strategy || {};
  for (const model of Array.isArray(strategy.models) ? strategy.models : []) {
    if (model) strings.push({ name: model, roleLabel: 'Subwoofers' });
  }
  // The specified acoustic treatment is part of this version's selected products.
  const treatment = snapshot?.room?.acoustic_treatment || {};
  if (treatment.enabled === true && Number(treatment.quantity) > 0) {
    strings.push({ name: 'Abfuser', roleLabel: 'Acoustic treatment' });
  }
  return strings;
}

/** The role strings of one version's frozen comparison evidence. */
function authorityStringsFromVersionEvidence(version) {
  const strings = [];
  // The version's own product specification — the same strings its Technical
  // Report prints and the comparison table shows (quantity included). Grounding
  // therefore allows exactly what the table states, never an older package.
  const selected = version?.products_selected;
  if (selected && typeof selected === 'object') {
    for (const row of Array.isArray(selected.rows) ? selected.rows : []) {
      if (row?.value) strings.push({ name: row.value, roleLabel: row.area || null });
    }
  }
  if (strings.length > 0) return strings;

  // A comparison saved before the product authority existed: its per-role package.
  for (const role of Array.isArray(version?.speaker_package) ? version.speaker_package : []) {
    if (role?.model) strings.push({ name: role.model, roleLabel: role.role_description || role.role || null });
  }
  if (version?.subwoofer_package?.strategy) {
    strings.push({ name: version.subwoofer_package.strategy, roleLabel: 'Subwoofers' });
  }
  return strings;
}

/** The At a Glance comparison rows that state a version's products. */
const GLANCE_PRODUCT_ROW_KEYS = Object.freeze(['lcr', 'surrounds', 'overheads', 'subwoofers']);

function authorityStringsFromComparisonRows(comparisonTable, index) {
  const rows = Array.isArray(comparisonTable?.rows) ? comparisonTable.rows : [];
  const strings = [];
  for (const row of rows) {
    if (!GLANCE_PRODUCT_ROW_KEYS.includes(String(row?.key || ''))) continue;
    const value = row?.values?.[index];
    if (value) strings.push({ name: value, roleLabel: row?.area || row?.label || null });
  }
  return strings;
}

/** Carry the allowed names alongside each version's products. */
function withNames(versions) {
  return versions.map((version) => ({
    ...version,
    allowedNames: version.products.map((product) => product.name),
  }));
}

/**
 * The allowed product vocabulary for a proposal.
 *
 * @param {Object} input
 * @param {Object} [input.snapshot] — the frozen Engineering Snapshot (single report)
 * @param {string} [input.resolvedType] — 'single' | 'system_summary' | 'comparison'
 * @param {Object} [input.comparisonTable] — the frozen comparison table
 * @param {Array} [input.versionEvidence] — per-version frozen evidence
 * @param {Array} [input.versions] — the version names/labels, in report order
 * @returns {{ available: boolean, isComparison: boolean, versions: Array }}
 */
export function buildProductGrounding({ snapshot = null, resolvedType = 'single', comparisonTable = null, versionEvidence = [], versions = [] } = {}) {
  const list = Array.isArray(versionEvidence) ? versionEvidence : [];

  if (resolvedType === 'comparison' && list.length > 0) {
    const built = list.map((version, index) => ({
      id: String(version?.version_id || index),
      label: String(version?.version_name || version?.label || `Option ${String.fromCharCode(65 + index)}`),
      optionLabel: version?.label || null,
      products: productsFromAuthorityStrings([
        ...authorityStringsFromVersionEvidence(version),
        ...authorityStringsFromComparisonRows(comparisonTable, index),
      ]),
    }));
    return {
      available: built.some((version) => version.products.length > 0),
      isComparison: true,
      versions: withNames(built),
      table: comparisonTable || null,
    };
  }

  const products = productsFromAuthorityStrings(authorityStringsFromSnapshot(snapshot));
  const named = Array.isArray(versions) ? versions : [];
  return {
    available: products.length > 0,
    isComparison: false,
    versions: withNames([{
      id: String(snapshot?.version?.id || 'version'),
      label: String(snapshot?.version?.name || named[0] || 'This design version'),
      products,
    }]),
    table: null,
  };
}

/** True when the grounding can police anything at all. */
export function isGroundingUsable(grounding) {
  return Boolean(grounding?.available) && Array.isArray(grounding.versions)
    && grounding.versions.some((version) => version.products.length > 0);
}

/**
 * The prompt constraint. Appended last, so it overrides any earlier prose
 * guidance that would name a product the version does not have.
 */
export function buildProductVocabularyRule(grounding) {
  if (!isGroundingUsable(grounding)) return '';
  const lines = ['=== ALLOWED PRODUCTS: VERSION-SPECIFIC, HARD RULE (overrides every other instruction) ==='];

  if (!grounding.isComparison) {
    const version = grounding.versions[0];
    lines.push(`${version.label}: the ONLY products selected in this design version are`);
    lines.push(...version.products.map((product) => `- ${product.name}${product.roleLabel ? ` (${product.roleLabel})` : ''}`));
  } else {
    lines.push('This report compares design versions. Each version has its OWN products, and a product belongs only to the version it is listed under:');
    for (const version of grounding.versions) {
      const names = version.products.length > 0
        ? version.products.map((product) => product.name).join(', ')
        : 'no product named';
      lines.push(`- ${version.label}: ${names}`);
    }
    lines.push("Name a product only in text about the version that has it, and never let one version be described as using another version's product. Where the products differ, say plainly which version uses which.");
  }

  lines.push(
    'Never name a product from another version, another project, an earlier proposal, the product catalogue, a product family you remember, or a report example.',
    'A product not listed above does not exist in this design, however well it would suit it: do not name it, add it, compare against it or explain it.',
    'Write each speaker reference as one complete thought. Never join a selected product with a product that is not on the list, such as "combines X and Y" where only one of them is selected.',
    'For layer context without naming a model, write "the selected Artcoustic screen-wall loudspeakers", "the selected Artcoustic surround loudspeakers", "the selected Artcoustic overhead loudspeakers", "the selected subwoofer system" or "the specified acoustic treatment".',
    '"Artcoustic" may be used as the brand name. No other product name may appear anywhere in this report.',
    'Every product name is checked against this list before the report is saved, and any sentence that names a product not on it is rewritten.',
  );
  return lines.join('\n');
}

export default buildProductGrounding;