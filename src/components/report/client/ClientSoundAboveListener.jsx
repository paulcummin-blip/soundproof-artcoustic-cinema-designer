/**
 * ClientSoundAboveListener
 * --------------------------
 * Pure SVG renderer for Client Visual Report Page 2.
 *
 * Shows: floor, ceiling, seated listener, RSP ear position, front/middle/rear
 * overhead rows, rays from ear to each row, actual elevation angle labels,
 * adjacent-row gap arcs, pale overhead continuity shading, preferred
 * placement bands, one compact P9 status card.
 *
 * Uses ONLY the p9Snapshot from useClientReportAuthority — no engine hooks.
 * Client-friendly angle labels ("45° forward", "90° overhead", "45° rear")
 * are display-only; production angles are retained internally for P9 maths.
 */

import React, { useMemo } from "react";

// ── Status copy ────────────────────────────────────────────────────────────
const STATUS_COPY = {
  L4: { label: "Excellent overhead continuity", color: "#213428" },
  L3: { label: "Very good overhead continuity", color: "#3E4349" },
  L2: { label: "Good overhead continuity", color: "#625143" },
  L1: { label: "Noticeable overhead gaps", color: "#4A230F" },
  Fail: { label: "Improvement recommended", color: "#4A230F" },
  "—": { label: "Improvement recommended", color: "#C1B6AD" },
};

function getStatusInfo(level) {
  return STATUS_COPY[level] || STATUS_COPY["—"];
}

// ── Row metadata ───────────────────────────────────────────────────────────
const ROW_COLORS = {
  front: "#625143",
  mid: "#213428",
  rear: "#4A230F",
};

const ROW_LABELS = {
  front: "45° forward",
  mid: "90° overhead",
  rear: "45° rear",
};

function getRowName(role) {
  const r = String(role || "").toUpperCase();
  if (r.startsWith("TF")) return "front";
  if (r.startsWith("TM")) return "mid";
  if (r.startsWith("TR") || r.startsWith("TB")) return "rear";
  return "other";
}

export default function ClientSoundAboveListener({ p9Snapshot, roomDims }) {
  const L = Number(roomDims?.lengthM) || 6.0;
  const H = Number(roomDims?.heightM) || 2.4;

  // SVG canvas dimensions
  const PADDING_M = 0.6;
  const totalW = L + PADDING_M * 2;
  const totalH = H + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalH / totalW));
  const SCALE = SVG_W / totalW;

  // Coordinate transform: room (y, z) → SVG (px, py)
  // y: front(screen)→back, z: floor→ceiling (SVG y inverted)
  const toPx = (y, z) => ({
    px: (y + PADDING_M) * SCALE,
    py: SVG_H - (z + PADDING_M) * SCALE,
  });

  const rsp = p9Snapshot?.rsp;
  const earHeightM = p9Snapshot?.earHeightM || 1.2;
  const rowGroups = p9Snapshot?.rowGroups || [];
  const mergedGaps = p9Snapshot?.mergedGaps || [];
  const upperSpeakers = p9Snapshot?.upperSpeakers || [];
  const zoneBands = p9Snapshot?.zoneBands;
  const level = p9Snapshot?.level || "—";
  const worstGapDeg = p9Snapshot?.worstGapDeg;
  const statusInfo = getStatusInfo(level);

  // Ear position in SVG coords
  const earPx = rsp ? toPx(rsp.y, earHeightM) : null;

  // Polar to SVG (elevation angle from horizontal, 0°=behind, 90°=above, 180°=front)
  const polarToSvg = (cx, cy, radiusPx, elevDeg) => {
    const rad = (elevDeg * Math.PI) / 180;
    return {
      x: cx + radiusPx * Math.cos(rad),
      y: cy - radiusPx * Math.sin(rad),
    };
  };

  // ── Preferred placement bands ────────────────────────────────────────────
  const placementBands = useMemo(() => {
    if (!zoneBands) return [];
    const bands = [];
    const zoneMap = { front: zoneBands.frontZone, mid: zoneBands.midZone, rear: zoneBands.backZone };
    for (const [rowName, zone] of Object.entries(zoneMap)) {
      if (!zone || !zone.active) continue;
      const y1 = Number(zone.y1);
      const y2 = Number(zone.y2);
      if (!Number.isFinite(y1) || !Number.isFinite(y2) || y2 <= y1) continue;
      const left = toPx(y1, 0);
      const right = toPx(y2, 0);
      bands.push({
        rowName,
        x: left.px,
        w: right.px - left.px,
        color: ROW_COLORS[rowName] || "#213428",
      });
    }
    return bands;
  }, [zoneBands, SCALE, L, H]);

  // ── Continuity shading (wedge from first to last row) ─────────────────────
  const SHADING_RADIUS_M = useMemo(() => {
    const earToCeiling = Math.max(0.4, H - earHeightM);
    return Math.min(earToCeiling, L * 0.35);
  }, [H, L, earHeightM]);

  const continuityPath = useMemo(() => {
    if (!earPx || rowGroups.length < 2) return null;
    const first = rowGroups[0];
    const last = rowGroups[rowGroups.length - 1];
    const r = SHADING_RADIUS_M * SCALE;

    const startPt = polarToSvg(earPx.px, earPx.py, r, first.elevDeg);
    const endPt = polarToSvg(earPx.px, earPx.py, r, last.elevDeg);

    const sweepDeg = Math.abs(first.elevDeg - last.elevDeg);
    const largeArc = sweepDeg > 180 ? 1 : 0;

    return `M ${earPx.px} ${earPx.py} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y} Z`;
  }, [earPx, rowGroups, SHADING_RADIUS_M, SCALE]);

  // ── Gap arcs (between adjacent merged rows) ───────────────────────────────
  const gapArcs = useMemo(() => {
    if (!earPx || mergedGaps.length === 0) return [];
    const ARC_RADIUS_M = SHADING_RADIUS_M * 0.78;
    const r = ARC_RADIUS_M * SCALE;

    return mergedGaps.map((gap, i) => {
      const startPt = polarToSvg(earPx.px, earPx.py, r, gap.fromElevDeg);
      const endPt = polarToSvg(earPx.px, earPx.py, r, gap.toElevDeg);

      const midElev = (gap.fromElevDeg + gap.toElevDeg) / 2;
      const midPt = polarToSvg(earPx.px, earPx.py, r + 14, midElev);

      const isWorst = Number.isFinite(worstGapDeg) && Math.abs(gap.deg - worstGapDeg) < 0.5;
      const arcColor = isWorst ? "#4A230F" : "#625143";

      const sweepDeg = Math.abs(gap.toElevDeg - gap.fromElevDeg);
      const largeArc = sweepDeg > 180 ? 1 : 0;

      return {
        id: i,
        path: `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`,
        midPt,
        deg: gap.deg,
        fromRow: gap.fromRow,
        toRow: gap.toRow,
        isWorst,
        arcColor,
      };
    });
  }, [earPx, mergedGaps, worstGapDeg, SHADING_RADIUS_M, SCALE]);

  // ── Loading / empty state ────────────────────────────────────────────────
  if (!p9Snapshot || !earPx) {
    return (
      <div style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 48,
        textAlign: "center",
        color: "#625143",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        border: "1px solid #DCDBD6",
      }}>
        {p9Snapshot === null && upperSpeakers.length === 0
          ? "No overhead speakers configured for this layout."
          : "Preparing overhead resolution view…"}
      </div>
    );
  }

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 16,
      padding: 32,
      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
      border: "1px solid #DCDBD6",
    }}>
      {/* ── Heading hierarchy: Category → Visual title → Parameter reference ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          margin: 0,
          fontSize: 34,
          fontWeight: 300,
          color: "#213428",
          letterSpacing: "0.01em",
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          Spatial Resolution
        </h1>
        <h2 style={{
          margin: "6px 0 0 0",
          fontSize: 22,
          fontWeight: 500,
          color: "#3E4349",
          letterSpacing: "0.01em",
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          Sound Above the Listener
        </h2>
        <p style={{
          margin: "4px 0 0 0",
          fontSize: 12,
          color: "#625143",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          RP22 Parameter 9 — Overhead speaker spacing
        </p>
      </div>

      {/* ── SVG canvas ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: 24,
      }}>
        <svg
          width="100%"
          maxWidth={SVG_W}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ maxWidth: SVG_W, width: "100%", height: "auto" }}
        >
          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="#F8F8F7" rx="12" />

          {/* ── Preferred placement bands (near ceiling) ── */}
          {placementBands.map((band, i) => {
            const ceilingPy = toPx(0, H).py;
            const bandBottomPy = toPx(0, H * 0.65).py;
            const bandH = ceilingPy - bandBottomPy;
            if (bandH <= 0) return null;
            return (
              <rect
                key={`band-${i}`}
                x={band.x}
                y={ceilingPy}
                width={band.w}
                height={Math.abs(bandH)}
                fill={band.color}
                fillOpacity={0.08}
                rx={2}
              />
            );
          })}

          {/* ── Floor ── */}
          {(() => {
            const fl = toPx(0, 0);
            const fr = toPx(L, 0);
            return (
              <g>
                <line
                  x1={fl.px}
                  y1={fl.py}
                  x2={fr.px}
                  y2={fr.py}
                  stroke="#C1B6AD"
                  strokeWidth={2}
                />
                <text
                  x={fl.px}
                  y={fl.py + 16}
                  fill="#625143"
                  fontSize={10}
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.08em"
                >
                  FLOOR
                </text>
              </g>
            );
          })()}

          {/* ── Ceiling ── */}
          {(() => {
            const cl = toPx(0, H);
            const cr = toPx(L, H);
            return (
              <g>
                <line
                  x1={cl.px}
                  y1={cl.py}
                  x2={cr.px}
                  y2={cr.py}
                  stroke="#C1B6AD"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                <text
                  x={cr.px}
                  y={cl.py - 8}
                  fill="#625143"
                  fontSize={10}
                  textAnchor="end"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.08em"
                >
                  CEILING
                </text>
              </g>
            );
          })()}

          {/* ── Front / rear wall labels ── */}
          {(() => {
            const frontWall = toPx(0, H / 2);
            const rearWall = toPx(L, H / 2);
            return (
              <g>
                <text
                  x={frontWall.px + 4}
                  y={frontWall.py}
                  fill="#625143"
                  fontSize={10}
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.06em"
                  opacity={0.6}
                >
                  SCREEN
                </text>
                <text
                  x={rearWall.px - 4}
                  y={rearWall.py}
                  fill="#625143"
                  fontSize={10}
                  textAnchor="end"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.06em"
                  opacity={0.6}
                >
                  REAR
                </text>
              </g>
            );
          })()}

          {/* ── Continuity shading ── */}
          {continuityPath && (
            <path
              d={continuityPath}
              fill="#213428"
              fillOpacity={0.06}
              stroke="none"
            />
          )}

          {/* ── Gap arcs ── */}
          {gapArcs.map((arc) => (
            <g key={`gap-${arc.id}`}>
              <path
                d={arc.path}
                fill="none"
                stroke={arc.arcColor}
                strokeWidth={arc.isWorst ? 3 : 1.5}
                strokeOpacity={arc.isWorst ? 0.9 : 0.5}
                strokeDasharray={arc.isWorst ? "6 4" : "4 4"}
              />
              <text
                x={arc.midPt.x}
                y={arc.midPt.y}
                fill={arc.arcColor}
                fontSize={11}
                textAnchor="middle"
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                fontWeight={arc.isWorst ? 600 : 400}
              >
                {Math.round(arc.deg)}°
              </text>
            </g>
          ))}

          {/* ── Rays from ear to each overhead speaker ── */}
          {upperSpeakers.map((spk, i) => {
            const sp = toPx(spk.position.y, spk.position.z);
            return (
              <line
                key={`ray-${i}`}
                x1={earPx.px}
                y1={earPx.py}
                x2={sp.px}
                y2={sp.py}
                stroke="#625143"
                strokeWidth={1}
                strokeOpacity={0.25}
              />
            );
          })}

          {/* ── Overhead speakers ── */}
          {upperSpeakers.map((spk, i) => {
            const sp = toPx(spk.position.y, spk.position.z);
            const rowName = getRowName(spk.role);
            const color = ROW_COLORS[rowName] || "#625143";
            return (
              <g key={`spk-${i}`}>
                <circle
                  cx={sp.px}
                  cy={sp.py}
                  r={6}
                  fill={color}
                  stroke="#F8F8F7"
                  strokeWidth={1.5}
                />
                <text
                  x={sp.px}
                  y={sp.py - 12}
                  fill={color}
                  fontSize={10}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  fontWeight={600}
                >
                  {spk.role}
                </text>
              </g>
            );
          })}

          {/* ── Row angle labels (client-friendly) ── */}
          {rowGroups.map((row, i) => {
            const rowColor = ROW_COLORS[row.rowName] || "#625143";
            const label = ROW_LABELS[row.rowName] || "";
            // Place label near the row's average position
            const labelPos = toPx(row.avgY, row.avgZ);
            return (
              <g key={`row-label-${i}`}>
                <text
                  x={labelPos.px}
                  y={labelPos.py - 22}
                  fill={rowColor}
                  fontSize={11}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  fontWeight={600}
                >
                  {label}
                </text>
                <text
                  x={labelPos.px}
                  y={labelPos.py - 10}
                  fill="#625143"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                >
                  {Math.round(row.elevDeg)}°
                </text>
              </g>
            );
          })}

          {/* ── Listener marker (seated ear position) ── */}
          <g>
            {/* Head */}
            <circle
              cx={earPx.px}
              cy={earPx.py}
              r={5}
              fill="#213428"
            />
            {/* Shoulders */}
            <path
              d={`M ${earPx.px - 9} ${earPx.py + 14} Q ${earPx.px} ${earPx.py + 5} ${earPx.px + 9} ${earPx.py + 14}`}
              stroke="#213428"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
            {/* Label */}
            <text
              x={earPx.px}
              y={earPx.py + 28}
              fill="#213428"
              fontSize={11}
              textAnchor="middle"
              fontFamily="Didact Gothic, Century Gothic, sans-serif"
              fontWeight={600}
              letterSpacing="0.08em"
            >
              RSP
            </text>
          </g>
        </svg>
      </div>

      {/* ── Status card ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        background: "#F1F0EE",
        borderRadius: 12,
        border: `1px solid ${statusInfo.color}40`,
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: `${statusInfo.color}25`,
          border: `2px solid ${statusInfo.color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 700,
          color: statusInfo.color,
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          flexShrink: 0,
        }}>
          {level}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#213428",
            marginBottom: 4,
          }}>
            {statusInfo.label}
          </div>
          <div style={{
            fontSize: 13,
            color: "#3E4349",
            lineHeight: 1.5,
          }}>
            The overhead layout creates a clear and continuous sound path above the listener.
          </div>
        </div>
        {Number.isFinite(worstGapDeg) && (
          <div style={{
            textAlign: "right",
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 11,
              color: "#625143",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 2,
            }}>
              Largest gap
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: statusInfo.color,
            }}>
              {Math.round(worstGapDeg)}°
            </div>
          </div>
        )}
      </div>

      {/* ── Footnote ── */}
      <p style={{
        margin: "16px 0 0 0",
        fontSize: 11,
        color: "#625143",
        opacity: 0.6,
        fontStyle: "italic",
        textAlign: "center",
      }}>
        Side elevation shows vertical angular continuity only and does not imply SPL, dispersion, or measured acoustic coverage.
      </p>
    </div>
  );
}