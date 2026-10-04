// bassGraphMarkerLabels.js
// ---------------------------------------------------------------------------
// Label layout for the Technical Report's bass response graph markers.
//
// The plot draws the marker lines; this module decides where each label goes.
// Pure arithmetic, no React: it changes only where a label is drawn, never what
// a marker states.
//
// The rules it enforces:
//   • markers sitting on (practically) the same frequency share ONE combined
//     label — "Transition / Schroeder ≈ 123 Hz" — instead of two clashing ones;
//   • labels that would otherwise touch are stacked onto separate rows;
//   • no label may leave the plot box, so text can never run through the border.
// ---------------------------------------------------------------------------

export const LABEL_FONT_SIZE = 15;

/** Conservative average character advance for the label face, in viewBox units. */
const CHAR_WIDTH = 8.2;
/** Clear space kept between two labels sharing a row. */
const LABEL_GAP = 12;
/** Markers this close (viewBox units) are one position, so they share a label. */
const MERGE_DISTANCE_PX = 12;
const ROW_HEIGHT = 22;
const MAX_ROWS = 3;
/** Gap held between a marker line and the label beside it. */
const LINE_GAP = 6;

/** Rendered width of a label, in viewBox units. */
export function markerLabelWidth(text) {
  return Math.round(String(text ?? "").length * CHAR_WIDTH);
}

/** First row with room for this label, else the least-occupied row. */
function resolveRow(rowEnds, labelX, width) {
  for (let row = 0; row < MAX_ROWS; row += 1) {
    const end = rowEnds[row];
    if (end === undefined || end + LABEL_GAP <= labelX) return row;
  }
  return rowEnds.indexOf(Math.min(...rowEnds));
}

/**
 * Place the marker labels.
 *
 * @param {Array<{key, frequency, x, shortName, color}>} entries
 *        one entry per marker line, `x` already in plot coordinates
 * @param {{plotLeft: number, plotRight: number, firstRowY: number}} box
 * @returns {Array<{key, text, color, lines, labelX, labelY, row, box}>}
 *          `lines` holds the stroke x of every marker the label covers.
 */
export function buildMarkerLabelLayout(entries = [], { plotLeft, plotRight, firstRowY }) {
  const sorted = [...entries].sort((a, b) => a.x - b.x);

  // ── Markers on the same position become one group ──
  const groups = [];
  for (const entry of sorted) {
    const current = groups[groups.length - 1];
    if (current && Math.abs(entry.x - current.x) <= MERGE_DISTANCE_PX) {
      current.names.push(entry.shortName);
      current.frequencies.push(Number(entry.frequency));
      current.lines.push(entry.x);
      current.x = (current.x + entry.x) / 2;
      continue;
    }
    groups.push({
      key: entry.key,
      x: entry.x,
      color: entry.color,
      names: [entry.shortName],
      frequencies: [Number(entry.frequency)],
      lines: [entry.x],
    });
  }

  // ── One combined, row-stacked, border-safe label per group ──
  const rowEnds = [];
  return groups.map((group) => {
    const frequency = Math.round(
      group.frequencies.reduce((sum, value) => sum + value, 0) / group.frequencies.length,
    );
    const text = `${group.names.join(" / ")} ≈ ${frequency} Hz`;
    const width = markerLabelWidth(text);

    // Prefer the right of the marker line; flip to its left when the label would
    // cross the plot border, and clamp so it can never leave the box.
    const labelX = group.x + LINE_GAP + width <= plotRight
      ? group.x + LINE_GAP
      : Math.max(plotLeft + 4, group.x - LINE_GAP - width);

    const row = resolveRow(rowEnds, labelX, width);
    rowEnds[row] = labelX + width;

    const labelY = firstRowY + row * ROW_HEIGHT;
    return {
      key: group.key,
      text,
      color: group.color,
      lines: group.lines,
      labelX,
      labelY,
      row,
      box: { left: labelX, right: labelX + width, top: labelY - LABEL_FONT_SIZE, bottom: labelY },
    };
  });
}