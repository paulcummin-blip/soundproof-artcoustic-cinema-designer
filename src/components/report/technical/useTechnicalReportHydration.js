import { useEffect } from 'react';
import { readProjectRecord, readProjectVersionRecord } from '@/components/state/projectReadCache';
import { readVersionIdentity } from '@/components/report/activeVersionIdentity';
import { resolveReportVersionId, sharedHydrationMatchesRequest } from '@/components/report/reportVersionRequest';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';

const SETTERS = ['Screen', 'DolbyConfig', 'SevenBedLayoutType', 'LcrAimMode', 'EnableFrontWides',
  'OverheadGlobalModel', 'OverheadFrontOverride', 'OverheadMidOverride', 'OverheadRearOverride',
  'UseFrontGlobal', 'UseMidGlobal', 'UseRearGlobal', 'RowSpacingM', 'SeatsPerRowByRow', 'Overlays',
  'SeatingPositions', 'RoomElements', 'FrontSubsCfg', 'RearSubsCfg', 'SpeakerSystem', 'SeatingRows',
  'SeatsPerRow', 'SeatSpacing', 'MlpBasis', 'SeatingBlockOffset', 'RowEarHeights', 'SelectedSpeakersByRole',
  'SpeakerNodes', 'GlobalSurroundModel', 'ExtraSurroundCount', 'FreeMoveLcr', 'RspMode', 'ManualRspY_m',
  'ManualRspX_m', 'DesignatedRspSeatId'];

/** Existing route hydration, separate from the immutable report presentation. */
export default function useTechnicalReportHydration({ app, explicitProjectId, requestedVersionId,
  activeProjectId, sharedHydratedVersionId, reportVersionId, reportReadyProjectId, reportReadyVersionId,
  reportHydrating, setProjectDetails, setReportHydrating, setReportReadyProjectId, setReportReadyVersionId,
  setReportProjectError, setReportVersionNumber, setReportVersionName }) {
  useEffect(() => {
    let cancelled = false;
    if (!app) return;
    const fail = () => {
      setProjectDetails(null); setReportHydrating(false); setReportReadyProjectId(null);
      setReportProjectError('Project could not be resolved for Technical Report.');
    };
    if (!explicitProjectId) { fail(); return; }
    setReportProjectError(null);
    const fast = activeProjectId === explicitProjectId && app.isProjectHydrationReady === true
      && sharedHydrationMatchesRequest({ requestedVersionId, hydratedVersionId: sharedHydratedVersionId })
      && Number.isFinite(Number(app.roomDims?.widthM)) && Number.isFinite(Number(app.roomDims?.lengthM));
    if (!fast && reportReadyProjectId === explicitProjectId && reportReadyVersionId === (reportVersionId || null)
      && reportHydrating === false) return;
    if (fast) {
      setReportHydrating(false); setReportReadyProjectId(explicitProjectId); setReportReadyVersionId(reportVersionId || null);
    } else { setReportHydrating(true); setReportReadyProjectId(null); setReportReadyVersionId(null); }
    readProjectRecord(explicitProjectId).then(async p => {
      if (cancelled) return;
      if (!p) { if (!fast) fail(); return; }
      setProjectDetails({ id: p.id, name: p.name, client_name: p.client_name, project_status: p.project_status,
        notes: p.notes, created_date: p.created_date, updated_date: p.updated_date, account_id: p.account_id || null,
        dealer_name: p.dealer_name || null, project_reference: p.project_reference || null, active_version_id: p.active_version_id || null });
      const versionId = resolveReportVersionId({ requestedVersionId, activeVersionId: p.active_version_id });
      if (fast) {
        const v = await readVersionIdentity(versionId);
        if (!cancelled) { setReportVersionNumber(v.number); setReportVersionName(v.name); }
        return;
      }
      let merged = p;
      if (versionId) {
        try {
          const v = await readProjectVersionRecord(versionId);
          if (cancelled) return;
          if (v) { merged = mergeProjectAndVersion(p, v); setReportVersionNumber(v.version_number ?? null); setReportVersionName(v.version_name ?? null); }
        } catch (error) { console.warn('[RP22Report] Version fetch failed, using project-only:', error); }
      }
      const setters = Object.fromEntries(SETTERS.map(name => ['set' + name, app['set' + name]]));
      hydrateProjectIntoAppState(merged, app, { ...setters, setDolbyPreset: app.setDolbyLayout });
      setReportReadyProjectId(p.id); setReportReadyVersionId(versionId || null); setReportHydrating(false);
    }).catch(() => { if (!cancelled && !fast) fail(); });
    return () => { cancelled = true; };
  }, [explicitProjectId, requestedVersionId]);
}