/**
 * ProjectReportProducts.jsx
 * -------------------------
 * The Project Report's Systems / Products Selected schedule: the complete
 * equipment specification for the design version the report documents, stated
 * deliberately — what each role is, the model and quantity specified for it,
 * and the engineering job that layer performs in THIS design.
 *
 * The schedule is the report's own canonical product derivation (the same rows
 * the Technical Report and the frozen Engineering Snapshot state), so the
 * consolidated report cannot name a different package from the one the design
 * was priced and specified from. The engineering connection beside each role
 * comes from the ADI highlight authority: it is stated only where the published
 * evidence supports it, and never as marketing copy.
 */

import React from 'react';
import ReportLevelValue from '@/components/report/ReportLevelValue';
import {
  REPORT_FONT_HEADING,
  REPORT_FONT_BODY,
} from '@/components/report/typography/reportTypography';

/** One row's models, each on its own line: "SUB4-12 × 2 (front)". */
function modelLines(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function ProjectReportProducts({ rows = [], connections = {}, print = false }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const cellStyle = {
    fontSize: print ? 9 : 12,
    color: '#3E4349',
    lineHeight: 1.35,
  };

  const headingStyle = {
    fontFamily: REPORT_FONT_HEADING,
    fontSize: print ? 7 : 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#625143',
  };

  return (
    <div style={{ fontFamily: REPORT_FONT_BODY, color: '#1B1A1A' }}>
      <div style={{
        fontFamily: REPORT_FONT_HEADING,
        fontSize: print ? 7.5 : 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#625143',
      }}>
        System specification
      </div>
      <div style={{
        height: 1,
        background: '#DCDBD6',
        margin: print ? '2mm 0 3mm 0' : '5px 0 10px 0',
      }} />

      <div style={{
        display: 'flex',
        gap: 12,
        padding: print ? '0 0 1.6mm 0' : '0 0 8px 0',
        borderBottom: '1px solid #21342830',
      }}>
        <div style={{ width: print ? '34mm' : 150, flexShrink: 0, ...headingStyle }}>Role</div>
        <div style={{ flex: 1, minWidth: 0, ...headingStyle }}>Model &amp; quantity</div>
        <div style={{ width: print ? '58mm' : 240, flexShrink: 0, ...headingStyle }}>
          System role &amp; engineering link
        </div>
      </div>

      <div>
        {rows.map((row) => {
          const models = modelLines(row.value);
          const connectionLines = Array.isArray(connections?.[row.key]) ? connections[row.key] : [];
          return (
            <div
              key={row.key || row.area}
              style={{
                display: 'flex',
                gap: 12,
                padding: print ? '2.2mm 0' : '10px 0',
                borderBottom: '1px solid #E5E5E5',
              }}
            >
              <div style={{
                width: print ? '34mm' : 150,
                flexShrink: 0,
                fontFamily: REPORT_FONT_HEADING,
                fontSize: print ? 7.5 : 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#213428',
                lineHeight: 1.4,
              }}>
                {String(row.area || '').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, ...cellStyle }}>
                {models.length > 0
                  ? models.map((line) => <div key={line}>{line}</div>)
                  : '—'}
              </div>
              <div style={{
                width: print ? '58mm' : 240,
                flexShrink: 0,
                fontSize: print ? 8 : 11,
                color: connectionLines.length > 0 ? '#3E4349' : '#625143',
                lineHeight: 1.35,
              }}>
                {connectionLines.length > 0
                  ? connectionLines.map((line, index) => (
                    <div
                      key={`${row.key || row.area}-link-${index}`}
                      style={{ marginTop: index === 0 ? 0 : print ? '1mm' : 4 }}
                    >
                      {/* The level of the published result this layer delivers —
                          the canonical pill, never plain text. */}
                      <ReportLevelValue
                        label={line.parameter}
                        level={line.level}
                        value={line.text}
                        gap={print ? 5 : 6}
                      />
                    </div>
                  ))
                  : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}