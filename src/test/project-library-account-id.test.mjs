/**
 * project-library-account-id.test.mjs
 * -----------------------------------
 * The focused check for the confirmed storage rejection:
 *
 *   ProjectAssetExport.create → HTTP 422
 *   "Error in field account_id: Input should be a valid string"
 *   account_id supplied: null
 *
 * What must hold, for BOTH documents the one shared path stores — the Project
 * Report and the Current Speaker Design:
 *
 *   A. An admin-owned project (no owning account) still stores its document.
 *   B. A dealer-owned project stores it under that dealer's own account.
 *   C. The record carries the right project, version, type and file.
 *   D. Retrying a failed record step reuses the PDF that is already uploaded.
 *   E. The failure notice is compact, with the diagnostic behind its disclosure.
 *
 * Plus the permission model: dealer isolation is unchanged.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildIssuedDocumentRow,
  normaliseAccountId,
} from '../components/library/issuedDocument/issuedDocumentRowPayload.js';
import { resolveIssuedDocumentAccountId } from '../components/library/issuedDocument/issuedDocumentOwnership.js';
import { buildStorageNotice, STORAGE_NOTICE_CLASS } from '../components/library/issuedDocument/exportStorageFailure.js';
import {
  holdPendingExport,
  peekPendingExport,
  clearPendingExport,
} from '../components/library/issuedDocument/pendingIssuedExportStore.js';

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');
const SCHEMA = JSON.parse(read('base44/entities/ProjectAssetExport.jsonc'));
const STORAGE_PATH = read('src/components/library/issuedDocument/recordIssuedExport.js');

/** The export identity the shared path resolves, as both documents supply it. */
const issuedIdentity = (accountId) => ({
  projectId: 'project-jooced',
  versionId: 'version-1',
  selectedVersionIds: ['version-1'],
  documentType: 'speaker_design',
  title: 'Current Speaker Design',
  accountId,
  exportedBy: 'designer@example.com',
  sourceFingerprints: { engineeringFingerprint: 'eng-1' },
  sourceStatusAtExport: 'current',
});

/* ── A/B/C — the record itself ─────────────────────────────────────────────── */

test('A. an admin-owned project stores its document without an account id', () => {
  const row = buildIssuedDocumentRow({
    issued: issuedIdentity(null),
    filename: 'Sound Proof - Jooced - Speaker Design.pdf',
    pageCount: 1,
    fileUri: 'private/issued/jooced-speaker-design.pdf',
  });

  // Omitted, not null: storage rejects null as "not a valid string".
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'account_id'), false,
    'account_id is omitted rather than sent as null');
  assert.equal(row.project_id, 'project-jooced');
  assert.equal(row.version_id, 'version-1');
  assert.deepEqual(row.selected_version_ids, ['version-1']);
  assert.equal(row.document_type, 'speaker_design');
  assert.equal(row.filename, 'Sound Proof - Jooced - Speaker Design.pdf');
  assert.equal(row.file_uri, 'private/issued/jooced-speaker-design.pdf');
  assert.equal(row.page_count, 1);
  assert.ok(Date.parse(row.exported_at) > 0, 'the export is timestamped');
});

test('B. a dealer-owned project stores it under that dealer’s own account', () => {
  const row = buildIssuedDocumentRow({
    issued: issuedIdentity('dealer-account-7'),
    filename: 'Project Report.pdf',
    fileUri: 'private/issued/report.pdf',
  });
  assert.equal(row.account_id, 'dealer-account-7', 'the project’s own account is stamped');
});

test('C. no account id is invented from empty, whitespace or a non-string', () => {
  for (const value of ['', '   ', undefined, null, NaN]) {
    assert.equal(normaliseAccountId(value), null, `${String(value)} states no account`);
    const row = buildIssuedDocumentRow({
      issued: issuedIdentity(value),
      filename: 'Project Report.pdf',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'account_id'), false);
  }
});

test('C. the record is the same shape for both issued documents', () => {
  for (const documentType of ['project', 'speaker_design']) {
    const row = buildIssuedDocumentRow({
      issued: { ...issuedIdentity('dealer-account-7'), documentType },
      filename: 'Document.pdf',
      fileUri: 'private/issued/document.pdf',
    });
    assert.equal(row.document_type, documentType);
    assert.equal(row.account_id, 'dealer-account-7');
  }
});

/* ── the schema and the permission model ───────────────────────────────────── */

test('A. the schema no longer requires account_id, and permits it to be absent', () => {
  assert.deepEqual(SCHEMA.required, ['project_id', 'document_type', 'filename', 'exported_at'],
    'account_id is no longer a required field');
  assert.equal(SCHEMA.properties.account_id.nullable, true,
    'a legacy record carrying null is still readable');
  assert.equal(SCHEMA.properties.account_id.type, 'string');
});

test('B. dealer isolation is unchanged by the schema fix', () => {
  const create = JSON.stringify(SCHEMA.rls.create);
  // The dealer branch still demands a non-empty account that matches the caller.
  assert.match(create, /data\.account_id/, 'the record must state an account id for a dealer create');
  assert.match(create, /\$nin/, 'null and empty are still excluded from the dealer branch');
  assert.match(create, /SOUND_PROOF_ONLY/, 'account access levels are untouched');
  // The admin branch is what lets an admin-owned project store its document.
  assert.match(create, /"role":"admin"/, 'the admin branch is present');
  const readRule = JSON.stringify(SCHEMA.rls.read);
  assert.match(readRule, /\$nin/, 'a record with no account id stays invisible to dealers');
});

/* ── ownership resolution ──────────────────────────────────────────────────── */

test('the owning account comes from the project, and is never substituted', async () => {
  let reads = 0;
  const readProject = async () => { reads += 1; return { id: 'project-jooced', account_id: 'dealer-account-3' }; };

  // The export already states the account: nothing else is consulted.
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: 'dealer-account-3', readProject,
  }), 'dealer-account-3');
  assert.equal(reads, 0, 'a stated account needs no project read');

  // Nothing stated: the project's own ownership is read.
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: null, readProject,
  }), 'dealer-account-3');
  assert.equal(reads, 1);
});

test('an admin-owned project resolves to no account, and never fabricates one', async () => {
  const noAccount = async () => ({ id: 'project-jooced', account_id: null });
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: null, readProject: noAccount,
  }), null);

  // Whitespace and blank account values state nothing at all.
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: '   ', readProject: noAccount,
  }), null);

  // A project that cannot be read states no account — the export is still stored.
  const failing = async () => { throw new Error('unreadable'); };
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: null, readProject: failing,
  }), null);
  assert.equal(await resolveIssuedDocumentAccountId({ projectId: null, accountId: null }), null,
    'no project means no account to state');
  // Without a project read there is nothing to consult: the rule states none
  // rather than reaching the network on its own.
  assert.equal(await resolveIssuedDocumentAccountId({
    projectId: 'project-jooced', accountId: null,
  }), null);
});

test('the shared path reads ownership from the project, through the one reader', () => {
  assert.match(STORAGE_PATH, /readProject: readProjectOwnership/,
    'the shared path consults the project ownership authority');
  const ownershipRead = read('src/components/library/issuedDocument/projectOwnershipRead.js');
  assert.match(ownershipRead, /entities\.Project\.filter\(/, 'the account is read from the project record');
  assert.match(ownershipRead, /fields: \['account_id'\]/, 'one field is read');
});

/* ── D — retry reuses the uploaded PDF ─────────────────────────────────────── */

test('D. the uploaded file path is held with the attempt for the retry', () => {
  const key = holdPendingExport({
    identity: { projectId: 'jooced', documentType: 'speaker_design' },
    filename: 'Speaker Design.pdf',
  });
  const held = peekPendingExport(key);
  assert.ok(held, 'the attempt is held');

  // The shared path holds the uploaded path as soon as the upload returns.
  assert.match(STORAGE_PATH, /updatePendingExport\(pendingKey, \{ fileUri: stored\.file_uri \}\)/,
    'the uploaded file path is held with the attempt');
  assert.match(STORAGE_PATH, /const fileUri = entry\.fileUri\s*\|\|/,
    'a retry reuses that file instead of uploading a second copy');

  clearPendingExport(key);
});

test('D. one insert path stores both the Project Report and the Speaker Design', () => {
  assert.match(STORAGE_PATH, /ProjectAssetExport\.create\(buildIssuedDocumentRow\(/, 'one insert, one payload authority');
  assert.equal((STORAGE_PATH.match(/ProjectAssetExport\.create\(/g) || []).length, 1,
    'there is exactly one ProjectAssetExport.create in the shared path');
  for (const file of [
    'src/components/report/speakerDesign/speakerDesignIssuedDocument.js',
    'src/components/report/client/useClientReportPdfExport.js',
  ]) {
    assert.match(read(file), /recordIssuedExportInBackground/, `${file} uses the shared path`);
  }
});

/* ── E — the notice is compact ─────────────────────────────────────────────── */

test('E. the failure notice is compact, with the diagnostic behind its disclosure', () => {
  const notice = buildStorageNotice({
    title: 'Project Report saved, but Speaker Design PDF could not be created.',
    reason: 'The Project Library record was rejected as invalid by storage.',
    duration: 60000,
  });

  assert.equal(notice.variant, 'destructive');
  assert.equal(notice.className, STORAGE_NOTICE_CLASS);
  assert.match(notice.className, /p-3/, 'compact padding');
  assert.doesNotMatch(notice.className, /p-6/, 'not the oversized default surface');
  assert.match(notice.className, /text-sm/);
  assert.equal(notice.duration, 60000, 'a failure the designer can act on stays on screen');
  assert.equal(notice.diagnostic, undefined, 'the notice body carries no diagnostic');

  // The diagnostic reaches the reader through the actions' own disclosure only.
  const actions = read('src/components/library/issuedDocument/ExportStorageFailureActions.jsx');
  assert.match(actions, /<StorageFailureTechnicalDetail diagnostic=\{diagnostic\}/);
  const detail = read('src/components/library/issuedDocument/StorageFailureTechnicalDetail.jsx');
  assert.match(detail, /useState\(defaultOpen\)/, 'the technical detail opens collapsed unless asked');
});