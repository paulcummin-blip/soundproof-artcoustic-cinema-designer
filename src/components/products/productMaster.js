import { MODELS, getModelDisplayOrder } from '@/components/models/speakers/registry';

export { getModelDisplayOrder };
import { artcousticSpeakers } from '@/components/data/speakerData';
import { SUBWOOFER_BASS_CAPABILITIES } from '@/components/data/subwooferBassCapabilities';
import { normaliseModelKey } from '@/components/utils/modelKeyNormaliser';

export const PRODUCT_ROLES = Object.freeze({
  LCR: 'lcr',
  CENTRE_SOUNDBAR: 'centre_soundbar',
  SURROUND: 'surround',
  REAR_SURROUND: 'rear_surround',
  FRONT_WIDE: 'front_wide',
  OVERHEAD: 'overhead',
  SUBWOOFER: 'subwoofer',
});

export const PRODUCT_ROLE_LABELS = Object.freeze({
  [PRODUCT_ROLES.LCR]: 'LCR',
  [PRODUCT_ROLES.CENTRE_SOUNDBAR]: 'Centre / soundbar',
  [PRODUCT_ROLES.SURROUND]: 'Surround',
  [PRODUCT_ROLES.REAR_SURROUND]: 'Rear surround',
  [PRODUCT_ROLES.FRONT_WIDE]: 'Front wide',
  [PRODUCT_ROLES.OVERHEAD]: 'Overhead',
  [PRODUCT_ROLES.SUBWOOFER]: 'Subwoofer',
});

export const PRODUCT_ROLE_OPTIONS = Object.entries(PRODUCT_ROLE_LABELS)
  .map(([value, label]) => ({ value, label }));

const LEGACY_OVERHEAD = new Set(['architect-mikro', 'architect-2-1', 'spitfire-cloud', 'architect-4-2-mk2']);
const LEGACY_SOUNDBARS = new Set(['c-1', 'c4-1', 'multi-lcr', 'multi-mono', 'hspl-lcr', 'hspl-mono']);
const ALL_SURROUND_ROLES = [PRODUCT_ROLES.SURROUND, PRODUCT_ROLES.REAR_SURROUND, PRODUCT_ROLES.FRONT_WIDE];

const ENGINEERING_CATEGORY_LABELS = Object.freeze({
  LCR: 'LCR / front stage',
  SURROUNDS: 'Surround / effects',
  ARCHITECT: 'Architect / overhead',
  SUBWOOFERS: 'Subwoofer',
});

export const PRODUCT_ENGINEERING_OPTIONS = MODELS
  .filter((model) => !String(model.key).endsWith('_s'))
  .map((model) => ({
    value: model.key,
    label: model.label,
    application: ENGINEERING_CATEGORY_LABELS[model.category] || model.category,
    category: model.category,
  }));

export function defaultProductRolesForEngineeringKey(engineeringKey) {
  const key = normaliseModelKey(engineeringKey);
  const meta = MODELS.find((model) => model.key === key);
  if (!meta) return [];
  if (meta.category === 'SUBWOOFERS') return [PRODUCT_ROLES.SUBWOOFER];
  if (meta.category === 'ARCHITECT') return [PRODUCT_ROLES.OVERHEAD];
  if (meta.category === 'SURROUNDS') return [...ALL_SURROUND_ROLES];
  if (meta.frontStageType) return [PRODUCT_ROLES.CENTRE_SOUNDBAR];
  return [PRODUCT_ROLES.LCR];
}

export function productEngineeringKey(product) {
  if (product?.engineering_key) return normaliseModelKey(product.engineering_key);
  const sku = String(product?.sku || '').split(':')[0];
  return normaliseModelKey(sku.endsWith('_s') ? sku.slice(0, -2) : sku);
}

export function productSelectorKey(product, role = null) {
  const sku = normaliseModelKey(String(product?.sku || '').split(':')[0]);
  if (sku.endsWith('_s')) return sku;

  const engineeringKey = productEngineeringKey(product);
  if (ALL_SURROUND_ROLES.includes(role)) {
    const surroundKey = engineeringKey.endsWith('_s') ? engineeringKey : `${engineeringKey}_s`;
    if (MODELS.some((model) => model.key === surroundKey)) return surroundKey;
  }
  return engineeringKey;
}

export function legacyRolesForProduct(product) {
  const rawSku = normaliseModelKey(String(product?.sku || '').split(':')[0]);
  const key = productEngineeringKey(product);
  if (product?.category === 'Subwoofer') return [PRODUCT_ROLES.SUBWOOFER];
  if (rawSku.endsWith('_s')) return ALL_SURROUND_ROLES;
  if (LEGACY_SOUNDBARS.has(key)) return [PRODUCT_ROLES.CENTRE_SOUNDBAR];
  if (LEGACY_OVERHEAD.has(key)) return [PRODUCT_ROLES.OVERHEAD];
  const meta = MODELS.find((model) => model.key === rawSku)
    || MODELS.find((model) => model.key === key);
  if (meta?.category === 'SURROUNDS') return ALL_SURROUND_ROLES;
  if (meta?.category === 'ARCHITECT') return [PRODUCT_ROLES.OVERHEAD];
  if (product?.category === 'Loudspeaker') {
    if (key === 'architect-4-2' || key === 'architect-pas2-2') return [];
    return [PRODUCT_ROLES.LCR];
  }
  return [];
}

export function effectiveProductRoles(product) {
  return Array.isArray(product?.roles) ? [...new Set(product.roles)] : legacyRolesForProduct(product);
}

function staticSpeakerFor(keys) {
  for (const speaker of artcousticSpeakers) {
    const aliases = [speaker.id, speaker.model, speaker.canonicalProductId]
      .filter(Boolean)
      .map((value) => normaliseModelKey(value));
    if (keys.some((key) => aliases.includes(key))) return speaker;
  }
  return null;
}

function positive(...values) {
  return values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

function firstPositive(...values) {
  const value = values.find((candidate) => Number.isFinite(Number(candidate)) && Number(candidate) > 0);
  return value === undefined ? null : Number(value);
}

function formatFrequency(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const frequency = Number(value);
  return frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
}

function technicalDetails(meta, staticSpeaker, capability, isSubwoofer) {
  if (!meta) return [];

  const details = [];
  const depth = firstPositive(meta.depthMm);
  if (positive(meta.diameterMm)) {
    details.push(`Dimensions: Ø${Number(meta.diameterMm)} × ${depth || '—'} mm deep`);
  } else if (meta.tvWidthMap && Object.keys(meta.tvWidthMap).length) {
    const widths = Object.values(meta.tvWidthMap).map(Number).filter(Number.isFinite);
    const widthRange = widths.length ? `${Math.min(...widths)}–${Math.max(...widths)}` : 'TV-linked';
    details.push(`Dimensions: ${widthRange} × ${meta.heightMm || '—'} × ${depth || '—'} mm (TV-linked width)`);
  } else if (positive(meta.widthMm, meta.fixedWidthMm)) {
    details.push(`Dimensions: ${firstPositive(meta.widthMm, meta.fixedWidthMm)} × ${meta.heightMm || '—'} × ${depth || '—'} mm`);
  }

  const sensitivity = firstPositive(
    meta.sensitivity_dB_1w1m,
    meta.sensitivity_dB_2p83,
    staticSpeaker?.sensitivity,
    staticSpeaker?.sensitivity_db_1w_1m
  );
  if (sensitivity) details.push(`Sensitivity: ${sensitivity} dB`);

  const impedance = firstPositive(meta.nominalOhms, staticSpeaker?.impedance, staticSpeaker?.impedance_ohm);
  if (impedance) details.push(`Nominal impedance: ${impedance} Ω`);

  const power = firstPositive(meta.max_power, staticSpeaker?.max_power, staticSpeaker?.power_handling_w);
  if (power) details.push(`Power handling: ${power} W`);

  const maxSpl = firstPositive(
    capability?.maxSPL,
    meta.max_spl_cont_db_1m_halfspace,
    meta.max_spl,
    staticSpeaker?.max_spl_cont_db_1m,
    staticSpeaker?.max_spl
  );
  if (maxSpl) details.push(`Maximum continuous SPL: ${maxSpl} dB at 1 m`);

  const responseLow = firstPositive(meta.frequency_response_low, staticSpeaker?.frequency_response_low);
  const responseHigh = firstPositive(meta.frequency_response_high, staticSpeaker?.frequency_response_high);
  if (responseLow || responseHigh) {
    details.push(`Frequency range: ${formatFrequency(responseLow)} – ${formatFrequency(responseHigh)}`);
  }

  const lowLimit = firstPositive(
    capability?.usableLF_neg6dB,
    meta.usable_lf_hz_minus6db,
    staticSpeaker?.usable_lf_response_hz_minus6
  );
  if (lowLimit) details.push(`Usable LF response (−6 dB): ${lowLimit} Hz`);

  const nominalCoverage = meta.coverage_deg || staticSpeaker?.coverage_deg;
  const nominalHorizontal = firstPositive(nominalCoverage?.horizontal, staticSpeaker?.horizontal_dispersion_angle);
  const nominalVertical = firstPositive(nominalCoverage?.vertical, staticSpeaker?.vertical_dispersion_angle);
  if (nominalHorizontal || nominalVertical) {
    details.push(`Nominal coverage: ${nominalHorizontal ? `H ${nominalHorizontal}°` : ''}${nominalHorizontal && nominalVertical ? ' / ' : ''}${nominalVertical ? `V ${nominalVertical}°` : ''}`);
  }

  const horizontal = firstPositive(meta.dispersion?.horizontal?.minus3dB);
  const vertical = firstPositive(meta.dispersion?.vertical?.minus3dB);
  if (horizontal || vertical) {
    details.push(`Dispersion at −3 dB: ${horizontal ? `H ${horizontal}°` : ''}${horizontal && vertical ? ' / ' : ''}${vertical ? `V ${vertical}°` : ''}`);
  } else if (meta.polarModel?.dataset) {
    details.push(`Dispersion source: measured ${meta.polarModel.dataset} polar data`);
  }

  details.push(isSubwoofer && capability?.outputReference
    ? `Source type: ${capability.outputReference}`
    : 'Source type: Sound Proof engineering registry');
  return details;
}

export function getProductTechnicalStatus(product) {
  const roles = effectiveProductRoles(product);
  const needsEngineering = product?.category === 'Loudspeaker'
    || product?.category === 'Subwoofer'
    || roles.length > 0;

  if (!needsEngineering) {
    return {
      status: 'Complete',
      calculable: true,
      missing: [],
      warnings: [],
      details: ['Technical data: not required for this product category.'],
      message: 'No Room Designer engineering record is required for this product category.',
    };
  }

  const engineeringKey = productEngineeringKey(product);
  const selectorKey = productSelectorKey(product);
  const meta = MODELS.find((model) => model.key === selectorKey)
    || MODELS.find((model) => model.key === engineeringKey);
  const staticSpeaker = staticSpeakerFor([selectorKey, engineeringKey, selectorKey.replace(/_s$/, '')]);
  const missing = [];
  const warnings = [];
  const isSubwoofer = roles.includes(PRODUCT_ROLES.SUBWOOFER) || product?.category === 'Subwoofer';
  const capability = isSubwoofer ? SUBWOOFER_BASS_CAPABILITIES[engineeringKey] : null;

  if (!engineeringKey) missing.push('engineering link');
  if (!meta) missing.push('recognised engineering record');

  if (meta) {
    const dimensionsAvailable = positive(meta.diameterMm)
      ? positive(meta.diameterMm, meta.depthMm)
      : positive(meta.widthMm, meta.fixedWidthMm, Object.values(meta.tvWidthMap || {})[0])
        && positive(meta.heightMm)
        && positive(meta.depthMm);
    if (!dimensionsAvailable) missing.push('physical dimensions');

    if (isSubwoofer) {
      if (!capability || !Array.isArray(capability.frequencyResponseCurve) || capability.frequencyResponseCurve.length < 3) {
        missing.push('subwoofer capability curve');
      }
      if (!positive(capability?.maxSPL, meta.max_spl, meta.max_spl_cont_db_1m_halfspace)) {
        missing.push('maximum SPL authority');
      }
      if (!positive(capability?.usableLF_neg6dB, meta.usable_lf_hz_minus6db)) {
        missing.push('usable low-frequency limit');
      }
    } else {
      if (!positive(meta.sensitivity_dB_1w1m, meta.sensitivity_dB_2p83, staticSpeaker?.sensitivity, staticSpeaker?.sensitivity_db_1w_1m)) {
        missing.push('sensitivity');
      }
      if (!positive(meta.nominalOhms, staticSpeaker?.impedance, staticSpeaker?.impedance_ohm)) {
        missing.push('nominal impedance');
      }
      if (!positive(meta.max_power, staticSpeaker?.max_power, staticSpeaker?.power_handling_w)) {
        missing.push('power handling');
      }
      const hasCapability = positive(
        meta.max_spl,
        meta.max_spl_cont_db_1m_halfspace,
        meta.max_spl_cont_db_1m_anechoic,
        staticSpeaker?.max_spl,
        staticSpeaker?.max_spl_cont_db_1m
      ) || (
        positive(meta.sensitivity_dB_1w1m, staticSpeaker?.sensitivity)
        && positive(meta.max_power, staticSpeaker?.max_power)
      );
      if (!hasCapability) missing.push('maximum SPL / capability');

      if (!positive(
        meta.frequency_response_low,
        meta.usable_lf_hz_minus6db,
        staticSpeaker?.frequency_response_low,
        staticSpeaker?.usable_lf_response_hz_minus6
      )) warnings.push('verified frequency range');

      if (!meta.coverage_deg && !meta.dispersion && !meta.polarModel && !staticSpeaker?.coverage_deg) {
        warnings.push('dispersion / directivity');
      }
    }
  }

  const calculable = missing.length === 0;
  const status = !calculable ? 'Missing' : warnings.length ? 'Partial' : 'Complete';
  return {
    status,
    calculable,
    missing,
    warnings,
    details: technicalDetails(meta, staticSpeaker, capability, isSubwoofer),
    message: !calculable
      ? 'Unavailable in new design selectors until the required engineering data is linked.'
      : warnings.length
        ? 'Calculable with established data; optional technical fields remain to be completed.'
        : 'Linked engineering data is complete for current Sound Proof calculations.',
  };
}

function productDisplayLabel(product, meta) {
  const commercialLabel = String(product?.label || '').split('—')[0].trim().replace(/\s+\(Surround\)\s*$/i, '');
  return commercialLabel || meta?.label || product?.sku || 'Unnamed product';
}

export function buildProductRoleOptions(products, role) {
  const candidates = (Array.isArray(products) ? products : [])
    .filter((product) => product?.active !== false)
    .filter((product) => effectiveProductRoles(product).includes(role))
    .sort((a, b) => {
      const keyA = productSelectorKey(a, role);
      const keyB = productSelectorKey(b, role);
      const orderA = getModelDisplayOrder(keyA);
      const orderB = getModelDisplayOrder(keyB);
      return orderA - orderB || String(a.label || '').localeCompare(String(b.label || ''));
    });

  const byKey = new Map();
  for (const product of candidates) {
    const key = productSelectorKey(product, role);
    if (!key || byKey.has(key)) continue;
    const technical = getProductTechnicalStatus(product);
    if (!technical.calculable) continue;
    const meta = MODELS.find((model) => model.key === key)
      || MODELS.find((model) => model.key === productEngineeringKey(product));
    if (!meta) continue;
    const label = productDisplayLabel(product, meta);
    byKey.set(key, {
      ...meta,
      key,
      label: technical.status === 'Partial' ? `${label} · Limited data` : label,
      product_id: product.id,
      product_sku: product.sku,
      product_master_label: label,
      technical_status: technical.status,
    });
  }
  return [...byKey.values()];
}