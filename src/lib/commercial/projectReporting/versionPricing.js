/**
 * versionPricing.js
 * -----------------
 * Live Design Value for one design version.
 *
 * Reads the version's stored design (design_state, with the legacy Project
 * fields as fallback for pre-version projects), adapts it into the input the
 * existing pricing engine expects, and prices it with that engine. No pricing
 * is recalculated here: the value is the engine's own output.
 *
 * Nothing is written anywhere, and a version that cannot be priced returns a
 * null value rather than zero, so an unpriced design is never counted as £0.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { computeCommercialPriceBreakdown } from '@/components/pricing/commercialPriceBreakdown';

function safeObject(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const isEnabled = (instance) => instance?.enabled !== false;

/**
 * The pricing input for one stored design. design_state wins; legacy Project
 * fields are used only when the design_state carries nothing (unmigrated or
 * pre-version projects).
 */
export function buildVersionPricingInputs({ designState = null, legacyProject = null } = {}) {
  const state = safeObject(designState) || {};
  const legacy = legacyProject || {};

  const pick = (stateKeys, legacyKeys, fallback) => {
    for (const key of stateKeys) {
      if (state[key] !== undefined && state[key] !== null) return state[key];
    }
    for (const key of legacyKeys) {
      if (legacy[key] !== undefined && legacy[key] !== null) return legacy[key];
    }
    return fallback;
  };

  const placedSpeakers = safeArray(pick(['selected_speakers'], ['selected_speakers'], []));
  const manualExtras = safeArray(pick(['manual_extras'], ['manual_extras'], []));
  const difficultyMultiplier = Number(pick(['difficulty_multiplier'], ['difficulty_multiplier'], 1));
  const priceMode = pick(['price_mode'], ['price_mode'], 'incVat');
  const acousticTreatmentEnabled = pick(['acoustic_treatment_enabled'], ['acoustic_treatment_enabled'], false) === true;
  const selectedAbfuserQty = Number(pick(['selected_abfuser_qty'], ['selected_abfuser_qty'], 0)) || 0;

  const instances = safeArray(pick(['subwooferInstances'], ['subwooferInstances'], []));
  const legacySubs = safeArray(pick(['subwoofers'], ['subwoofers'], []));

  return {
    placedSpeakers,
    manualExtras,
    difficultyMultiplier: Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 ? difficultyMultiplier : 1,
    priceMode: priceMode === 'exVat' ? 'exVat' : 'incVat',
    acousticTreatmentEnabled,
    selectedAbfuserQty,
    frontSubsCfg: safeObject(pick(['front_subs_cfg'], ['front_subs_cfg'], null)),
    rearSubsCfg: safeObject(pick(['rear_subs_cfg'], ['rear_subs_cfg'], null)),
    subwooferInstances: instances,
    legacySubwoofers: legacySubs,
    hasDesignState: Object.keys(state).length > 0,
  };
}

/**
 * The subwoofer configuration variants to price.
 *
 * Normally one variant: a front model/count and a rear model/count, which is
 * what the pricing engine expects. A group containing more than one model is
 * split into one variant per model so every instance is priced, instead of
 * silently collapsing the group to a single product.
 */
function buildSubwooferVariants(inputs) {
  const groups = { front: new Map(), rear: new Map() };

  const addTo = (group, model, count) => {
    const key = String(model || '').trim();
    if (!key || count <= 0) return;
    const bucket = group === 'rear' ? groups.rear : groups.front;
    bucket.set(key, (bucket.get(key) || 0) + count);
  };

  if (inputs.subwooferInstances.length > 0) {
    for (const instance of inputs.subwooferInstances) {
      if (!isEnabled(instance)) continue;
      addTo(instance?.legacyGroup === 'rear' ? 'rear' : 'front', instance?.model, 1);
    }
  } else if (inputs.legacySubwoofers.length > 0) {
    for (const sub of inputs.legacySubwoofers) {
      addTo(sub?.group === 'rear' ? 'rear' : 'front', sub?.model || sub?.modelKey, 1);
    }
  } else {
    for (const [group, cfg] of [['front', inputs.frontSubsCfg], ['rear', inputs.rearSubsCfg]]) {
      if (cfg?.model) addTo(group, cfg.model, Math.max(0, Number(cfg.count) || 0));
    }
  }

  const frontEntries = [...groups.front.entries()];
  const rearEntries = [...groups.rear.entries()];
  const variants = [];

  // Cap the combinations so a corrupted mixed-model group cannot explode the
  // report; the first model in each group always carries the variant.
  const frontSlots = frontEntries.length > 0 ? frontEntries : [[null, 0]];
  const rearSlots = rearEntries.length > 0 ? rearEntries : [[null, 0]];
  const maxVariants = 8;
  for (const [frontModel, frontCount] of frontSlots) {
    for (const [rearModel, rearCount] of rearSlots) {
      variants.push({
        frontSubsCfg: frontModel ? { model: frontModel, count: frontCount } : null,
        rearSubsCfg: rearModel ? { model: rearModel, count: rearCount } : null,
      });
      if (variants.length >= maxVariants) return variants;
    }
  }
  return variants;
}

function mergeLines(variants) {
  const byKey = new Map();
  for (const variant of variants) {
    for (const line of variant.breakdown || []) {
      const key = `${line.model || line.description}|${line.sizeValue || ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...line, count: Number(line.count ?? line.qty) || 0 });
        continue;
      }
      const count = existing.count + (Number(line.count ?? line.qty) || 0);
      const unit = existing.unitPriceExVat ?? line.unitPriceExVat;
      const hasPrice = unit !== null && unit !== undefined;
      byKey.set(key, {
        ...existing,
        count,
        qty: count,
        subtotalExVat: hasPrice ? Number(unit) * count : null,
        subtotal: hasPrice ? Number(unit) * count : null,
        rolesList: [...(existing.rolesList || []), ...(line.rolesList || [])],
      });
    }
  }
  return [...byKey.values()];
}

function mergeInactiveLines(variants) {
  const byKey = new Map();
  for (const variant of variants) {
    for (const line of variant.inactiveBreakdown || []) {
      const key = `${line.model || line.description}|${line.sizeValue || ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...line, count: Number(line.count ?? line.qty) || 0 });
        continue;
      }
      byKey.set(key, { ...existing, count: existing.count + (Number(line.count ?? line.qty) || 0) });
    }
  }
  return [...byKey.values()];
}

/**
 * Price one design version with the existing pricing engine.
 *
 * @param {Object} input
 * @param {Object|null} input.designState — ProjectVersion.design_state
 * @param {Object|null} input.legacyProject — Project record (fallback only)
 * @param {Object} input.priceContext — { priceMap, soundbarOptions, priceListAvailable, territoryCode, territoryLabel, currency }
 * @returns {Object} the version's Live Design Value and priced lines
 */
export function deriveVersionPricing({ designState = null, legacyProject = null, priceContext = {} } = {}) {
  const inputs = buildVersionPricingInputs({ designState, legacyProject });
  const variants = buildSubwooferVariants(inputs);

  const pricedVariants = variants.map((variant, index) => computeCommercialPriceBreakdown({
    placedSpeakers: inputs.placedSpeakers,
    frontSubsCfg: variant.frontSubsCfg,
    rearSubsCfg: variant.rearSubsCfg,
    difficultyMultiplier: inputs.difficultyMultiplier,
    priceMode: inputs.priceMode,
    // Manual extras and acoustic treatment belong to the design, not to a
    // subwoofer variant, so they are priced once.
    manualExtras: index === 0 ? inputs.manualExtras : [],
    acousticTreatmentEnabled: index === 0 ? inputs.acousticTreatmentEnabled : false,
    selectedAbfuserQty: index === 0 ? inputs.selectedAbfuserQty : 0,
    soundbarSelections: {},
    priceMap: priceContext.priceMap || null,
    soundbarOptions: priceContext.soundbarOptions || null,
    priceListAvailable: priceContext.priceListAvailable === true,
    priceListLoading: false,
    territoryCode: priceContext.territoryCode || null,
    territoryLabel: priceContext.territoryLabel || null,
    currency: priceContext.currency || null,
  }));

  const lines = mergeLines(pricedVariants);
  const inactiveLines = mergeInactiveLines(pricedVariants);
  const priceListAvailable = pricedVariants.length > 0
    && pricedVariants.every((variant) => variant.priceListAvailable === true);

  const sumOrNull = (values) => (
    values.every((value) => value === null || value === undefined)
      ? null
      : values.reduce((total, value) => total + (Number(value) || 0), 0)
  );

  const valueDisplay = priceListAvailable
    ? sumOrNull(pricedVariants.map((variant) => variant.displayTotal ?? variant.finalTotal))
    : null;
  const valueExVat = priceListAvailable
    ? sumOrNull(pricedVariants.map((variant) => variant.finalTotalExVat))
    : null;

  const unpricedLineCount = lines.filter((line) => line.unitPriceExVat === null || line.unitPriceExVat === undefined).length;

  return {
    priceListAvailable,
    value: valueDisplay,
    valueExVat,
    priceMode: inputs.priceMode,
    difficultyMultiplier: inputs.difficultyMultiplier,
    currency: priceContext.currency || null,
    territoryCode: priceContext.territoryCode || null,
    lines,
    inactiveLines,
    lineCount: lines.length,
    unpricedLineCount,
    incompletePriceCount: pricedVariants.reduce((total, variant) => total + (Number(variant.incompletePriceCount) || 0), 0),
    hasDesignState: inputs.hasDesignState,
    hasAnySelection: lines.length > 0 || inactiveLines.length > 0,
  };
}

export const __test__ = { buildSubwooferVariants, safeObject, safeArray };