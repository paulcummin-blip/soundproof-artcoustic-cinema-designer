import { publicationSectionReport, RP22_PARAMETER_KEYS } from './publicationGateCore';
import { statesBassAuthority } from './versionedEngineeringAuthority';

export function engineeringPublicationPreflight({
  projectId, versionId, ready, isPublishable, engineeringSummary,
  engineeringFingerprint, bassReadiness = {}, retainedFromRefresh = false,
  reportSnapshot, designState, versions,
}) {
  const bassReady = bassReadiness.ready === true || retainedFromRefresh === true;
  const candidate = {
    engineering_fingerprint: engineeringFingerprint, published_at: 'preflight',
    engineering_summary: engineeringSummary, report_snapshot: reportSnapshot,
    ...versions, provenance: { bass_fingerprint: bassReadiness.fingerprint },
  };
  const sectionReport = publicationSectionReport(candidate, {
    project: { roomDims: designState?.roomDims,
      screen_size: designState?.screen?.visibleWidthInches,
      manual_width_m: designState?.screen?.manualWidthM,
      tv_width_mm: designState?.screen?.tvWidthMm },
    bassAuthorityAvailable: bassReady,
  });
  const parameters = engineeringSummary?.parameterAuthority || {};
  const provisional = RP22_PARAMETER_KEYS.filter(key => {
    const item = parameters[key];
    // Bass is composed from the matching verified contract, not its provisional shell.
    if (['p14', 'p18', 'p19', 'p20'].includes(key) && bassReady) return false;
    return !item || ['provisional', 'pending', 'calculating'].includes(item.state);
  });
  const bassReason = bassReadiness.detail || bassReadiness.reason || 'bass authority unavailable';
  const gates = [
    { key: 'version', label: 'Project and selected version', ok: !!projectId && !!versionId },
    { key: 'hydration', label: 'Version loaded and minimum system selected', ok: ready === true },
    { key: 'rp22_terminal', label: 'RP22 P1–P21 terminal (verified bass or explicit N/A)', ok: provisional.length === 0, detail: provisional.join(', ') },
    { key: 'bass_current', label: 'Current verified bass / P19', ok: bassReady, detail: bassReady ? null : bassReason },
    { key: 'design_rating', label: 'Publishable settled design rating', ok: isPublishable === true },
    { key: 'bass_summary', label: 'Bass results in engineering summary', ok: statesBassAuthority(engineeringSummary) },
    ...sectionReport.items.filter(item => item.key !== 'published_at'),
  ];
  const missing = gates.filter(item => !item.ok);
  return {
    ready: missing.length === 0, gates, missing,
    reason: missing.map(item => item.label + (item.detail ? ': ' + item.detail : '')).join('; '),
    action: bassReady ? 'Publish Assessment' : 'Verify Bass / Complete P19',
    p19Blocks: !bassReady && bassReadiness.reason === 'not-verified',
  };
}
