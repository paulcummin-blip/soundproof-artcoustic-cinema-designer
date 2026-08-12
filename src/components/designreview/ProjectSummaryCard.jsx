/**
 * ProjectSummaryCard.jsx
 * ----------------------
 * Compact project/system identity card for the Design Review workspace.
 * Renders: Project, Client, Room, System, Screen, Seating
 * plus a small secondary line: Last updated / Report date.
 *
 * Uses only existing project entity fields — no new calculations.
 */

import React from "react";

const COLORS = {
  primary: "#213428",
  secondary: "#625143",
  body: "#3E4349",
  muted: "#9B8E82",
  border: "#E6E4DD",
  label: "#9B8E82",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function parseRoomDims(project) {
  if (project?.roomDims) {
    try {
      const parsed = typeof project.roomDims === "string" ? JSON.parse(project.roomDims) : project.roomDims;
      if (parsed && Number.isFinite(parsed.widthM) && Number.isFinite(parsed.lengthM)) {
        return {
          width: parsed.widthM,
          length: parsed.lengthM,
          height: parsed.heightM,
        };
      }
    } catch {}
  }
  return {
    width: Number(project?.room_width) || null,
    length: Number(project?.room_length) || null,
    height: Number(project?.room_height) || null,
  };
}

function countSeating(project) {
  // Prefer seats_per_row_by_row if available
  if (Array.isArray(project?.seats_per_row_by_row) && project.seats_per_row_by_row.length > 0) {
    const rows = project.seats_per_row_by_row.length;
    const total = project.seats_per_row_by_row.reduce((sum, n) => sum + (Number(n) || 0), 0);
    return { rows, total };
  }
  // Fallback: count from seating_positions array
  if (Array.isArray(project?.seating_positions) && project.seating_positions.length > 0) {
    const rowSet = new Set();
    project.seating_positions.forEach((s) => {
      if (s?.row != null) rowSet.add(s.row);
    });
    return { rows: rowSet.size || 1, total: project.seating_positions.length };
  }
  return { rows: 0, total: 0 };
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: COLORS.label,
        fontFamily: FONT_BODY,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: COLORS.primary,
        fontFamily: FONT_HEADING,
        marginTop: 2,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

export default function ProjectSummaryCard({ project }) {
  if (!project) return null;

  const room = parseRoomDims(project);
  const seating = countSeating(project);
  const dolbyConfig = project?.dolby_config || "—";
  const screenSize = project?.screen_size ? `${project.screen_size}"` : "—";
  const aspectRatio = project?.aspect_ratio || "16:9";

  const roomStr = [room.width, room.length, room.height].every(v => v != null)
    ? `${room.width}m × ${room.length}m × ${room.height}m`
    : "—";

  const seatingStr = seating.total > 0
    ? `${seating.rows} row${seating.rows !== 1 ? "s" : ""} · ${seating.total} seat${seating.total !== 1 ? "s" : ""}`
    : "—";

  const screenStr = screenSize !== "—" ? `${screenSize} · ${aspectRatio}` : "—";

  const reportDate = formatDate(project?.created_date);

  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: "16px 20px",
    }}>
      {/* Fields grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: "12px 20px",
      }}>
        <Field label="Project" value={project?.name} />
        <Field label="Client" value={project?.client_name} />
        <Field label="Room" value={roomStr} />
        <Field label="System" value={`${dolbyConfig} Dolby Atmos`} />
        <Field label="Screen" value={screenStr} />
        <Field label="Seating" value={seatingStr} />
      </div>

      {/* Secondary metadata line */}
      <div style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 10,
          color: COLORS.muted,
          fontFamily: FONT_BODY,
        }}>
          Last updated: {formatDate(project?.updated_date)}
        </span>
        <span style={{
          fontSize: 10,
          color: COLORS.muted,
          fontFamily: FONT_BODY,
        }}>
          Report date: {reportDate}
        </span>
      </div>
    </div>
  );
}