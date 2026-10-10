import { cloneEvidence, stableEvidence, pinnedParameter, pinnedP19, frozenRspCurveReference, frozenDisplayType, checkPinnedReportEvidenceParity } from './pinnedReportEvidenceParity.js';
import { evidenceFingerprint } from './reportEvidenceFingerprint.js';
import { selectStrengthStoriesFromReportEvidence, buildStrengthSourcesFromReportEvidence } from './strengthEvidenceContext.js';
import { collectEligibleEvidence, classifySpecTier, tierFloor } from './strengthImportance.js';
import { buildCandidates, admitStrengthStories, rankStrengthStories } from './strengthStories.js';
import { resolveSavedReportCell } from './proposalReadinessAuthority.js';

export function evidenceDiff(before, after, path='') {
  if (stableEvidence(before) === stableEvidence(after)) return [];
  if (before && after && typeof before==='object' && typeof after==='object' && Array.isArray(before)===Array.isArray(after)) {
    return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key => evidenceDiff(before[key],after[key],Array.isArray(after)?`${path}[${key}]`:(path?`${path}.${key}`:key)));
  }
  return [{path,current:before===undefined?'[absent]':before,proposed:after===undefined?'[absent]':after}];
}

/** Merge only proven fields. This function has no persistence or live-state inputs. */
export function buildHistoricalEvidenceCandidate(snapshot, publication) {
  const evidence=cloneEvidence(snapshot.payload.reportEvidence);
  if (snapshot.source_fingerprints.engineeringFingerprint !== publication.engineering_fingerprint) throw new Error('Publication pin mismatch');
  const summary=publication.engineering_summary;
  const project=publication.report_snapshot.report_project;
  evidence.screen.display_type=frozenDisplayType(publication);
  const expectedP5=pinnedParameter(publication,5);
  if (evidence.parameter_index.P5.scope==='room') {
    const corrected=evidence.parameter_index.P5;
    for (const field of ['scope','value','raw_value','unit','level','limiting_group','context','source_row','seat_id','row','column','priority']) {
      if (expectedP5[field] !== undefined) corrected[field]=cloneEvidence(expectedP5[field]);
    }
    corrected.authority_value=corrected.value;
    corrected.authority_level=corrected.level;
    corrected.text=`${corrected.level} · ${corrected.value}`;
    evidence.parameters[evidence.parameters.findIndex(r=>r.key==='P5')]=cloneEvidence(corrected);
  }
  for (let id=1;id<=21;id++) {
    const state=summary.parameterAuthority[`p${id}`]?.state;
    if (!state) throw new Error(`Missing pinned terminal state P${id}`);
    for (const row of [evidence.parameter_index[`P${id}`],evidence.parameters.find(r=>r.key===`P${id}`)]) {
      row.state=state;
      for (const seat of row.supporting_per_seat || []) seat.state=summary.parameterAuthority[`p${id}`].seats?.[seat.seat_id ?? seat.seatId]?.state ?? state;
    }
  }
  Object.assign(evidence.bass.p19.rsp,pinnedP19(publication));
  evidence.bass.rsp_curve_ref=cloneEvidence(frozenRspCurveReference(publication).value);
  evidence.bass.current=true;
  evidence.seating.rsp_bass={...(evidence.seating.rsp_bass || {}),scope:'RSP',p19:cloneEvidence(evidence.bass.p19.rsp),
    curve_ref:cloneEvidence(evidence.bass.rsp_curve_ref),rsp_identity:cloneEvidence(evidence.seating.rsp),
    bass_fingerprint:publication.provenance.bass_fingerprint,current:true};
  evidence.evidence_fingerprint=evidenceFingerprint(evidence);
  return evidence;
}

const storySignature = story => ({id:story.id,order:story.order,level:story.level,scope:story.scope,
  evidence_ids:story.sources,evidence_lines:(story.evidence || []).map(line=>({id:line.key,level:line.level}))});

export function validateHistoricalEvidenceCandidate(snapshot, publication, expectedOrder) {
  const inputBefore=stableEvidence({snapshot,publication});
  const candidate=buildHistoricalEvidenceCandidate(snapshot,publication);
  const parity=checkPinnedReportEvidenceParity({evidence:candidate,publication,snapshot});
  candidate.proposal_ready=parity.passed;
  candidate.evidence_fingerprint=evidenceFingerprint(candidate);
  const candidateSnapshot={...snapshot,payload:{...snapshot.payload,reportEvidence:candidate,evidence_parity:{proposal_ready:parity.passed}}};
  const readiness=resolveSavedReportCell({saved:candidateSnapshot,currentFingerprints:snapshot.source_fingerprints});
  const selection=selectStrengthStoriesFromReportEvidence(candidate);
  // Independent publication input, not the candidate's converted parameter state.
  const sources=buildStrengthSourcesFromReportEvidence(snapshot.payload.reportEvidence);
  sources.engineeringSummary={...publication.engineering_summary,parameter_index:publication.parameter_index};
  sources.seatingPositions=publication.report_snapshot.seatingPositions;
  sources.displayType=frozenDisplayType(publication);
  sources.dolbyConfig=publication.report_snapshot.report_project.dolby_config;
  const eligible=collectEligibleEvidence(sources.engineeringSummary);
  const floor=tierFloor(classifySpecTier(eligible.distribution));
  const {candidates}=buildCandidates(sources,{byKey:eligible.byKey,floor,connections:sources.connections});
  const admission=admitStrengthStories(candidates,{floor});
  const published=rankStrengthStories(admission.admitted,7);
  const strengthParity=stableEvidence(selection.ranked.map(storySignature))===stableEvidence(published.map(storySignature));
  const diagnostics = value => JSON.stringify(value,(key,v)=>key==='state'?undefined:v);
  const original=snapshot.payload.reportEvidence;
  const p20Preserved=diagnostics({row:original.parameter_index.P20,parallel:original.parameters.find(r=>r.key==='P20'),bass:original.bass.p20})===diagnostics({row:candidate.parameter_index.P20,parallel:candidate.parameters.find(r=>r.key==='P20'),bass:candidate.bass.p20});
  const diff=evidenceDiff(original,candidate).map(row=>({...row,frozen_source:sourceFor(row.path,publication)}));
  const expectedOrderMatch=stableEvidence(selection.selected)===stableEvidence(expectedOrder);
  const inputsUnchanged=inputBefore===stableEvidence({snapshot,publication});
  const fingerprintValid=candidate.evidence_fingerprint===evidenceFingerprint(candidate);
  const unrelatedChanges=diff.filter(row=>!(/^(screen\.display_type|evidence_fingerprint|bass\.(current|rsp_curve_ref)|bass\.p19\.rsp\.(raw_value|display_value|level|state)|seating\.rsp_bass(?:\.|$))/.test(row.path)
    || /^(parameter_index\.P\d+|parameters\[\d+\])(?:\.supporting_per_seat\[\d+\])?\.state$/.test(row.path)
    || /^(parameter_index\.P5|parameters\[4\])\./.test(row.path)));
  return {snapshot_id:snapshot.id,generated_at:snapshot.generated_at,engineering_fingerprint:publication.engineering_fingerprint,
    parity,proposal_ready:readiness.current,strength_parity:strengthParity,strength_order:selection.selected,
    publication_strength_order:published.map(s=>s.id),expected_order_match:expectedOrderMatch,
    p19:selection.byKey.p19,p20_diagnostics_preserved:p20Preserved,inputs_unchanged:inputsUnchanged,
    evidence_fingerprint:candidate.evidence_fingerprint,fingerprint_valid:fingerprintValid,
    unrelated_changes:unrelatedChanges,diff,
    passed:parity.passed&&readiness.current&&strengthParity&&expectedOrderMatch&&selection.byKey.p19?.eligible===false&&p20Preserved&&inputsUnchanged&&fingerprintValid&&!unrelatedChanges.length};
}

function sourceFor(path,publication) {
  const id=/parameter_index\.P(\d+)/.exec(path)?.[1] || (/^parameters\[(\d+)\]/.exec(path)?Number(/^parameters\[(\d+)\]/.exec(path)[1])+1:null);
  if (id && /\.state$/.test(path)) return `publication.engineering_summary.parameterAuthority.p${id}${path.includes('supporting_per_seat')?'.seats[seat_id].state':'.state'}`;
  if (Number(id)===5) return 'publication.parameter_index.P5.supporting_per_seat[seat-r2-c1]';
  if (/curve_ref/.test(path)) return frozenRspCurveReference(publication).path;
  if (path==='screen.display_type') return 'publication.report_snapshot.report_project.report_screen / frozen TV identity';
  if (path==='evidence_fingerprint') return 'Canonical shared evidenceFingerprint(candidate)';
  if (/rsp_identity/.test(path)) return 'publication.report_snapshot.report_project.rsp_mode/manual_rsp_x_m/manual_rsp_y_m';
  if (/bass_fingerprint/.test(path)) return 'publication.provenance.bass_fingerprint';
  if (/state/.test(path)) return 'publication.engineering_summary.parameterAuthority.p19.state';
  return 'publication.parameter_index.P19 + publication.provenance.bass_fingerprint (pinned result currentness)';
}