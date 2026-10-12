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
  REPORT_DOCUMENT_TYPES,
} from '../src/components/library/issuedDocument/issuedDocumentTypes.js';
import {
  buildSpeakerDesignFilename,
  buildSpeakerDesignMarkup,
} from '../src/components/roomdesigner/speakerDesignPdf.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const EXPORT_HOOK = read('src/components/report/client/useClientReportPdfExport.js');
const COMPANION = read('src/components/report/speakerDesign/speakerDesignIssuedDocument.js');
const REPORT_PAGE = read('src/pages/RP22ClientReport.jsx');
const PANEL_BUTTON = read('src/components/roomdesigner/SpeakerDesignPdfButton.jsx');
const PDF_MODULE = read('src/components/roomdesigner/speakerDesignPdf.js');

/** One dual-centre schedule, as the panel states it. */
const SCHEDULE_GROUPS = Object.freeze([
  {
    key: 'front_stage',
    title: 'Front stage',
    rows: [
      {
        key: 'FC',
        position: 'Centre',
        model: 'C4-1 × 2',
        quantityLabel: '2 cabinets',
        note: 'Dual physical centre cabinets, one logical centre channel · cabinets mounted vertically',
      },
      { key: 'FL', position: 'Front left', model: 'SL4-1', quantityLabel: '1', note: 'Behind screen' },
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

  // It is captured from its own print composition, on the paper it prints on.
  const composition = ISSUED_DOCUMENT_COMPOSITION[ISSUED_DOCUMENT_TYPE.SPEAKER_DESIGN];
  assert.equal(composition.nodeSelector, '.speaker-design-schedule');
  assert.equal(composition.pageSelector, '.speaker-design-schedule');
  assert.equal(composition.bodyClass, 'speaker-design-export-mode');
  assert.equal(composition.pageFrame.marginMm, 16, 'the schedule’s own 16mm page margin');
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

  // The dual-centre wording stays inside the Model cell.
  assert.match(
    markup,
    /model-name">C4-1 × 2<\/span>\s*<span class="model-note">Dual physical centre cabinets, one logical centre channel · cabinets mounted vertically<\/span>/,
  );
  assert.match(markup, /<td class="qty">2 cabinets<\/td>/);

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

export default null;