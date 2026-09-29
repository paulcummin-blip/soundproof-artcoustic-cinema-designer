import React from 'react';

/**
 * KeyPerformanceHighlightsTable
 * -----------------------------
 * The measured summary table of a System Design Summary:
 * Performance area | Result | What you hear.
 *
 * The Result column is read verbatim from the calculated Sound Proof rows
 * stored on the section. This component never derives, rounds, regrades or
 * recalculates a value.
 *
 * Used by the Proposal Editor and by the print/PDF document, so both show
 * exactly the same table. The `kph-table` class is the print stylesheet hook.
 *
 * Props:
 * - rows: Array<{ key, area, result, what_you_hear }>
 * - className: optional wrapper class
 */

const COLUMNS = [
  { key: 'area', label: 'Performance area' },
  { key: 'result', label: 'Result' },
  { key: 'what_you_hear', label: 'What you hear' },
];

const CELL = 'px-3 py-2 align-top border-b border-[#EAE8E3]';

export default function KeyPerformanceHighlightsTable({ rows, className = '' }) {
  const list = (rows || []).filter((row) => row && (row.area || row.result));
  if (list.length === 0) return null;

  return (
    <div className={className}>
      <table className="kph-table w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 text-left text-xs font-semibold text-[#213428] bg-[#F5F4F0] border-b border-[#DCDBD6]"
                style={{ fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, index) => (
            <tr key={row.key || index}>
              <td className={`${CELL} text-sm text-[#1B1A1A]`}>{row.area}</td>
              <td className={`${CELL} text-sm text-[#3E4349]`}>{row.result}</td>
              <td className={`${CELL} text-sm text-[#625143]`}>{row.what_you_hear}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[#8A8477]">
        Every value calculated by Sound Proof. RP22 levels and measured results are shown as assessed.
      </p>
    </div>
  );
}