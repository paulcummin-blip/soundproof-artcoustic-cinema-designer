/**
 * ProjectReportFactsGrid.jsx
 * --------------------------
 * The Project Report's key facts, laid out in two columns so the page reads as a
 * designed fact sheet rather than a single long list.
 *
 * The columns are supplied already grouped (the room the design is built in, and
 * the system it specifies) and every fact keeps the label and value it already
 * had; this component only lays them out. Nothing is graded, recalculated or
 * inferred, and a fact with no value states the report's own dash.
 *
 * Presentation only.
 */

import React from 'react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const DASH = '—';
const LABEL = '#213428';
const VALUE = '#3E4349';
const RULE = '#E5E5E5';

function FactCell({ fact, print }) {
  return (
    <div style={{
      padding: print ? '2.4mm 0' : '9px 0',
      borderBottom: `1px solid ${RULE}`,
    }}>
      <div style={{
        fontFamily: FONT_HEADING,
        fontSize: print ? 7.5 : 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: LABEL,
        marginBottom: print ? '1mm' : 4,
      }}>
        {fact.label}
      </div>
      <div style={{ fontSize: print ? 9 : 12, lineHeight: 1.45, color: VALUE }}>
        {fact.value || DASH}
      </div>
    </div>
  );
}

export default function ProjectReportFactsGrid({ columns = [], print = false }) {
  const groups = (Array.isArray(columns) ? columns : [])
    .map((column) => (Array.isArray(column) ? column.filter(Boolean) : []))
    .filter((column) => column.length > 0);

  if (groups.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: groups.length > 1 ? '1fr 1fr' : '1fr',
      columnGap: print ? '8mm' : 28,
      alignItems: 'start',
      fontFamily: FONT_BODY,
    }}>
      {groups.map((column, index) => (
        <div key={`fact-column-${index}`}>
          {column.map((fact) => (
            <FactCell key={fact.label} fact={fact} print={print} />
          ))}
        </div>
      ))}
    </div>
  );
}