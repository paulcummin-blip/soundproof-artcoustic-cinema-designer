import { fitMediaUnit } from '@/components/proposal/export/composition/proposalMediaFitting';

/** Semantic units within the measured browser compositor; original DOM order is authoritative. */
const PROSE = '.pp-body,.pp-endnote__body,.proposal-print-section__body';
const HEADING = '.pp-header,.pp-block__title,.pp-facts-group__title,.pp-decision__title,.pp-endnote__title,h1,h2,h3,h4';
/** Media that must never be split: a photograph stays with its own caption. */
const MEDIA = 'figure,.pp-media,img,svg,video';
/** The gallery and its supporting row: measured photograph by photograph. */
const GALLERY = '.pp-gallery';
const GALLERY_ROW = '.pp-gallery__support';
/** The editorial compositions a client-facing pack reads its copy in. */
const COMPOSITION = '[data-editorial-composition]';
const COMPOSITION_BLOCK = '[data-editorial-block]';
function shell(node) {
  const copy = node.cloneNode(false);
  if (copy.nodeType === 1) copy.removeAttribute('id');
  return copy;
}
function wrapped(node, ancestors) {
  let copy = node.cloneNode(true);
  for (const parent of [...ancestors].reverse()) {
    const container = shell(parent);
    container.append(copy);
    copy = container;
  }
  copy.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
  return copy;
}
export function markCompositionOrigins(page) {
  [...page.querySelectorAll('*')].forEach((node, index) => { node.dataset.paginationOrigin = `${page.dataset.paginationFrame}:${index}`; });
  // Keep column geometry identical for all row fragments, including five-option comparisons.
  page.querySelectorAll('table').forEach((table) => {
    const cells = [...(table.tHead?.rows[0]?.cells || [])];
    const widths = cells.map((cell) => cell.getBoundingClientRect().width);
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (!total || table.querySelector('colgroup')) return;
    const columns = table.ownerDocument.createElement('colgroup');
    columns.dataset.paginationOrigin = `${table.dataset.paginationOrigin}:columns`;
    widths.forEach((width) => {
      const col = table.ownerDocument.createElement('col');
      col.style.width = `${width / total * 100}%`;
      columns.append(col);
    });
    table.prepend(columns);
    table.style.setProperty('table-layout', 'fixed', 'important');
  });
}
export function proposalContentUnits(page, measureUnits) {
  const units = [];
  const atom = (source, ancestors, extra = {}) => ({
    node: wrapped(source, ancestors),
    source,
    keepNext: source.matches?.(HEADING) || false,
    atomic: source.matches?.(MEDIA) || false,
    ...extra,
  });
  const tableUnits = (table, ancestors) => {
    const entries = [...table.tBodies].flatMap((body) => [...body.rows].map((row) => ({ body, row })));
    if (!entries.length) return [atom(table, ancestors)];
    return entries.map(({ body, row }, index) => {
      const grid = shell(table);
      for (const child of table.children) {
        if (child.matches('colgroup,thead') || (index === 0 && child.matches('caption'))
            || (index === entries.length - 1 && child.matches('tfoot'))) grid.append(child.cloneNode(true));
      }
      const rows = shell(body);
      rows.append(row.cloneNode(true));
      const footer = grid.querySelector('tfoot');
      if (footer) grid.insertBefore(rows, footer); else grid.append(rows);
      return { node: wrapped(grid, ancestors), source: row, keepNext: false,
        tableId: table.dataset.paginationOrigin, rowTotal: entries.length, rowIndex: index };
    });
  };
  const collect = (node, ancestors = [], force = false) => {
    if (node.nodeType !== 1) return [atom(node, ancestors, { keepNext: !node.textContent.trim() })];
    // A composition is read by its own rule wherever it sits, so the editorial
    // grouping holds however deeply the pack nests it.
    if (node.matches?.(COMPOSITION)) return compositionUnits(node);
    if (node.matches('table')) {
      // The evidence summary is never divided: its table is measured, and moved,
      // as ONE unit, so no sheet can carry half of it. Its rows are curated by
      // measurement before composition, so it always fits the sheet it starts on.
      if (node.closest?.('.pp-page--highlights')) return [atom(node, ancestors)];
      return tableUnits(node, ancestors);
    }
    const unit = atom(node, ancestors);
    const prose = node.matches(PROSE);
    // A gallery is measured photograph by photograph, so a sheet carries only the
    // photographs that actually fit on it — including within a supporting row.
    const gallery = node.matches(GALLERY) || node.matches(GALLERY_ROW);
    if (!force && !prose && !gallery && measureUnits([unit]).fits) return [unit];
    // A photograph is indivisible: it is fitted, or moved, as one block with its caption.
    if (node.matches('p,li,figcaption,figure') || !node.childNodes.length) return [unit];
    return [...node.childNodes].flatMap((child) => collect(child, [...ancestors, node],
      child.matches?.(PROSE) || child.matches?.(GALLERY_ROW)));
  };
  // ── Editorial compositions ───────────────────────────────────────────────
  // A composition is one block of the document: its own heading, the photograph
  // that leads it and the copy it carries. It is measured as ONE unit wherever
  // it fits a sheet, so a sheet break can only fall between compositions and
  // never inside one. Where a composition genuinely exceeds a sheet the
  // photograph that leads it is reduced proportionally first — never cropped,
  // never removed, never re-set in a smaller type — and only when that is not
  // enough does the composition fall back to its own blocks, and a block, in
  // turn, to its paragraphs: the explicit overflow for copy that cannot be
  // presented on one sheet.
  const blockUnits = (block) => {
    const whole = atom(block, []);
    if (measureUnits([whole]).fits) return [whole];
    if (fitMediaUnit(whole, [], measureUnits)) return [whole];
    return collect(block, [], true);
  };
  const compositionUnits = (composition) => {
    const whole = atom(composition, []);
    if (measureUnits([whole]).fits) return [whole];
    if (fitMediaUnit(whole, [], measureUnits)) return [whole];
    return [...composition.children].flatMap((child) => (
      child.matches?.(COMPOSITION_BLOCK) ? blockUnits(child) : collect(child, [], true)
    ));
  };

  for (const group of page.childNodes) {
    if (group.nodeType === 1 && group.matches(COMPOSITION)) {
      units.push(...compositionUnits(group));
      continue;
    }
    const whole = atom(group, []);
    const standalone = measureUnits([whole]);
    const paragraphs = group.querySelectorAll?.('.pp-body p') || [];
    // A long prose section may use spare space; a short section stays a complete unit.
    const longProse = group.hasAttribute?.('data-editorial-section') && paragraphs.length >= 3
      && standalone.used > standalone.budget * 0.55;
    const evidenceTable = page.matches('.pp-page--highlights') && (group.matches?.('table') || group.querySelector?.('table'));
    units.push(...(standalone.fits && !longProse && !evidenceTable ? [whole] : collect(group, [], true)));
  }
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (unit.source.matches?.('.kph-table__note,.pp-endnote') && index > 0) units[index - 1].keepNext = true;
    if (unit.source.matches?.('img') && units[index + 1]?.source.matches?.('figcaption')) unit.keepNext = true;
    // A heading keeps its first image with it. A gallery photograph is content in
    // its own right, so it never drags the next photograph onto its own sheet.
    const galleryPhotograph = Boolean(unit.source.matches?.('figure') && unit.source.closest?.(GALLERY));
    if (unit.source.matches?.('figure,.pp-media') && !galleryPhotograph && index > 0 && units[index - 1].keepNext && index + 1 < units.length) unit.keepNext = true;
    // A tiny opening paragraph keeps a second paragraph instead of opening a section on a single sentence.
    if (unit.source.matches?.('p') && index > 0 && units[index - 1].keepNext
        && unit.source.textContent.trim().length < 160 && units[index + 1]?.source.matches?.('p')) unit.keepNext = true;
  }
  if (page.matches('.pp-page--highlights')) {
    // The heading, its introduction and the table are one statement: they never
    // open a sheet the table itself is not on.
    const tableAt = units.findIndex((unit) => unit.tableId || unit.source.matches?.('table'));
    if (tableAt >= 0) units.slice(0, tableAt).forEach((unit) => { unit.keepNext = true; });
  }
  return units;
}