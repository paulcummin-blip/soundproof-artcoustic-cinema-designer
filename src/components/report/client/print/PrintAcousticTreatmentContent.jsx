/**
 * PrintAcousticTreatmentContent
 * -----------------------------
 * The printed (A4) Acoustic Treatment page of the Visual Report.
 *
 * One page, in order:
 *   1  what the treatment is for          (opening statement)
 *   2  the treatment summary card         (type · quantity · purpose · role)
 *   3  where the panels go                (the shared Abfuser plan drawing, or a
 *                                         product card when the room's placement
 *                                         geometry is unavailable)
 *   4  what it does and what it supports  (practical note + the three design
 *                                         priorities)
 *   5  the closing result band            (8 × Artcoustic Abfuser)
 *
 * Numbers and wording come from ONE authority
 * (acousticTreatmentPageAuthority), so this page states exactly what the
 * on-screen Visual Report page states. Nothing is calculated here and nothing is
 * invented: with no treatment data the page is never added to the report at all.
 *
 * The page never renders empty. If the authority has no quantity to state it
 * still prints a truthful statement rather than an empty page shell, so a page
 * that reached the print layout can never come out blank.
 *
 * Type note: the report's shared stylesheet sets the body role on every <p>
 * inside a report page, so paragraph type is stated inline here (the sizes the
 * page wants, which that rule would otherwise re-set) while layout, borders and
 * card type are carried by the page's own class names.
 */

import React from "react";
import AbfuserTreatmentPlan from "../AbfuserTreatmentPlan";
import { buildClientAcousticTreatmentPage } from "../acousticTreatmentPageAuthority";

// Paragraph type, stated inline: the shared report stylesheet sets the body role
// on every <p> in a report page, and this page keeps its own scale.
const LEDE_TEXT = { fontSize: "9.5pt", lineHeight: 1.5, color: "#3E4349", margin: 0 };
const QUIET_TEXT = { fontSize: "8pt", lineHeight: 1.45, color: "#625143", margin: "1.5mm 0 0 0" };
const BAND_TEXT = { fontSize: "9pt", lineHeight: 1.4, color: "#FFFFFF", opacity: 0.9, margin: 0 };

const STYLES = `
  .acoustic-treatment-print { display: flex; flex-direction: column; gap: 4mm; }
  .acoustic-treatment-print__row { display: flex; gap: 5mm; align-items: flex-start; }
  .acoustic-treatment-print__card {
    background: #FFFFFF;
    border: 1px solid #E6E4DD;
    border-radius: 4mm;
    padding: 4mm 5mm;
    box-sizing: border-box;
  }
  .acoustic-treatment-print__card--summary { flex: 0 0 68mm; }
  .acoustic-treatment-print__card--placement { flex: 1 1 auto; min-width: 0; }
  .acoustic-treatment-print__label {
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #213428;
    margin-bottom: 2mm;
  }
  .acoustic-treatment-print__field { padding: 1.6mm 0; border-top: 1px solid #F0EFEA; }
  .acoustic-treatment-print__field:first-of-type { border-top: 0; padding-top: 0; }
  .acoustic-treatment-print__field-label {
    font-size: 7.5pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #9B8E82;
  }
  .acoustic-treatment-print__field-value { font-size: 10pt; line-height: 1.35; color: #3E4349; }
  .acoustic-treatment-print__plan { margin-bottom: 1mm; }
  .acoustic-treatment-print__plan svg { max-height: 84mm; }
  .acoustic-treatment-print__zone {
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    font-size: 8.5pt;
    line-height: 1.4;
    color: #3E4349;
    padding: 0.7mm 0;
    border-top: 1px solid #F0EFEA;
  }
  .acoustic-treatment-print__zone-count { font-weight: 700; color: #213428; white-space: nowrap; }
  .acoustic-treatment-print__zone--advisory { color: #625143; font-style: italic; }
  .acoustic-treatment-print__zone--advisory .acoustic-treatment-print__zone-count { color: #625143; }
  .acoustic-treatment-print__band { background: #213428; border-color: #213428; color: #FFFFFF; }
  .acoustic-treatment-print__band-label {
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
    margin-bottom: 1.5mm;
  }
  .acoustic-treatment-print__band-value { margin: 0 0 1.5mm 0; }
`;

function SummaryCard({ rows, label }) {
  return (
    <div className="acoustic-treatment-print__card acoustic-treatment-print__card--summary">
      <div className="acoustic-treatment-print__label">{label}</div>
      {rows.map((row) => (
        <div key={row.key} className="acoustic-treatment-print__field">
          <div className="acoustic-treatment-print__field-label">{row.label}</div>
          <div className="acoustic-treatment-print__field-value">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

/** The placement card: the same plan the on-screen page draws, plus the counts. */
function PlacementCard({ treatment, seatingPositions, placedSpeakers, rsp }) {
  const placement = treatment.placement;
  return (
    <div className="acoustic-treatment-print__card acoustic-treatment-print__card--placement">
      <div className="acoustic-treatment-print__label">{treatment.placementLabel}</div>
      <div className="acoustic-treatment-print__plan">
        <AbfuserTreatmentPlan
          roomPlan={placement.roomPlan}
          zones={placement.zones}
          panels={placement.markers}
          panel={placement.panel}
          seatingPositions={seatingPositions}
          placedSpeakers={placedSpeakers}
          rsp={rsp}
          totalPanels={placement.totalPanels}
        />
      </div>
      {placement.countedZones.map((zone) => (
        <div key={zone.id} className="acoustic-treatment-print__zone">
          <span>{zone.label}</span>
          <span className="acoustic-treatment-print__zone-count">
            {zone.panels} {zone.panels === 1 ? "panel" : "panels"}
          </span>
        </div>
      ))}
      {placement.advisoryZones.map((zone) => (
        <div
          key={zone.id}
          className="acoustic-treatment-print__zone acoustic-treatment-print__zone--advisory"
        >
          <span>{zone.label} — advisory only, not counted</span>
          <span className="acoustic-treatment-print__zone-count">
            {zone.panels} {zone.panels === 1 ? "panel" : "panels"}
          </span>
        </div>
      ))}
      <p style={QUIET_TEXT}>{treatment.basis}</p>
    </div>
  );
}

export default function PrintAcousticTreatmentContent(props) {
  const treatment = buildClientAcousticTreatmentPage(props);

  return (
    <>
      <style>{STYLES}</style>

      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">{treatment.title}</h1>
        <p className="client-report-print-heading__subtitle">{treatment.subtitle}</p>
      </div>

      <div
        className="client-report-print-drawing acoustic-treatment-print"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
        }}
      >
        <p style={LEDE_TEXT}>{treatment.opening}</p>

        <div className="acoustic-treatment-print__row">
          <SummaryCard rows={treatment.summaryRows} label={treatment.summaryLabel} />

          {treatment.placement ? (
            <PlacementCard
              treatment={treatment}
              seatingPositions={props.seatingPositions}
              placedSpeakers={props.placedSpeakers}
              rsp={props.rsp}
            />
          ) : (
            /* No placement geometry: product facts, never an invented location. */
            <div className="acoustic-treatment-print__card acoustic-treatment-print__card--placement">
              <div className="acoustic-treatment-print__label">{treatment.productLabel}</div>
              <p style={LEDE_TEXT}>{treatment.productNote}</p>
              <p style={QUIET_TEXT}>{treatment.basis}</p>
            </div>
          )}
        </div>

        <p style={LEDE_TEXT}>{treatment.practical}</p>
        <p style={QUIET_TEXT}>{treatment.bassNote}</p>
        <p style={LEDE_TEXT}>{treatment.performance}</p>
      </div>

      <div
        className="client-report-print-result acoustic-treatment-print__band"
        style={{ background: "#213428", borderColor: "#213428", color: "#FFFFFF" }}
      >
        <div className="client-report-print-result__content">
          <div className="acoustic-treatment-print__band-label">
            {treatment.includedInDesign
              ? "Acoustic treatment — included"
              : "ADI acoustic treatment recommendation"}
          </div>
          <h3 className="acoustic-treatment-print__band-value">
            {treatment.quantity} × {treatment.panelType}
          </h3>
          <p style={BAND_TEXT}>
            The panels control the strongest early reflections at the listening positions,
            supporting dialogue clarity and tonal balance across the seating area.
          </p>
          {treatment.quantityNote && <p style={BAND_TEXT}>{treatment.quantityNote}</p>}
        </div>
      </div>
    </>
  );
}