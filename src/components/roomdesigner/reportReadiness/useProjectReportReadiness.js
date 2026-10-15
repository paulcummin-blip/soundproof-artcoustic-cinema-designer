/**
 * useProjectReportReadiness
 * -------------------------
 * The Project Report verdict for the project (Room Designer) page.
 *
 * It reads the SAME authorities the Project Report page reads, and derives
 * nothing of its own:
 *   - useVersionedEngineeringAuthority — the version's durable engineering
 *     publication and its one publication verdict.
 *   - useReportSnapshot — the saved Project Report and its own saved-vs-design
 *     source fingerprints (the report's single staleness authority).
 *   - reportReadinessAuthority.deriveReportReadiness — the required-data and
 *     assessment checklist.
 *
 * Read-only: no analysis is mounted, no report is generated, nothing is saved.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { useVersionedEngineeringAuthority } from '@/components/engineering/useVersionedEngineeringAuthority';
import { statesBassAuthority } from '@/components/engineering/versionedEngineeringAuthority';
import { readBassPendingIndicator } from '@/components/state/designReviewHandoff';
import { deriveReportReadiness } from '@/components/report/reportReadinessAuthority';
import { useReportSnapshot } from '@/components/report/useReportSnapshot';
import {
  REPORT_SNAPSHOT_TYPE,
  currentSourceFingerprints,
} from '@/components/report/reportSnapshotAuthority';
import { assessmentDetail, composeProjectReportVerdict } from './projectReportReadiness';

export function useProjectReportReadiness({
  projectId = null,
  versionId = null,
  hydrating = false,
} = {}) {
  const appState = useAppState();

  // A running bass assessment changes the verdict, so the button keeps reading
  // the existing bass-pending indicator while it is on screen.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const authority = useVersionedEngineeringAuthority(projectId, versionId, {
    finalReport: true,
  });

  const engineeringSummary = authority.snapshot?.engineeringSummary
    ?? authority.snapshot?.rating?.engineeringSummary
    ?? null;

  // The report page's own "project as it stands now" fingerprints. The saved
  // report is judged against exactly these, so both surfaces agree.
  const currentFingerprints = useMemo(
    () =>
      currentSourceFingerprints({
        authoritySnapshot: authority.snapshot,
        engineeringSummary,
      }),
    [authority.snapshot, engineeringSummary],
  );

  const report = useReportSnapshot({
    projectId,
    versionId,
    reportType: REPORT_SNAPSHOT_TYPE.PROJECT,
    currentFingerprints,
  });

  const readiness = useMemo(
    () =>
      deriveReportReadiness({
        hydrating: hydrating || authority.loading || report.loading,
        roomDims: appState?.roomDims || null,
        placedSpeakers: appState?.speakerSystem?.placedSpeakers || [],
        engineeringSummary,
        assessment: {
          reportComplete: authority.reportComplete,
          status: authority.publicationGate?.status,
          reason: authority.reportCompleteness?.reason,
        },
        bassPerformance: statesBassAuthority(engineeringSummary) ? engineeringSummary : null,
        // The report page states pricing as unknown when the design carries no
        // schedule; it is never a blocker here either.
        pricingStatus: 'unknown',
        bassCalculating: readBassPendingIndicator(projectId) === true,
      }),
    [
      hydrating,
      authority.loading,
      authority.reportComplete,
      authority.publicationGate?.status,
      authority.reportCompleteness?.reason,
      report.loading,
      appState?.roomDims,
      appState?.speakerSystem?.placedSpeakers,
      engineeringSummary,
      projectId,
      tick,
    ],
  );

  const verdict = useMemo(
    () =>
      composeProjectReportVerdict({
        readiness,
        snapshotStatus: report.status,
        changedKeys: report.changedKeys,
        detail: assessmentDetail(authority.reportCompleteness),
      }),
    [readiness, report.status, report.changedKeys, authority.reportCompleteness],
  );

  return {
    ...verdict,
    loading: authority.loading || report.loading,
    generatedAt: report.generatedAt || null,
    generatedBy: report.generatedBy || null,
  };
}

export default useProjectReportReadiness;