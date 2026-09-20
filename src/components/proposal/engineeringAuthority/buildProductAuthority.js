/**
 * buildProductAuthority.js
 * --------------------------------
 * Layer 1 — Product facts sub-authority.
 * Returns factual engineering specifications for each product in the design.
 * No marketing language. No sales copy.
 * Pure function. No GPT. No side effects.
 */

import { CONFIDENCE, SOURCE } from './confidence';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { resolveSpeakerModelsByRole } from './resolveSpeakerModelsByRole';

function extractProductFacts(meta, modelKey) {
  if (!meta || meta.notFound) {
    return {
      model_key: modelKey,
      label: String(modelKey || 'Unknown'),
      category: 'Unknown',
      found_in_registry: false,
      specifications: {},
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const specs = {
    sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m ?? null,
    sensitivity_db_2p83v: meta.sensitivity_dB_2p83 ?? null,
    nominal_impedance_ohm: meta.nominalOhms ?? null,
    max_power_w: meta.max_power ?? null,
    max_continuous_spl_db_halfspace: meta.max_spl_cont_db_1m_halfspace ?? meta.max_spl ?? null,
    max_peak_spl_db_halfspace: meta.max_spl_peak_db_cf6_1m_halfspace ?? meta.peak_spl ?? null,
    max_continuous_spl_db_anechoic: meta.max_spl_cont_db_1m_anechoic ?? null,
    frequency_response_low_hz: meta.frequency_response_low ?? null,
    frequency_response_high_hz: meta.frequency_response_high ?? null,
    usable_lf_hz_minus6db: meta.usable_lf_hz_minus6db ?? null,
    coverage_horizontal_deg: meta.coverage_deg?.horizontal ?? meta.dispersion?.horizontal?.minus3dB ?? null,
    coverage_vertical_deg: meta.coverage_deg?.vertical ?? meta.dispersion?.vertical?.minus3dB ?? null,
    cabinet_width_mm: meta.widthM ? Math.round(meta.widthM * 1000) : null,
    cabinet_height_mm: meta.heightM ? Math.round(meta.heightM * 1000) : null,
    cabinet_depth_mm: meta.depthM ? Math.round(meta.depthM * 1000) : null,
    round: meta.round ?? false,
    front_stage_type: meta.frontStageType ?? null,
  };

  // Determine confidence based on data completeness
  const hasSensitivity = specs.sensitivity_db_1w_1m != null || specs.sensitivity_db_2p83v != null;
  const hasMaxSpl = specs.max_continuous_spl_db_halfspace != null;
  const hasFreqResponse = specs.frequency_response_low_hz != null || specs.usable_lf_hz_minus6db != null;
  const completeness = [hasSensitivity, hasMaxSpl, hasFreqResponse].filter(Boolean).length;
  const confidence = completeness === 3 ? CONFIDENCE.PUBLISHED_SPEC_A
    : completeness === 2 ? CONFIDENCE.PUBLISHED_SPEC_B
    : completeness === 1 ? CONFIDENCE.PUBLISHED_SPEC_C
    : CONFIDENCE.PUBLISHED_SPEC_D;

  return {
    model_key: meta.key || modelKey,
    label: meta.label || String(modelKey),
    category: meta.category || 'Unknown',
    found_in_registry: true,
    specifications: specs,
    confidence,
    source: SOURCE.PUBLISHED_SPEC,
  };
}

function describeEngineeringPurpose(role, meta) {
  const purposes = {
    lcr: 'Left, Centre, and Right screen-wall speakers. Responsible for dialogue intelligibility, on-screen sound localisation, and the primary front soundstage.',
    centre_soundbar: 'Centre channel soundbar. Responsible for dialogue intelligibility and on-screen sound localisation.',
    surround: 'Side surround speakers. Responsible for lateral spatial envelopment and off-screen sound movement.',
    rear_surround: 'Rear surround speakers. Responsible for rear spatial envelopment and back hemisphere sound localisation.',
    front_wide: 'Front wide speakers. Expands the front soundstage beyond the screen width for enhanced spatial width.',
    overhead: 'Overhead/height speakers. Responsible for vertical spatial envelopment and overhead sound object rendering.',
    subwoofer: 'Subwoofer. Responsible for low-frequency effects and bass-managed content below the room transition frequency.',
  };

  let purpose = purposes[role] || `Role: ${role}`;

  // Add cabinet-specific context
  if (meta?.frontStageType === 'integrated_lcr') {
    purpose += ' Integrated LCR soundbar design for TV-mounted front stage.';
  } else if (meta?.frontStageType === 'center_only') {
    purpose += ' Centre-only soundbar design for TV-mounted front stage.';
  }
  if (meta?.round) {
    purpose += ' Round in-ceiling form factor for overhead placement.';
  }

  return purpose;
}

export function buildProductAuthority(project, _version, placedSpeakers) {
  const speakersByRole = resolveSpeakerModelsByRole(project, placedSpeakers);
  const subwooferInstances = Array.isArray(project?.subwooferInstances) ? project.subwooferInstances : [];
  const overheadGlobal = project?.overhead_global_model || 'architect-2-1';

  const products = [];

  // LCR / centre soundbar
  if (speakersByRole.lcr) {
    const meta = getSpeakerModelMeta(speakersByRole.lcr);
    const facts = extractProductFacts(meta, speakersByRole.lcr);
    products.push({
      ...facts,
      role: 'lcr',
      role_description: 'Left/Centre/Right (screen wall)',
      engineering_purpose: describeEngineeringPurpose('lcr', meta),
    });
  }
  if (speakersByRole.centre_soundbar && speakersByRole.centre_soundbar !== speakersByRole.lcr) {
    const meta = getSpeakerModelMeta(speakersByRole.centre_soundbar);
    const facts = extractProductFacts(meta, speakersByRole.centre_soundbar);
    products.push({
      ...facts,
      role: 'centre_soundbar',
      role_description: 'Centre channel (soundbar)',
      engineering_purpose: describeEngineeringPurpose('centre_soundbar', meta),
    });
  }

  // Surrounds
  if (speakersByRole.surround) {
    const meta = getSpeakerModelMeta(speakersByRole.surround);
    const facts = extractProductFacts(meta, speakersByRole.surround);
    products.push({
      ...facts,
      role: 'surround',
      role_description: 'Side surround',
      engineering_purpose: describeEngineeringPurpose('surround', meta),
    });
  }

  // Rear surrounds
  if (speakersByRole.rear_surround) {
    const meta = getSpeakerModelMeta(speakersByRole.rear_surround);
    const facts = extractProductFacts(meta, speakersByRole.rear_surround);
    products.push({
      ...facts,
      role: 'rear_surround',
      role_description: 'Rear surround',
      engineering_purpose: describeEngineeringPurpose('rear_surround', meta),
    });
  }

  // Front wides
  if (speakersByRole.front_wide) {
    const meta = getSpeakerModelMeta(speakersByRole.front_wide);
    const facts = extractProductFacts(meta, speakersByRole.front_wide);
    products.push({
      ...facts,
      role: 'front_wide',
      role_description: 'Front wide',
      engineering_purpose: describeEngineeringPurpose('front_wide', meta),
    });
  }

  // Overhead (global model)
  const overheadMeta = getSpeakerModelMeta(overheadGlobal);
  const overheadFacts = extractProductFacts(overheadMeta, overheadGlobal);
  products.push({
    ...overheadFacts,
    role: 'overhead',
    role_description: 'Overhead/height',
    engineering_purpose: describeEngineeringPurpose('overhead', overheadMeta),
  });

  // Subwoofers
  const subModels = [...new Set(subwooferInstances.filter((s) => s.enabled !== false && s.model).map((s) => s.model))];
  for (const subModel of subModels) {
    const meta = getSpeakerModelMeta(subModel);
    const facts = extractProductFacts(meta, subModel);
    const instanceCount = subwooferInstances.filter((s) => s.enabled !== false && s.model === subModel).length;
    products.push({
      ...facts,
      role: 'subwoofer',
      role_description: `Subwoofer (${instanceCount} instance${instanceCount !== 1 ? 's' : ''})`,
      engineering_purpose: describeEngineeringPurpose('subwoofer', meta),
      instance_count: instanceCount,
    });
  }

  // System coherence assessment
  const allModelKeys = products.map((p) => p.model_key);
  const uniqueFamilies = new Set(allModelKeys.map((k) => {
    if (k?.startsWith('evolve') || k?.startsWith('sl-evolve')) return 'EVOLVE';
    if (/^q\d+-\d+/.test(k)) return 'SPITFIRE_Q';
    if (k?.startsWith('architect')) return 'ARCHITECT';
    if (k?.startsWith('c-') || k?.startsWith('multi') || k?.startsWith('hspl')) return 'TV_SOUNDBAR';
    return 'OTHER';
  }));
  const isMatchedFamily = uniqueFamilies.size <= 2 && !uniqueFamilies.has('OTHER');

  return {
    products,
    product_count: products.length,
    system_coherence: {
      is_matched_family: isMatchedFamily,
      families: [...uniqueFamilies],
      text: isMatchedFamily
        ? 'The system uses a matched speaker family across all channels, ensuring timbral consistency from front to back.'
        : 'The system uses products from multiple families; timbral consistency should be verified during calibration.',
      confidence: CONFIDENCE.COMPUTED_GEOMETRIC,
    },
  };
}