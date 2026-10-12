/**
 * speakerDesignPdf.js
 * -------------------
 * The Current Speaker Design panel's quick equipment schedule export.
 *
 * It exports the ONE current speaker design of the version on screen — Position,
 * Model and Qty — and nothing else. It is a schedule, not a report: no Project
 * Report record is created, no report snapshot and no report evidence is written
 * or overwritten, so exporting a schedule can never change what the client's
 * report states.
 *
 * The print window is the app's shared one (@/components/report/reportPrintWindow):
 * it opens a document the app owns, so the browser names the saved PDF after this
 * schedule's own filename instead of after the host tab.
 *
 * Pure: no React, no app state, no calculation, no writes.
 */

import {
  openReportPrintWindow,
  printReportInWindow,
  closeReportPrintWindow,
} from '@/components/report/reportPrintWindow';
import { REPORT_PDF_TYPE, buildReportFilename } from '@/components/report/reportPdfTitle';

/**
 * The schedule's document token. It is the SAME shared report filename authority
 * the Project Report names itself with, so the schedule and the report it
 * accompanies are written in one format:
 *   Sound Proof - Artcoustic Cinema Designer - Speaker Design - …
 */
export const SPEAKER_DESIGN_PDF_TYPE = REPORT_PDF_TYPE.SPEAKER_DESIGN;

/** Added to the print window's body — this schedule needs no app shell. */
const PRINT_BODY_CLASS = 'speaker-design-export-mode';

/** Shown when the export cannot produce a document. */
export const SPEAKER_DESIGN_EXPORT_MESSAGES = Object.freeze({
  EMPTY: 'There is no speaker design to export for this version yet.',
  WINDOW_UNAVAILABLE: 'The PDF window could not be opened. Allow pop-ups for this site, then try again.',
  NOT_READY: 'The PDF was not printed because the schedule was not ready.',
});

/**
 * The export filename, WITHOUT the ".pdf" extension: the browser's print dialog
 * names the saved file from the printed document's title and adds the extension
 * itself.
 *
 * It is built by the shared report filename authority, with this document's own
 * type token, so the schedule states the same project identity as the Project
 * Report it accompanies:
 *
 *   Sound Proof - Artcoustic Cinema Designer - Speaker Design[ - <Dealer>] - <Project Name>[ - <Client Name>][ - <Project Reference>] - <Version Name>
 *
 * Only segments that hold a value are written. The client name and the project
 * reference are independent project fields — a blank one never borrows the
 * other's value — and every segment is sanitised by that one authority.
 *
 * @returns {string}
 */
export function buildSpeakerDesignFilename({
  projectName,
  dealerName = null,
  clientName = null,
  projectReference = null,
  versionName = null,
  versionNumber = null,
} = {}) {
  return buildReportFilename(
    SPEAKER_DESIGN_PDF_TYPE,
    projectName,
    { number: versionNumber, name: versionName },
    { dealerName, clientName, projectReference },
  );
}

/** Today, as the schedule's own export date ("12 October 2026"). */
export function speakerDesignExportDate(now = new Date()) {
  try {
    return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The schedule's own styles: A4, the app's report typography, no images. */
const SCHEDULE_CSS = `
@page { size: A4; margin: 16mm; }
.speaker-design-schedule {
  font-family: "Didact Gothic", "Century Gothic", Helvetica, Arial, sans-serif;
  color: #1B1A1A;
  font-size: 12px;
  line-height: 1.5;
}
.speaker-design-schedule .brand {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #625143;
}
.speaker-design-schedule h1 {
  font-family: "Futura PT Light", "Futura PT", "Century Gothic", "Didact Gothic", sans-serif;
  font-size: 26px;
  font-weight: 400;
  margin: 2px 0 0;
  color: #1B1A1A;
}
.speaker-design-schedule .facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 24px;
  margin: 18px 0 24px;
  padding: 14px 16px;
  border: 1px solid #DCDBD6;
  background: #F8F8F7;
}
.speaker-design-schedule .facts div { min-width: 0; }
.speaker-design-schedule .facts dt {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #625143;
}
.speaker-design-schedule .facts dd { margin: 2px 0 0; font-size: 13px; font-weight: 600; }
.speaker-design-schedule .group { margin-bottom: 20px; break-inside: avoid; }
.speaker-design-schedule .group h2 {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #213428;
  margin: 0 0 6px;
}
.speaker-design-schedule table { width: 100%; border-collapse: collapse; }
.speaker-design-schedule thead tr { border-bottom: 1px solid #DCDBD6; }
.speaker-design-schedule th {
  text-align: left;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #625143;
  padding: 0 12px 5px 0;
}
.speaker-design-schedule td { padding: 7px 12px 7px 0; vertical-align: top; border-bottom: 1px solid #EFEDE8; }
.speaker-design-schedule tr:last-child td { border-bottom: 0; }
.speaker-design-schedule .pos { width: 26%; color: #3E4349; }
.speaker-design-schedule .model { width: 56%; }
.speaker-design-schedule .model-name { font-weight: 600; color: #1B1A1A; }
.speaker-design-schedule .model-note { display: block; font-size: 10.5px; color: #625143; margin-top: 2px; }
.speaker-design-schedule .qty { width: 18%; text-align: right; padding-right: 0; color: #3E4349; }
.speaker-design-schedule .foot {
  margin-top: 22px;
  padding-top: 10px;
  border-top: 1px solid #DCDBD6;
  font-size: 10px;
  color: #737373;
}
`;

/** One fact of the header block; an absent value is omitted, never placeholdered. */
function factsMarkup({ projectName, clientName, versionName, layout, dateLabel }) {
  const facts = [
    ['Project', projectName],
    ['Client', clientName],
    ['Version', versionName],
    ['System layout', layout],
    ['Date', dateLabel],
  ].filter(([, value]) => String(value || '').trim() !== '');
  if (facts.length === 0) return '';
  return `<dl class="facts">${facts
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('')}</dl>`;
}

/** The layer groups, exactly as the panel states them, with no Notes column. */
function groupsMarkup(groups) {
  return groups
    .map((group) => {
      const rows = Array.isArray(group?.rows) ? group.rows : [];
      if (rows.length === 0) return '';
      const body = rows
        .map(
          (row) => `<tr>
          <td class="pos">${escapeHtml(row.position)}</td>
          <td class="model"><span class="model-name">${escapeHtml(row.model)}</span>${
            row.note ? `<span class="model-note">${escapeHtml(row.note)}</span>` : ''
          }</td>
          <td class="qty">${escapeHtml(row.quantityLabel)}</td>
        </tr>`
        )
        .join('');
      return `<section class="group">
        <h2>${escapeHtml(group.title)}</h2>
        <table>
          <thead><tr><th class="pos">Position</th><th class="model">Model</th><th class="qty">Qty</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </section>`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * The schedule as HTML: the same design the panel shows, in the same order, with
 * the same dual-centre wording folded into the Model cell.
 */
export function buildSpeakerDesignMarkup({
  groups = [],
  projectName = null,
  clientName = null,
  versionName = null,
  layout = null,
  dateLabel = null,
} = {}) {
  const body = groupsMarkup(Array.isArray(groups) ? groups : []);
  if (!body) return '';
  return `<section class="speaker-design-schedule">
  <style>${SCHEDULE_CSS}</style>
  <div class="brand">Sound Proof</div>
  <h1>Speaker Design</h1>
  ${factsMarkup({ projectName, clientName, versionName, layout, dateLabel })}
  ${body}
  <div class="foot">Current speaker design for this design version. Equipment schedule only.</div>
</section>`;
}

/** The schedule as a detached node, ready for the shared print window. */
export function buildSpeakerDesignNode(data = {}) {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.innerHTML = buildSpeakerDesignMarkup(data);
  return host.firstElementChild || null;
}

/**
 * Export the current speaker design as a PDF.
 *
 * The window is opened synchronously in the click's own turn (a browser only
 * opens one for a user gesture), then the schedule is written into it and printed
 * through the shared print-readiness authority. Nothing is stored.
 *
 * @returns {Promise<{printed: boolean, reason: string|null, message: string|null, title: string}>}
 */
export async function exportSpeakerDesignPdf({
  groups = [],
  projectName = null,
  dealerName = null,
  clientName = null,
  projectReference = null,
  versionName = null,
  versionNumber = null,
  layout = null,
} = {}) {
  const title = buildSpeakerDesignFilename({
    projectName,
    dealerName,
    clientName,
    projectReference,
    versionName,
    versionNumber,
  });

  if (!Array.isArray(groups) || groups.length === 0) {
    return { printed: false, reason: 'empty', message: SPEAKER_DESIGN_EXPORT_MESSAGES.EMPTY, title };
  }

  const node = buildSpeakerDesignNode({
    groups,
    projectName,
    clientName,
    versionName,
    layout,
    dateLabel: speakerDesignExportDate(),
  });
  const win = openReportPrintWindow(title);
  if (!win || !node) {
    closeReportPrintWindow(win);
    return { printed: false, reason: 'window_unavailable', message: SPEAKER_DESIGN_EXPORT_MESSAGES.WINDOW_UNAVAILABLE, title };
  }

  const outcome = await printReportInWindow(win, { title, node, bodyClass: PRINT_BODY_CLASS });
  if (!outcome.printed) {
    closeReportPrintWindow(win);
    return {
      ...outcome,
      title,
      message: outcome.reason === 'window_unavailable'
        ? SPEAKER_DESIGN_EXPORT_MESSAGES.WINDOW_UNAVAILABLE
        : (outcome.message || SPEAKER_DESIGN_EXPORT_MESSAGES.NOT_READY),
    };
  }
  return { ...outcome, title };
}

export default exportSpeakerDesignPdf;