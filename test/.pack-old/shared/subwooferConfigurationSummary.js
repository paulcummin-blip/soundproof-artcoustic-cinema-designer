/**
 * subwooferConfigurationSummary.js (shared)
 * -----------------------------------------
 * The ONE reading of a design version's subwoofer configuration.
 *
 * Every surface that states how many subwoofers a version has — the ADI example
 * chips, the prompt evidence given to the writer, the client summary payload —
 * reads it from here, so they can never disagree with each other or with the
 * version they describe.
 *
 * The count is the version's ACTIVE subwoofers: the same enabled instances the
 * bass analysis, the pricing engine and the reports use. The front/rear split is
 * read from each instance's own group metadata, never from a single group.
 *
 * The Dolby notation digit is deliberately NOT used as a subwoofer count: in
 * "9.1.6" the 1 is one LFE channel, which says nothing about how many
 * subwoofers the design actually has.
 *
 * Nothing is calculated, graded or corrected here. It reads passively.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs.
 */

/** An enabled flag absent still means enabled, matching the rest of the app. */
function isActive(instance) {
  return instance?.enabled !== false;
}

function groupOf(instance) {
  const raw = String(instance?.legacyGroup ?? instance?.group ?? '').trim().toLowerCase();
  return raw === 'front' || raw === 'rear' ? raw : null;
}

function countOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** The instances wherever they arrive: a raw array, a snapshot, or a payload. */
function resolveInstances(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.subwooferInstances)) return source.subwooferInstances;
  if (Array.isArray(source?.subwoofer_strategy?.instances)) return source.subwoofer_strategy.instances;
  return [];
}

/** 'sub4-12' is stated as SUB4-12, as it is everywhere the designer sees it. */
function resolveModelLabel(source, models) {
  const fromInstances = models
    .map((model) => String(model || '').trim().toUpperCase())
    .filter(Boolean);
  const fallback = (Array.isArray(source?.subwooferModels)
    ? source.subwooferModels
    : Array.isArray(source?.subwoofer_strategy?.models)
      ? source.subwoofer_strategy.models
      : [])
    .map((model) => String(model || '').trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(fromInstances.length > 0 ? fromInstances : fallback)];
  return unique.length > 0 ? unique.join(' + ') : null;
}

/**
 * Summarise one version's subwoofer configuration.
 *
 * @param {Array|Object} source — subwoofer instances, an Engineering Snapshot
 *   system block, or a client-summary system payload.
 * @returns {{
 *   totalSubwooferCount: number,
 *   frontCount: number,
 *   rearCount: number,
 *   layoutLabel: string|null,
 *   modelLabel: string|null,
 *   humanReadableSummary: string|null,
 *   available: boolean
 * }}
 */
export function summariseSubwooferConfiguration(source) {
  const instances = resolveInstances(source);

  let frontCount = 0;
  let rearCount = 0;
  let ungroupedCount = 0;
  const models = [];

  for (const instance of instances) {
    if (!isActive(instance)) continue;
    const group = groupOf(instance);
    if (group === 'front') frontCount += 1;
    else if (group === 'rear') rearCount += 1;
    else ungroupedCount += 1;
    if (instance?.model) models.push(instance.model);
  }

  const activeTotal = frontCount + rearCount + ungroupedCount;
  const statedFallback = countOf(source?.subwooferCount)
    ?? countOf(source?.subwoofer_strategy?.count)
    ?? countOf(source?.channel_layout?.subwoofer_count);
  const totalSubwooferCount = instances.length > 0
    ? activeTotal
    : (statedFallback ?? 0);

  const modelLabel = resolveModelLabel(source, models);
  const layoutLabel = frontCount > 0 && rearCount > 0
    ? 'front/rear'
    : frontCount > 0
      ? 'front'
      : rearCount > 0
        ? 'rear'
        : null;

  const breakdown = frontCount > 0 && rearCount > 0
    ? `${frontCount} front / ${rearCount} rear`
    : layoutLabel;

  let humanReadableSummary = null;
  if (totalSubwooferCount > 0) {
    const counted = modelLabel
      ? `${totalSubwooferCount} × ${modelLabel}`
      : `${totalSubwooferCount} subwoofer${totalSubwooferCount === 1 ? '' : 's'}`;
    humanReadableSummary = breakdown ? `${counted} · ${breakdown} layout` : counted;
  }

  return {
    totalSubwooferCount,
    frontCount,
    rearCount,
    layoutLabel,
    modelLabel,
    humanReadableSummary,
    available: totalSubwooferCount > 0,
  };
}

export default summariseSubwooferConfiguration;