import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/RP22ClientReport.jsx', import.meta.url), 'utf8');
const start = page.indexOf('  const incompleteAssessmentKeys =');
const end = page.indexOf("\n  // The design version this report belongs to.", start);
assert.ok(start >= 0 && end > start);
function readiness({ hydrating = false, resolved = true, gate = 'complete', missing = [] } = {}) {
  const context = vm.createContext({
    hydrating, savedReport: { resolved },
    derivedReadiness: { state: hydrating || !resolved ? 'preparing' : 'ready', canExport: !hydrating && resolved },
    REPORT_STATE: { NOT_READY: 'not_ready' },
    authority: {
      publicationGate: { status: gate },
      reportCompleteness: { missingParameterKeys: missing, incompleteSeatParameterKeys: [] },
    },
  });
  vm.runInContext(page.slice(start, end) + '\nthis.result = readinessBase;', context);
  return context.result;
}
const allMissing = Array.from({ length: 21 }, (_, i) => 'p' + (i + 1));
test('cold evidence read does not tell the designer to complete P1–P21', () => {
  const r = readiness({ hydrating: true, gate: 'assessment_missing', missing: allMissing });
  assert.equal(r.state, 'preparing');
  assert.equal(r.canExport, false);
});
test('unresolved snapshot identity remains preparing', () => {
  assert.equal(readiness({ resolved: false, missing: allMissing }).state, 'preparing');
});
test('missing historical publication is stale, not 21 missing calculations', () => {
  const r = readiness({ gate: 'stale_pointer', missing: allMissing });
  assert.equal(r.state, 'not_ready');
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].key, 'engineering_publication');
  assert.equal(r.canExport, false);
});
test('genuinely missing P11 still blocks creation and names P11', () => {
  const r = readiness({ gate: 'assessment_incomplete', missing: ['p11'] });
  assert.equal(r.state, 'not_ready');
  assert.equal(r.missing[1].key, 'p11');
  assert.equal(r.canExport, false);
});
test('genuinely unavailable assessment still fails closed', () => {
  assert.equal(readiness({ gate: 'assessment_missing', missing: allMissing }).canExport, false);
});
test('complete published assessment retains normal readiness', () => {
  assert.equal(readiness().state, 'ready');
});
