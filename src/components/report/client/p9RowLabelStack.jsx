/**
 * p9RowLabelStack
 * ---------------
 * Shared P9 overhead row label stack used by both the screen
 * (ClientSoundAboveListener) and print (PrintP9Content) renderers
 * so they cannot drift apart.
 *
 * For each visible overhead row, renders exactly one label stack:
 *   1. Row speaker-role label  — markerY - 48  (highest)
 *   2. Positional heading       — markerY - 30
 *   3. (speaker marker is drawn separately by the parent)
 *   4. Calculated elevation angle — markerY + 20
 *
 * All text is horizontally centred over the row marker.
 */

import React from "react";

export const P9_ROW_COLORS = {
  front: "#625143",
  mid: "#213428",
  rear: "#4A230F",
};

export const P9_ROW_LABELS = {
  front: "45° forward",
  mid: "90° overhead",
  rear: "45° rear",
};

export const P9_ROW_ROLE_LABELS = {
  front: "TFL / TFR",
  mid: "TML / TMR",
  rear: "TRL / TRR",
};

export const P9_LABEL_OFFSETS = {
  roleLabel: -48,
  positionalHeading: -30,
  elevationAngle: 20,
};

export const P9_FONT_FAMILY = "Didact Gothic, Century Gothic, sans-serif";

/**
 * Renders the label stack for one overhead row.
 *
 * @param {Object} row - representative row ({ rowName, avgY, avgZ, elevDeg })
 * @param {Function} toPx - coordinate converter (y, z) → { px, py }
 * @param {string} rowColor - colour for role label + heading
 */
export default function P9RowLabelStack({ row, toPx, rowColor }) {
  if (!row || !toPx) return null;
  const labelPos = toPx(row.avgY, row.avgZ);
  const roleLabel = P9_ROW_ROLE_LABELS[row.rowName] || "";
  const heading = P9_ROW_LABELS[row.rowName] || "";

  return (
    <g>
      {/* 1. Role label — highest */}
      <text
        x={labelPos.px}
        y={labelPos.py + P9_LABEL_OFFSETS.roleLabel}
        fill={rowColor}
        fontSize={10}
        textAnchor="middle"
        fontFamily={P9_FONT_FAMILY}
      >
        {roleLabel}
      </text>
      {/* 2. Positional heading */}
      <text
        x={labelPos.px}
        y={labelPos.py + P9_LABEL_OFFSETS.positionalHeading}
        fill={rowColor}
        fontSize={11}
        textAnchor="middle"
        fontFamily={P9_FONT_FAMILY}
        fontWeight={600}
      >
        {heading}
      </text>
      {/* 4. Calculated elevation angle — below marker */}
      <text
        x={labelPos.px}
        y={labelPos.py + P9_LABEL_OFFSETS.elevationAngle}
        fill="#625143"
        fontSize={9}
        textAnchor="middle"
        fontFamily={P9_FONT_FAMILY}
      >
        {Math.round(row.elevDeg)}°
      </text>
    </g>
  );
}