/** Discrete channel architecture. An integrated LCR is one cabinet with three channels. */
const integratedModels = new Set(['multi-lcr', 'hspl-lcr']);
const frontRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
export function isIntegratedLcrSpeaker(speaker, modelMeta = null) {
  const role = String(speaker?.role || '').toUpperCase();
  if (!['FC', 'C'].includes(role)) return false;
  const type = modelMeta?.frontStageType ?? speaker?.frontStageType;
  return type ? type === 'integrated_lcr' : integratedModels.has(String(speaker?.model || '').toLowerCase());
}
export function usesIntegratedLcrStage(speakers, getModelMeta = () => null) {
  const fronts = (speakers || []).filter(s => frontRoles.has(String(s?.role || '').toUpperCase()));
  return fronts.length === 1 && isIntegratedLcrSpeaker(fronts[0], getModelMeta(fronts[0].model));
}
export function discreteChannelCounts(speakers) {
  const list = (speakers || []).filter(s => !/^LFE/.test(String(s?.role || '').toUpperCase()));
  const overhead = list.filter(s => /^(T|OH|U)/.test(String(s?.role || '').toUpperCase())).length;
  return { bed: list.length - overhead + (usesIntegratedLcrStage(list) ? 2 : 0), overhead };
}
