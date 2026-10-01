/**
 * AbfuserTreatmentPlan.jsx
 * ------------------------
 * Visual Report Acoustic Treatment plan.
 *
 * This is a thin Visual Report presenter around the single Abfuser plan-drawing
 * authority (AbfuserPlanDrawing). It owns no geometry: the room, zones, panels,
 * seats, speakers and reference marker are all drawn by the shared authority on
 * the same room scale the Technical Report uses, and the Visual Report's
 * annotation layer (zone labels, dimensions, total, legend, drawn-joint note)
 * is switched on with variant="visual".
 *
 * Panel count, size, position and the drawn joint all come from the caller's
 * ADI recommendation selector. This file decides nothing.
 */

import React from "react";
import AbfuserPlanDrawing from "@/components/report/AbfuserPlanDrawing";

export default function AbfuserTreatmentPlan({
  roomPlan,
  zones = [],
  panels = [],
  panel = null,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  totalPanels = 0,
}) {
  return (
    <AbfuserPlanDrawing
      variant="visual"
      roomPlan={roomPlan}
      zones={zones}
      panels={panels}
      panel={panel}
      seatingPositions={seatingPositions}
      placedSpeakers={placedSpeakers}
      rsp={rsp}
      totalPanels={totalPanels}
    />
  );
}