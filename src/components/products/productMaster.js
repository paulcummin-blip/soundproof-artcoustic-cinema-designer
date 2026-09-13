import { MODELS } from '@/components/models/speakers/registry';
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

export function productEngineeringKey(product) {
  if (product?.engineering_key) return normaliseModelKey(product.engineering_key);
  const sku = String(product?.sku || '').split(':')[0];
  return normaliseModelKey(sku.endsWith('_s') ? sku.slice(0, -2) : sku);
}

export function productSelectorKey(product) {
  const sku = normaliseModelKey(String(product?.sku || '').split(':')[0]);
  if (sku.endsWith('_s')) return sku;
  return productEngineeringKey(product);
}

export function legacyRolesForProduct(product) {
  const rawSku = normaliseModelKey(String(product?.sku || '').split(':')[0]);
  const key = productEngineeringKey(product);
  if (product?.category === 'Subwoofer') return [PRODUCT_ROLES.SUBWOOFER];
  if (rawSku.endsWith('_s')) return ALL_SURROUND_ROLES;
  if (LEGACY_SOUNDBARS.has(key)) return [PRODUCT_ROLES.CENTRE_SOUNDBAR];
  if (LEGACY_OVERHEAD.has(key)) return [PRODUCT_ROLES.OVERHEAD];
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

  if (!engineeringKey) missing.push('engineering link');
  if (!meta) missing.push('recognised engineering record');

  if (meta) {
    const dimensionsAvailable = positive(meta.diameterMm)
      ? positive(meta.diameterMm, meta.depthMm)
      : positive(meta.widthMm, meta.fixedWidthMm, Object.values(meta.tvWidthMap || {})[0])
        && positive(meta.heightMm)
        && positive(meta.depthMm);
    if (!dimensionsAvailable) missing.push('physical dimensions');

    const isSubwoofer = roles.includes(PRODUCT_ROLES.SUBWOOFER) || product?.category === 'Subwoofer';
    if (isSubwoofer) {
      const capability = SUBWOOFER_BASS_CAPABILITIES[engineeringKey];
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

      if (!meta.dispersion && !meta.polarModel && !staticSpeaker?.coverage_deg) {
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
      const orderA = Number.isFinite(Number(a.selector_order)) ? Number(a.selector_order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.selector_order)) ? Number(b.selector_order) : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || String(a.label || '').localeCompare(String(b.label || ''));
    });

  const byKey = new Map();
  for (const product of candidates) {
    const key = productSelectorKey(product);
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
