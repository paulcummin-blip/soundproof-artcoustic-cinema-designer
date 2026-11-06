/**
 * writerOptionEvidenceSummary.js (shared)
 * ------------------------------------------------
 * A clearly separated, easily readable evidence summary for each option, built
 * from the frozen evidence pack so the writer can attribute a product or a
 * parameter result only to the version it belongs to.
 *
 * The frozen pack already carries every fact and every claim, but they are
 * nested deep under `evidence_pack.options[].facts` and a flat `allowed_claims`
 * list. A comparison writer that has to mine that structure can attach a shared
 * claim to an option-specific sentence, name an option by its internal "Option
 * A/B" label instead of its saved version name, or transfer a product between
 * options. This summary surfaces, per option, the one set of facts and the one
 * set of claim IDs that belong to that option, so attribution is scannable.
 *
 * Nothing here is a second copy of the engineering. Every value, level, product
 * and claim ID is read from the pack the writer was already given, and the
 * summary changes no figure, no level, no product and no claim. It is a derived
 * view, not a new authority.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The claim areas that are RP22 parameters, lower-cased for matching. */
const PARAMETER_AREA = /^p(\d{1,2})$/i;

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The classification row for an area, if the pack carries one. */
function classificationFor(pack, areaKey) {
  return (Array.isArray(pack?.classification) ? pack.classification : [])
    .find((row) => String(row?.area || '').toLowerCase() === String(areaKey || '').toLowerCase())
    || null;
}

/** The claim IDs for one area that belong to one option, split by attribution. */
function claimsForArea(pack, areaKey, optionId) {
  const own = [];
  const shared = [];
  for (const claim of Array.isArray(pack?.allowed_claims) ? pack.allowed_claims : []) {
    if (String(claim?.area || '').toLowerCase() !== String(areaKey || '').toLowerCase()) continue;
    const claimOptionId = claim?.option?.version_id || null;
    if (claimOptionId && claimOptionId === optionId) {
      own.push(claim.claim_id);
    } else if (!claimOptionId) {
      // A shared, factual-change or not-materially-different modest claim carries
      // no option of its own, so it covers every option. It is listed under shared
      // so the writer cites it for a shared result and never for an option-specific
      // one.
      shared.push(claim.claim_id);
    }
  }
  return { own, shared };
}

/** One option's products, flat by layer, exactly as the pack lists them. */
function optionProducts(option) {
  const byLayer = option?.facts?.system?.products_by_layer
    && typeof option.facts.system.products_by_layer === 'object'
    ? option.facts.system.products_by_layer
    : {};
  const products = [];
  for (const [layer, rows] of Object.entries(byLayer)) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const model = asText(row?.model);
      if (!model) continue;
      products.push({
        layer,
        role: asText(row?.role) || null,
        model,
        quantity: numberOrNull(row?.quantity),
      });
    }
  }
  return products;
}

/** One option's RP22 parameters, each with its value, level and the claim IDs. */
function optionParameters(pack, option) {
  const parameters = Array.isArray(option?.facts?.parameters) ? option.facts.parameters : [];
  const out = [];
  for (const row of parameters) {
    const id = Number(row?.parameter_id);
    if (!Number.isFinite(id)) continue;
    // An assumed parameter is never a client-facing result and never a
    // difference between options, so it carries no claim IDs here.
    if (row?.kind === 'assumed_parameter') continue;
    const areaKey = `p${id}`;
    const { own, shared } = claimsForArea(pack, areaKey, option?.version_id);
    const classification = classificationFor(pack, areaKey);
    out.push({
      key: asText(row?.key) || `P${id}`,
      label: asText(row?.label) || null,
      level: asText(row?.level),
      value: asText(row?.value),
      classification: classification?.classification || null,
      own_claim_ids: own,
      shared_claim_ids: shared,
    });
  }
  return out;
}

/** The ranked strength story claim IDs this option's own evidence supports. */
function optionStrengthStoryClaimIds(option) {
  return (Array.isArray(option?.strength_stories) ? option.strength_stories : [])
    .flatMap((story) => (Array.isArray(story?.allowed_claim_ids) ? story.allowed_claim_ids : []));
}

/**
 * The per-option evidence summary the writer is given.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @returns {Array<Object>} one summary per option, in pack order
 */
export function buildOptionEvidenceSummary(pack) {
  const options = Array.isArray(pack?.options) ? pack.options : [];
  return options.map((option) => {
    const versionName = asText(option?.version_name) || asText(option?.label) || null;
    const label = asText(option?.label) || null;
    return {
      version_id: option?.version_id ?? null,
      version_name: versionName,
      label,
      naming_rule: versionName
        ? `Name this option only as "${versionName}" in client-facing prose. Never call it "${label || 'Option A/B'}" or any other label: the comparison must read whose product and whose result is whose.`
        : 'Name this option only by its saved version name in client-facing prose, never by its internal option label.',
      products: optionProducts(option),
      parameters: optionParameters(pack, option),
      strength_story_claim_ids: optionStrengthStoryClaimIds(option),
    };
  });
}

export default buildOptionEvidenceSummary;