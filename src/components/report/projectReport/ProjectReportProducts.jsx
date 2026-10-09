/**
 * ProjectReportProducts.jsx
 * -------------------------
 * The Project Report's Systems / Products Selected page: the complete equipment
 * schedule for the design version the report documents.
 *
 * The schedule is the report's own canonical product derivation (the same rows
 * the Technical Report and the frozen Engineering Snapshot state), so the
 * consolidated report cannot name a different package from the one the design
 * was priced and specified from.
 */

import React from 'react';
import {
  REPORT_FONT_HEADING,
  REPORT_FONT_BODY,
} from '@/components/report/typography/reportTypography';

export default function ProjectReportProducts({ rows = [], print = false }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div style={{ fontFamily: REPORT_FONT_BODY, color: '#1B1A1A' }}>
      <div style={{
        fontSize: print ? 9 : 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#625143',
        marginBottom: print ? '4mm' : 10,
      }}>
        System specification
      </div>

      <div>
        {rows.map((row) => (
          <div
            key={row.key || row.area}
            style={{
              display: 'flex',
              gap: 12,
              padding: print ? '2mm 0' : '8px 0',
              borderBottom: '1px solid #E5E5E5',
            }}
          >
            <div style={{
              width: print ? '42mm' : 160,
              flexShrink: 0,
              fontFamily: REPORT_FONT_HEADING,
              fontSize: print ? 7.5 : 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#213428',
            }}>
              {String(row.area || '').toUpperCase()}
            </div>
            <div style={{ fontSize: print ? 9 : 12, color: '#3E4349' }}>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}