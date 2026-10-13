/**
 * speakerDesignPaging.js
 * ----------------------
 * The Current Speaker Design's page frame and its page allocation.
 *
 * The schedule prints on A4 under its own print stylesheet:
 *
 *   paper         A4 — 210 × 297mm
 *   page margin   16mm       (the schedule's own @page rule)
 *   page frame    the printable content box — 178 × 265mm
 *
 * A schedule that fits the frame is ONE sheet: it is never pushed onto a second
 * page it does not need. A longer schedule continues onto further sheets, whole
 * rows at a time — a group's heading and its column headings stay with the rows
 * they introduce, a row is never split, and the closing note is never split or
 * clipped. Every sheet's content is capped at the frame height, so the 16mm
 * bottom margin is guaranteed on every page, and the note carries its own
 * clearance from the printable edge.
 *
 * The pure packer is the authority: it decides the sheets from measured heights.
 * The printed PDF and the stored Project Library copy both compose their pages
 * from it, so the two documents paginate identically.
 *
 * Pure core — no DOM, no React. The composer takes a Document and only moves the
 * nodes the packer has already allocated; it never restyles, recounts or reorders
 * anything.
 */

export const SPEAKER_DESIGN_PAGE_CLASS = 'speaker-design-page';
export const SPEAKER_DESIGN_CONTENT_WIDTH_MM = 178;
export const SPEAKER_DESIGN_CONTENT_HEIGHT_MM = 265;

/** Sub-tenth-of-a-millimetre measurement noise is not a page. */
const FIT_SLACK_MM = 0.1;
/**
 * Every composed frame is kept this far inside the printable box, so a rounding
 * difference can never push a whole frame onto a further page — the bottom
 * margin is guaranteed, not merely estimated.
 */
export const SPEAKER_DESIGN_FRAME_CLEARANCE_MM = 1;

const mm = (value) => Math.max(0, Number(value) || 0);

/**
 * Allocate the schedule's blocks to sheets.
 *
 * @param {Object} input
 * @param {Array<{key: string, heightMm: number}>} [input.leading]
 *   the document's opening blocks — brand, title and facts. They stay on the
 *   first sheet, in order.
 * @param {Array<{key: string, headHeightMm: number, rowHeightsMm: number[]}>} [input.groups]
 *   each group's heading-plus-column-headings cost, and its rows.
 * @param {{key: string, heightMm: number}|null} [input.closing]
 *   the closing note — atomic: never split, never dropped.
 * @param {number} [input.contentHeightMm]
 * @returns {{sheets: Array<{leading: string[], groups: Array<{key: string, rows: number[]}>, closing: boolean}>, sheetCount: number, fits: boolean}}
 */
export function packSpeakerDesignSheets({
  leading = [],
  groups = [],
  closing = null,
  contentHeightMm = SPEAKER_DESIGN_CONTENT_HEIGHT_MM,
} = {}) {
  const limit = Number(contentHeightMm) > 0 ? Number(contentHeightMm) : SPEAKER_DESIGN_CONTENT_HEIGHT_MM;
  const sheets = [];
  let sheet = null;

  const openSheet = () => {
    sheet = { leading: [], groups: [], closing: false, heightMm: 0 };
    sheets.push(sheet);
    return sheet;
  };

  openSheet();

  leading.forEach((block) => {
    const blockHeight = mm(block?.heightMm);
    // An opening block never crowds a sheet it cannot fit on.
    if (sheet.heightMm > 0 && sheet.heightMm + blockHeight > limit + FIT_SLACK_MM) openSheet();
    sheet.leading.push(block?.key);
    sheet.heightMm += blockHeight;
  });

  groups.forEach((group) => {
    const headHeight = mm(group?.headHeightMm);
    const rowHeights = (Array.isArray(group?.rowHeightsMm) ? group.rowHeightsMm : []).map(mm);
    let index = 0;

    while (index < rowHeights.length) {
      // The heading, the column headings and at least the first row travel
      // together, so a sheet never opens with a heading and no rows under it.
      if (sheet.heightMm > 0 && sheet.heightMm + headHeight + rowHeights[index] > limit + FIT_SLACK_MM) {
        openSheet();
      }

      const portion = { key: group?.key, rows: [] };
      sheet.groups.push(portion);
      sheet.heightMm += headHeight;

      while (index < rowHeights.length && sheet.heightMm + rowHeights[index] <= limit + FIT_SLACK_MM) {
        portion.rows.push(index);
        sheet.heightMm += rowHeights[index];
        index += 1;
      }

      if (portion.rows.length === 0) {
        // A row taller than a whole sheet still gets its sheet: the capture
        // reports that rather than cropping it away.
        portion.rows.push(index);
        sheet.heightMm += rowHeights[index];
        index += 1;
      }
    }
  });

  if (closing) {
    const closingHeight = mm(closing.heightMm);
    // The closing note is never clipped and never split: it joins the last sheet
    // when it fits there, and otherwise opens the next one — a page the note
    // genuinely needs, never a page a fitting schedule was pushed onto.
    if (sheet.heightMm + closingHeight > limit + FIT_SLACK_MM) openSheet();
    sheet.closing = true;
    sheet.heightMm += closingHeight;
  }

  return {
    sheets: sheets.map(({ heightMm, ...sheetView }) => sheetView),
    sheetCount: sheets.length,
    fits: sheets.length <= 1,
  };
}

/**
 * One element's outer height in millimetres, at the width it is laid out at.
 *
 * Layout is measured in CSS pixels (96 to the inch), so a measurement is
 * converted to millimetres by multiplying — the page frame the packer reasons
 * about is a millimetre box, and a mis-scaled measurement would page a
 * one-sheet schedule onto a dozen sheets.
 */
function elementHeightMm(element, pxToMm) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return 0;
  const view = element.ownerDocument?.defaultView || null;
  const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;
  const outer = Number.parseFloat(style?.marginTop || '0') + Number.parseFloat(style?.marginBottom || '0');
  const heightPx = element.getBoundingClientRect().height + (Number.isFinite(outer) ? outer : 0);
  return heightPx * pxToMm;
}

/**
 * Compose the mounted schedule into its page frames.
 *
 * Runs in the document holding the schedule — the app-owned print window for the
 * downloaded PDF, and the capture document for the Project Library copy — so both
 * documents carry the same pages.
 *
 * @param {Document} doc
 * @param {{contentHeightMm?: number}} [options]
 * @returns {number} the number of sheets composed (0 when there was nothing to do)
 */
export function composeSpeakerDesignPages(doc, { contentHeightMm = SPEAKER_DESIGN_CONTENT_HEIGHT_MM } = {}) {
  const root = doc?.querySelector?.('.speaker-design-schedule');
  if (!root || root.dataset.speakerDesignPaged === 'true' || !doc.defaultView) return 0;

  const groupSections = Array.from(root.querySelectorAll(':scope > .group'));
  if (groupSections.length === 0) return 0;

  // 96 CSS px per inch: the scale the print layout is measured in.
  const pxToMm = 25.4 / 96;
  const foot = root.querySelector(':scope > .foot');
  const facts = root.querySelector(':scope > .facts');
  const brand = root.querySelector(':scope > .brand');
  const title = root.querySelector(':scope > h1');

  // The opening blocks — the brand line and the title — are each measured where
  // they lie, then placed on the sheet the packer gives them. Nothing is wrapped
  // or moved before it has been measured.
  const openingBlocks = [
    ...(brand ? [{ key: 'brand', node: brand, heightMm: elementHeightMm(brand, pxToMm) }] : []),
    ...(title ? [{ key: 'title', node: title, heightMm: elementHeightMm(title, pxToMm) }] : []),
  ];

  const measured = groupSections.map((section, index) => {
    const heading = section.querySelector('h2');
    const head = section.querySelector('thead');
    const rows = Array.from(section.querySelectorAll('tbody tr'));
    return {
      key: `group-${index}`,
      section,
      heading,
      head,
      rows,
      headHeightMm: elementHeightMm(heading, pxToMm) + elementHeightMm(head, pxToMm),
      rowHeightsMm: rows.map((row) => elementHeightMm(row, pxToMm)),
    };
  });

  const packed = packSpeakerDesignSheets({
    leading: [
      ...openingBlocks.map(({ key, heightMm }) => ({ key, heightMm })),
      ...(facts ? [{ key: 'facts', heightMm: elementHeightMm(facts, pxToMm) }] : []),
    ],
    groups: measured,
    closing: foot ? { key: 'closing', heightMm: elementHeightMm(foot, pxToMm) } : null,
    // The frame is kept a clearance inside the printable box, so every sheet's
    // bottom margin is guaranteed rather than merely estimated.
    contentHeightMm: mm(contentHeightMm) - SPEAKER_DESIGN_FRAME_CLEARANCE_MM,
  });

  // Every block has been measured in place; the frames are then built from the
  // packer's own allocation. Nothing is re-measured or re-decided below.
  groupSections.forEach((section) => section.remove());

  packed.sheets.forEach((sheet) => {
    const page = doc.createElement('section');
    page.className = SPEAKER_DESIGN_PAGE_CLASS;

    openingBlocks.forEach(({ key, node }) => {
      if (sheet.leading.includes(key)) page.appendChild(node);
    });
    if (facts && sheet.leading.includes('facts')) page.appendChild(facts);

    sheet.groups.forEach((portion) => {
      const source = measured.find((group) => group.key === portion.key);
      if (!source) return;
      const section = doc.createElement('section');
      section.className = 'group';
      if (source.heading) section.appendChild(source.heading.cloneNode(true));
      const table = doc.createElement('table');
      // A cloned thead keeps its own row, so the column headings repeat on every
      // sheet the group continues onto.
      if (source.head) table.appendChild(source.head.cloneNode(true));
      const body = doc.createElement('tbody');
      portion.rows.forEach((rowIndex) => {
        const row = source.rows[rowIndex];
        if (row) body.appendChild(row);
      });
      table.appendChild(body);
      section.appendChild(table);
      section.dataset.speakerDesignGroup = portion.key;
      page.appendChild(section);
    });

    if (foot && sheet.closing) page.appendChild(foot);
    root.appendChild(page);
  });

  root.dataset.speakerDesignPaged = 'true';
  root.dataset.speakerDesignPageCount = String(packed.sheetCount);
  return packed.sheetCount;
}

export default composeSpeakerDesignPages;