/**
 * ProjectReportParameterIndex.jsx
 * -------------------------------
 * The explicit assessment table for one RP22 category: every parameter in that
 * category, its human title, its achieved result and its Performance Level
 * (or FAIL, or "—" when nothing has been assessed).
 *
 * This is what stops a parameter from silently disappearing from the
 * consolidated report: a parameter that carries no drawing page of its own is
 * still stated here. Values come from the canonical report evidence reader —
 * nothing is recalculated, re-graded or rounded on this surface.
 */

import React from 'react';
import { getCategoryColour } from '@/components/report/technical/technicalParameterMeta';
import { getSeatGradeColors } from '@/components/report/client/visualReportSeatStyle';
import {
  REPORT_FONT_HEADING,
  REPORT_FONT_BODY,
} from '@/components/report/typography/reportTypography';

/** The canonical grade colour for a level token (Level 1–4, FAIL, "—"). */
function levelColour(level) {
  const token = String(level ?? '').trim();
  if (!token || token === '—') return '#737373';
  // The shared grade tokens resolve FAIL, L1–L4 and an unassessed token alike.
  return getSeatGradeColors(token === 'FAIL' ? 0 : token.replace(/^L/, '')).text;
}

export default function ProjectReportParameterIndex({ category, rows = [], print = false }) {
  const colour = getCategoryColour(category);

  return (
    <div style={{ fontFamily: REPORT_FONT_BODY, color: '#1B1A1A' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: print ? 8 : 11,
      }}>
        <thead>
          <tr>
            {['Parameter', 'Assessment', 'Result'].map((heading) => (
              <th
                key={heading}
                style={{
                  textAlign: 'left',
                  padding: print ? '1.5mm 2mm' : '6px 8px',
                  borderBottom: `1.5px solid ${colour}`,
                  fontFamily: REPORT_FONT_HEADING,
                  fontSize: print ? 7.5 : 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colour,
                  fontWeight: 400,
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={{
                padding: print ? '1.5mm 2mm' : '6px 8px',
                borderBottom: '1px solid #E5E5E5',
                whiteSpace: 'nowrap',
                color: '#625143',
                width: '18%',
              }}>
                {row.key}
              </td>
              <td style={{
                padding: print ? '1.5mm 2mm' : '6px 8px',
                borderBottom: '1px solid #E5E5E5',
              }}>
                {row.title}
              </td>
              <td style={{
                padding: print ? '1.5mm 2mm' : '6px 8px',
                borderBottom: '1px solid #E5E5E5',
                whiteSpace: 'nowrap',
                width: '28%',
              }}>
                <span style={{ color: levelColour(row.level), fontWeight: 600 }}>{row.level}</span>
                {row.value && row.value !== '—' ? (
                  <span style={{ color: '#3E4349' }}>{` · ${row.value}`}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}