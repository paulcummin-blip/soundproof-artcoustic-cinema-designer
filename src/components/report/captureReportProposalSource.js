import { buildEngineeringSnapshot } from '@/components/proposal/engineeringAuthority/buildEngineeringSnapshot';
import { buildProductsSelected } from '@/components/report/reportProductsSelected';
import { readReportParameter } from '@/components/report/reportParameterEvidence';
import { buildReportEvidence } from '@/components/report/reportEvidenceAuthority';

// Called only by a generated report's save action, never by proposal generation.
export default function captureReportProposalSource({
  projectId, versionId, project, engineeringSummary, app, presentation,
  reportType = null, sourceFingerprint = null, seatingPublication = null,
}) {
  if (!engineeringSummary || !projectId || !versionId || !project) return null;
  if (engineeringSummary.reportAuthority?.source_type !== 'durable-engineering-publication'
    || !seatingPublication?.report_snapshot?.report_project) return null;
  const speakers = seatingPublication.report_snapshot.placedSpeakers || [];
  const seats = seatingPublication
    ? seatingPublication.report_snapshot?.seatingPositions || []
    : presentation?.seatingPositions || app?.seatingPositions || [];
  const design = { ...project, selected_speakers: speakers };
  const snapshot = buildEngineeringSnapshot({
    projectId, versionId, project, mergedProject: design,
    version: { id: versionId, version_name: project.version_name },
    engineeringSummary, seats, placedSpeakers: speakers,
    priceCalculation: presentation?.priceData,
  });
  const products = buildProductsSelected({
    placedSpeakers: speakers,
    frontSubsCfg: project.front_subs_cfg,
    rearSubsCfg: project.rear_subs_cfg,
    acousticTreatmentEnabled: project.acoustic_treatment_enabled,
    selectedAbfuserQty: project.selected_abfuser_qty,
  });
  const ids = Object.keys(engineeringSummary.parameterSummaries?.project || {})
    .filter((key) => /^p\d+$/.test(key)).map((key) => Number(key.slice(1)));
  const parameters = ids.map((id) => readReportParameter(engineeringSummary, id));
  // The RP22 authority's own statement of each parameter, kept BEFORE the
  // visible rows overwrite the headlines. The parity check compares the two.
  const authorityHeadlines = snapshot.rp22.parameter_headlines.map(row => {
    const atomic = parameters.find(entry => entry.parameter_id === row.parameter_id);
    return { ...row, achieved_level: atomic?.level, formatted_value: atomic?.value };
  });
  const captured = {
    ...snapshot,
    system: { ...snapshot.system, products_selected: products },
    rp22: { ...snapshot.rp22, parameter_headlines: authorityHeadlines.map((row) => {
      const stated = parameters.find((entry) => entry.parameter_id === row.parameter_id);
      return { ...row, achieved_level: stated?.level, formatted_value: stated?.value };
    }) },
    report_parameters: parameters,
    report_seat_results: engineeringSummary.project?.reportCounts?.seatResultsByParameter || {},
    viewing: seatingPublication?.engineering_summary?.viewing || snapshot.viewing,
    report_engineering_summary: engineeringSummary,
    report_source_version: 1,
  };

  // ── The machine-readable evidence snapshot ──
  // Assembled from the SAME frozen capture the human report is saved with, at
  // the same moment and from the same authority: the RP22 parameter verdicts,
  // the version's own product specification, its room, screen and viewing
  // geometry. It is invisible to the designer, and is never built from prose,
  // from a rendered PDF, or from the project as it stands later.
  captured.reportEvidence = buildReportEvidence({
    reportType,
    captured,
    sourceFingerprint,
    // The RP22 authority's own statement of each parameter, taken before the
    // visible rows overwrote the headlines. Parity compares the two, so a report
    // can never show a figure its own authority did not state.
    authorityHeadlines,
    borderThicknessM: project?.border_thickness_m ?? null,
  });
  return captured;
}