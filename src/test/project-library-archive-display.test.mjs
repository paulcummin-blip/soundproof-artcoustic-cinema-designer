// project-library-archive-display.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's archive display.
//
//   A  The archive groups what it holds by kind: Project Reports, then Proposals,
//      and a kind holding nothing is left out entirely
//   B  Nothing archived means nothing rendered — there is no empty heading — and
//      the heading states how many documents are inside
//   C  Collapsed by default, toggled by the heading or its chevron, with a short
//      transition, and remembered while the designer moves around the Library
//   D  Current files stay on the page: the report row and the version's current
//      documents are untouched, and nothing has moved into the archive but the
//      documents the design has actually moved past
//   E  A proposal states its latest issued PDF on the page and folds only its
//      older ones
//
// Presentation only: no record, report, proposal or issued document is classified
// differently, written, or hidden from the current files by this change.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIBRARY_ARCHIVE_GROUP,
  groupArchivedDocuments,
} from '../components/library/librarySourceStatus.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const ARCHIVE = read('src/components/library/LibraryArchiveSection.jsx');
const EXPANSION = read('src/components/library/useLibraryArchiveExpansion.js');
const REPORTS = read('src/components/library/ProjectLibraryReportsSection.jsx');
const PROPOSALS = read('src/components/library/ProjectLibraryProposalsSection.jsx');

/* ── A — grouping ─────────────────────────────────────────────────────────── */

test('A — archived documents group by kind, and a kind holding nothing is left out', () => {
  const entries = [
    { record: { id: 'a', document_type: 'project' } },
    { record: { id: 'b', document_type: 'proposal' } },
    { record: { id: 'c', document_type: 'speaker_design' } },
  ];
  const groups = groupArchivedDocuments(entries);
  assert.deepEqual(groups.map((group) => group.key), [
    LIBRARY_ARCHIVE_GROUP.REPORTS,
    LIBRARY_ARCHIVE_GROUP.PROPOSALS,
  ]);
  assert.deepEqual(groups.map((group) => group.label), ['Project Reports', 'Proposals']);
  assert.deepEqual(groups[0].entries.map((entry) => entry.record.id), ['a', 'c']);
  assert.deepEqual(groups[1].entries.map((entry) => entry.record.id), ['b']);

  // One kind alone states no sub-heading, and nothing at all states no groups.
  assert.deepEqual(
    groupArchivedDocuments([{ record: { id: 'x', document_type: 'project' } }]).map((group) => group.key),
    [LIBRARY_ARCHIVE_GROUP.REPORTS],
  );
  assert.deepEqual(groupArchivedDocuments([]), []);
  assert.deepEqual(groupArchivedDocuments(null), []);
});

/* ── B — the empty state ──────────────────────────────────────────────────── */

test('B — nothing archived renders nothing, and the heading states the count', () => {
  assert.match(
    ARCHIVE,
    /if \(count === 0 \|\| typeof renderEntry !== 'function'\) return null;/,
    'an archive holding nothing is not rendered at all',
  );
  assert.match(ARCHIVE, /\{ARCHIVE_SECTION_LABEL\} \(\{count\}\)/, 'the heading states how many documents are inside');
  assert.match(ARCHIVE, /aria-expanded=\{expanded\}/, 'the heading states whether the archive is open');
});

/* ── C — collapsed by default, remembered ─────────────────────────────────── */

test('C — the archive is collapsed by default, toggles, and remembers being opened', () => {
  assert.match(EXPANSION, /preference = false;/, 'collapsed is the default state');
  assert.match(EXPANSION, /sessionStorage\.setItem/, 'the state is remembered for the session');
  assert.match(ARCHIVE, /library-archive__panel\$\{expanded \? ' is-expanded' : ''\}/);
  assert.match(ARCHIVE, /transition: grid-template-rows 220ms ease;/, 'the transition is short and quiet');
  assert.match(ARCHIVE, /onClick=\{toggle\}/, 'the heading toggles it');
  assert.match(ARCHIVE, /rotate-180/, 'the chevron states the state it is in');
});

/* ── D — the current files are untouched ──────────────────────────────────── */

test('D — current files stay visible and only the archived documents are folded away', () => {
  assert.match(REPORTS, /<LiveReportRow/, 'the version’s current report row is still listed');
  assert.match(REPORTS, /variant="current"/, 'the version’s other current files are still listed');
  assert.match(REPORTS, /variant="archived"/, 'the archived rows keep their own treatment');
  assert.match(REPORTS, /groups=\{groupArchivedDocuments\(archivedFiles\)\}/, 'the archive holds exactly the files judged archived');
  assert.match(REPORTS, /const archivedFiles = judged\.filter\(\(entry\) => !isCurrent\(entry\)\);/);
  // The always-visible archive heading is replaced by the collapsible one.
  assert.doesNotMatch(REPORTS, /ARCHIVED_PDFS_HEADING|ARCHIVED_PDFS_EMPTY/);
});

/* ── E — proposals ────────────────────────────────────────────────────────── */

test('E — a proposal states its latest issued PDF on the page and folds only its older ones', () => {
  assert.match(PROPOSALS, /const currentRows = group\.rows\.filter\(\(entry\) => !entry\.superseded\);/);
  assert.match(PROPOSALS, /const archivedRows = group\.rows\.filter\(\(entry\) => entry\.superseded\);/);
  assert.match(PROPOSALS, /groups=\{groupArchivedDocuments\(archivedRows\)\}/);
  assert.match(PROPOSALS, /\{currentRows\.map\(renderRow\)\}/, 'the current PDFs stay on the page');
});