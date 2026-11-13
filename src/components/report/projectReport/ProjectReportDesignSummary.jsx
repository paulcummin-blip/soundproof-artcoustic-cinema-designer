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
 * The opening is the project-specific headline alone. The screen, the room and
 * the seating are stated once, by the fact sheet directly below it, so the same
 * facts are never read twice on one page.
 *
 * The fact sheet states the room the design is built in, then the system it
 * specifies: the architecture, EACH loudspeaker layer on its own row — LCR,
 * Surrounds, Overheads — carrying the models and quantities that layer is built
 * from, and the subwoofers. Acoustic treatment is not a fact here: it belongs to
 * the room-and-system picture only as supporting evidence, and it states its own
 * quantity and recommendation in full on its own page.
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
import { AUTO_INTENT } from '@/components/report/projectReport/useAutoDesignIntent';
import {
  displayFactLabel,
  displayPhrase,
  isTvDisplay,
} from '@/components/models/screen/displayTypeAuthority';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';



/** The report's own canonical product row for one layer, or null. */
function productValue(productsSelected, key) {
  const row = (productsSelected?.rows || []).find((entry) => entry?.key === key);
  const value = String(row?.value || '').trim();
  return value || null;
}

/** One layer's models and quantities, exactly as that layer's own product row
 *  states them. A layer specifying two models reads as the pair it is
 *  ("C4-1 × 1 and Evolve 3-1 × 2"), never as one identical package. Null when the
 *  design specifies nothing for that layer. */
function layerValue(productsSelected, key) {
  const value = productValue(productsSelected, key);
  if (!value) return null;
  const models = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (models.length <= 1) return models[0] || null;
  return `${models.slice(0, -1).join(', ')} and ${models[models.length - 1]}`;
}

/**
 * How the design's display is stated. THE screen-size display rule, read from
 * the one display authority: a television by its nominal diagonal alone
 * (`77" TV`), a projection screen by its viewable width and aspect ratio alone
 * (`170" 2.35:1 screen`). A projection screen's diagonal is never printed, and
 * a television never states an aspect ratio or a width.
 */
function screenFact(projectDetails) {
  return displayPhrase(projectDetails);
}

/** The facts that state the system's own products: each is shown only when the
 *  design actually specifies that layer, so an absent one is never stated. */
const PRODUCT_FACT_LABELS = new Set(['LCR', 'Surrounds', 'Overheads', 'Subwoofers']);

/** The loudspeaker layers the fact sheet states, each on its own row, in the
 *  order a cinema is built: the screen wall first, then around and above the
 *  listener. The label is the design's own layer name, and the models and
 *  quantities come from that layer's own product row — never from a summary. */
const LOUDSPEAKER_LAYER_ROWS = [
  { key: 'lcr', label: 'LCR' },
  { key: 'surrounds', label: 'Surrounds' },
  { key: 'overheads', label: 'Overheads' },
];

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
  // The design's client-facing system format — bed channels . ACTIVE subwoofers .
  // overhead channels — resolved once by the report page from the one shared format
  // authority. Null falls back to the project's own Dolby configuration.
  systemFormat = null,
  print = false,
  // The automatic ADI Project Summary status. While generation is running the
  // report page shows a blocking overlay; when it has failed the page shows a
  // failure card with Retry here instead of the summary text, so an unfinished
  // summary is never presented as the finished ADI narrative.
  autoIntentStatus = null,
  autoIntentReason = null,
  onRetryAutoIntent = null,
}) {
  const seatRows = groupSeatsIntoRows(seatingPositions);

  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);
  const roomFact = [widthM, lengthM, heightM].every((value) => Number.isFinite(value) && value > 0)
    ? `${widthM.toFixed(2)} × ${lengthM.toFixed(2)} × ${heightM.toFixed(2)} m (W × L × H)`
    : null;

  // The seating positions entered in Room Designer are acoustic listening
  // positions, not a statement of the room's physical seating capacity: three
  // positions across a sofa may serve four or five people. The fact sheet states
  // the row arrangement, never a precise listener count.
  const seatingFact = seatRows.length > 0
    ? `${seatRows.length} row${seatRows.length === 1 ? '' : 's'}`
    : null;

  // One row per loudspeaker layer, each carrying that layer's own models and
  // quantities. The layers are stated separately rather than folded into one
  // sentence, so the screen wall, the surrounds and the overheads are read as the
  // distinct layers they are.
  const layerFacts = LOUDSPEAKER_LAYER_ROWS.map((row) => ({
    label: row.label,
    value: layerValue(productsSelected, row.key),
  }));

  // Acoustic treatment is deliberately not a fact on this page: it states its own
  // quantity and recommendation in full on its own page.
  const facts = [
    { label: 'Room', value: roomFact },
    { label: displayFactLabel(projectDetails), value: screenFact(projectDetails) },
    { label: 'Seating', value: seatingFact },
    // The decoder layout is never a fallback in client-facing copy: the summary
    // states the client's system format (9.3.6) or states nothing.
    { label: 'System format', value: String(systemFormat || '').trim() || null },
    ...layerFacts,
    { label: 'Subwoofers', value: productValue(productsSelected, 'subwoofers') },
  ]
    // A product fact the design does not have is left out altogether: the page
    // never states an absent speaker layer, not even as a dash.
    .filter((fact) => !PRODUCT_FACT_LABELS.has(fact.label) || Boolean(fact.value));

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

      {/* The opening is the project-specific headline alone: the screen, the room
          and the seating are stated once by the fact sheet immediately below,
          never a second time under the headline. */}
      <ProjectReportOpeningBlock
        headline={opening?.headline || null}
        print={print}
      />

      <div style={{ marginTop: print ? '4mm' : 14 }}>
        <ProjectReportFactsGrid columns={columns} print={print} />
      </div>

      {summaryOpening && autoIntentStatus !== AUTO_INTENT.FAILED && (
        <div style={{
          marginTop: print ? '6mm' : 20,
          marginBottom: print ? '6mm' : 20,
        }}>
          <ProjectReportSummaryOpening sentence={summaryOpening} print={print} />
        </div>
      )}

      {/* A failed generation is never shown as a finished summary: the deterministic
          fallback is withheld and a clear failure card with Retry is shown in its
          place. Screen only — the printed PDF is never produced in this state. */}
      {!print && autoIntentStatus === AUTO_INTENT.FAILED && (
        <div style={{
          marginTop: 20,
          padding: '18px 20px',
          background: '#FFFFFF',
          border: '1px solid #C1B6AD',
          borderLeft: '4px solid #8A1A1A',
          borderRadius: 8,
          fontFamily: FONT_BODY,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#8A1A1A' }}>
            ADI could not write the project summary.
          </div>
          <div style={{ fontSize: 12.5, color: '#625143', marginTop: 4, lineHeight: 1.5 }}>
            {autoIntentReason
              ? `The writer refused: ${autoIntentReason}. Retry to generate it again.`
              : 'The summary could not be generated from this design. Retry to generate it again.'}
          </div>
          <button
            type="button"
            onClick={onRetryAutoIntent}
            style={{
              marginTop: 12,
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: '#FFFFFF',
              background: '#213428',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}