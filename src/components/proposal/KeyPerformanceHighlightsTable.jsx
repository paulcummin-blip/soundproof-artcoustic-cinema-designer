import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

/**
 * KeyPerformanceHighlightsTable
 * -----------------------------
 * The measured summary table of a System Design Summary:
 * Performance area | Result | What listeners hear.
 *
 * The Result column is read verbatim from the calculated Sound Proof rows
 * stored on the section. This component never derives, rounds, regrades or
 * recalculates a value.
 *
 * Used by the Proposal Editor and by the print/PDF document, so both show
 * exactly the same table. The `kph-table` class is the print stylesheet hook.
 *
 * Props:
 * - rows: Array<{ key, area, result, what_you_hear }> (what_you_hear is the
 *   stored key for the "What listeners hear" column)
 * - className: optional wrapper class
 */

const COLUMNS = [
  { key: 'area', label: 'Performance area' },
  { key: 'result', label: 'Result' },
  { key: 'what_you_hear', label: 'What listeners hear' },
];

const CELL = 'px-3 py-2 align-top border-b border-[#EAE8E3]';

/**
 * Design Index rows are no longer selected for the client-facing table, but a
 * report generated before that change still carries them in stored metadata.
 * They are dropped here at render time, so the editor preview and the exported
 * PDF both hide them without regenerating the report.
 */
const DESIGN_INDEX_KEY = /^dpi_/i;
const DESIGN_INDEX_AREA = /design index/i;

export function isClientVisibleHighlightRow(row) {
  if (!row) return false;
  if (DESIGN_INDEX_KEY.test(String(row.key || ''))) return false;
  if (DESIGN_INDEX_AREA.test(String(row.area || ''))) return false;
  return true;
}

export default function KeyPerformanceHighlightsTable({ rows, className = '' }) {
  const list = (rows || []).filter(
    (row) => isClientVisibleHighlightRow(row) && (row.area || row.result),
  );
  if (list.length === 0) return null;

  return (
    <div className={className}>
      <table className="kph-table w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className="px-3 py-2 text-left text-[#213428] bg-[#F5F4F0] border-b border-[#DCDBD6]"
                style={proposalRoleStyle('label')}
              >
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
              <td className={`${CELL} text-[#625143]`} style={proposalRoleStyle('body')}>{row.what_you_hear}</td>
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