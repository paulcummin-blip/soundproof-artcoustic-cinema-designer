import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MAX_PROPOSAL_DELETIONS,
  PROPOSAL_DELETION_REFUSAL,
  PROPOSAL_DELETION_REASON,
  PROPOSAL_ISSUED_DOCUMENT_TYPES,
  isIssuedStatus,
  issuedDocumentCounts,
  partitionProposalDeletions,
  proposalDeletionDecision,
} from '../base44/shared/proposalDeletion/proposalDeletionAuthority.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const FIXTURE_ACCOUNT = 'acct-fixture-1';
const OTHER_ACCOUNT = 'acct-fixture-2';

const proposal = (over = {}) => ({
  id: 'prop-fixture-1',
  account_id: FIXTURE_ACCOUNT,
  project_id: 'proj-fixture-1',
  title: 'Test proposal',
  status: 'draft',
  ...over,
});

test('an unissued proposal is deletable, and generated is not issued', () => {
  for (const status of ['draft', 'generated', 'edited', 'archived']) {
    const decision = proposalDeletionDecision({ proposal: proposal({ status }), issuedDocumentCount: 0 });
    assert.equal(decision.deletable, true, `expected ${status} to be deletable`);
    assert.equal(decision.refusal, null);
  }

  // Only a proposal being written right now is held back.
  const writing = proposalDeletionDecision({ proposal: proposal({ status: 'generating' }) });
  assert.equal(writing.deletable, false);
  assert.equal(writing.refusal, PROPOSAL_DELETION_REFUSAL.GENERATING);
});

test('issued proposals are protected from routine bulk deletion', () => {
  // Primary evidence: an issued document was exported from this proposal.
  const withDocument = proposalDeletionDecision({
    proposal: proposal({ status: 'generated' }),
    issuedDocumentCount: 1,
  });
  assert.equal(withDocument.deletable, false);
  assert.equal(withDocument.refusal, PROPOSAL_DELETION_REFUSAL.ISSUED_DOCUMENT);

  // Second evidence: the lifecycle status itself, including the legacy alias.
  for (const status of ['issued', 'accepted', 'sent']) {
    assert.equal(isIssuedStatus(status), true);
    const decision = proposalDeletionDecision({ proposal: proposal({ status }) });
    assert.equal(decision.deletable, false, `expected ${status} to be protected`);
    assert.equal(decision.refusal, PROPOSAL_DELETION_REFUSAL.ISSUED_STATUS);
  }

  // A protected proposal is reported with a reason the designer can read, and is
  // never archived as a side effect — protecting only ever means "kept".
  assert.ok(withDocument.reason && withDocument.reason.length > 10);
  assert.doesNotMatch(JSON.stringify(withDocument), /archiv/i);
});

test('authority is enforced per proposal, not per request', () => {
  const own = proposal({ id: 'prop-own', account_id: FIXTURE_ACCOUNT });
  const foreign = proposal({ id: 'prop-foreign', account_id: OTHER_ACCOUNT });

  const { deletable, refused } = partitionProposalDeletions({
    candidates: [
      { proposal: own, issuedDocumentCount: 0 },
      { proposal: foreign, issuedDocumentCount: 0 },
    ],
    canManageFor: (p) => p.account_id === FIXTURE_ACCOUNT,
  });

  assert.deepEqual(deletable.map((entry) => entry.id), ['prop-own']);
  assert.deepEqual(refused.map((entry) => entry.id), ['prop-foreign']);
  assert.equal(refused[0].refusal, PROPOSAL_DELETION_REFUSAL.FORBIDDEN);
});

test('a master admin may delete across accounts and a missing proposal is refused', () => {
  const { deletable } = partitionProposalDeletions({
    candidates: [{ proposal: proposal({ account_id: OTHER_ACCOUNT }), issuedDocumentCount: 0 }],
    canManageFor: () => true,
  });
  assert.equal(deletable.length, 1);

  const missing = proposalDeletionDecision({ proposal: null });
  assert.equal(missing.deletable, false);
  assert.equal(missing.refusal, PROPOSAL_DELETION_REFUSAL.NOT_FOUND);
});

test('issued documents are counted from issued-export records only', () => {
  assert.ok(PROPOSAL_ISSUED_DOCUMENT_TYPES.includes('proposal'));
  assert.ok(PROPOSAL_ISSUED_DOCUMENT_TYPES.includes('comparison'));
  assert.ok(PROPOSAL_ISSUED_DOCUMENT_TYPES.includes('system_design_summary'));

  const counts = issuedDocumentCounts([
    { source_record_id: 'prop-fixture-1', document_type: 'proposal' },
    { source_record_id: 'prop-fixture-1', document_type: 'system_design_summary' },
    // A report export records its own report snapshot, never a proposal.
    { source_record_id: 'prop-fixture-1', document_type: 'project' },
    { source_record_id: 'prop-other', document_type: 'proposal' },
  ], ['prop-fixture-1']);

  assert.equal(counts.get('prop-fixture-1'), 2);
  assert.equal(counts.has('prop-other'), false);
  assert.equal(issuedDocumentCounts([], ['prop-fixture-1']).size, 0);
});

test('the deletion function enforces authority, order and honest reporting', () => {
  const fn = read('base44/functions/deleteProposals/entry.ts');

  // Authority resolved from the session, capability checked, every id validated.
  assert.match(fn, /resolveAccountAccess\(base44, user\)/);
  assert.match(fn, /access\.capabilities\?\.soundProof !== true/);
  assert.match(fn, /access\.isMasterAdmin === true/);
  assert.match(fn, /proposal\.account_id === callerAccountId/);
  assert.match(fn, /MAX_PROPOSAL_DELETIONS/);

  // The proposal's own records go first, each verified empty, the proposal last.
  const sectionRemoval = fn.indexOf('ProposalSection.deleteMany');
  const generationRemoval = fn.indexOf('ProposalGeneration.deleteMany');
  const editRemoval = fn.indexOf('ProposalEdit.deleteMany');
  const proposalRemoval = fn.indexOf('entities.Proposal.delete(proposalId)');
  assert.ok(sectionRemoval > 0 && generationRemoval > sectionRemoval);
  assert.ok(editRemoval > generationRemoval);
  assert.ok(proposalRemoval > editRemoval, 'the proposal is removed only after its records');
  assert.match(fn, /PROPOSAL_DELETION_REASON\.RELATED_RECORDS_REMAINING/);
  assert.match(fn, /PROPOSAL_DELETION_REASON\.DELETE_UNCONFIRMED/);

  // A dry run checks everything and changes nothing.
  assert.match(fn, /if \(dryRun\) \{/);
  assert.ok(fn.indexOf('if (dryRun) {') < fn.indexOf('entities.Proposal.delete(proposalId)'));

  // Per-proposal isolation, and failures reported rather than swallowed.
  assert.match(fn, /for \(const entry of deletable\)/);
  assert.match(fn, /not_deleted: notDeleted/);
  assert.match(fn, /deleted_ids: deleted\.map/);

  // Nothing outside the proposal's own records is touched.
  for (const forbidden of [
    'entities.Project.delete',
    'entities.ProjectVersion.delete',
    'entities.ReportSnapshot.delete',
    'entities.ProjectAssetExport.delete',
    'entities.ProposalAsset.delete',
    'entities.ProposalAnalysisCache.delete',
  ]) {
    assert.equal(fn.includes(forbidden), false, `${forbidden} must never be called`);
  }
  assert.ok(fn.indexOf('ProjectAssetExport.filter') > 0, 'issued documents are read as evidence');
});

test('the library offers selection, confirmation and immediate removal', () => {
  const tab = read('src/components/proposal/library/ProposalLibraryTab.jsx');
  const card = read('src/components/proposal/ProposalCard.jsx');
  const group = read('src/components/proposal/library/ProposalLibraryGroup.jsx');
  const bar = read('src/components/proposal/library/ProposalSelectionBar.jsx');
  const dialog = read('src/components/proposal/library/ProposalBulkDeleteDialog.jsx');
  const hook = read('src/components/proposal/library/useBulkProposalDeletion.js');
  const library = read('src/components/proposal/library/useProposalLibrary.js');

  // A checkbox on every card, and the actions the selection needs.
  assert.match(card, /<Checkbox/);
  assert.match(group, /onToggleSelect/);
  assert.match(bar, /Select All/);
  assert.match(bar, /Cancel Selection/);
  assert.match(bar, /Delete Selected/);

  // One confirmation, in the agreed words, naming what is kept.
  assert.match(dialog, /Delete \$\{count\} \$\{noun\}\?/);
  assert.match(dialog, /These proposals and their associated generation history will be permanently deleted\./);
  assert.match(dialog, /Your projects, designs and Project Reports will not be affected\./);
  assert.match(dialog, /Issued proposals are kept/);
  assert.match(dialog, /Delete \$\{count\} \$\{count === 1 \? 'Proposal' : 'Proposals'\}/);
  assert.match(dialog, /\{error && \(/);
  assert.match(dialog, /Not deleted \(\{outcome\.notDeleted\.length\}\)/);

  // Select All is scoped to what is displayed, and a hidden proposal leaves it.
  assert.match(tab, /visibleProposalIds/);
  assert.match(hook, /setSelectedIds\(new Set\(visibleProposalIds\)\)/);
  assert.match(hook, /visible\.has\(id\)/);

  // Selection never reaches an invisible proposal: the tab passes only the
  // proposals its current filter and view are showing.
  const visibleBlock = tab.slice(tab.indexOf('const visibleGroups'), tab.indexOf('const counts'));
  assert.match(visibleBlock, /view === 'archived'/);

  // The server decides protection, the dry run is asked first, and the list is
  // updated in place afterwards.
  assert.match(hook, /base44\.functions\.invoke\('deleteProposals'/);
  assert.match(hook, /dry_run: true/);
  assert.match(hook, /dry_run: false/);
  assert.ok(hook.indexOf('dry_run: true') < hook.indexOf('dry_run: false'));
  assert.match(hook, /onDeleted\(deletedIds\)/);
  assert.match(hook, /notDeleted\.length === 0/);
  assert.match(library, /removeProposals/);
  assert.match(tab, /library\.removeProposals/);
});

test('the bulk deletion is bounded', () => {
  assert.equal(MAX_PROPOSAL_DELETIONS, 50);
  const fn = read('base44/functions/deleteProposals/entry.ts');
  assert.match(fn, /requestedIds\.length > MAX_PROPOSAL_DELETIONS/);
  assert.match(fn, /new Set\(/);
  assert.equal(PROPOSAL_DELETION_REASON.RELATED_RECORDS_REMAINING, 'related_records_remaining');
});