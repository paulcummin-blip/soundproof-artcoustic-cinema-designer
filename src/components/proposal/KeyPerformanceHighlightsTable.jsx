import React from 'react';
import { resolveComparisonDisplay } from '@/components/proposal/comparisonDisplayAuthority';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
import { excludeClientFacingRows } from '@/components/proposal/designIndexRowAuthority';
import {
  buildHighlightDisplayRows,
  changeCellText,
  comparisonClientMeaning,
} from '@/components/proposal/keyPerformanceHighlightsAuthority';

/**
 * KeyPerformanceHighlightsTable
 * -----------------------------
 * The measured summary table of a System Design report.
 *
 * Single Summary:      Performance area | Parameter | Result | What the room gains
 * Comparison:          Performance area | Option A | Option B | What changes
 *                      (one column per selected version)
 *
 * Every cell is read from calculated Sound Proof data stored on the section:
 * for a summary the calculated rows, for a comparison the calculated comparison
 * rows (one value per version, plus the derived change). This component never
 * derives, regrades or recalculates a value. The summary's Performance area,
 * Parameter source and display rounding come from
 * keyPerformanceHighlightsAuthority, which also guarantees the "What the room
 * gains" column is populated on every row.
 *
 * The Design Index is an internal designer diagnostic, so it is never a row
 * here. A proposal generated before that rule existed still carries the row in
 * stored data, and the guard below drops it on the way to the editor, the
 * preview and the PDF. The stored record is never modified.
 *
 * Used by the Proposal Editor and by the print/PDF document, so both show
 * exactly the same table. The `kph-table` class is the print stylesheet hook.
 *
 * Props:
 * - rows: Array<{ key, area, result, what_the_room_gains }> — summary rows
 *   (what_the_room_gains is the stored key for the "What the room gains" column;
 *    rows written before the rename still carry the legacy what_you_hear key)
 * - comparisonRows: Array<{ key, area, values: string[], change: string|null }>
 * - comparisonVersions: Array<{ version_id, label, version_name }> — the option
 *   columns, in report order
 * - viewingResult: the compact per-row RP23 line ('Row 1 L4, 63° / Row 2 L3,
 *   45°') from the published per-seat angles. Stated in the Result column in
 *   place of the longer stored sentence, so the row holds one line. Null prints
 *   the stored result unchanged.
 * - className: optional wrapper class
 */

const SUMMARY_COLUMNS = [
  { key: 'area', label: 'Performance area', width: '17%' },
  { key: 'parameter', label: 'Parameter', width: '21%' },
  { key: 'result', label: 'Result', width: '18%' },
  { key: 'gain', label: 'What the room gains', width: '44%' },
];

const CELL = 'px-3 py-2 align-top border-b border-[#EAE8E3]';
const HEAD = 'px-3 py-2 text-left text-[#213428] bg-[#F5F4F0] border-b border-[#DCDBD6]';

/**
 * The heading of one option column. The official saved version name is the
 * heading: "Option A · Level 1 version" states the position as well as the name,
 * and the position is already carried by the column order.
 */
function optionHeading(column, index) {
  return column?.version_name || column?.label || `Option ${String.fromCharCode(65 + index)}`;
}

/**
 * The short derived change a row leads its "What you gain" cell with: the
 * calculated level or measured difference when it is stated compactly, a plain
 * statement when the versions share the result, and nothing when the stored
 * change is too long to hold the column.
 */
function changeLead(row) {
  if (row?.identical) return 'Same / No change. ';
  const change = String(row?.change || '').trim();
  return change && change.length <= 24 ? `${change}. ` : '';
}

export default function KeyPerformanceHighlightsTable({
  rows,
  comparisonRows,
  comparisonVersions,
  comparisonExpected = false,
  proposalComparisonTable = null,
  viewingResult = null,
  className = '',
}) {
  const display = resolveComparisonDisplay(comparisonRows, comparisonVersions, proposalComparisonTable);
  const options = display.versions;
  // The internal Design Index and the assumed parameters (P8, P15, P21) are
  // never client-facing rows.
  const visibleComparisonRows = excludeClientFacingRows(display.rows);
  const comparison = options.length >= 2 && visibleComparisonRows.length > 0;
  // A comparison whose table could not be built says so on the page. A heading
  // with nothing under it reads as a section that failed silently, which is
  // exactly what it would be.
  const comparisonUnavailable = !comparison && (comparisonExpected || options.length >= 2);

  if (comparisonUnavailable) {
    return (
      <div className={className}>
        <p className="text-[#8A8477]" style={proposalRoleStyle('body')}>
          Comparison evidence requires regeneration. Create a new comparison revision from both versions; the existing report is unchanged.
        </p>
      </div>
    );
  }

  if (comparison) {
    // Every assessed area is carried, so a comparison of two fully assessed
    // designs carries more rows than the single-report table. The rows tighten
    // rather than the table being cut: it stays one printed block on one page,
    // and no assessed area is dropped to make it fit.
    const dense = visibleComparisonRows.length > 10;
    const cell = dense ? 'px-2 py-1 align-top border-b border-[#EAE8E3]' : CELL;
    return (
      <div className={className}>
        <table className="kph-table w-full border-collapse">
          <thead>
            <tr>
              <th className={HEAD} style={proposalRoleStyle('label')}>Performance area</th>
              {options.map((column, index) => (
                <th key={column.version_id || index} className={HEAD} style={proposalRoleStyle('label')}>
                  {optionHeading(column, index)}
                </th>
              ))}
              <th className={HEAD} style={proposalRoleStyle('label')}>What you gain</th>
            </tr>
          </thead>
          <tbody>
            {visibleComparisonRows.map((row, index) => (
              <tr key={row.key || index}>
                <td className={`${cell} text-[#1B1A1A]`} style={proposalRoleStyle('body')}>{row.area}</td>
                {options.map((column, optionIndex) => (
                  <td
                    key={`${row.key || index}:${column.version_id || optionIndex}`}
                    className={`${cell} text-[#3E4349]`}
                    style={proposalRoleStyle('body')}
                  >
                    {row.values?.[optionIndex] || '—'}
                  </td>
                ))}
                <td className={`${cell} text-[#625143]`} style={proposalRoleStyle('body')}>
                  {changeLead(row)}{comparisonClientMeaning(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[#8A8477]" style={proposalRoleStyle('caption')}>
          Values are read from each version’s frozen Sound Proof evidence. Matching results are retained as Same / No change.
        </p>
      </div>
    );
  }

  const list = buildHighlightDisplayRows(rows, { viewingResult });
  if (list.length === 0) return null;

  return (
    <div className={className}>
      <table className="kph-table kph-table--summary w-full border-collapse">
        <thead>
          <tr>
            {SUMMARY_COLUMNS.map((column) => (
              <th
                key={column.key}
                className={HEAD}
                style={{ ...proposalRoleStyle('label'), width: column.width }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.key}>
              <td className={`${CELL} text-[#1B1A1A]`} style={proposalRoleStyle('body')}>{row.area}</td>
              <td className={`${CELL} text-[#3E4349]`} style={proposalRoleStyle('body')}>{row.parameter}</td>
              <td className={`${CELL} text-[#1B1A1A]`} style={proposalRoleStyle('body')}>{row.result}</td>
              <td className={`${CELL} text-[#625143]`} style={proposalRoleStyle('body')}>{row.gain}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[#8A8477]" style={proposalRoleStyle('caption')}>
        Every result calculated by Sound Proof. Levels and measured results are shown as assessed, rounded to whole degrees, dB and Hz.
      </p>
    </div>
  );
}