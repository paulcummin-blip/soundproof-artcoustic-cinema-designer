/**
 * ProjectReportDesignSummary.jsx
 * ------------------------------
 * PAGE 1 of the consolidated Project Report: Project Report / Design Summary.
 *
 * One stronger opening instead of the two the reports used to carry — the
 * design's key facts at a glance (room, screen, seating, system format, the
 * specified products, the subwoofer arrangement and the treatment), then the
 * report's own concise, project-specific Design Summary and the strengths the
 * published assessment supports.
 *
 * The report's identity line above it (project, client, version, reference and
 * date) is the shared report masthead, stated once by ClientReportPage. It is
 * never repeated here.
 *
 * Presentation only. Every fact comes from the saved project, the report's own
 * canonical product derivation and the published engineering summary. Nothing is
 * graded, recalculated or inferred.
 */

import React from 'react';
import ClientDesignHighlights from '@/components/report/client/ClientDesignHighlights';
import ProjectReportSummaryOpening from '@/components/report/projectReport/ProjectReportSummaryOpening';
import { groupSeatsIntoRows } from '@/components/report/client/seatRowGrouping';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const DASH = '—';

/** The report's own canonical product row for one layer, or null. */
function productValue(productsSelected, key) {
  const row = (productsSelected?.rows || []).find((entry) => entry?.key === key);
  const value = String(row?.value || '').trim();
  return value || null;
}

/** How the design's screen is stated: the specified size, then its viewable width. */
function screenFact(projectDetails, screenWidthM) {
  const widthM = Number(screenWidthM);
  const aspect = String(projectDetails?.aspect_ratio || '').trim();

  if (projectDetails?.manual_dimensions && Number(projectDetails?.manual_width_m) > 0) {
    const heightM = Number(projectDetails?.manual_height_m);
    const size = `${Number(projectDetails.manual_width_m).toFixed(2)} × ${Number.isFinite(heightM) && heightM > 0 ? heightM.toFixed(2) : DASH} m viewable`;
    return aspect ? `${size} · ${aspect}` : size;
  }

  const diagonal = Number(projectDetails?.screen_size);
  const parts = [];
  if (Number.isFinite(diagonal) && diagonal > 0) parts.push(`${Math.round(diagonal)}" diagonal`);
  if (aspect) parts.push(aspect);
  if (Number.isFinite(widthM) && widthM > 0) parts.push(`${widthM.toFixed(2)} m viewable width`);
  return parts.join(' · ') || null;
}

function FactRow({ label, value, print }) {
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: print ? '2mm 0' : '8px 0',
      borderBottom: '1px solid #E5E5E5',
    }}>
      <div style={{
        width: print ? '42mm' : 160,
        flexShrink: 0,
        fontFamily: FONT_HEADING,
        fontSize: print ? 7.5 : 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#213428',
      }}>
        {label}
      </div>
      <div style={{ fontSize: print ? 9 : 12, color: '#3E4349' }}>
        {value || DASH}
      </div>
    </div>
  );
}

export default function ProjectReportDesignSummary({
  projectDetails = null,
  roomDims = null,
  seatingPositions = [],
  screenWidthM = null,
  productsSelected = null,
  summaryOpening = null,
  highlights = [],
  print = false,
}) {
  const seatRows = groupSeatsIntoRows(seatingPositions);
  const seatCount = Array.isArray(seatingPositions) ? seatingPositions.length : 0;

  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);
  const roomFact = [widthM, lengthM, heightM].every((value) => Number.isFinite(value) && value > 0)
    ? `${widthM.toFixed(2)} × ${lengthM.toFixed(2)} × ${heightM.toFixed(2)} m (W × L × H)`
    : null;

  const seatingFact = seatCount > 0
    ? `${seatRows.length} row${seatRows.length === 1 ? '' : 's'} · ${seatCount} seat${seatCount === 1 ? '' : 's'}`
    : null;

  const keyProducts = ['lcr', 'surrounds', 'overheads']
    .map((key) => productValue(productsSelected, key))
    .filter(Boolean)
    .join(' · ') || null;

  const facts = [
    { label: 'Room', value: roomFact },
    { label: 'Screen', value: screenFact(projectDetails, screenWidthM) },
    { label: 'Seating', value: seatingFact },
    { label: 'System format', value: String(projectDetails?.dolby_config || '').trim() || null },
    { label: 'Key products', value: keyProducts },
    { label: 'Subwoofers', value: productValue(productsSelected, 'subwoofers') },
    { label: 'Acoustic treatment', value: productValue(productsSelected, 'acoustic_treatment') },
  ];

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
          Design Summary
        </h1>
      </div>

      <div>
        {facts.map((fact) => (
          <FactRow key={fact.label} label={fact.label} value={fact.value} print={print} />
        ))}
      </div>

      {summaryOpening && (
        <div style={{
          marginTop: print ? '6mm' : 20,
          marginBottom: print ? '6mm' : 20,
        }}>
          <ProjectReportSummaryOpening sentence={summaryOpening} print={print} />
        </div>
      )}

      {Array.isArray(highlights) && highlights.length > 0 && (
        <div style={{ marginTop: print ? '4mm' : 8 }}>
          <ClientDesignHighlights highlights={highlights} print={print} />
        </div>
      )}
    </div>
  );
}