import React, { useMemo } from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Roles displayed in front elevation
const FRONT_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const canonFront = (role) => {
  const map = { L: "FL", C: "FC", R: "FR", FL: "FL", FC: "FC", FR: "FR" };
  return map[String(role || "").toUpperCase()] || null;
};

// Convert screen config to viewable width/height in metres
function screenDimsM(screen) {
  if (!screen) return { w: 2.54, h: 1.43 };

  // TV preset widths (inches)
  const TV_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
  let wInches = 0;

  if (screen.tvPresetKey && TV_INCHES[screen.tvPresetKey]) {
    wInches = TV_INCHES[screen.tvPresetKey];
  } else if (screen.manualMode && Number(screen.manualWidthM) > 0) {
    return { w: Number(screen.manualWidthM), h: Number(screen.manualHeightM) || Number(screen.manualWidthM) * (9 / 16) };
  } else {
    wInches = Number(screen.visibleWidthInches) || 100;
  }

  const wM = wInches * 0.0254;
  const ar = screen.aspectRatio === "2.35:1" ? (2.35 / 1) : (16 / 9);
  return { w: wM, h: wM / ar };
}

export default function FrontElevation({ dimensions, screen, placedSpeakers = [], frontSubs = [], roomElements = [] }) {
  const roomW = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const roomH = Number(dimensions?.heightM ?? dimensions?.height) || 2.8;

  // Internal coordinate system — fixed virtual canvas
  const SVG_W = 640;
  const PADDING = 36;
  const LABEL_TOP = 56; // increased top padding — title breathing room + label rows
  const LABEL_LEFT = 36;
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (roomH / roomW));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const offsetX = PADDING + LABEL_LEFT;
  const offsetY = PADDING + LABEL_TOP;

  // room-metres → SVG px
  const rx = (m) => offsetX + (m / roomW) * drawW;
  const ry = (m) => offsetY + drawH - (m / roomH) * drawH; // y=0 is floor

  // Screen
  const screenData = useMemo(() => screenDimsM(screen), [screen]);
  const screenFloorM = Number(screen?.heightFromFloorM) || 0.5;
  const screenCenterX = roomW / 2;
  // Border/frame: use persisted value, else safe visual fallback
  const hasBorderData = Number(screen?.borderThicknessM) > 0;
  const borderM = hasBorderData ? Number(screen.borderThicknessM) : 0.05; // 5cm fallback
  const overallW = screenData.w + borderM * 2;
  const overallH = screenData.h + borderM * 2;

  // LCR speakers — always returns a plain array
  const lcrSpeakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter(s => canonFront(s?.role))
      .map(s => {
        const meta = getSpeakerModelMeta(s?.model);
        const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.20;
        const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.20;
        const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
        const z = Number.isFinite(s?.position?.z) ? s.position.z : 1.2;
        const drawingShapes = Array.isArray(meta?.frontElevationDrawing?.shapes) ? meta.frontElevationDrawing.shapes : null;
        return { role: canonFront(s.role), x, z, wM, hM, label: canonFront(s.role), drawingShapes };
      });
  }, [placedSpeakers, roomW]);

  // Front subs — always returns a plain array
  const subItems = useMemo(() => {
    const safeSubs = Array.isArray(frontSubs) ? frontSubs : [];
    return safeSubs.map((s, i) => {
      const meta = getSpeakerModelMeta(s?.model);
      const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.35;
      const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.35;
      const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
      const z = Number.isFinite(s?.position?.z) ? s.position.z : hM / 2;
      return { x, z, wM, hM, label: `SUB${i + 1}` };
    });
  }, [frontSubs, roomW]);

  // Projector element from roomElements
  const projectorEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'projector') || null;
  }, [roomElements]);

  // Riser element from roomElements
  const riserEl = useMemo(() => {
    if (!Array.isArray(roomElements)) return null;
    return roomElements.find(el => el?.type === 'riser') || null;
  }, [roomElements]);

  // Engineering drawing palette — premium technical style
  const ROOM_FILL = "#F4F3F0";
  const ROOM_STROKE = "#B0AEA8";  // lighter grey, less dominant
  const SCREEN_FILL = "#2C2C2C";
  const SCREEN_STROKE = "#1a1a1a";
  const SPEAKER_FILL = "#213428";
  const SPEAKER_STROKE = "#152420";
  const SUB_FILL = "#4A3B30";      // darker than before for contrast
  const SUB_STROKE = "#2E241D";
  const FLOOR_COLOR = "#8C8880";   // construction floor line
  const LABEL_COLOR = "#4A4540";
  const DIM_COLOR = "#9B9890";
  const PROJ_FILL = "#3E4349";
  const RISER_FILL = "rgba(180,170,160,0.18)";
  const RISER_STROKE = "#9B9890";

  /**
   * drawSpeakerFront — reusable helper for rendering a single speaker
   * in the XZ front-elevation plane.
   *
   * @param {string}  key    - React key
   * @param {number}  cx     - SVG centre X (pixels)
   * @param {number}  cy     - SVG centre Y (pixels, position.z mapped via ry)
   * @param {number}  sw     - rendered width in SVG pixels
   * @param {number}  sh     - rendered height in SVG pixels
   * @param {boolean} isRound - true → circle, false → rectangle
   * @param {string}  fill   - body fill colour
   * @param {string}  stroke - body stroke colour
   * @param {string}  label  - text label above speaker
   * @param {number}  zM     - acoustic centre height in metres (for z= annotation)
   */
  const drawSpeakerFront = ({ key, cx, cy, sw, sh, isRound, fill, stroke, label, zM, shapes }) => {
    const sx = cx - sw / 2;
    const sy = cy - sh / 2;

    // Render product-specific shapes if provided, otherwise fallback to simple geometry
    const hasShapes = Array.isArray(shapes) && shapes.length > 0 && !isRound;

    const renderShapes = () => shapes.map((s, i) => {
      if (!s || !s.type) return null;
      const sFill = s.specialFill ?? (s.fill ? fill : "none");
      const sStroke = s.stroke ? stroke : "none";
      if (s.type === "rect") {
        return (
          <rect
            key={i}
            x={sx + s.x * sw}
            y={sy + s.y * sh}
            width={s.w * sw}
            height={s.h * sh}
            fill={sFill}
            stroke={sStroke}
            strokeWidth={0.8}
            rx={1}
          />
        );
      }
      if (s.type === "circle") {
        const rPx = s.r * Math.min(sw, sh);
        return (
          <circle
            key={i}
            cx={sx + s.cx * sw}
            cy={sy + s.cy * sh}
            r={Math.max(1.5, rPx)}
            fill={sFill}
            stroke={sStroke}
            strokeWidth={0.8}
          />
        );
      }
      return null;
    });

    return (
      <g key={key}>
        {/* Body: product drawing or simple fallback */}
        {hasShapes ? (
          <g opacity={0.92}>
            {/* Cabinet outline */}
            <rect x={sx} y={sy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2} rx={2} opacity={0.90} />
            {/* Product-specific detail shapes */}
            {renderShapes()}
          </g>
        ) : (
          isRound
            ? <circle cx={cx} cy={cy} r={Math.max(6, sw / 2)} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={0.90} />
            : <rect x={sx} y={sy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2} rx={2} opacity={0.90} />
        )}
        {/* Acoustic centre dot — only when no shapes (shapes include their own marker) */}
        {!hasShapes && <circle cx={cx} cy={cy} r={1.8} fill="rgba(255,255,255,0.55)" />}
        {/* Label above */}
        <text x={cx} y={sy - 5} textAnchor="middle" fontSize={9} fill={LABEL_COLOR} fontWeight={700} letterSpacing="0.04em">
          {label}
        </text>
        {/* Z-height annotation below */}
        <text x={cx} y={sy + sh + 10} textAnchor="middle" fontSize={7} fill={DIM_COLOR}>
          z={zM.toFixed(2)}m
        </text>
      </g>
    );
  };

  return (
    <div style={{ width: "100%", padding: 16, background: "#F8F8F7", boxSizing: "border-box" }}>
      {/* Responsive wrapper: aspect-ratio drives height from available width */}
      <div style={{ width: "100%", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <text x={offsetX + drawW / 2} y={14} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_COLOR} letterSpacing="0.06em">
          FRONT ELEVATION
        </text>

        {/* Room rectangle — lighter stroke, thinner */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawW}
          height={drawH}
          fill={ROOM_FILL}
          stroke={ROOM_STROKE}
          strokeWidth={0.8}
        />

        {/* Floor construction line */}
        <line
          x1={offsetX - 6}
          y1={offsetY + drawH}
          x2={offsetX + drawW + 6}
          y2={offsetY + drawH}
          stroke={FLOOR_COLOR}
          strokeWidth={2}
          strokeLinecap="square"
        />
        {/* Floor hatch marks (engineering convention) */}
        {Array.from({ length: Math.floor(drawW / 14) + 1 }, (_, i) => (
          <line
            key={`hatch-${i}`}
            x1={offsetX + i * 14}
            y1={offsetY + drawH}
            x2={offsetX + i * 14 - 6}
            y2={offsetY + drawH + 7}
            stroke={FLOOR_COLOR}
            strokeWidth={0.7}
            opacity={0.55}
          />
        ))}

        {/* Dimension: room width */}
        <line x1={offsetX} y1={offsetY - 10} x2={offsetX + drawW} y2={offsetY - 10} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX} y1={offsetY - 14} x2={offsetX} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX + drawW} y1={offsetY - 14} x2={offsetX + drawW} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text x={offsetX + drawW / 2} y={offsetY - 13} textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
          {roomW.toFixed(2)}m
        </text>

        {/* Dimension: room height (rotated left side) */}
        <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY} x2={offsetX - 6} y2={offsetY} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY + drawH} x2={offsetX - 6} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text
          x={offsetX - 18}
          y={offsetY + drawH / 2}
          textAnchor="middle"
          fontSize={9}
          fill={DIM_COLOR}
          transform={`rotate(-90, ${offsetX - 18}, ${offsetY + drawH / 2})`}
        >
          {roomH.toFixed(2)}m
        </text>

        {/* Screen: overall frame (black), then viewable area (white) */}
        {(() => {
          // Overall frame rect (viewable + border on all sides)
          const oW = (overallW / roomW) * drawW;
          const oH = (overallH / roomH) * drawH;
          const ox = rx(screenCenterX) - oW / 2;
          const oy = ry(screenFloorM + overallH);

          // Viewable rect
          const sw = (screenData.w / roomW) * drawW;
          const sh = (screenData.h / roomH) * drawH;
          const sx = rx(screenCenterX) - sw / 2;
          const sy = ry(screenFloorM + overallH - borderM) - (sh);
          // sy = top of viewable area in SVG coords
          const syTop = ry(screenFloorM + overallH - borderM);

          const labelViewable = `${(screenData.w * 100).toFixed(0)} × ${(screenData.h * 100).toFixed(0)} cm (viewable)`;
          const labelOverall = `${(overallW * 100).toFixed(0)} × ${(overallH * 100).toFixed(0)} cm overall${!hasBorderData ? ' (est. frame)' : ''}`;

          return (
            <g>
              {/* Black frame */}
              <rect x={ox} y={oy} width={oW} height={oH} fill={SCREEN_STROKE} stroke={SCREEN_STROKE} strokeWidth={1} rx={2} />
              {/* White viewable area */}
              <rect x={sx} y={syTop} width={sw} height={sh} fill="#fff" stroke="#555" strokeWidth={0.5} />
              {/* Screen labels: inside white area top-left if there is room, else below frame */}
              {sw >= 90 && sh >= 36 ? (
                // Enough room — render inside top-left of the white viewable area
                <g>
                  <text x={sx + 5} y={syTop + 11} textAnchor="start" fontSize={7} fill="#888">
                    {labelOverall}
                  </text>
                  <text x={sx + 5} y={syTop + 21} textAnchor="start" fontSize={7} fill="#444" fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              ) : (
                // Too small — render below the frame, centred
                <g>
                  <text x={rx(screenCenterX)} y={oy + oH + 12} textAnchor="middle" fontSize={7} fill={DIM_COLOR}>
                    {labelOverall}
                  </text>
                  <text x={rx(screenCenterX)} y={oy + oH + 22} textAnchor="middle" fontSize={7} fill={LABEL_COLOR} fontWeight={600}>
                    {labelViewable}
                  </text>
                </g>
              )}
            </g>
          );
        })()}

        {/* ── drawSpeakerFront ─────────────────────────────────────────────────
           Internal helper: renders a single speaker in the XZ (front elevation)
           plane. rect for rectangular models, circle for round models.
           Designed to be the single rendering path for all front-stage speakers,
           ready to accept product SVG art in future without changing call sites.
           ──────────────────────────────────────────────────────────────────── */}

        {/* Riser outline if element exists */}
        {riserEl && (() => {
          const rW_m = Number(riserEl.length_m) || Number(riserEl.width) || roomW * 0.6;
          const rH_m = Number(riserEl.height_m) || 0.20;
          const rX_m = Number(riserEl.pos_m) || (roomW / 2 - rW_m / 2);
          const rPx_w = (rW_m / roomW) * drawW;
          const rPx_h = (rH_m / roomH) * drawH;
          return (
            <g opacity={0.9}>
              <rect
                x={rx(rX_m)}
                y={ry(rH_m)}
                width={rPx_w}
                height={rPx_h}
                fill={RISER_FILL}
                stroke={RISER_STROKE}
                strokeWidth={0.8}
                strokeDasharray="3 2"
              />
              <text x={rx(rX_m + rW_m / 2)} y={ry(rH_m) - 3} textAnchor="middle" fontSize={7} fill={DIM_COLOR} letterSpacing="0.05em">
                RISER
              </text>
            </g>
          );
        })()}

        {/* LCR Speakers — via drawSpeakerFront helper */}
        {(Array.isArray(lcrSpeakers) ? lcrSpeakers : []).map((spk) =>
          drawSpeakerFront({
            key: spk.role,
            cx: rx(spk.x),
            cy: ry(spk.z),
            sw: Math.max(12, (spk.wM / roomW) * drawW * 1.20),
            sh: Math.max(12, (spk.hM / roomH) * drawH * 1.20),
            isRound: spk.round === true,
            fill: SPEAKER_FILL,
            stroke: SPEAKER_STROKE,
            label: spk.label,
            zM: spk.z,
            shapes: spk.drawingShapes ?? null,
          })
        )}

        {/* Front subwoofers — via drawSpeakerFront helper */}
        {(Array.isArray(subItems) ? subItems : []).map((sub, i) =>
          drawSpeakerFront({
            key: `sub-${i}`,
            cx: rx(sub.x),
            cy: ry(sub.z),
            sw: Math.max(12, (sub.wM / roomW) * drawW * 1.15),
            sh: Math.max(12, (sub.hM / roomH) * drawH * 1.15),
            isRound: false,
            fill: SUB_FILL,
            stroke: SUB_STROKE,
            label: sub.label,
            zM: sub.z,
          })
        )}

        {/* Projector element if present */}
        {projectorEl && (() => {
          const pX_m = Number.isFinite(Number(projectorEl.x_lens_m)) ? Number(projectorEl.x_lens_m) : (roomW / 2);
          const pZ_m = Number.isFinite(Number(projectorEl.z_lens_m)) ? Number(projectorEl.z_lens_m) : (roomH - 0.3);
          const pW_m = Number(projectorEl.body_width_m) || 0.35;
          const pD_m = Number(projectorEl.body_depth_m) || 0.25;
          const pW_px = Math.max(16, (pW_m / roomW) * drawW);
          const pD_px = Math.max(10, (pD_m / roomH) * drawH);
          const pX_px = rx(pX_m) - pW_px / 2;
          const pY_px = ry(pZ_m) - pD_px / 2;
          return (
            <g opacity={0.88}>
              <rect x={pX_px} y={pY_px} width={pW_px} height={pD_px} fill={PROJ_FILL} stroke="#222" strokeWidth={1} rx={2} />
              {/* Lens circle */}
              <circle cx={rx(pX_m)} cy={ry(pZ_m)} r={Math.max(3, pD_px * 0.28)} fill="#888" stroke="#555" strokeWidth={0.8} />
              <text x={rx(pX_m)} y={pY_px - 4} textAnchor="middle" fontSize={8} fill={DIM_COLOR} letterSpacing="0.05em">
                PROJ
              </text>
            </g>
          );
        })()}

        {/* Empty state hint */}
        {lcrSpeakers.length === 0 && frontSubs.length === 0 && (
          <text x={offsetX + drawW / 2} y={offsetY + drawH / 2} textAnchor="middle" fontSize={11} fill={DIM_COLOR}>
            Add speakers in the Controls panel
          </text>
        )}
      </svg>
      </div>
    </div>
  );
}