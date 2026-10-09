/**
 * ProjectReportDesignSummary.jsx
 * ------------------------------
 * PAGE 1 of the consolidated Project Report: the PROJECT SUMMARY.
 *
 * A designed opening page: the project's identity is stated by the report
 * masthead directly above it (project, client, version, reference and date —
 * composed once by the shared first-page meta line and never repeated here),
 * followed by the project-specific headline, the facts that open the design up,
 * the key facts as a two-column fact sheet, and ONE short project-specific
 * Design Intent paragraph.
 *
 * The page carries nothing else. The strengths the published assessment
 * supports are stated on their own page (ADI Design Highlights), so this page
 * can never overfill or clip — the sections that used to be stacked onto it
 * have moved to the page that gives them room.
 *
 * Presentation only. Every fact comes from the saved project, the report's own
 * canonical product derivation and the published engineering summary. Nothing is
 * graded, recalculated or inferred.
 */

import React from 'react';
import ProjectReportSummaryOpening from '@/components/report/projectReport/ProjectReportSummaryOpening';
import ProjectReportOpeningBlock from '@/components/report/projectReport/ProjectReportOpeningBlock';
import ProjectReportFactsGrid from '@/components/report/projectReport/ProjectReportFactsGrid';
import { groupSeatsIntoRows } from '@/components/report/client/seatRowGrouping';
import {
  displayFactLabel,
  displayPhrase,
  isTvDisplay,
} from '@/components/models/screen/displayTypeAuthority';
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

/** How the design's display is stated: a television by its own size, a screen as before. */
function screenFact(projectDetails, screenWidthM) {
  // A television is stated as a television — its saved diagonal authority and
  // nothing else: no aspect ratio, no viewable width × height.
  if (isTvDisplay(projectDetails)) return displayPhrase(projectDetails);

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

/** The facts that describe the room, as opposed to the system built into it. */
// 'TV' is the display fact's label when the design's display is a television, so
// it sits with the room facts exactly as 'Screen' does.
const ROOM_FACT_LABELS = new Set(['Room', 'Screen', 'TV', 'Seating']);

/** The fact sheet's two columns: the room the design is built in, and the system. */
function factColumns(facts) {
  const list = Array.isArray(facts) ? facts : [];
  return [
    list.filter((fact) => ROOM_FACT_LABELS.has(fact.label)),
    list.filter((fact) => !ROOM_FACT_LABELS.has(fact.label)),
  ];
}

export default function ProjectReportDesignSummary({
  projectDetails = null,
  roomDims = null,
  seatingPositions = [],
  screenWidthM = null,
  productsSelected = null,
  summaryOpening = null,
  opening = null,
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

  // The loudspeaker families the design is built on, each with its own count.
  const keyLoudspeakers = ['lcr', 'surrounds', 'overheads']
    .map((key) => productValue(productsSelected, key))
    .filter(Boolean)
    .join(' · ') || null;

  const facts = [
    { label: 'Room', value: roomFact },
    { label: displayFactLabel(projectDetails), value: screenFact(projectDetails, screenWidthM) },
    { label: 'Seating', value: seatingFact },
    { label: 'System format', value: String(projectDetails?.dolby_config || '').trim() || null },
    { label: 'Key loudspeakers', value: keyLoudspeakers },
    { label: 'Subwoofers', value: productValue(productsSelected, 'subwoofers') },
    { label: 'Acoustic treatment', value: productValue(productsSelected, 'acoustic_treatment') },
  ];

  // The fact sheet's own two columns — every fact stays on the page.
  const columns = factColumns(facts);

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
          Project Summary
        </h1>
      </div>

      <ProjectReportOpeningBlock
        headline={opening?.headline || null}
        supportingLine={opening?.supportingLine || null}
        print={print}
      />

      <div style={{ marginTop: print ? '4mm' : 14 }}>
        <ProjectReportFactsGrid columns={columns} print={print} />
      </div>

      {summaryOpening && (
        <div style={{
          marginTop: print ? '6mm' : 20,
          marginBottom: print ? '6mm' : 20,
        }}>
          <ProjectReportSummaryOpening sentence={summaryOpening} print={print} />
        </div>
      )}
    </div>
  );
}