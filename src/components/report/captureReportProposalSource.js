import { buildEngineeringSnapshot } from '@/components/proposal/engineeringAuthority/buildEngineeringSnapshot';
import { buildProductsSelected } from '@/components/report/reportProductsSelected';
import { readReportParameter } from '@/components/report/reportParameterEvidence';

// Called only by a generated report's save action, never by proposal generation.
export default function captureReportProposalSource({ projectId, versionId, project, engineeringSummary, app, presentation }) {
  if (!engineeringSummary || !projectId || !versionId || !project) return null;
  const speakers = presentation?.placedSpeakers || app?.speakerSystem?.placedSpeakers || [];
  const seats = presentation?.seatingPositions || app?.seatingPositions || [];
  const design = { ...project, selected_speakers: speakers };
  const snapshot = buildEngineeringSnapshot({
    projectId, versionId, project, mergedProject: design,
    version: { id: versionId, version_name: project.version_name },
    engineeringSummary, seats, placedSpeakers: speakers,
    priceCalculation: presentation?.priceData,
  });
  const products = buildProductsSelected({
    placedSpeakers: speakers,
    frontSubsCfg: app?.frontSubsCfg || project.front_subs_cfg,
    rearSubsCfg: app?.rearSubsCfg || project.rear_subs_cfg,
    acousticTreatmentEnabled: app?.acousticTreatmentEnabled ?? project.acoustic_treatment_enabled,
    selectedAbfuserQty: app?.selectedAbfuserQty ?? project.selected_abfuser_qty,
    isVisible: app?.getSpeakerVisibility,
  });
  const ids = Object.keys(engineeringSummary.parameterSummaries?.project || {})
    .filter((key) => /^p\d+$/.test(key)).map((key) => Number(key.slice(1)));
  const parameters = ids.map((id) => readReportParameter(engineeringSummary, id));
  return {
    ...snapshot,
    system: { ...snapshot.system, products_selected: products },
    rp22: { ...snapshot.rp22, parameter_headlines: snapshot.rp22.parameter_headlines.map((row) => {
      const stated = parameters.find((entry) => entry.parameter_id === row.parameter_id);
      return { ...row, achieved_level: stated?.level, formatted_value: stated?.value };
    }) },
    report_parameters: parameters,
    report_seat_results: engineeringSummary.project?.reportCounts?.seatResultsByParameter || {},
    report_engineering_summary: engineeringSummary,
    report_source_version: 1,
  };
}