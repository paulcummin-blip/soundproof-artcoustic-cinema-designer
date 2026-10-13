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
import ReportLevelValue from '@/components/report/ReportLevelValue';
import {
  buildSpecificationConnections,
  connectionLine,
  productEntries,
} from '@/components/report/projectReport/adiDesignHighlights';
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
    // The row's own published RP23 result(s), kept as levels so the page can
    // render each as the canonical pill. A row whose seats differ states both.
    levels,
  };
}

import { displayPhrase, isTvDisplay } from "@/components/models/screen/displayTypeAuthority";

export default function ProjectReportSystemOverview({
  projectDetails = null,
  productsSelected = null,
  engineeringSummary = null,
  rows = [],
  // The viewing experience, where the Highlights page has not already stated the
  // per-row viewing result: one paragraph saying what those figures mean for the
  // audience, set beside the geometry table it explains. Null when the report has
  // already made the point, so nothing is ever said twice.
  viewingNarrative = null,
  print = false,
}) {
  const connections = buildSpecificationConnections({ productsSelected, engineeringSummary, dolbyConfig: projectDetails?.dolby_config });
  const { counts } = connections;

  const speakerCount = counts.lcr + counts.surrounds + counts.overheads;
  const summaryLine = [
    // The display is named as the design's own authority states it — a television
    // by its own size. A projection screen states it exactly as before.
    isTvDisplay(projectDetails) ? displayPhrase(projectDetails) : null,
    String(projectDetails?.dolby_config || '').trim() || null,
    speakerCount > 0 ? `${speakerCount} speakers` : null,
    counts.subwoofers > 0 ? `${counts.subwoofers} subwoofers` : null,
    counts.acoustic_treatment > 0 ? `${counts.acoustic_treatment} × Abfuser` : null,
  ].filter(Boolean).join(' · ');

  // Each specified role is stated with the connection the evidence supports; a
  // role carrying no engineering connection still names what is specified for it.
  const subwooferValue = productValue(productsSelected, 'subwoofers');
  const scheduleConnections = {
    ...connections,
    subwoofers: (connections.subwoofers || []).length
      ? connections.subwoofers
      : (subwooferValue ? [connectionLine(null, null, subwooferValue)] : []),
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

  // The viewing geometry table is a plain four-column table — Row, Seats, Viewing
  // angle, RP23 — so every heading sits directly above its own values and each row
  // stays together. Its columns are aligned to the specification schedule printed
  // above it: Row stands in the schedule's Role column, Seats begins where MODEL &
  // QUANTITY begins, Viewing angle begins where SYSTEM ROLE & ENGINEERING LINK
  // begins, and RP23 ends on the schedule's right boundary. Alignment only — no
  // value, level or score is touched.
  const geometryHeading = {
    fontFamily: FONT_HEADING,
    fontSize: print ? 7 : 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#625143',
  };
  // The last column is right-aligned so the table ends on the schedule's right
  // boundary; the row name and the two measured columns read left-aligned, exactly
  // as the schedule's cells do.
  const geometryRight = { textAlign: 'right' };

  // The schedule's own columns, taken from it so the two tables line up on screen
  // AND in print: the same role-column width and the same column gap put SEATS
  // exactly under MODEL & QUANTITY, the seats column then stops two gaps short of
  // the schedule's engineering-link column so VIEWING ANGLE begins on that column's
  // own left edge, and RP23 is sized by its own content and right-aligned, so the
  // table ends on the schedule's right boundary. Widths and alignment only.
  const scheduleGapPx = 12;
  const scheduleRoleTrack = print ? '34mm' : '150px';
  const scheduleLinkTrack = print ? '58mm' : '240px';
  const geometrySeatsTrack = `calc(100% - ${scheduleRoleTrack} - ${scheduleLinkTrack} - ${scheduleGapPx * 2}px)`;

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
          {viewingNarrative && (
            <div style={{
              fontSize: print ? 9 : 12,
              lineHeight: 1.5,
              color: '#3E4349',
              marginBottom: print ? '4mm' : 12,
            }}>
              {viewingNarrative}
            </div>
          )}
          <div style={{
            fontFamily: FONT_HEADING,
            fontSize: print ? 7.5 : 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#625143',
          }}>
            Viewing geometry by row
          </div>
          <div style={{
            height: 1,
            background: '#DCDBD6',
            margin: print ? '2mm 0 3mm 0' : '5px 0 8px 0',
          }} />
          <div style={{
            display: 'grid',
            // FOUR tracks for four columns: Row, Seats, Viewing angle, RP23 — each
            // starting on the specification schedule's own column edge, at the
            // schedule's own column gap. The track count must always equal the number
            // of cells each row contributes: one more track and every row's cells
            // would spill into the row above it.
            gridTemplateColumns: `${scheduleRoleTrack} ${geometrySeatsTrack} minmax(0, 1fr) auto`,
            gap: print ? `2mm ${scheduleGapPx}px` : `8px ${scheduleGapPx}px`,
            // Centred, so each row's level pill sits on the same line as the
            // seat count and viewing angle beside it.
            alignItems: 'center',
            fontSize: print ? 9 : 12,
            color: '#3E4349',
          }}>
            <div style={geometryHeading}>Row</div>
            <div style={geometryHeading}>Seats</div>
            <div style={geometryHeading}>Viewing angle</div>
            <div style={{ ...geometryHeading, ...geometryRight }}>RP23</div>
            {geometry.map((row) => (
              <React.Fragment key={row.key}>
                <div>{row.label}</div>
                <div>{row.seats}</div>
                <div>{row.angleText}</div>
                {/* Each row's own RP23 result, as the canonical level pill. */}
                <div style={geometryRight}>{row.levels.length ? <ReportLevelValue levels={row.levels} /> : DASH}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}