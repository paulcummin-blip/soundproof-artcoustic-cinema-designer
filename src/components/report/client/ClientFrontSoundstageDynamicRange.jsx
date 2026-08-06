/**
 * ClientFrontSoundstageDynamicRange
 * ---------------------------------
 * Client-facing Visual Report page — Front Soundstage Dynamic Capability.
 *
 * RP22 Parameter 12 — Screen Speakers SPL Capability at RSP.
 * P12 is a ROOM parameter, measured at the Reference Seating Position.
 *
 * The shaded horizontal bands in the drawing are a purely visual explanation
 * of how dynamic capability changes with listening distance — they are NOT SPL
 * contours and no acoustic transition is implied at any boundary. No text is
 * rendered inside the drawing.
 *
 * The legend (band labels) and the result panel follow the ACTIVE P12 target
 * basis (Minimum / Recommended) — the same authority as the App compliance
 * panel and the Technical Report. The achieved FL/FC/FR SPL and the achieved
 * minimum SPL do NOT change with the target basis; the RP22 level and the
 * threshold band labels DO.
 *
 * The component never grades P12 — it renders what the selector provides.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React, { useMemo } from "react";

// ── Front-soundstage capability bands (distance from screen wall, % of length) ──
// Purely visual — lightest at the front, stronger toward the back.
const ZONES = [
  { key: "below-102", from: 0.80, to: 1.00, fill: "rgba(74, 35, 15, 0.20)" },
  { key: "l1",        from: 0.60, to: 0.80, fill: "rgba(98, 81, 67, 0.14)" },
  { key: "l2",        from: 0.40, to: 0.60, fill: "rgba(98, 81, 67, 0.08)" },
  { key: "l3",        from: 0.20, to: 0.40, fill: "rgba(33, 52, 40, 0.05)" },
  { key: "l4",        from: 0.00, to: 0.20, fill: "rgba(33, 52, 40, 0.02)" },
];

export default function ClientFrontSoundstageDynamicRange({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  screen,
  placedSpeakers,
  fl,
  fc,
  fr,
  minimum,
  level,
  bandLabels,
  targetBasisLabel,
  resultHeading,
  resultExplanation,
  print,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const { svgW, svgH, toPx } = useMemo(() => {
    const PADDING_M = 0.6;
    const totalW = W + PADDING_M * 2;
    const totalL = L + PADDING_M * 2;
    const SVG_W = 760;
    const SVG_H = Math.round(SVG_W * (totalL / totalW));
    const SCALE = SVG_W / totalW;
    const toPx = (x, y) => ({
      px: (x + PADDING_M) * SCALE,
      py: (y + PADDING_M) * SCALE,
    });
    return { svgW: SVG_W, svgH: SVG_H, toPx };
  }, [W, L]);

  const plotSeats = useMemo(
    () =>
      (Array.isArray(seats) ? seats : [])
        .map((s) => {
          const x = Number(s.x);
          const y = Number(s.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { id: s.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
        })
        .filter(Boolean),
    [seats]
  );

  // RSP marker
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspMatchesSeat =
    rspValid && plotSeats.some((s) => Math.abs(s.x - rspX) < 0.01 && Math.abs(s.y - rspY) < 0.01);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Screen (front wall)
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  // LCR speaker positions + SPL labels
  const splByRole = { FL: fl?.formatted, FC: fc?.formatted, FR: fr?.formatted };
  const lcrSpeakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter((s) => {
        const r = String(s?.role || "").toUpperCase();
        return r === "FL" || r === "FC" || r === "FR" || r === "L" || r === "C" || r === "R";
      })
      .filter((s) => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y))
      .map((s) => {
        const r = String(s.role).toUpperCase();
        const canon = r === "L" ? "FL" : r === "C" ? "FC" : r === "R" ? "FR" : r;
        return { role: canon, x: Number(s.position.x), y: Number(s.position.y) };
      });
  }, [placedSpeakers]);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  if (!rspValid || plotSeats.length === 0) return null;

  const containerStyle = print
    ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0", width: "100%" }
    : {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: 32,
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      };

  const legend = Array.isArray(bandLabels) && bandLabels.length === 5 ? bandLabels : [];

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy: Category → Parameter reference (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
          <h1 style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
            textAlign: "center",
          }}>
            Spatial Resolution
          </h1>
          <p style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}>
            RP22 Parameter 12 — Screen Speakers SPL Capability at RSP
          </p>
        </div>
      )}

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="client-report-print-svg"
        style={print
          ? { width: "100%", height: "auto", maxHeight: "none" }
          : { width: "100%", maxWidth: 600, height: "auto" }
        }
      >
        {/* ── Nested capability bands (visual only — no text inside the drawing) ── */}
        {ZONES.map((zone) => {
          const y0 = screenY + L * zone.from;
          const y1 = screenY + L * zone.to;
          const tl = toPx(0, y0);
          const br = toPx(W, y1);
          return (
            <rect
              key={zone.key}
              x={roomTopLeft.px}
              y={tl.py}
              width={roomBottomRight.px - roomTopLeft.px}
              height={br.py - tl.py}
              fill={zone.fill}
              stroke="none"
            />
          );
        })}

        {/* Room outline */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="none"
          stroke="#625143"
          strokeWidth={2}
        />

        {/* Screen */}
        <line
          x1={screenLeftPx.px}
          y1={screenLeftPx.py}
          x2={screenRightPx.px}
          y2={screenRightPx.py}
          stroke="#3E4349"
          strokeWidth={5}
        />
        <text
          x={(screenLeftPx.px + screenRightPx.px) / 2}
          y={screenLeftPx.py - 10}
          fill="#625143"
          fontSize={11}
          textAnchor="middle"
          fontFamily="Didact Gothic, Century Gothic, sans-serif"
          letterSpacing="0.06em"
        >
          SCREEN
        </text>

        {/* ── LCR speaker markers + small SPL labels (only text inside the drawing) ── */}
        {lcrSpeakers.map((spk) => {
          const sp = toPx(spk.x, spk.y);
          const splText = splByRole[spk.role];
          return (
            <g key={`lcr-${spk.role}`}>
              <rect
                x={sp.px - 5}
                y={sp.py - 5}
                width={10}
                height={10}
                fill="#3E4349"
                stroke="#F8F8F7"
                strokeWidth={1}
              />
              <text
                x={sp.px}
                y={sp.py + 22}
                fill="#3E4349"
                fontSize={9}
                textAnchor="middle"
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                letterSpacing="0.04em"
              >
                {spk.role}
              </text>
              {splText && (
                <text
                  x={sp.px}
                  y={sp.py + 34}
                  fill="#625143"
                  fontSize={8.5}
                  textAnchor="middle"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.02em"
                >
                  {splText}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Seats (geometry only — no per-seat SPL) ── */}
        {plotSeats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const isRspSeat = rspMatchesSeat && Math.abs(seat.x - rspX) < 0.01 && Math.abs(seat.y - rspY) < 0.01;
          return (
            <circle
              key={seat.id}
              cx={sp.px}
              cy={sp.py}
              r={isRspSeat ? 9 : 7}
              fill="#625143"
              stroke="#F8F8F7"
              strokeWidth={1.5}
            />
          );
        })}

        {/* RSP marker — separate if not on a seat */}
        {rspPx && !rspMatchesSeat && (
          <g>
            <circle cx={rspPx.px} cy={rspPx.py} r={12} fill="none" stroke="#213428" strokeWidth={3} />
            <circle cx={rspPx.px} cy={rspPx.py} r={5} fill="#213428" />
          </g>
        )}

        {/* RSP label */}
        {rspPx && (
          <text
            x={rspPx.px}
            y={rspPx.py + 28}
            fill="#213428"
            fontSize={12}
            textAnchor="middle"
            fontWeight={600}
            fontFamily="Didact Gothic, Century Gothic, sans-serif"
            letterSpacing="0.08em"
          >
            RSP
          </text>
        )}
      </svg>

      {/* ── Band labels (active target basis) ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: print ? 10 : 14,
        margin: 0,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {legend.map((item) => (
          <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: 3,
              background: item.fill,
              border: "1px solid #DCDBD6",
            }} />
            <span style={{ fontSize: print ? 9 : 11, color: "#3E4349", letterSpacing: "0.04em" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Result panel (P5-style) ── */}
      <div style={{
        width: "100%",
        maxWidth: print ? 460 : 520,
        margin: "0 auto",
        textAlign: "center",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {/* Primary — achieved level */}
        {level && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 64,
            padding: "8px 18px",
            borderRadius: 999,
            background: "#213428",
            color: "#FFFFFF",
            fontSize: print ? 20 : 26,
            fontWeight: 600,
            letterSpacing: "0.04em",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
            marginBottom: 10,
          }}>
            {level}
          </div>
        )}

        {/* Heading — dynamic by level */}
        {resultHeading && (
          <div style={{
            fontSize: print ? 15 : 18,
            fontWeight: 600,
            color: "#213428",
            letterSpacing: "0.01em",
            marginBottom: 8,
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}>
            {resultHeading}
          </div>
        )}

        {/* Plain-English explanation (screen only — print uses the result region) */}
        {!print && resultExplanation && (
          <p style={{
            fontSize: 13,
            color: "#625143",
            textAlign: "center",
            maxWidth: 480,
            lineHeight: 1.5,
            margin: "0 0 12px 0",
          }}>
            {resultExplanation}
          </p>
        )}

        {/* Supporting line */}
        <div style={{
          fontSize: print ? 12 : 14,
          fontWeight: 600,
          color: "#213428",
          letterSpacing: "0.02em",
          paddingTop: 8,
          borderTop: "1px solid #DCDBD6",
        }}>
          {minimum?.formatted ?? "—"}
          {" minimum capability — RP22 Parameter 12"}
        </div>

        {/* Target basis (small secondary text) */}
        <div style={{
          fontSize: print ? 10 : 11,
          color: "#625143",
          letterSpacing: "0.04em",
          marginTop: 4,
        }}>
          Target basis: {targetBasisLabel || "Minimum"}
        </div>

        {/* LCR details (RSP SPL — do not change with target basis) */}
        <div style={{
          fontSize: print ? 11 : 12,
          color: "#625143",
          letterSpacing: "0.02em",
          marginTop: 10,
        }}>
          Left {fl?.formatted ?? "—"}
          {" · Centre "}{fc?.formatted ?? "—"}
          {" · Right "}{fr?.formatted ?? "—"}
        </div>
      </div>
    </div>
  );
}