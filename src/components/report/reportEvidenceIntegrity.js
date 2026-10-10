import { buildReportEvidence } from './reportEvidenceAuthority';
import { readReportParameter } from './reportParameterEvidence';

const stable = value => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

/** Independent frozen capture versus stored evidence, including absent fields. */
export default function reportEvidenceIntegrity(evidence, captured, reportType) {
  if (!captured) return [{ area: 'authority', key: 'frozen_capture', blocking: true }];
  const expected = buildReportEvidence({ captured, reportType,
    sourceFingerprint: { engineeringFingerprint: captured.identity?.engineeringFingerprint },
    borderThicknessM: null });
  const mismatches = [];
  const compare = (area, key, actual, wanted) => {
    if (stable(actual ?? null) !== stable(wanted ?? null)) mismatches.push({ area, key, evidence: actual ?? null, report: wanted ?? null, blocking: true });
  };
  for (const key of ['display_type', 'display_label', 'viewable_diagonal_in', 'viewable_width_cm', 'viewable_height_cm', 'screen_type'])
    compare('display', key, evidence?.screen?.[key], expected.screen[key]);
  for (const key of ['project_id', 'project_name', 'client_name', 'project_reference', 'version_id', 'version_name'])
    compare('identity', key, evidence?.identity?.[key], expected.identity[key]);
  for (const key of ['products_selected', 'products_selected_by_layer'])
    compare('products', key, evidence?.system?.[key], expected.system[key]);
  const summary = captured.report_engineering_summary;
  for (const row of captured.report_parameters || []) {
    const key = row.key;
    const atomic = summary ? readReportParameter(summary, Number(row.parameter_id)) : row;
    const actual = evidence?.parameter_index?.[key];
    for (const field of ['scope', 'value', 'level', 'raw_value'])
      compare('parameter_authority', `${key}.${field}`, actual?.[field], atomic?.[field]);
    // A seat-scoped parameter cannot be laundered into a room headline.
    if ([1, 4, 5, 6, 9, 10, 16, 17, 20].includes(Number(row.parameter_id)) && actual?.scope === 'room')
      mismatches.push({ area: 'parameter_scope', key, evidence: 'room', report: 'seat-scoped', blocking: true });
  }
  for (const key of ['p19', 'rsp_curve_ref']) compare('bass', key, evidence?.bass?.[key], expected.bass[key]);
  compare('bass', 'rsp_bass', evidence?.seating?.rsp_bass, expected.seating.rsp_bass);
  compare('bass', 'current', evidence?.bass?.current, expected.bass.current);
  return mismatches;
}