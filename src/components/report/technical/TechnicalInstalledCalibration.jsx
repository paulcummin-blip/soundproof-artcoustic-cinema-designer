/**
 * TechnicalInstalledCalibration.jsx
 * ---------------------------------
 * Technical Report — Installed Subwoofer Calibration table.
 *
 * Shows the CURRENT installed effective calibration for each enabled subwoofer:
 *   - Client-facing product name (SUB2-12, SUB3-12, SUB4-12 — never internal IDs)
 *   - Location/position label (Front Left, Rear Right, etc.)
 *   - Effective delay (ms)
 *   - Gain/trim (dB)
 *   - Polarity (Normal / Inverted)
 *
 * Uses CURRENT installed state from subwooferInstances — never optimiser preview
 * or recommendation data. Only shows values that are actually persisted on the
 * project's subwooferInstances array.
 *
 * Disabled subwoofers are excluded (they are not part of the active calibration).
 */

import React, { useMemo } from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { subwooferDisplayLabel } from "@/components/utils/subwooferDisplayLabel";

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  muted: "#9B8E82",
  label: "#9B8E82",
};

/**
 * Resolve a client-facing product name from a subwoofer instance.
 * Uses the canonical subwooferDisplayLabel helper — never exposes internal
 * lowercase model identifiers.
 */
function resolveClientProductName(instance) {
  const model = instance?.model || instance?.selectedProduct;
  if (!model) return "Subwoofer";
  // subwooferDisplayLabel returns client-facing names like "SUB2-12"
  const label = subwooferDisplayLabel(model);
  if (label && label !== model) return label;
  // Fallback: try registry meta
  try {
    const meta = getSpeakerModelMeta(model);
    if (meta?.displayLabel) return meta.displayLabel;
  } catch { /* ignore */ }
  // Last resort: uppercase the model key
  return String(model).toUpperCase().replace(/-/g, "-");
}

/**
 * Derive a location label from the subwoofer instance position.
 * Front/Back + Left/Right based on room coordinates.
 */
function resolveLocationLabel(instance, roomDims) {
  const pos = instance?.position || {};
  const x = Number(pos.x);
  const y = Number(pos.y);
  const L = Number(roomDims?.lengthM) || 0;
  const W = Number(roomDims?.widthM) || 0;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return instance?.positionSource === "manual" ? "Manual" : "—";
  }

  // Front/Back: y < L/2 = Front, y >= L/2 = Back
  const isFront = L > 0 ? y < L / 2 : true;
  // Left/Right: x < W/2 = Left, x >= W/2 = Right
  const isLeft = W > 0 ? x < W / 2 : true;

  const fb = isFront ? "Front" : "Rear";
  const lr = isLeft ? "Left" : "Right";
  return `${fb} ${lr}`;
}

/**
 * Format delay in ms with 1 decimal place.
 */
function formatDelay(delayMs) {
  const n = Number(delayMs);
  if (!Number.isFinite(n) || n === 0) return "0.0 ms";
  return `${n.toFixed(1)} ms`;
}

/**
 * Format gain/trim in dB with 1 decimal place, signed.
 */
function formatGain(gainDb) {
  const n = Number(gainDb);
  if (!Number.isFinite(n) || n === 0) return "0.0 dB";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} dB`;
}

/**
 * Format polarity as Normal or Inverted.
 */
function formatPolarity(polarity) {
  const n = Number(polarity) || 0;
  return (n < 0 || n === 180) ? "Inverted" : "Normal";
}

/**
 * TechnicalInstalledCalibration
 *
 * @param {Array} subwooferInstances - current project subwooferInstances
 * @param {object} roomDims - { widthM, lengthM, heightM }
 * @param {boolean} showInPrint - if true, renders print-friendly layout
 */
export default function TechnicalInstalledCalibration({ subwooferInstances, roomDims, showInPrint = false }) {
  const rows = useMemo(() => {
    if (!Array.isArray(subwooferInstances)) return [];
    return subwooferInstances
      .filter((inst) => inst.enabled !== false)
      .map((inst, i) => ({
        id: inst.id || `sub-${i}`,
        product: resolveClientProductName(inst),
        location: resolveLocationLabel(inst, roomDims),
        delay: formatDelay(inst.delayMs),
        gain: formatGain(inst.gainDb),
        polarity: formatPolarity(inst.polarity),
        tuningSource: inst.tuningSource || "manual",
      }));
  }, [subwooferInstances, roomDims]);

  if (rows.length === 0) return null;

  const hasAnyTuning = rows.some((r) =>
    r.delay !== "0.0 ms" || r.gain !== "0.0 dB" || r.polarity === "Inverted"
  );

  return (
    <div style={{
      background: COLORS.cardBg,
      borderRadius: showInPrint ? "0" : "8px",
      padding: showInPrint ? "4mm" : "20px 24px",
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{
        fontSize: showInPrint ? "10pt" : "14px",
        fontWeight: 600,
        color: COLORS.primary,
        fontFamily: FONT_HEADING,
        marginBottom: showInPrint ? "2mm" : "12px",
        letterSpacing: "0.04em",
      }}>
        Installed Subwoofer Calibration
      </div>
      <div style={{
        fontSize: showInPrint ? "7pt" : "11px",
        color: COLORS.muted,
        fontFamily: FONT_BODY,
        marginBottom: showInPrint ? "2mm" : "10px",
      }}>
        Current effective calibration applied to each enabled subwoofer.
        {hasAnyTuning ? "" : " No calibration adjustments are currently applied."}
      </div>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: showInPrint ? "8pt" : "12px",
        fontFamily: FONT_BODY,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.borderStrong}` }}>
            <th style={{
              textAlign: "left",
              padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
              color: COLORS.muted,
              fontWeight: 600,
              fontSize: showInPrint ? "7pt" : "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Subwoofer
            </th>
            <th style={{
              textAlign: "left",
              padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
              color: COLORS.muted,
              fontWeight: 600,
              fontSize: showInPrint ? "7pt" : "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Location
            </th>
            <th style={{
              textAlign: "right",
              padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
              color: COLORS.muted,
              fontWeight: 600,
              fontSize: showInPrint ? "7pt" : "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Delay
            </th>
            <th style={{
              textAlign: "right",
              padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
              color: COLORS.muted,
              fontWeight: 600,
              fontSize: showInPrint ? "7pt" : "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Gain
            </th>
            <th style={{
              textAlign: "center",
              padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
              color: COLORS.muted,
              fontWeight: 600,
              fontSize: showInPrint ? "7pt" : "10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Polarity
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <td style={{
                padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
                color: COLORS.primary,
                fontWeight: 600,
              }}>
                {row.product}
              </td>
              <td style={{
                padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
                color: COLORS.body,
              }}>
                {row.location}
              </td>
              <td style={{
                padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
                color: COLORS.body,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>
                {row.delay}
              </td>
              <td style={{
                padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
                color: COLORS.body,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>
                {row.gain}
              </td>
              <td style={{
                padding: showInPrint ? "1.5mm 2mm" : "8px 12px",
                color: COLORS.body,
                textAlign: "center",
              }}>
                {row.polarity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}