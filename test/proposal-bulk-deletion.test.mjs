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
import {
  MAX_PROPOSALS_PER_DELETION_REQUEST,
  chunkSelection,
  mergeDeletionPlan,
  mergeDeletionResults,
  retainVisibleSelection,
  selectionIds,
  toggleSelection,
} from '../src/components/proposal/library/proposalSelectionAuthority.js';

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

  // A checkbox on every card, keyed by the stable proposal ID — never by the
  // record itself, which is what made a selected card read back as unselected.
  assert.match(card, /<Checkbox/);
  assert.match(card, /checked=\{selected === true\}/);
  assert.match(card, /onToggleSelect\?\.\(proposal\.id\)/);
  assert.match(group, /selectedIds\.has\(proposal\.id\)/);

  // The toolbar is always on screen, and Delete stays visible while disabled.
  assert.match(bar, /\{count\} selected/);
  assert.match(bar, /Select All Visible/);
  assert.match(bar, /Clear Selection/);
  assert.match(bar, /Delete Selected/);
  assert.equal(bar.includes('if (!count) return null'), false, 'the toolbar must never disappear');
  assert.match(bar, /disabled=\{busy \|\| nothingSelected\}/);

  // One confirmation, in the agreed words, naming what is kept.
  assert.match(dialog, /Delete \$\{count\} \$\{noun\}\?/);
  assert.match(dialog, /This will permanently delete the selected proposals and their associated proposal content\. This action cannot be undone\./);
  assert.match(dialog, /Your projects, designs and Project Reports will not be affected\./);
  assert.match(dialog, /Issued proposals are kept/);
  assert.match(dialog, /Delete \$\{count\} \$\{count === 1 \? 'Proposal' : 'Proposals'\}/);
  assert.match(dialog, /\{error && \(/);
  assert.match(dialog, /Not deleted \(\{outcome\.notDeleted\.length\}\)/);
  assert.match(dialog, /outcome\.deleted\.length === 1 \? 'proposal' : 'proposals'\} deleted/);

  // Select All is scoped to what is displayed, and a hidden proposal leaves it.
  assert.match(tab, /visibleProposalIds/);
  assert.match(hook, /selectionIds\(visibleProposalIds\)/);
  assert.match(hook, /retainVisibleSelection/);

  // The selection is one set of stable IDs, whatever shape a caller passes.
  assert.match(hook, /toggleSelection\(previous, proposalOrId\)/);
  // Any number may be selected: the bound is on one request, not on selection.
  assert.match(hook, /chunkSelection\(proposalIds, MAX_PROPOSALS_PER_DELETION_REQUEST\)/);

  // The server decides protection, the dry run is asked first, the real outcome
  // is always reported, and the list is updated in place afterwards.
  assert.match(hook, /base44\.functions\.invoke\('deleteProposals'/);
  assert.match(hook, /dry_run: dryRun/);
  assert.ok(hook.indexOf('runDeletionBatches(proposalIds, true)')
    < hook.indexOf('runDeletionBatches(proposalIds, false)'), 'the dry run is asked first');
  assert.match(hook, /onDeleted\(deletedIds\)/);
  assert.match(hook, /setOutcome\(\{ deleted, notDeleted \}\)/);
  assert.match(library, /removeProposals/);
  assert.match(tab, /library\.removeProposals/);
});

test('a selection is keyed by stable proposal IDs, whatever the checkbox hands over', () => {
  const record = proposal({ id: 'prop-a' });

  // The same proposal, handed over as a record and as an id, selects once.
  let selection = toggleSelection(new Set(), record);
  assert.deepEqual([...selection], ['prop-a']);
  selection = toggleSelection(selection, 'prop-a');
  assert.equal(selection.size, 0, 'a second click deselects');

  selection = toggleSelection(new Set(), record);
  selection = toggleSelection(selection, proposal({ id: 'prop-b' }));
  assert.deepEqual([...selection], ['prop-a', 'prop-b']);
  assert.equal(selection.has(record.id), true, 'the card reads its own id back');

  // Nothing usable in, nothing selected.
  assert.equal(toggleSelection(new Set(), null).size, 0);
  assert.equal(toggleSelection(new Set(), { title: 'no id' }).size, 0);
});

test('selection survives re-renders and is only scoped to what is on screen', () => {
  const ids = ['prop-1', 'prop-2', 'prop-3'];
  const selected = new Set(ids);

  // A re-render passes the same visible set: the very same selection returns.
  assert.equal(retainVisibleSelection(selected, ids), selected);
  // A proposal that leaves the list leaves the selection, and the others stay.
  assert.deepEqual([...retainVisibleSelection(selected, ['prop-1', 'prop-3'])], ['prop-1', 'prop-3']);
  assert.equal(selectionIds([]).length, 0);
});

test('any number of eligible proposals can be selected and issued', () => {
  const many = Array.from({ length: 120 }, (_, index) => `prop-${index + 1}`);
  const batches = chunkSelection(many, MAX_PROPOSALS_PER_DELETION_REQUEST);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 50);
  assert.equal(batches[2].length, 20);
  assert.deepEqual(batches.flat(), many);
  assert.equal(MAX_PROPOSALS_PER_DELETION_REQUEST, MAX_PROPOSAL_DELETIONS, "the request bound is the function's own");

  // Select All Visible is every visible ID, with no cap.
  assert.equal(selectionIds(many).length, 120);
  // A repeated ID never double-counts.
  assert.equal(chunkSelection(['prop-1', 'prop-1', 'prop-2']).flat().length, 2);
});

test('the confirmation count comes from the server plan, not from the selection', () => {
  const plan = mergeDeletionPlan([
    { deletable: [{ id: 'prop-1', title: 'A' }], refused: [{ id: 'prop-2', title: 'B', reason: 'issued' }] },
    { deletable: [{ id: 'prop-3', title: 'C' }], refused: [] },
  ]);
  assert.deepEqual(plan.deletable.map((entry) => entry.id), ['prop-1', 'prop-3']);
  assert.deepEqual(plan.refused.map((entry) => entry.id), ['prop-2']);

  const outcome = mergeDeletionResults([
    { deleted: [{ id: 'prop-1', title: 'A' }], not_deleted: [{ id: 'prop-3', title: 'C' }] },
    { deleted: [{ id: 'prop-3', title: 'C' }], not_deleted: [] },
  ]);
  assert.deepEqual(selectionIds(outcome.deleted), ['prop-1', 'prop-3']);
  assert.deepEqual(selectionIds(outcome.notDeleted), ['prop-3'], 'what was not deleted stays named');
});

test('no fixture proposal is deleted to prove the selection rules', () => {
  // Every case above is decided in memory. The one destructive path is the
  // backend function, and it is only ever named here.
  const hook = read('src/components/proposal/library/useBulkProposalDeletion.js');
  assert.equal(hook.includes('entities.Proposal.delete'), false);
  assert.equal(hook.includes('deleteMany'), false);
  assert.match(hook, /base44\.functions\.invoke\('deleteProposals'/);
});

test('the bulk deletion is bounded', () => {
  assert.equal(MAX_PROPOSAL_DELETIONS, 50);
  const fn = read('base44/functions/deleteProposals/entry.ts');
  assert.match(fn, /requestedIds\.length > MAX_PROPOSAL_DELETIONS/);
  assert.match(fn, /new Set\(/);
  assert.equal(PROPOSAL_DELETION_REASON.RELATED_RECORDS_REMAINING, 'related_records_remaining');
});