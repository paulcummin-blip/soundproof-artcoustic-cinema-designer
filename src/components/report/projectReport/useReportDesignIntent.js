/**
 * useReportDesignIntent.js
 * ------------------------
 * READS the accepted Design Intent saved beside a Project Report.
 *
 * Read-only by design: opening a report never generates a narrative and never
 * calls a provider. It reads the saved Project Report snapshot for this version
 * and hands back the narrative metadata and the evidence fingerprints the report
 * was generated from, so the report's own authority can decide whether that
 * narrative still belongs to the report on screen.
 *
 * A report that has no saved snapshot, or a read that fails, returns nothing at
 * all — the report then shows its own deterministic Design Intent, exactly as it
 * does today.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const REPORT_TYPE_PROJECT = 'project';

export function useReportDesignIntent({ projectId, versionId }) {
  const [state, setState] = useState({ saved: null, sourceFingerprints: null, loading: false });

  const reload = useCallback(async () => {
    if (!projectId || !versionId) {
      setState({ saved: null, sourceFingerprints: null, loading: false });
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    try {
      const page = await base44.entities.ReportSnapshot.filter(
        { project_id: projectId, version_id: versionId, report_type: REPORT_TYPE_PROJECT },
        { limit: 1 },
      );
      const snapshot = (page?.items || [])[0] || null;
      setState({
        saved: snapshot?.payload?.design_intent || null,
        sourceFingerprints: snapshot?.source_fingerprints || null,
        loading: false,
      });
    } catch {
      // A narrative that cannot be read is simply not shown; the report's own
      // deterministic Design Intent stands.
      setState({ saved: null, sourceFingerprints: null, loading: false });
    }
  }, [projectId, versionId]);

  useEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}

export default useReportDesignIntent;