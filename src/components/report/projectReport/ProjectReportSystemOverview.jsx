/**
 * ProjectReportSystemOverview.jsx
 * -------------------------------
 * PAGE 3 of the consolidated Project Report: System & Products.
 *
 * The equipment brought forward so the client understands what has been
 * specified and why: the system stated in one line, the specification schedule
 * (role, model, quantity and the engineering job each layer performs), and the
 * viewing geometry of every seating row.
 *
 * Presentation only: the schedule is the report's own canonical product
 * derivation, the engineering links come from the ADI highlight authority (and
 * are stated only where the published evidence supports them), and the viewing
 * geometry is read from the same published per-seat viewing results the Visual
 * Report's Viewing Experience page prints. Nothing is graded, recalculated or
 * inferred.
 */

import React from 'react';
import ProjectReportProducts from '@/components/report/projectReport/ProjectReportProducts';
import { buildSpecificationConnections, productEntries } from '@/components/report/projectReport/adiDesignHighlights';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';
import { normalizeLevelForDisplay } from '@/components/utils/rp22LevelDisplay';

const DASH = '—';

function productValue(productsSelected, key) {
  const row = (productsSelected?.rows || []).find((entry) => entry?.key === key);
  const value = String(row?.value || '').trim();
  return value || null;
}

/** One seating row's stated viewing geometry, read from its own seat results. */
function rowGeometry(row) {
  const seats = Array.isArray(row?.seats) ? row.seats : [];
  const angles = seats
    .map((seat) => Number(seat?.angleDeg))
    .filter((value) => Number.isFinite(value));
  const levels = [...new Set(seats
    .map((seat) => normalizeLevelForDisplay(seat?.level))
    .filter((value) => value && value !== DASH))];

  const angleText = angles.length === 0
    ? DASH
    : angles.length === 1
      ? `${angles[0].toFixed(1)}°`
      : `${Math.min(...angles).toFixed(1)}° – ${Math.max(...angles).toFixed(1)}°`;

  return {
    key: row?.rowIndex ?? row?.label,
    label: row?.label || `Row ${row?.rowIndex ?? ''}`.trim(),
    seats: seats.length,
    angleText,
    levelText: levels.length ? levels.join(' / ') : DASH,
  };
}

export default function ProjectReportSystemOverview({
  projectDetails = null,
  productsSelected = null,
  engineeringSummary = null,
  rows = [],
  print = false,
}) {
  const connections = buildSpecificationConnections({ productsSelected, engineeringSummary, dolbyConfig: projectDetails?.dolby_config });
  const { counts } = connections;

  const speakerCount = counts.lcr + counts.surrounds + counts.overheads;
  const summaryLine = [
    String(projectDetails?.dolby_config || '').trim() || null,
    speakerCount > 0 ? `${speakerCount} speakers` : null,
    counts.subwoofers > 0 ? `${counts.subwoofers} subwoofers` : null,
    counts.acoustic_treatment > 0 ? `${counts.acoustic_treatment} × Abfuser` : null,
  ].filter(Boolean).join(' · ');

  // Each specified role is stated with the connection the evidence supports.
  const scheduleConnections = {
    ...connections,
    subwoofers: connections.subwoofers || productValue(productsSelected, 'subwoofers'),
  };

  const geometry = (Array.isArray(rows) ? rows : [])
    .map(rowGeometry)
    .filter((row) => row.seats > 0);

  // The schedule rows carry the design's own layers; a role the design does not
  // specify (no product) is not stated.
  const scheduleRows = (productsSelected?.rows || []).filter((row) => {
    const entries = productEntries(productsSelected, row.key);
    return entries.length > 0;
  });

  return (
    <div style={{ fontFamily: FONT_BODY, color: '#1B1A1A' }}>
      <div className="client-report-print-heading">
        <h1
          className="client-report-print-heading__title"
          style={{
            margin: print ? 0 : '0 0 12px 0',
            fontFamily: FONT_HEADING,
            fontSize: print ? undefined : 22,
            fontWeight: 300,
            letterSpacing: '0.01em',
            color: '#213428',
          }}
        >
          System &amp; Products
        </h1>
      </div>

      {summaryLine && (
        <div style={{
          fontSize: print ? 9 : 12,
          color: '#3E4349',
          marginBottom: print ? '5mm' : 16,
        }}>
          {summaryLine}
        </div>
      )}

      <ProjectReportProducts
        rows={scheduleRows}
        connections={scheduleConnections}
        print={print}
      />

      {geometry.length > 0 && (
        <div style={{ marginTop: print ? '6mm' : 22 }}>
          <div style={{
            fontFamily: FONT_HEADING,
            fontSize: print ? 7.5 : 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#213428',
            marginBottom: print ? '3mm' : 8,
          }}>
            Viewing geometry by row
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto auto',
            gap: print ? '2mm 4mm' : '8px 14px',
            alignItems: 'baseline',
            fontSize: print ? 9 : 12,
            color: '#3E4349',
          }}>
            <div style={{ fontFamily: FONT_HEADING, fontSize: print ? 7 : 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#625143' }}>Row</div>
            <div style={{ fontFamily: FONT_HEADING, fontSize: print ? 7 : 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#625143' }}>Seats</div>
            <div style={{ fontFamily: FONT_HEADING, fontSize: print ? 7 : 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#625143' }}>Viewing angle</div>
            <div style={{ fontFamily: FONT_HEADING, fontSize: print ? 7 : 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#625143' }}>RP23</div>
            {geometry.map((row) => (
              <React.Fragment key={row.key}>
                <div>{row.label}</div>
                <div>{row.seats}</div>
                <div>{row.angleText}</div>
                <div>{row.levelText}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}