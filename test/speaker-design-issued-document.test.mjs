/**
 * Speaker Design issued document — acceptance.
 *
 * A Project Report export carries the version's Current Speaker Design with it:
 *
 *   1. the Project Report's own Library copy is started FIRST
 *   2. the schedule is stored as its own document type, for the SAME version,
 *      from the report's own source identity
 *   3. a schedule failure never breaks the report's copy, names itself, and
 *      offers a retry for the schedule only
 *   4. the panel's download and the Library copy are the same document: one
 *      builder, one filename authority, Position / Model / Qty, no Notes column
 *
 * The schedule never changes a design, a count, a system layout or a report.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ISSUED_DOCUMENT_TYPE,
  ISSUED_DOCUMENT_LABEL,
  ISSUED_DOCUMENT_COMPOSITION,
  ISSUED_DOCUMENT_PAGE_COMPOSER,
  REPORT_DOCUMENT_TYPES,
} from '../src/components/library/issuedDocument/issuedDocumentTypes.js';
import {
  buildSpeakerDesignFilename,
  buildSpeakerDesignMarkup,
} from '../src/components/roomdesigner/speakerDesignPdf.js';
import {
  SPEAKER_DESIGN_CONTENT_HEIGHT_MM,
  packSpeakerDesignSheets,
} from '../src/components/report/speakerDesign/speakerDesignPaging.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const EXPORT_HOOK = read('src/components/report/client/useClientReportPdfExport.js');
const COMPANION = read('src/components/report/speakerDesign/speakerDesignIssuedDocument.js');
const REPORT_PAGE = read('src/pages/RP22ClientReport.jsx');
const PANEL_BUTTON = read('src/components/roomdesigner/SpeakerDesignPdfButton.jsx');
const PDF_MODULE = read('src/components/roomdesigner/speakerDesignPdf.js');
const ROW_SOURCE = read('src/components/report/speakerDesign/speakerDesignRows.js');
const PAGE_COMPOSER_REGISTRY = read('src/components/library/issuedDocument/issuedDocumentPageComposers.js');
const COMPOSITION_CAPTURE = read('src/components/library/compositionCapture.js');

/** One dual-centre schedule, as the panel states it. */
const SCHEDULE_GROUPS = Object.freeze([
  {
    key: 'front_stage',
    title: 'Front stage',
    rows: [
      {
        key: 'FC',
        position: 'Centre',
        // The row builder states ONE model cell — the name alone — and the count
        // lives in Qty, so the panel and the document state the same row.
        model: 'C4-1',
        // QTY is a plain number — the physical loudspeakers at the position.
        quantityLabel: '2',
        note: 'Dual physical centre cabinets, one logical centre channel · cabinets mounted vertically',
      },
      { key: 'FL', position: 'Front left', model: 'SL4-1', quantityLabel: '1', note: 'Behind screen' },
      // A pair that shares one row: QTY is the two speakers the row states.
      { key: 'SL', position: 'Side surrounds', model: 'EVOLVE 2-1', quantityLabel: '2', note: null },
    ],
  },
]);

/* ── 1 — the document type ────────────────────────────────────────────────── */

test('the schedule is its own document type, listed with the reports', () => {
  assert.equal(ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN, 'speaker_design');
  assert.equal(ISSUED_DOCUMENT_LABEL[ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN], 'Speaker Design');
  assert.ok(
    REPORT_DOCUMENT_TYPES.includes(ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN),
    'the schedule is listed in the Library’s Generated Reports tab',
  );

  // It is captured from its own print composition, on the paper it prints on:
  // A4 less the schedule's own 16mm page margin, on both axes, so one frame is
  // one sheet's worth of content.
  const composition = ISSUED_DOCUMENT_COMPOSITION[ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN];
  assert.equal(composition.nodeSelector, '.speaker-design-schedule');
  assert.equal(composition.bodyClass, 'speaker-design-export-mode');
  assert.equal(composition.pageFrame.marginMm, 16, 'the schedule’s own 16mm page margin');
  assert.equal(composition.pageFrame.widthMm, 178);
  assert.equal(composition.pageFrame.heightMm, 265);
  // The composed frames become the pages; before they exist the schedule itself
  // is the single page.
  assert.equal(composition.pageSelector, '.speaker-design-page, .speaker-design-schedule');
  assert.equal(composition.pageComposer, ISSUED_DOCUMENT_PAGE_COMPOSER.SPEAKER_DESIGN);
});

/* ── 2 — the filename ─────────────────────────────────────────────────────── */

test('the filename states the document, the project identity and the version', () => {
  assert.equal(
    buildSpeakerDesignFilename({
      projectName: 'Genesis AV',
      clientName: 'Noble Projects',
      projectReference: 'AC-2026-014',
      versionName: 'Original Design',
    }),
    'Sound Proof - Artcoustic Cinema Designer - Speaker Design - Genesis AV - Noble Projects - AC-2026-014 - Original Design',
  );

  // A missing client or reference is omitted cleanly, never placeholdered.
  assert.equal(
    buildSpeakerDesignFilename({ projectName: 'Genesis AV', versionName: 'Original Design' }),
    'Sound Proof - Artcoustic Cinema Designer - Speaker Design - Genesis AV - Original Design',
  );

  // It is the SAME shared authority the Project Report names itself with.
  assert.match(PDF_MODULE, /buildReportFilename\(/);
  assert.match(read('src/components/report/reportPdfTitle.js'), /PROJECT_REPORT: "Project Report"/);
});

/* ── 3 — the content ──────────────────────────────────────────────────────── */

test('the schedule states Position, Model and Qty only — never a Notes column', () => {
  const markup = buildSpeakerDesignMarkup({
    groups: SCHEDULE_GROUPS,
    projectName: 'Genesis AV',
    clientName: 'Noble Projects',
    versionName: 'Original Design',
    layout: '9.4.6',
    dateLabel: '12 October 2026',
  });

  assert.match(markup, /<th class="pos">Position<\/th><th class="model">Model<\/th><th class="qty">Qty<\/th>/);
  assert.doesNotMatch(markup, />\s*Notes/i, 'no Notes column');

  // The Model cell states the product name alone; the number of speakers belongs
  // to the Qty column. The dual-centre wording stays inside the Model cell.
  assert.match(
    markup,
    /model-name">C4-1<\/span>\s*<span class="model-note">Dual physical centre cabinets, one logical centre channel · cabinets mounted vertically<\/span>/,
  );
  // Every QTY cell is a plain number: the physical loudspeakers at that position —
  // 1 each for separate left and right rows, 2 for a pair that shares one row, 2
  // for two centre loudspeakers. Never a unit, never a wording.
  assert.deepEqual(
    [...markup.matchAll(/<td class="qty">([^<]*)<\/td>/g)].map((match) => match[1]),
    ['2', '1', '2'],
  );
  assert.doesNotMatch(markup, /<td class="qty">[^<]*[A-Za-z]/, 'the QTY column carries a number only');
  // The count is worded nowhere in the one authority both the document and the
  // panel read.
  assert.doesNotMatch(ROW_SOURCE, /quantityLabel:[^\n]*cabinets/);

  // No quantity multiplier ever reaches the Model column, and a number that is
  // part of a product name is passed through untouched.
  assert.doesNotMatch(markup, /model-name">[^<]*×/, 'the Model column carries no multiplier');
  assert.match(markup, /model-name">SL4-1<\/span>/, 'a number inside a product name is not stripped');

  // ONE logical centre channel — never a second one.
  const centreRows = markup.match(/<td class="pos">Centre<\/td>/g) || [];
  assert.equal(centreRows.length, 1, 'one logical centre row');

  // The project identity and the version are stated on the schedule itself.
  assert.match(markup, /Genesis AV/);
  assert.match(markup, /Original Design/);
});

/* ── 4 — the export order and the shared version ──────────────────────────── */

test('the report export stores the report first, then the schedule, from the same version', () => {
  const reportStorage = EXPORT_HOOK.indexOf('recordIssuedExportInBackground({');
  const companionStorage = EXPORT_HOOK.indexOf('storeSpeakerDesignInBackground({');
  assert.ok(reportStorage > -1, 'the report’s own Library copy is still stored');
  assert.ok(companionStorage > -1, 'the schedule is stored too');
  assert.ok(reportStorage < companionStorage, 'the Project Report is saved first');
  assert.ok(
    EXPORT_HOOK.lastIndexOf('snapshotIssuedComposition(issuedDocument.documentType)') < companionStorage,
    'the report’s snapshot is taken before the schedule is built',
  );

  // SAME version: the schedule takes the report's own identity resolver, so it
  // can only ever belong to the version the report was made from.
  assert.match(EXPORT_HOOK, /resolveSource: issuedDocument\.resolveSource \|\| null/);
  assert.match(EXPORT_HOOK, /projectId: issuedDocument\.projectId/);
  assert.match(EXPORT_HOOK, /accountId: issuedDocument\.accountId \|\| null/);

  // It is only attempted when the report has a project and the version holds a
  // speaker design — nothing is claimed to exist when there is nothing to state.
  assert.match(
    EXPORT_HOOK,
    /speakerDesignCompanion\?\.groups\?\.length > 0 && issuedDocument\?\.projectId/,
  );
});

test('the report page builds the schedule from the report’s own frozen design', () => {
  assert.match(REPORT_PAGE, /buildSpeakerDesignRows\(\{/);
  assert.match(REPORT_PAGE, /appState\?\.getSpeakerVisibility/);
  assert.match(REPORT_PAGE, /speakerDesignCompanion,/);
  // The export hook's own export path is unchanged: the report still prints from
  // its mounted composition and its filename authority.
  assert.match(EXPORT_HOOK, /buildProjectReportTitle\(/);
  assert.match(EXPORT_HOOK, /snapshotIssuedComposition\(issuedDocument\.documentType\)/);
});

/* ── 5 — failure isolation ────────────────────────────────────────────────── */

test('a schedule failure never breaks the report copy, and names itself with a retry', () => {
  assert.match(
    COMPANION,
    /Project Report saved, but Speaker Design PDF could not be created\./,
  );
  assert.match(COMPANION, /storageFailureTitle: SPEAKER_DESIGN_STORAGE_FAILURE_TITLE/);
  assert.match(
    COMPANION,
    /retryExport: \(\) => storeSpeakerDesignInBackground\(parameters\)/,
    'the retry re-runs the schedule alone, from the same version',
  );
  assert.match(
    read('src/components/library/issuedDocument/recordIssuedExport.js'),
    /issued\.storageFailureTitle \|\| STORAGE_FAILURE_MESSAGE/,
    'the storage notice honours a companion document’s own wording',
  );
  // Nothing in the schedule path writes a report, a snapshot or evidence.
  assert.doesNotMatch(COMPANION, /ReportSnapshot|ReportGeneration|ProposalSection/);
});

/* ── 6 — the panel and the Library copy are one document ──────────────────── */

test('the panel download and the Library copy are the same document', () => {
  // One node builder and one filename authority, used by both paths.
  assert.match(COMPANION, /buildSpeakerDesignNode\(\{/);
  assert.match(COMPANION, /buildSpeakerDesignFilename\(\{/);
  assert.match(PANEL_BUTTON, /exportSpeakerDesignPdf\(\{/);
  assert.match(PDF_MODULE, /export function buildSpeakerDesignNode/);
  assert.match(PDF_MODULE, /export async function exportSpeakerDesignPdf/);
  // The panel keeps its own download button.
  assert.match(PANEL_BUTTON, /Download Speaker Design PDF/);
});

/* ── 7 — the page frame, the closing note and continuation pages ───────────── */

/** The Genesis AV schedule as it measures on A4 — about 247mm in a 265mm frame. */
const GENESIS_SCHEDULE = Object.freeze({
  leading: [{ key: 'opening', heightMm: 22 }, { key: 'facts', heightMm: 45 }],
  groups: [
    { key: 'group-0', headHeightMm: 8, rowHeightsMm: [12, 12, 16] },
    { key: 'group-1', headHeightMm: 8, rowHeightsMm: [12, 12, 12] },
    { key: 'group-2', headHeightMm: 8, rowHeightsMm: [12, 12, 12] },
    { key: 'group-3', headHeightMm: 8, rowHeightsMm: [12, 12] },
  ],
  closing: { key: 'closing', heightMm: 12 },
});

/** What each sheet actually carries, recomputed from the measured blocks. */
function sheetHeights(packed, metrics) {
  const closingHeight = metrics.closing?.heightMm || 0;
  return packed.sheets.map((sheet) => {
    let height = sheet.leading.reduce(
      (total, key) => total + (metrics.leading.find((block) => block.key === key)?.heightMm || 0),
      0,
    );
    sheet.groups.forEach((portion) => {
      const group = metrics.groups.find((candidate) => candidate.key === portion.key);
      height += group?.headHeightMm || 0;
      portion.rows.forEach((rowIndex) => { height += group?.rowHeightsMm[rowIndex] || 0; });
    });
    if (sheet.closing) height += closingHeight;
    return height;
  });
}

test('a schedule that fits the frame is one sheet, and the closing note is on it', () => {
  // The composer packs at the frame height less its own 1mm clearance.
  const packed = packSpeakerDesignSheets({ ...GENESIS_SCHEDULE, contentHeightMm: 264 });

  assert.equal(packed.sheetCount, 1, 'no unnecessary second page');
  assert.equal(packed.fits, true);
  assert.equal(packed.sheets[0].closing, true, 'the closing note stays on the sheet with its content');
  assert.deepEqual(packed.sheets[0].leading, ['opening', 'facts']);
  assert.deepEqual(packed.sheets[0].groups.map((portion) => portion.rows.length), [3, 3, 3, 2], 'every row is placed');
  assert.ok(sheetHeights(packed, GENESIS_SCHEDULE)[0] <= SPEAKER_DESIGN_CONTENT_HEIGHT_MM, 'inside the frame');
});

test('a longer schedule continues onto further sheets, inside the frame, nothing dropped', () => {
  const metrics = {
    ...GENESIS_SCHEDULE,
    groups: [
      ...GENESIS_SCHEDULE.groups,
      { key: 'group-4', headHeightMm: 8, rowHeightsMm: Array(20).fill(12) },
    ],
  };
  const packed = packSpeakerDesignSheets(metrics);
  const heights = sheetHeights(packed, metrics);

  assert.ok(packed.sheetCount > 1, 'a longer schedule needs further pages');
  assert.equal(packed.fits, false);
  assert.equal(
    packed.sheets.flatMap((sheet) => sheet.groups.flatMap((portion) => portion.rows)).length,
    3 + 3 + 3 + 2 + 20,
    'no row is dropped or clipped',
  );
  assert.equal(packed.sheets[packed.sheets.length - 1].closing, true, 'the closing note is whole, on the last sheet');
  packed.sheets.forEach((sheet, index) => {
    sheet.groups.forEach((portion) => assert.ok(portion.rows.length > 0, 'a heading never opens a sheet with no rows'));
    assert.ok(
      heights[index] <= SPEAKER_DESIGN_CONTENT_HEIGHT_MM,
      `sheet ${index + 1} stays inside the frame, so the bottom margin is kept`,
    );
  });
});

test('one group longer than a sheet continues, with its heading repeated', () => {
  const metrics = { leading: [], groups: [{ key: 'group-0', headHeightMm: 8, rowHeightsMm: Array(30).fill(12) }], closing: null };
  const packed = packSpeakerDesignSheets(metrics);

  assert.equal(packed.sheetCount, 2);
  assert.deepEqual(packed.sheets.map((sheet) => sheet.groups[0].rows.length), [21, 9], 'rows split between sheets, never inside a row');
  assert.deepEqual(packed.sheets.map((sheet) => sheet.groups[0].key), ['group-0', 'group-0'], 'the heading is repeated on the continuation');
});

test('the schedule’s own stylesheet declares the page frame and its pagination guards', () => {
  assert.match(PDF_MODULE, /@page \{ size: A4; margin: 16mm; \}/);
  assert.match(PDF_MODULE, /\.speaker-design-page \{\s*width: 178mm/);
  assert.match(PDF_MODULE, /\.speaker-design-page:not\(:last-child\) \{[\s\S]*?break-after: page/);
  assert.match(PDF_MODULE, /\.group h2 \{[\s\S]*?break-after: avoid/);
  assert.match(PDF_MODULE, /\.foot \{[\s\S]*?break-before: avoid/);
  assert.match(PDF_MODULE, /\.foot \{[\s\S]*?padding-bottom: 4mm/, 'the closing note keeps its clearance from the paper edge');
  assert.match(PDF_MODULE, /thead \{ display: table-header-group; \}/, 'column headings repeat on a continuation page');

  // One composer pages both documents: the printed PDF and the stored copy.
  assert.match(PDF_MODULE, /prepareComposition: \(doc\) => composeSpeakerDesignPages\(doc\)/);
  assert.match(COMPOSITION_CAPTURE, /resolvePageComposer\(pageComposer\)/);
  assert.match(PAGE_COMPOSER_REGISTRY, /composeSpeakerDesignPages/);
  assert.match(PAGE_COMPOSER_REGISTRY, /ISSUED_DOCUMENT_PAGE_COMPOSER\.SPEAKER_DESIGN/);
});

export default null;