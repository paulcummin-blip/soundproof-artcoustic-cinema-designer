import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briefScreenContingency } from '../base44/shared/proposalWriter/writerClausePrecision.js';
import { buildDealerFailureMessage, isRecoveryAvailable, FAILURE_TYPE } from '../base44/shared/systemHealth/incidentMessages.js';

const clause = 'a different screen size would involve a minor adjustment to the system design, rather than a different system concept.';
const objective = { instruction: 'The system will need just a minimal edit should a different size screen be needed.', section: 'what_stays_same', subjects: ['display_options'] };
const input = { section_structure: { proposal_mode: 'single' }, editorial_brief: { material_objectives: [objective] } };

test('an explicitly recorded screen contingency is design intent', () => {
  assert.equal(briefScreenContingency(clause, input, 'what_stays_same'), true);
});
for (const [label, override, section] of [
  ['missing brief', { ...input, editorial_brief: null }, 'what_stays_same'],
  ['unrelated brief', { ...input, editorial_brief: { material_objectives: [{ ...objective, instruction: 'The screen suits the room.' }] } }, 'what_stays_same'],
  ['negated contingency', { ...input, editorial_brief: { material_objectives: [{ ...objective, instruction: 'The system will not need a minimal edit should a different size screen be needed.' }] } }, 'what_stays_same'],
  ['comparison', { ...input, section_structure: { proposal_mode: 'comparison' } }, 'what_stays_same'],
  ['wrong section', input, 'dynamic_range'],
]) test(label + ' never acquires contingent-design authority', () => {
  assert.equal(briefScreenContingency(clause, override, section), false);
});
for (const text of [
  'The design has a different screen size.',
  'A different screen size will improve the bass.',
  clause + ' It will deliver 130 dBC.',
  clause.replace('minor adjustment', '15 dB improvement'),
  clause.replace('would involve', 'has required'),
  clause.replace('system design', 'SUB4-12 system design'),
]) test('contingency cannot carry another claim: ' + text, () => {
  assert.equal(briefScreenContingency(text, input, 'what_stays_same'), false);
});

// Execute the actual request handler, substituting only its external dependencies.
// No SDK connection, persistent records or notifications are created by these tests.
const source = readFileSync(new URL('../base44/functions/generateProposal/entry.ts', import.meta.url), 'utf8');
function handlerFor({ recordingFails = false, authFails = false } = {}) {
  const captured = { incidents: [], failures: [], starts: [] };
  const original = new Error('Controlled version-read failure');
  const client = {
    auth: { me: async () => { if (authFails) throw original; return { role: 'admin' }; } },
    entities: {
      Proposal: { filter: async () => [] },
      Project: { filter: async () => [{ id: 'project', account_id: 'account' }] },
      ProjectVersion: { filter: async () => { throw original; } },
    },
  };
  const dependencies = {
    createClientFromRequest: () => client,
    normaliseNarrativeSteer: () => ({ excluded_topics: [] }),
    startOperation: async (_client, details) => captured.starts.push(details),
    OPERATION_TYPE: { PROPOSAL_GENERATION: 'proposal_generation' },
    recordProposalGenerationIncident: async (_client, details) => {
      captured.incidents.push(details);
      if (recordingFails) throw new Error('Controlled monitoring failure');
      return { reference: 'INC-test', recorded: true };
    },
    failOperation: async (_client, details) => captured.failures.push(details),
    buildDealerFailureMessage, isRecoveryAvailable, FAILURE_TYPE,
    console: { error() {} },
  };
  const executable = source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace('export default async function(req)', 'const handler = async function(req)');
  const handler = new Function(...Object.keys(dependencies), executable + '\nreturn handler;')(...Object.values(dependencies));
  return { handler, captured, original };
}
function request() {
  return new Request('https://example.invalid/generateProposal', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://preview-sandbox.example.invalid' },
    body: JSON.stringify({ request_id: 'request-test', project_id: 'project', account_id: 'account', selected_version_ids: ['version'], proposal_type: 'single' }),
  });
}
test('unexpected failure returns a recoverable response and terminates its operation', async () => {
  const { handler, captured, original } = handlerFor();
  const response = await handler(request());
  const result = await response.json();
  assert.equal(response.status, 500);
  assert.equal(result.cleanup_succeeded, true);
  assert.equal(result.recovery_available, true);
  assert.equal(result.incident_recorded, true);
  assert.doesNotMatch(result.error, /user-exception|ReferenceError/);
  assert.equal(captured.starts[0].version_id, 'version');
  assert.equal(captured.failures[0].operation_id, 'request-test');
  const incident = captured.incidents[0];
  assert.equal(incident.operation_id, 'request-test');
  assert.equal(incident.project_id, 'project');
  assert.equal(incident.account_id, 'account');
  assert.equal(incident.version_id, 'version');
  assert.equal(incident.runtime_environment, 'preview');
  assert.equal(incident.error_detail, original.message);
  assert.equal(incident.component_stack, original.stack);
});
test('monitoring failure cannot mask the original generation failure', async () => {
  const { handler, captured } = handlerFor({ recordingFails: true });
  const response = await handler(request());
  const result = await response.json();
  assert.equal(response.status, 500);
  assert.equal(result.incident_recorded, false);
  assert.equal(result.recovery_available, true);
  assert.equal(captured.failures[0].operation_id, 'request-test');
});
test('failure before parsing the request has no out-of-scope identifier', async () => {
  const { handler, captured } = handlerFor({ authFails: true });
  const response = await handler(request());
  assert.equal(response.status, 500);
  assert.equal(captured.failures[0].operation_id, null);
});
