/**
 * comparisonTable.js (shared)
 * ---------------------------
 * The calculated System Design Comparison table.
 *
 * Every cell is read from a version's frozen Engineering Snapshot. The AI never
 * writes a comparison value: it writes only the prose around the table, and for
 * the single-report table the experience cell of each row.
 *
 * Row rules:
 *   - only client-facing differences are carried: a row appears only when every
 *     version has a reliable value AND the values are not identical;
 *   - P8, P15, P21, assumed parameters, and unavailable, stale, unreliable or
 *     unassessed results never appear, because the evidence rules never supply
 *     them. Bass consistency (P20) appears when the P20 rule admits it, which is
 *     what lets a comparison show one bass layout as more even across seats;
 *   - the internal Design Index is never a row: it is a designer diagnostic, not
 *     a client-facing result, and a table stored before that rule existed has
 *     its Design Index rows dropped before it reaches a writer;
 *   - the change column is DERIVED from the values, never written by the model.
 *
 * Columns:
 *   2 versions  → Performance area | Option A | Option B | What changes
 *   3+ versions → Performance area | Option A | Option B | Option C
 *                 (the change column is omitted: with three options a single
 *                  "what changes" cell would have to choose a pairing)
 *
 * Pure: no React, no side effects.
 */

import { isDesignIndexRow } from './reportWritingStyleContract.js';

export const COMPARISON_ROW_ORDER = Object.freeze([
  'screen_size',
  'rp23_viewing',
  'system_layout',
  'p2',
  'p4',
  'p5',
  'p7',
  'p9',
  'p10',
  'p12',
  'p13',
  'p14',
  'p16',
  'p17',
  'p18',
  'p19',
  'p20',
]);

/**
 * The most rows the printed comparison table carries. It is one indivisible
 * block on one page, so it shows the differences first and fills the remaining
 * places with the areas both versions share.
 */
export const COMPARISON_ROW_LIMIT = 10;

const ROW_LABELS = Object.freeze({
  screen_size: 'Screen size',
  rp23_viewing: 'Viewing angle / RP23',
  system_layout: 'System layout',
  p2: 'Discrete channels (P2)',
  p4: 'Screen consistency (P4)',
  p5: 'Horizontal spacing (P5)',
  p7: 'Front wide position (P7)',
  p9: 'Overhead spacing (P9)',
  p10: 'Overhead level consistency (P10)',
  p12: 'Screen Dynamic Range (P12)',
  p13: 'Non-screen Dynamic Range (P13)',
  p14: 'LFE and subwoofer Dynamic Range (P14)',
  p16: 'Screen timbre (P16)',
  p17: 'Surround and overhead timbre (P17)',
  p18: 'Bass extension (P18)',
  p19: 'Bass response (P19)',
  p20: 'Bass consistency (P20)',
});

/** The reliable value one version carries for a row, or null. */
function readRowValue(evidence, rowKey) {
  if (!evidence?.available) return null;

  if (rowKey === 'screen_size') {
    const screen = evidence.screen_data || {};
    if (screen.manual_dimensions && screen.manual_width_m) {
      return screen.manual_height_m
        ? `${screen.manual_width_m}m × ${screen.manual_height_m}m (manual)`
        : `${screen.manual_width_m}m (manual)`;
    }
    if (screen.size_inches) {
      // The aspect ratio is written in brackets so the inch value stays a clean,
      // comparable measure for the change column.
      return screen.aspect_ratio
        ? `${screen.size_inches}" (${screen.aspect_ratio})`
        : `${screen.size_inches}"`;
    }
    return null;
  }

  if (rowKey === 'rp23_viewing') {
    const viewing = evidence.rp23_results || {};
    if (!viewing.available || !viewing.summary) return null;
    if (/not calculated/i.test(String(viewing.summary))) return null;
    // The achieved floor leads, so a change between floors reads as a level
    // change rather than as a re-print of two long summaries.
    return viewing.primary_floor
      ? `${viewing.primary_floor} · ${viewing.summary}`
      : String(viewing.summary);
  }

  if (rowKey === 'system_layout') return evidence.system_format_short || evidence.system_format || null;

  if (rowKey === 'p14') return evidence.bass_evidence_if_reliable?.p14?.text || null;
  if (rowKey === 'p18') return evidence.bass_evidence_if_reliable?.p18?.text || null;
  if (rowKey === 'p19') return evidence.bass_evidence_if_reliable?.p19?.text || null;

  const parameterId = Number(rowKey.replace('p', ''));
  if (!Number.isFinite(parameterId)) return null;
  const row = (evidence.rp22_results || []).find((entry) => Number(entry.parameter_id) === parameterId);
  return row?.text || null;
}

function parseLevel(value) {
  // Accepts both the parameter form ("L4") and the RP23 floor form ("Level 4").
  const match = /^\s*(?:L([1-4])|Level\s*([1-4]))\b/i.exec(String(value || ''));
  if (!match) return null;
  return `L${match[1] || match[2]}`;
}

function parseMeasure(value) {
  const body = String(value || '').replace(/^\s*L[1-4]\s*[·\-]?\s*/i, '');
  const match = /(-?\d+(?:\.\d+)?)\s*([a-zA-Z%"°]+(?:\s?[a-zA-Z]+)?)?/.exec(body);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: (match[2] || '').trim() };
}

const isTolerance = (value) => /±/.test(String(value || ''));

/**
 * Derive the change between two option values from the values themselves.
 * Deterministic, data-only: it never invents a number or a claim.
 */
export function describeChange(firstValue, secondValue) {
  const first = String(firstValue ?? '').trim();
  const second = String(secondValue ?? '').trim();
  if (!first || !second) return null;
  if (first === second) return null;

  const firstLevel = parseLevel(first);
  const secondLevel = parseLevel(second);
  if (firstLevel && secondLevel && firstLevel !== secondLevel) {
    return `${firstLevel} → ${secondLevel}`;
  }

  if (!isTolerance(first) && !isTolerance(second)) {
    const firstMeasure = parseMeasure(first);
    const secondMeasure = parseMeasure(second);
    const pureNumber = (value) => /^-?\d+(?:\.\d+)?$/.test(value);
    // A numeric difference is stated only when the two values are genuinely
    // comparable: the same unit, or two plain numbers. Otherwise the change is
    // stated as the two values, which is honest and cannot mislead.
    const comparable = firstMeasure && secondMeasure
      && firstMeasure.unit === secondMeasure.unit
      && (firstMeasure.unit !== '' || (pureNumber(first) && pureNumber(second)));
    if (comparable) {
      const delta = Math.round((secondMeasure.amount - firstMeasure.amount) * 100) / 100;
      if (delta !== 0) {
        const sign = delta > 0 ? '+' : '-';
        const unit = firstMeasure.unit ? ` ${firstMeasure.unit}` : '';
        return `${sign}${Math.abs(delta)}${unit}`;
      }
    }
  }

  return `${first} → ${second}`;
}

/**
 * Build the comparison rows from every selected version's evidence.
 *
 * @param {Array<Object>} versions — buildSelectedVersionEvidence output, in
 *   report order (Option A first)
 * @returns {{ rows: Array, versions: Array<{ version_id, label, version_name }> }}
 */
export function buildComparisonTable(versions) {
  const list = Array.isArray(versions) ? versions : [];
  const columns = list.map((version, position) => ({
    version_id: version.version_id || null,
    label: version.label || `Option ${String.fromCharCode(65 + position)}`,
    version_name: version.version_name || null,
  }));

  // A comparison needs at least two versions with evidence to be a comparison.
  const usable = list.length >= 2 && list.every((version) => version?.available === true);
  if (!usable) return { rows: [], versions: columns };

  const compared = [];
  for (const key of COMPARISON_ROW_ORDER) {
    const values = list.map((version) => readRowValue(version, key));
    // A row needs a reliable value for EVERY version: a version that was not
    // assessed for this area is omitted rather than printed as a blank cell.
    if (values.some((value) => !value)) continue;
    const normalised = values.map((value) => String(value).trim());
    const identical = new Set(normalised).size < 2;

    compared.push({
      key,
      area: ROW_LABELS[key] || key,
      values: normalised,
      // A row both versions share is stated once, as itself: an unchanged area
      // is a real comparison result, not a missing one, so it says so in the
      // change column rather than being dropped from the table.
      identical,
      // The change column is derived from two comparable values. With more than
      // two options a single change cell would have to choose a pairing, so the
      // column stays empty there and the client reads the values themselves.
      change: identical
        ? 'No change'
        : (normalised.length === 2 ? describeChange(normalised[0], normalised[1]) : null),
    });
  }

  // The table is one printed block on one page, so it carries the limit and no
  // more. The differences lead: they are what the comparison is for, and the
  // areas both versions share fill the remaining places.
  const ordered = [...compared.filter((row) => !row.identical), ...compared.filter((row) => row.identical)]
    .slice(0, COMPARISON_ROW_LIMIT)
    .sort((a, b) => COMPARISON_ROW_ORDER.indexOf(a.key) - COMPARISON_ROW_ORDER.indexOf(b.key));

  // The internal Design Index is never a client-facing row, whatever a stored
  // table carries.
  return { rows: ordered.filter((row) => !isDesignIndexRow(row)), versions: columns };
}

/**
 * The table as prompt text, so the writer knows exactly what the table says and
 * never restates or contradicts it with a different number.
 */
export function formatComparisonTableForPrompt(table) {
  // A table stored before the rule existed may still carry the internal Design
  // Index, so its rows are dropped here too: a regenerated section must never
  // see the index, and must never be able to restate it.
  const rows = (table?.rows || []).filter((row) => !isDesignIndexRow(row));
  if (rows.length === 0) {
    return '=== COMPARISON TABLE ===\nNo calculated differences were found between the selected versions. Explain what stays the same and do not claim a difference.';
  }

  const labels = (table.versions || []).map((column, index) => column.label || `Option ${String.fromCharCode(65 + index)}`);
  const lines = [
    '=== COMPARISON TABLE (calculated by Sound Proof, already final) ===',
    `Columns: Performance area | ${labels.join(' | ')}${rows[0].change !== null ? ' | What changes' : ''}`,
  ];

  for (const row of rows) {
    const cells = row.values.join(' | ');
    lines.push(`${row.area} | ${cells}${row.change !== null ? ` | ${row.change}` : ''}`);
  }

  lines.push(
    '',
    'This table is built from each version\'s frozen engineering evidence. Do not add, remove or reorder a row, and never state a value that is not in it.',
  );
  return lines.join('\n');
}

/** The comparison highlights reply carries the introduction only. */
export const COMPARISON_HIGHLIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    intro_html: { type: 'string' },
  },
  required: ['intro_html'],
};

/**
 * The prompt for the introduction to a calculated comparison table. No value,
 * cell or row is written by the model: the table is already built.
 */
export function buildComparisonHighlightsPrompt() {
  return [
    'Write the introduction to the Key Differences section of a System Design Comparison, which compares multiple system options rather than describing one system.',
    '',
    'The comparison table below is already calculated by Sound Proof, one column per selected version. It follows your introduction in the report.',
    '',
    'Return intro_html only: 1 or 2 short sentences, as simple HTML with a <p> tag, written in the design-led voice defined in the style contract.',
    '',
    'RULES:',
    '- Do not write a table, a row or a value.',
    '- Do not restate a table value and do not describe a difference the table does not show.',
    '- Do not say which option is better here: this is the introduction only, and the section that follows explains the differences in order (what stays the same, what changes, what the room gains or gives up).',
  ].join('\n');
}