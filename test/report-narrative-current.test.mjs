import test from 'node:test';
import assert from 'node:assert/strict';
import {narrativeIsCurrent} from '../src/components/report/projectReport/reportNarrativeCurrent.js';
const snapshot=()=>({source_fingerprints:{engineeringFingerprint:'eng:current',calculationFingerprint:'bass:current'},payload:{design_intent:{status:'accepted',evidence_fingerprints:{engineeringFingerprint:'eng:current',calculationFingerprint:'bass:current'}}}});
test('accepted summary from old bass evidence cannot make current report ready',()=>{const s=snapshot();s.payload.design_intent.evidence_fingerprints.calculationFingerprint='bass:old';assert.equal(narrativeIsCurrent(s),false);});
test('accepted current summary can be reused without regeneration',()=>assert.equal(narrativeIsCurrent(snapshot()),true));
test('missing or refused summary is not ready',()=>{assert.equal(narrativeIsCurrent(null),false);const s=snapshot();s.payload.design_intent.status='refused';assert.equal(narrativeIsCurrent(s),false);});
