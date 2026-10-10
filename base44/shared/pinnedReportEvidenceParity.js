import { validateReportEvidence } from './reportEvidenceCompleteness.js';
export const cloneEvidence = value => value == null ? value : JSON.parse(JSON.stringify(value));
export const stableEvidence = value => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const rank = level => level === 'FAIL' ? 0 : Number(String(level).replace('L', '')) || 0;
export function frozenDisplayType(publication) {
  const project=publication.report_snapshot.report_project;
  const screen=project.report_screen;
  return screen?.manualSize?.displayType || screen?.display_type || (project.tv_preset_key || screen?.tvPresetKey ? 'tv' : 'projector_screen');
}

/** Only references actually recorded in this immutable publication count. */
export function frozenRspCurveReference(publication) {
  const refs = [];
  const walk = (node, path = '') => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const next = `${path}.${key}`;
      if (value != null && (key === 'rsp_curve_ref' || (key === 'curve_ref' && /p19|rsp/i.test(path)))) refs.push({path: next, value});
      else if (typeof value === 'object') walk(value, next);
    }
  };
  walk(publication, 'publication');
  if (new Set(refs.map(ref => stableEvidence(ref.value))).size > 1) throw new Error('Conflicting RSP references in pinned publication');
  return refs[0] || {path: 'publication (no RSP curve reference recorded)', value: null};
}

export function pinnedParameter(publication, id) {
  const saved = publication.parameter_index?.[`P${id}`];
  if (!saved) throw new Error(`Pinned publication lacks P${id}`);
  if (id !== 5) return saved;
  const seat = [...(saved.supporting_per_seat || [])].sort((a,b) => rank(a.level) - rank(b.level))[0];
  if (!seat) throw new Error('Pinned publication lacks P5 seat authority');
  return {...seat, scope:'project', supporting_per_seat:saved.supporting_per_seat, scopes:saved.scopes};
}

export function pinnedP19(publication) {
  const row = pinnedParameter(publication,19);
  if (row.raw_value == null || !Number.isFinite(Number(row.raw_value)) || !row.value || !row.level
    || !publication.engineering_summary.parameterAuthority.p19.state
    || row.authority_fingerprint !== publication.provenance.bass_fingerprint)
    throw new Error('Pinned P19 result or calculation authority is incomplete');
  return {raw_value:row.raw_value, display_value:row.value, level:row.level,
    state:publication.engineering_summary.parameterAuthority.p19.state};
}

/** Optional curve provenance: null is valid only when the pinned source is null. */
export function compareOptionalCurveReference(actual, expected) {
  return stableEvidence(actual ?? null) === stableEvidence(expected ?? null);
}

/** All engineering values are independently read from the pinned publication.
 * Baseline comparisons protect the remaining historical evidence, not its grades.
 */
export function checkPinnedReportEvidenceParity({evidence, publication, snapshot}) {
  const mismatches = [];
  const compare = (path, actual, expected) => {
    if (stableEvidence(actual ?? null) !== stableEvidence(expected ?? null)) mismatches.push({key:path,evidence:actual ?? null,report:expected ?? null,blocking:true});
  };
  const original = snapshot.payload.reportEvidence;
  const fp = snapshot.source_fingerprints.engineeringFingerprint;
  compare('publication.engineering_fingerprint',publication.engineering_fingerprint,fp);
  compare('identity',evidence.identity,original.identity);
  compare('identity.source_fingerprint',evidence.identity.source_fingerprint,fp);
  compare('identity.bass_fingerprint',evidence.identity.bass_fingerprint,publication.provenance.bass_fingerprint);
  for (const key of ['room','system','seat_scopes','report_facts']) compare(key,evidence[key],original[key]);
  const project = publication.report_snapshot.report_project;
  const display = frozenDisplayType(publication);
  compare('screen.display_type',evidence.screen.display_type,display);
  compare('screen.other_fields',{...evidence.screen,display_type:undefined},{...original.screen,display_type:undefined});
  compare('seating.other_fields',{...evidence.seating,rsp_bass:undefined},{...original.seating,rsp_bass:undefined});
  for (let id=1;id<=21;id++) {
    const key=`P${id}`, expected=pinnedParameter(publication,id);
    const state=publication.engineering_summary.parameterAuthority[`p${id}`]?.state;
    for (const [location,row] of [[`parameter_index.${key}`,evidence.parameter_index[key]],[`parameters[${id-1}]`,evidence.parameters.find(r=>r.key===key)]]) {
      for (const field of ['scope','value','raw_value','level','authority_fingerprint','source_type']) compare(`${location}.${field}`,row?.[field],expected[field]);
      compare(`${location}.state`,row?.state,state);
      compare(`${location}.authority_value`,row?.authority_value,expected.value);
      compare(`${location}.authority_level`,row?.authority_level,expected.level);
      compare(`${location}.authority_timestamp`,row?.authority_timestamp,original.parameter_index[key].authority_timestamp);
      for (const seat of row?.supporting_per_seat || []) {
        const seatId=seat.seat_id ?? seat.seatId;
        const source=expected.supporting_per_seat?.find(s=>(s.seat_id ?? s.seatId)===seatId);
        if (!source) { compare(`${location}.${seatId}.source`,seat,null); continue; }
        for (const f of ['scope','value','raw_value','level','authority_fingerprint','authority_timestamp','source_type','source_row']) compare(`${location}.${seatId}.${f}`,seat[f],source[f]);
        compare(`${location}.${seatId}.state`,seat.state,publication.engineering_summary.parameterAuthority[`p${id}`].seats?.[seatId]?.state ?? state);
      }
    }
  }
  const p19=pinnedP19(publication), curve=frozenRspCurveReference(publication);
  for (const [key,value] of Object.entries(p19)) compare(`bass.p19.rsp.${key}`,evidence.bass.p19.rsp[key],value);
  compare('bass.p19.scoped_metadata',{...evidence.bass.p19,rsp:undefined},{...original.bass.p19,rsp:undefined});
  compare('bass.p19.rsp.other_fields',{...evidence.bass.p19.rsp,...Object.fromEntries(Object.keys(p19).map(k=>[k,undefined]))},{...original.bass.p19.rsp,...Object.fromEntries(Object.keys(p19).map(k=>[k,undefined]))});
  compare('bass.current',evidence.bass.current,true);
  compare('bass.rsp_curve_ref',evidence.bass.rsp_curve_ref,curve.value);
  compare('seating.rsp_bass.scope',evidence.seating.rsp_bass?.scope,'RSP');
  compare('seating.rsp_bass.p19',evidence.seating.rsp_bass?.p19,evidence.bass.p19.rsp);
  compare('seating.rsp_bass.curve_ref',evidence.seating.rsp_bass?.curve_ref,curve.value);
  compare('seating.rsp_bass.bass_fingerprint',evidence.seating.rsp_bass?.bass_fingerprint,publication.provenance.bass_fingerprint);
  compare('seating.rsp_bass.current',evidence.seating.rsp_bass?.current,true);
  compare('seating.rsp_bass.rsp_identity',evidence.seating.rsp_bass?.rsp_identity,evidence.seating.rsp);
  compare('seating.rsp.mode',evidence.seating.rsp.mode,project.rsp_mode);
  for (const [a,b] of [['x_m','manual_rsp_x_m'],['y_m','manual_rsp_y_m']]) {
    if (project[b] != null) compare(`seating.rsp.${a}`,evidence.seating.rsp[a],Math.round(project[b]*100)/100);
  }
  for (const key of ['p14','p18','p20','primary_seat_curve_refs']) compare(`bass.${key}`,evidence.bass[key],original.bass[key]);
  const validation=validateReportEvidence(evidence,snapshot.report_type,{requireProposalReady:false,
    projectId:snapshot.project_id,versionId:snapshot.version_id,sourceFingerprint:fp,snapshotFingerprint:fp});
  const passed=validation.complete && !mismatches.length;
  return {passed,proposal_ready:passed,mismatch_count:mismatches.length+validation.missing.length,mismatches,missing:validation.missing,curve};
}