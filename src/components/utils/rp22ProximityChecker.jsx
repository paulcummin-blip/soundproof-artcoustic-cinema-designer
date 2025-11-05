// utils/rp22ProximityChecker.js

const THRESHOLD_WARN = 0.50;   // meters to any wall or corner → Warning
const THRESHOLD_CRIT = 0.25;   // meters → Critical
const BADGE_WARN = "0.5m";
const BADGE_CRIT = "0.25m";
const CATEGORY = "rp22-proximity";

function distToWalls(p, room) {
  const dxL = Math.abs(p.x - room.xMin);
  const dxR = Math.abs(room.xMax - p.x);
  const dyB = Math.abs(p.y - room.yMin);
  const dyT = Math.abs(room.yMax - p.y);
  const nearest = Math.min(dxL, dxR, dyB, dyT);
  return {dxL, dxR, dyB, dyT, nearest};
}

function distToCorners(p, room) {
  const corners = [
    {x: room.xMin, y: room.yMin}, {x: room.xMax, y: room.yMin},
    {x: room.xMin, y: room.yMax}, {x: room.xMax, y: room.yMax},
  ];
  const d = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
  return Math.min(...corners.map(c => d(p, c)));
}

function generateTooltipText(speaker, dWall, dCorner, severity) {
  const inWallNote = speaker.type === "in-wall" ? 
    " For in-wall/baffle installs, ensure >150 mm setback to perpendicular surfaces and execute proper damping/isolation (RP22 §5.9.3)." : "";
  
  return `${speaker.label || speaker.id}: ${severity} — too close to boundary.
Nearest wall: ${dWall.toFixed(1)} m; nearest corner: ${dCorner.toFixed(1)} m.
RP22 notes: Placing speakers near walls/corners increases boundary gain and early reflections, degrading timbre, localization, and imaging. Avoid <0.5 m to adjacent walls and corners; use absorption/diffusion at first reflection points when proximity is unavoidable. See RP22 §5.5–5.7 (placement/angles), §5.9 (directivity/orientation), §9.2.2 (early reflection control), §7.3.2 (corners as LF pressure maxima).
Recommended: Relocate ≥0.5 m from boundaries, or keep position and treat first reflection points; avoid corner adjacency.${inWallNote}`;
}

function generateReportBody(speaker, dWall, dCorner, severity) {
  const tooltipText = generateTooltipText(speaker, dWall, dCorner, severity);
  const actionText = severity === "Critical" 
    ? "Move this speaker at least 0.25–0.50 m further from the nearest boundary."
    : "Prefer ≥0.50 m clearance; if not possible, add absorption/diffusion at the mirror points.";
  
  return `${tooltipText}\n\n${actionText}`;
}

export function checkRP22ProximityWarnings({
  room,
  speakers,
  ui,
  proximityWarningsEnabled = true
}) {
  // 1. If proximity warnings are disabled, do nothing
  if (!proximityWarningsEnabled) {
    return;
  }

  // 2. Clear existing proximity warnings
  if (ui.clearCategory) {
    ui.clearCategory(CATEGORY);
  }

  // 3. Check each speaker
  speakers.forEach(speaker => {
    // Skip subwoofers
    if (speaker.type === "subwoofer" || speaker.type === "sub" || (speaker.role && speaker.role.includes("SUB"))) {
      return;
    }

    // Skip speakers without valid position
    if (!speaker.position || typeof speaker.position.x !== 'number' || typeof speaker.position.y !== 'number') {
      return;
    }

    const p = { x: speaker.position.x, y: speaker.position.y };
    const w = distToWalls(p, room);
    const c = distToCorners(p, room);
    const minEdge = Math.min(w.nearest, c);

    let severity = null;
    let badgeText = null;
    let fillColor = null;

    if (minEdge < THRESHOLD_CRIT) {
      severity = "Critical";
      badgeText = BADGE_CRIT;
      fillColor = "#D92D20";
    } else if (minEdge < THRESHOLD_WARN) {
      severity = "Warning";
      badgeText = BADGE_WARN;
      fillColor = "#F79009";
    }

    if (severity) {
      // Set visual styling
      if (ui.setSpeakerStyle) {
        ui.setSpeakerStyle(speaker.id, {
          fill: fillColor,
          ring: fillColor,
          badgeText: badgeText
        });
      }

      // Set tooltip
      const tooltipText = generateTooltipText(speaker, w.nearest, c, severity);
      if (ui.setTooltip) {
        ui.setTooltip(speaker.id, tooltipText);
      }

      // Add report item
      if (ui.addReportItem) {
        const reportBody = generateReportBody(speaker, w.nearest, c, severity);
        ui.addReportItem({
          id: `${speaker.id}-prox`,
          severity: severity.toLowerCase(),
          title: "Speaker too close to wall/corner",
          body: reportBody,
          category: CATEGORY
        });
      }
    }
  });
}