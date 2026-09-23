import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getRestoreStatus } from '../src/components/proposal/proposalLifecycle.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('proposal creation is idempotent and creates the canonical ten sections once', () => {
  const entity = read('base44/entities/Proposal.jsonc');
  const wizard = read('src/components/proposal/CreateProposalWizard.jsx');
  const generate = read('base44/functions/generateProposal/entry.ts');
  const sectionBlock = generate.slice(generate.indexOf('const SECTIONS = ['), generate.indexOf('const GOAL_LABELS'));

  assert.match(entity, /"creation_request_id"/);
  assert.match(wizard, /generationInFlightRef/);
  assert.match(wizard, /const requestId = creationRequestIdRef\.current \|\| createRequestId\(\)/);
  assert.match(wizard, /request_id:\s*requestId/);
  assert.equal((sectionBlock.match(/\{ type:/g) || []).length, 10);
  assert.ok(generate.indexOf('creation_request_id: request_id') < generate.indexOf('ProposalSection.bulkCreate'));
  assert.match(generate, /existing\[0\]\.status === 'generated' && existingSections\.length === SECTIONS\.length/);
});

test('failed generation cannot be presented as complete', () => {
  const generate = read('base44/functions/generateProposal/entry.ts');
  const failureGate = generate.indexOf('if (failedSections.length > 0)');
  const generatedTransition = generate.indexOf("status: 'generated'", failureGate);
  assert.ok(failureGate >= 0);
  assert.ok(generatedTransition > failureGate);
  assert.match(generate, /rollbackCreatedProposal/);
  assert.match(generate, /ProposalSection\.delete/);
  assert.match(generate, /Proposal\.delete/);
  assert.match(generate, /Proposal\.update\(proposalId, \{ status: 'draft' \}\)/);
});

test('duplication is server-owned, independent, lineage-aware, and resets lifecycle state', () => {
  const duplicate = read('base44/functions/duplicateProposal/entry.ts');
  const createStart = duplicate.indexOf('duplicate = await base44.entities.Proposal.create');
  const sectionStart = duplicate.indexOf('const sectionCopies', createStart);
  const createBlock = duplicate.slice(createStart, sectionStart);

  assert.match(createBlock, /status: 'draft'/);
  assert.match(createBlock, /parent_proposal_id: source\.id/);
  assert.match(createBlock, /creation_request_id: request_id/);
  assert.equal(createBlock.includes('previous_status'), false);
  assert.equal(createBlock.includes('proposal_date'), false);
  assert.match(duplicate, /locked: false/);
  assert.match(duplicate, /sanitiseSectionMetadata/);
  assert.match(duplicate, /TRANSIENT_METADATA_KEY/);
  assert.match(duplicate, /bulkCreate\(sectionCopies\)/);
  assert.match(duplicate, /rollbackDuplicate/);
});

test('history mutations use targeted state updates and canonical lifecycle filtering', () => {
  const history = read('src/components/proposal/ProposalHistoryTab.jsx');

  assert.match(history, /functions\.invoke\('duplicateProposal'/);
  assert.equal(history.includes('entities.Proposal.create'), false);
  assert.match(history, /setProposals\(\(previous\) => \[/);
  assert.match(history, /setSectionCounts\(\(previous\)/);
  assert.match(history, /previous\.map\(\(item\) =>/);
  assert.match(history, /proposals\.filter\(\(p\) => !isArchived\(p\.status\)\)/);
  assert.match(history, /proposals\.filter\(\(p\) => isArchived\(p\.status\)\)/);
});

test('restore fallback respects stored state and treats content-only legacy archives as edited', () => {
  assert.equal(getRestoreStatus('archived', null, true), 'edited');
  assert.equal(getRestoreStatus('archived', null, false), 'draft');
  assert.equal(getRestoreStatus('archived', 'generated', true), 'generated');
  assert.equal(getRestoreStatus('archived', 'reviewed', true), 'edited');
  assert.equal(getRestoreStatus('generated', null, true), null);
});
