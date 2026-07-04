// TemporaryBassAuditPanels.jsx
// Renders the temporary diagnostic audit panels for the Bass Response page as an
// "investigation notebook": a timeline, one dominant Active Investigation, a
// collapsed Recent list, and a single collapsed Retired accordion. UI organisation
// only — no audit logic, calculations, physics, graphs, or component props were
// changed; every panel below renders identically to before this refactor.
//
// Future investigations: append a new entry to the end of
// investigations/investigationManifest.js — it will automatically become the
// Active Investigation, and automatically move into Recent then Retired as later
// investigations are added. No further UI changes are required.

import React from "react";
import { buildInvestigationManifest } from "@/components/room/bass/investigations/investigationManifest";
import InvestigationTimeline from "@/components/room/bass/investigations/InvestigationTimeline";
import ActiveInvestigationCard from "@/components/room/bass/investigations/ActiveInvestigationCard";
import RecentInvestigationsList from "@/components/room/bass/investigations/RecentInvestigationsList";
import RetiredInvestigationsAccordion from "@/components/room/bass/investigations/RetiredInvestigationsAccordion";

const RECENT_COUNT = 5;
const TIMELINE_LENGTH = 6;

export default function TemporaryBassAuditPanels({
  roomDims, seatingPositions, subsForSimulation, surfaceAbsorption,
  rewOverlaySeries, multiSeries, qStrategy,
}) {
  const ctx = { roomDims, seatingPositions, subsForSimulation, surfaceAbsorption, rewOverlaySeries, multiSeries, qStrategy };
  const manifest = buildInvestigationManifest(ctx);

  const activeIndex = manifest.findIndex((m) => m.status === "ACTIVE");
  const resolvedActiveIndex = activeIndex >= 0 ? activeIndex : manifest.length - 1;
  const activeItem = manifest[resolvedActiveIndex];

  const others = manifest.filter((_, i) => i !== resolvedActiveIndex);
  const recentItems = others.slice(-RECENT_COUNT);
  const retiredItems = others.slice(0, Math.max(0, others.length - RECENT_COUNT));

  const timelineItems = manifest.slice(-TIMELINE_LENGTH);

  return (
    <>
      <InvestigationTimeline items={timelineItems} />
      <ActiveInvestigationCard item={activeItem} />
      <RecentInvestigationsList items={recentItems} />
      <RetiredInvestigationsAccordion items={retiredItems} />
    </>
  );
}