import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

/**
 * KeyPerformanceHighlightsTable
 * -----------------------------
 * The measured summary table of a System Design report.
 *
 * Single Summary:      Performance area | Result | What the room gains
 * Comparison:          Performance area | Option A | Option B | What changes
 *                      (one column per selected version)
 *
 * Every cell is read verbatim from calculated Sound Proof data stored on the
 * section: for a summary the calculated rows, for a comparison the calculated
 * comparison rows (one value per version, plus the derived change). This
 * component never derives, rounds, regrades or recalculates a value, and the
 * Design Performance Index rows are calculated rows like any other.
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
 * - className: optional wrapper class
 */

const SUMMARY_COLUMNS = [
  { key: 'area', label: 'Performance area' },
  { key: 'result', label: 'Result' },
  { key: 'what_the_room_gains', label: 'What the room gains' },
];

const CELL = 'px-3 py-2 align-top border-b border-[#EAE8E3]';
const HEAD = 'px-3 py-2 text-left text-[#213428] bg-[#F5F4F0] border-b border-[#DCDBD6]';

function optionHeading(column, index) {
  const label = column?.label || `Option ${String.fromCharCode(65 + index)}`;
  return column?.version_name ? `${label} · ${column.version_name}` : label;
}

export default function KeyPerformanceHighlightsTable({
  rows,
  comparisonRows,
  comparisonVersions,
  className = '',
}) {
  const options = Array.isArray(comparisonVersions) ? comparisonVersions : [];
  const comparison = options.length >= 2 && Array.isArray(comparisonRows) && comparisonRows.length > 0;

  if (comparison) {
    const showChange = comparisonRows.some((row) => row.change !== null && row.change !== undefined);
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
              {showChange && <th className={HEAD} style={proposalRoleStyle('label')}>What changes</th>}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row, index) => (
              <tr key={row.key || index}>
                <td className={`${CELL} text-[#1B1A1A]`} style={proposalRoleStyle('body')}>{row.area}</td>
                {options.map((column, optionIndex) => (
                  <td
                    key={`${row.key || index}:${column.version_id || optionIndex}`}
                    className={`${CELL} text-[#3E4349]`}
                    style={proposalRoleStyle('body')}
                  >
                    {row.values?.[optionIndex] || '—'}
                  </td>
                ))}
                {showChange && (
                  <td className={`${CELL} text-[#625143]`} style={proposalRoleStyle('body')}>
                    {row.change || '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[#8A8477]" style={proposalRoleStyle('caption')}>
          Every value calculated by Sound Proof for each version. The change column is derived from those values.
        </p>
      </div>
    );
  }

  const list = (rows || []).filter((row) => row && (row.area || row.result));
  if (list.length === 0) return null;

  return (
    <div className={className}>
      <table className="kph-table w-full border-collapse">
        <thead>
          <tr>
            {SUMMARY_COLUMNS.map((column) => (
              <th key={column.key} className={HEAD} style={proposalRoleStyle('label')}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={row.key || index}>
              <td className={`${CELL} text-[#1B1A1A]`} style={proposalRoleStyle('body')}>{row.area}</td>
              <td className={`${CELL} text-[#3E4349]`} style={proposalRoleStyle('body')}>{row.result}</td>
              <td className={`${CELL} text-[#625143]`} style={proposalRoleStyle('body')}>{row.what_the_room_gains ?? row.what_you_hear}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[#8A8477]" style={proposalRoleStyle('caption')}>
        Every value calculated by Sound Proof. RP22 levels and measured results are shown as assessed.
      </p>
    </div>
  );
}