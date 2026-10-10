import frozenReportRead from '@/components/report/frozenReportRead';
import frozenReportBass from '@/components/report/frozenReportBass';
import { frozenReportAppState } from '@/components/report/frozenReportAppState';
import captureReportProposalSource from '@/components/report/captureReportProposalSource';
import { checkReportEvidenceParity } from '@/components/report/reportEvidenceParity';
import { resolveSnapshotStatus } from '@/components/report/reportSnapshotAuthority';

const clone = x => JSON.parse(JSON.stringify(x));
/** Pure unit regression: no entity writes, navigation, provider calls or calculations. */
export default function frozenIntegrityRegression({ saved, publication, caches }) {
  const checks = [];
  const assert = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
  const A = clone(publication), B = clone(publication);
  B.engineering_fingerprint = 'eng:fixture:B';
  B.provenance.bass_fingerprint = 'cal:fixture:B';
  B.report_snapshot.report_project.report_screen.manualSize.diagonalInches = 120;
  B.report_snapshot.report_project.roomDims = JSON.stringify({ widthM: 9, lengthM: 10, heightM: 3 });
  B.report_snapshot.report_project.selected_speakers = [];
  B.report_snapshot.report_project.seating_positions = [];
  B.engineering_summary.viewing = { changed: true };
  const read = frozenReportRead(saved, B.engineering_fingerprint);
  assert('saved publication A selected', read.fingerprint === A.engineering_fingerprint);
  assert('Update Needed', read.updateNeeded && resolveSnapshotStatus({ saved,
    currentFingerprints: { engineeringFingerprint: B.engineering_fingerprint } }).status === 'stale');
  const picked = read.fingerprint === A.engineering_fingerprint ? A : B;
  const app = frozenReportAppState({ screen: B.report_snapshot.report_project.report_screen }, picked);
  const baseline = frozenReportAppState({}, A);
  assert('visible display remains 115 inch TV', app.screen.manualSize.diagonalInches === 115 && app.screen.manualSize.displayType === 'tv');
  for (const [name, key] of [['products', 'speakerSystem'], ['room', 'roomDims'], ['seating', 'seatingPositions'], ['drawings', 'roomElements']])
    assert(name + ' unchanged', JSON.stringify(app[key]) === JSON.stringify(baseline[key]));
  assert('RP23 unchanged', JSON.stringify(picked.engineering_summary.viewing) === JSON.stringify(A.engineering_summary.viewing));
  assert('P1-P21 unchanged', JSON.stringify(picked.parameter_index) === JSON.stringify(A.parameter_index));
  assert('bass graphs pinned to A', frozenReportBass(caches, picked).currentFingerprint === A.provenance.bass_fingerprint);
  assert('Create Updated Report selects B', frozenReportRead(saved, B.engineering_fingerprint, true).fingerprint === B.engineering_fingerprint);
  assert('new report display is 120 inch TV', frozenReportAppState({}, B).screen.manualSize.diagonalInches === 120);
  const summary = { ...A.engineering_summary, parameter_index: A.parameter_index,
    reportAuthority: { source_type: 'durable-engineering-publication', authority_fingerprint: A.engineering_fingerprint, authority_timestamp: A.published_at } };
  // A LATER version design (products, subwoofers, treatment) must not reach a saved report's evidence.
  const later = clone(B.report_snapshot.report_project);
  later.subwooferInstances = (later.subwooferInstances || []).map(s => ({ ...s, model: 'SUB-CHANGED' }));
  later.front_subs_cfg = { ...(later.front_subs_cfg || {}), count: 99 };
  later.acoustic_treatment_enabled = false;
  later.selected_abfuser_qty = 0;
  const captureArgs = version => ({ projectId: saved.project_id, versionId: saved.version_id,
    project: A.report_snapshot.report_project, version, seatingPublication: A, engineeringSummary: summary,
    reportType: 'project', sourceFingerprint: saved.source_fingerprints });
  const frozenOnly = captureReportProposalSource(captureArgs(null));
  const captured = captureReportProposalSource(captureArgs({ design_state: later }));
  assert('capture cannot import newer display', captured.reportEvidence.screen.display_label === '115" TV');
  const abfuser = e => (e.system.products_selected || []).filter(p => /abfuser/i.test(String(p.model)));
  assert('capture freezes products', JSON.stringify(captured.system.products_selected) === JSON.stringify(frozenOnly.system.products_selected));
  assert('capture freezes seating', JSON.stringify(captured.reportEvidence.seating.per_seat) === JSON.stringify(frozenOnly.reportEvidence.seating.per_seat));
  assert('capture freezes treatment', JSON.stringify(abfuser(captured.reportEvidence)) === JSON.stringify(abfuser(frozenOnly.reportEvidence)));
  assert('no later-version fact reaches evidence', !JSON.stringify(captured).includes('SUB-CHANGED'));
  const parity = evidence => checkReportEvidenceParity({ evidence, captured, reportType: 'project' });
  assert('stored repaired evidence parity passes', parity(saved.payload.reportEvidence).passed);
  // Reproduce the repaired categories as a fixture: reverting display_type/display_label
  // must be caught again, so the repaired record is what makes parity zero.
  const reverted = clone(saved.payload.reportEvidence);
  reverted.screen.display_type = 'projector_screen';
  reverted.screen.display_label = '115" Projection screen';
  const beforeCategories = [...new Set(parity(reverted).mismatches.map(m => m.area + ':' + m.key))];
  assert('parity re-detects repaired display categories', beforeCategories.length >= 2);
  const tamper = (name, edit) => { const e = clone(captured.reportEvidence); edit(e); assert(name, !parity(e).passed); };
  tamper('TV/projector contradiction rejected', e => { e.screen.display_type = 'projector_screen'; e.screen.display_label = '115" Projection screen'; });
  tamper('identity mutation rejected', e => { e.identity.client_name = 'Changed'; });
  tamper('dual-centre quantity mutation rejected', e => { e.system.products_selected.find(p => p.structure === 'dual-centre').quantity = 1; });
  tamper('P5 room headline rejected', e => { e.parameter_index.P5.scope = 'room'; });
  tamper('P19 raw result mutation rejected', e => { e.bass.p19.rsp.raw_value = 999; });
  tamper('missing RSP curve reference rejected', e => { e.bass.rsp_curve_ref = null; });
  return { passed: true, count: checks.length, checks };
}