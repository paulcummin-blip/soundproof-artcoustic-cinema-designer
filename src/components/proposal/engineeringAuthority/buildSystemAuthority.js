/**
 * buildSystemAuthority.js
 * --------------------------------
 * Layer 1 — Loudspeaker system sub-authority.
 * Returns structured engineering information about the speaker system.
 * Pure function. No GPT. No side effects.
 */

import { CONFIDENCE } from './confidence';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { resolveSpeakerModelsByRole } from './resolveSpeakerModelsByRole';
import { buildProductsSelected, layoutVisibilityFilter } from '@/components/report/reportProductsSelected';

function parseDolbyConfig(config) {
  if (!config || typeof config !== 'string') return { bed: 0, sub: 0, overhead: 0, text: 'Not configured' };
  const parts = config.split('.');
  const bed = parseInt(parts[0], 10) || 0;
  const sub = parseInt(parts[1], 10) || 0;
  const overhead = parseInt(parts[2], 10) || 0;
  return { bed, sub, overhead, text: `${config} Dolby Atmos configuration (${bed} bed channels, ${sub} subwoofer${sub !== 1 ? 's' : ''}, ${overhead} overhead channel${overhead !== 1 ? 's' : ''})` };
}

function describeRole(role) {
  const roleMap = {
    lcr: 'Left/Centre/Right (screen wall)',
    centre_soundbar: 'Centre channel (soundbar)',
    surround: 'Side surround',
    rear_surround: 'Rear surround',
    front_wide: 'Front wide',
    overhead: 'Overhead/height',
    subwoofer: 'Subwoofer',
  };
  return roleMap[role] || role;
}

function resolveOverheadModel(project) {
  const globalModel = project?.overhead_global_model || 'architect-2-1';
  const overrides = {
    front: project?.use_front_global ? null : project?.overhead_front_override,
    mid: project?.use_mid_global ? null : project?.overhead_mid_override,
    rear: project?.use_rear_global ? null : project?.overhead_rear_override,
  };
  return { global_model: globalModel, overrides };
}

export function buildSystemAuthority(project, _version, placedSpeakers) {
  const dolbyConfig = parseDolbyConfig(project?.dolby_config);
  const speakersByRole = resolveSpeakerModelsByRole(project, placedSpeakers);
  const subwooferInstances = Array.isArray(project?.subwooferInstances) ? project.subwooferInstances : [];
  const enabledSubs = subwooferInstances.filter((s) => s.enabled !== false);
  const ampPower = Number(project?.amplifier_power) || null;
  const overhead = resolveOverheadModel(project);

  // Build channel layout from dolby config. The subwoofer count is the number of
  // subwoofers this version actually has, taken from its own instances — the same
  // figure the analysis, pricing and reports use. The Dolby notation digit is one
  // LFE channel (9.1.6 → 1), never a subwoofer count, so it is kept separately.
  const channelLayout = {
    bed_channels: dolbyConfig.bed,
    subwoofer_count: enabledSubs.length,
    dolby_subwoofer_channels: dolbyConfig.sub,
    overhead_channels: dolbyConfig.overhead,
    total_discrete: dolbyConfig.bed + dolbyConfig.overhead,
    configuration_text: dolbyConfig.text,
  };

  // Build product roles from selected_speakers_by_role
  const productRoles = [];
  for (const [role, model] of Object.entries(speakersByRole)) {
    if (!model) continue;
    const meta = getSpeakerModelMeta(model);
    productRoles.push({
      role,
      role_description: describeRole(role),
      model_key: model,
      model_label: meta?.label || model,
      category: meta?.category || 'Unknown',
      found_in_registry: !meta?.notFound,
    });
  }

  // Subwoofer strategy
  const subwooferStrategy = {
    count: enabledSubs.length,
    models: [...new Set(enabledSubs.map((s) => s.model).filter(Boolean))],
    instances: enabledSubs.map((s) => ({
      id: s.id,
      model: s.model,
      // The group travels with the instance so the subwoofer summary can state
      // the front/rear layout without re-deciding which side a sub is on.
      group: s.legacyGroup ?? s.group ?? null,
      position: s.position ? { x: s.position.x, y: s.position.y } : null,
      bottom_height_m: s.bottomHeightM ?? 0,
      rotation_deg: s.rotationDeg ?? 0,
      gain_db: s.gainDb ?? 0,
      delay_ms: s.delayMs ?? 0,
      polarity: s.polarity ?? 0,
    })),
    strategy_text: enabledSubs.length === 0
      ? 'No subwoofers configured.'
      : enabledSubs.length === 1
        ? `Single subwoofer (${enabledSubs[0]?.model || 'unknown'}). Bass response will be position-dependent with significant seat-to-seat variation.`
        : enabledSubs.length === 2
          ? `Two subwoofers (${enabledSubs.map((s) => s.model).filter(Boolean).join(', ')}). Dual-subwoofer configuration improves modal smoothing compared to a single subwoofer.`
          : enabledSubs.length === 4
            ? `Four subwoofers (${[...new Set(enabledSubs.map((s) => s.model).filter(Boolean))].join(', ')}). Distributed multi-subwoofer arrangement for maximum seat-to-seat bass consistency.`
            : `${enabledSubs.length} subwoofers (${[...new Set(enabledSubs.map((s) => s.model).filter(Boolean))].join(', ')}). Multi-subwoofer configuration for modal smoothing.`,
    confidence: CONFIDENCE.MEASURED,
  };

  // Amplification
  const amplification = ampPower != null
    ? { specified: true, power_w: ampPower, text: `${ampPower}W amplifier power specified`, confidence: CONFIDENCE.MEASURED }
    : { specified: false, power_w: null, text: 'Amplification not specified', confidence: CONFIDENCE.NOT_CALCULATED };

  // The products this VERSION is specified with, stating model and quantity per
  // layer in the exact form the version's own Technical Report prints them. This
  // is the product specification a System Design Comparison column reads, so a
  // comparison can never state a different package from that version's report.
  const productsSelected = buildProductsSelected({
    placedSpeakers,
    frontSubsCfg: project?.front_subs_cfg || project?.frontSubsCfg || null,
    rearSubsCfg: project?.rear_subs_cfg || project?.rearSubsCfg || null,
    subwooferInstances,
    acousticTreatmentEnabled: project?.acoustic_treatment_enabled ?? project?.acousticTreatmentEnabled ?? false,
    selectedAbfuserQty: project?.selected_abfuser_qty ?? project?.selectedAbfuserQty ?? 0,
    isVisible: layoutVisibilityFilter(project?.dolby_config, project?.seven_bed_layout_type),
  });

  // System topology summary
  const topology = {
    dolby_config: project?.dolby_config || null,
    channel_layout: channelLayout,
    lcr_model: speakersByRole.lcr || speakersByRole.centre_soundbar || null,
    surround_model: speakersByRole.surround || null,
    rear_surround_model: speakersByRole.rear_surround || null,
    front_wide_model: speakersByRole.front_wide || null,
    overhead: {
      global_model: overhead.global_model,
      front_override: overhead.overrides.front,
      mid_override: overhead.overrides.mid,
      rear_override: overhead.overrides.rear,
    },
    subwoofer: subwooferStrategy,
    amplification,
    placed_speaker_count: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0,
  };

  return {
    configuration: {
      dolby_config: project?.dolby_config || null,
      text: dolbyConfig.text,
      bed_channels: dolbyConfig.bed,
      overhead_channels: dolbyConfig.overhead,
      total_discrete_channels: dolbyConfig.bed + dolbyConfig.overhead,
      confidence: CONFIDENCE.MEASURED,
    },
    channel_layout: channelLayout,
    product_roles: productRoles,
    // The report-stated product specification of this version (see
    // reportProductsSelected.js): the comparison's product rows read this.
    products_selected: productsSelected,
    subwoofer_strategy: subwooferStrategy,
    amplification,
    topology,
  };
}