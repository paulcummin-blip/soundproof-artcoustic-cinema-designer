/**
 * acousticTreatmentPageAuthority
 * ------------------------------
 * THE authority for the client-facing Acoustic Treatment page — the on-screen
 * Visual Report page and the printed (A4) page read their number and their
 * wording from here, so the two can never disagree.
 *
 * QUANTITY AUTHORITY
 *   The quantity the page may state is the DESIGN'S INCLUDED quantity
 *   (abfuserInclusionAuthority.resolveIncludedAbfuserQuantity) — the same number
 *   pricing, the product breakdown and the engineering snapshots follow. The ADI
 *   recommendation supplies the placement geometry and the treatment band the
 *   quantity is based on; it is never presented as a designer selection.
 *
 * NOTHING IS INVENTED. With no treatment data — treatment switched off, or no
 * quantity anywhere to state — `hasPage` is false and the page does not exist,
 * so no caller can print an empty or "Loading…" treatment page.
 *
 * Pure: no React, no side effects, no runtime APIs.
 */

import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";
import { resolveIncludedAbfuserQuantity } from "@/components/utils/abfuserInclusionAuthority";
import { ABFUSER_BASS_NOTE, ABFUSER_PRODUCT } from "@/components/utils/adiAbfuserProduct";

/** The page's own fixed wording — one statement, read by every consumer. */
export const ACOUSTIC_TREATMENT_PAGE_COPY = Object.freeze({
  title: "Acoustic Treatment",
  panelType: "Artcoustic Abfuser",
  purpose: "Broad-band absorption and diffusion",
  role: "Early reflection and room energy control",
  subtitle: "Artcoustic Abfuser — Early reflection and room energy control",
  opening:
    "Acoustic treatment is included to help the loudspeaker system perform as designed. "
    + "In a room of this size, treatment helps control early reflections and reverberation so "
    + "dialogue, effects and music remain clearer across the seating area.",
  practical:
    "The treatment is not there to make the room sound dead. Its role is to control the "
    + "strongest reflections while keeping the room natural and comfortable.",
  performance:
    "By managing reflections, the treatment supports the same three design priorities used "
    + "throughout Sound Proof: Spatial Resolution, Dynamic Range and Timbre Matching.",
  // Stated only when the room's own placement geometry is unavailable. Product
  // facts only — no location is claimed that has not been calculated.
  productNote:
    `Each ${ABFUSER_PRODUCT.label.split(",")[0]} panel is `
    + `${ABFUSER_PRODUCT.widthMm} × ${ABFUSER_PRODUCT.heightMm} mm and provides strong absorption `
    + "from 500 Hz upward, controlling the reflections that affect dialogue clarity, tonal "
    + "balance and localisation.",
  bassNote: ABFUSER_BASS_NOTE,
  summaryLabel: "Treatment summary",
  placementLabel: "Treatment placement",
  productLabel: "How the treatment works",
});

const plural = (count) => (count === 1 ? "panel" : "panels");

/**
 * The client-facing Acoustic Treatment page model.
 *
 * @returns {{
 *   hasPage: boolean, quantity: number, quantityLabel: string,
 *   includedInDesign: boolean, panelType: string, purpose: string, role: string,
 *   subtitle: string, opening: string, practical: string, performance: string,
 *   bassNote: string, productNote: string, summaryRows: Array<{key,label,value}>,
 *   placement: (null|{roomPlan,zones,markers,panel,totalPanels,countedZones,advisoryZones}),
 *   placementZones: Array<{id,label,panels,advisory}>,
 *   basis: string, quantityNote: (string|null), treatmentAreaM2: number
 * }}
 */
export function buildClientAcousticTreatmentPage({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
  legacyAutoQuantity = 0,
  abfuserQtySource = null,
} = {}) {
  const data = selectClientAcousticTreatment({
    roomDims,
    seatingPositions,
    placedSpeakers,
    rsp,
    acousticTreatmentEnabled,
    selectedAbfuserQty,
    legacyAutoQuantity,
    abfuserQtySource,
  });

  const recommendedQty = Math.max(0, Math.floor(Number(data.recommendedQty) || 0));
  const includedQty = resolveIncludedAbfuserQuantity({
    enabled: acousticTreatmentEnabled === true,
    quantitySource: abfuserQtySource,
    selectedQuantity: selectedAbfuserQty,
    recommendedQuantity: recommendedQty,
  });

  // The design's included quantity is the number the page states. Only when the
  // design carries none does the ADI recommendation stand in for it — and the
  // page says which of the two it is showing.
  const includedInDesign = includedQty > 0;
  const quantity = includedInDesign ? includedQty : recommendedQty;

  const placementZones = data.zones.map((zone) => ({
    id: zone.id,
    label: zone.shortLabel,
    panels: Math.max(0, Math.floor(Number(zone.panels) || 0)),
    advisory: zone.advisory === true,
  }));
  const countedZones = placementZones.filter((zone) => !zone.advisory);
  const advisoryZones = placementZones.filter((zone) => zone.advisory);
  const hasPlacement = data.zones.length > 0 && data.markers.length > 0;

  const bandLabel = data.recommendation?.bandLabel || null;

  return {
    // No treatment data → no page. `quantity > 0` is the whole guard: a page
    // without a number to state would be an empty page on paper.
    hasPage: acousticTreatmentEnabled === true && quantity > 0,
    quantity,
    quantityLabel: `${quantity} ${plural(quantity)}`,
    includedInDesign,
    panelType: ACOUSTIC_TREATMENT_PAGE_COPY.panelType,
    purpose: ACOUSTIC_TREATMENT_PAGE_COPY.purpose,
    role: ACOUSTIC_TREATMENT_PAGE_COPY.role,
    title: ACOUSTIC_TREATMENT_PAGE_COPY.title,
    subtitle: ACOUSTIC_TREATMENT_PAGE_COPY.subtitle,
    opening: ACOUSTIC_TREATMENT_PAGE_COPY.opening,
    practical: ACOUSTIC_TREATMENT_PAGE_COPY.practical,
    performance: ACOUSTIC_TREATMENT_PAGE_COPY.performance,
    bassNote: ACOUSTIC_TREATMENT_PAGE_COPY.bassNote,
    productNote: ACOUSTIC_TREATMENT_PAGE_COPY.productNote,
    summaryRows: [
      { key: "type", label: "Treatment type", value: ACOUSTIC_TREATMENT_PAGE_COPY.panelType },
      { key: "quantity", label: "Quantity", value: `${quantity} ${plural(quantity)}` },
      { key: "purpose", label: "Purpose", value: ACOUSTIC_TREATMENT_PAGE_COPY.purpose },
      { key: "role", label: "Role", value: ACOUSTIC_TREATMENT_PAGE_COPY.role },
    ],
    placement: hasPlacement
      ? {
          roomPlan: data.roomPlan,
          zones: data.zones,
          markers: data.markers,
          panel: data.panel,
          totalPanels: recommendedQty,
          countedZones,
          advisoryZones,
        }
      : null,
    placementZones,
    summaryLabel: ACOUSTIC_TREATMENT_PAGE_COPY.summaryLabel,
    placementLabel: ACOUSTIC_TREATMENT_PAGE_COPY.placementLabel,
    productLabel: ACOUSTIC_TREATMENT_PAGE_COPY.productLabel,
    // The acoustic design assumption the quantity rests on, stated only when the
    // recommendation states it.
    basis: bandLabel
      ? `ADI strategic reflection control — ${bandLabel}`
      : "ADI strategic reflection control",
    quantityNote: includedInDesign && recommendedQty > 0 && includedQty !== recommendedQty
      ? `The design includes ${includedQty} ${plural(includedQty)}; the placement shown is the ADI recommendation for this room (${recommendedQty}).`
      : null,
    treatmentAreaM2: Number(data.quantityBreakdown?.treatmentSurfaceArea) || 0,
  };
}