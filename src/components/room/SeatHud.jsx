"use client";
import React, { useState } from "react";
import { formatDb } from '@/components/utils/formatDb';
import { getRP22Definition } from '@/components/data/rp22Definitions';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { formatSeatLabel } from '@/components/utils/seatLabel';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import BassResultsSummary from '@/components/room/bass/BassResultsSummary';

export default function SeatHud({
  tooltipData,
  effectiveHoveredSeat,
  hudPosition,
  isHudPinned,
  hudDynamicStyle,
  onHudHeaderMouseDown,
  hudElRef,
  setHudHiddenWhenPinned,
  hudHiddenWhenPinned,
  renderLevelBadge,
  splPowerW,
  splRadiationMode,
}) {
  // Track which parameter is being hovered for tooltip
  const [hoveredParam, setHoveredParam] = useState(null);

  // Guard: render nothing if no hovered seat or tooltip data
  if (!effectiveHoveredSeat || !tooltipData) return null;

  // Safe value formatter
  const fmt = (v) => {
    if (v == null) return "—";
    if (typeof v === "object" && "formatted" in v) {
      const formatted = v.formatted ?? "—";
      const level = v.level;
      const hasRealValue = Object.keys(v).some((key) => (
        key !== 'formatted' &&
        key !== 'level' &&
        key !== 'hudLabel' &&
        key !== 'notes' &&
        key !== 'debug' &&
        key !== 'details' &&
        key !== 'perSpeaker' &&
        key !== 'worstRole' &&
        key !== 'worstAngleDeg' &&
        key !== 'worstLossDb' &&
        key !== 'worstLossLabel' &&
        key !== 'worstGroup' &&
        key !== 'p17HasNaAngles' &&
        v[key] != null
      ));

      if (formatted === '—') {
        return hasRealValue ? 'Not Calculated' : 'N/A';
      }

      if (formatted === 'Not Calculated' && !hasRealValue && (level === '—' || level == null)) {
        return 'N/A';
      }

      // If the formatted value is a SPL reading (ends with " dB"), reformat it
      if (typeof formatted === 'string' && formatted.includes(' dB')) {
        const numMatch = formatted.match(/^([-\d.]+)\s*dB/);
        if (numMatch) {
          const rawValue = parseFloat(numMatch[1]);
          return formatDb(rawValue);
        }
      }
      return formatted;
    }
    return String(v);
  };

  // RP22 Tooltip Component - positioned as a sibling to the HUD
  const RP22Tooltip = ({ paramKey, level, hudElRef }) => {
    const def = getRP22Definition(paramKey);
    if (!def) return null;

    const levelColors = getLevelColors(level);

    // Get the main HUD's actual screen position
    const r = hudElRef?.current?.getBoundingClientRect?.();
    if (!r) return null;

    // Constants for positioning
    const GAP = 12;
    const W = 320;
    const PAD = 12;

    // Calculate position - prefer left of HUD, fallback to right
    const spaceOnLeft = r.left;
    const spaceOnRight = window.innerWidth - r.right;
    
    let left, top;
    if (spaceOnLeft >= W + GAP) {
      // Place to the left
      left = r.left - W - GAP;
    } else {
      // Place to the right
      left = r.right + GAP;
    }

    // Align top with HUD, but clamp to viewport
    top = Math.max(PAD, Math.min(r.top, window.innerHeight - 400));

    return (
      <div
        style={{
          position: 'fixed',
          left,
          top,
          background: 'white',
          border: `2px solid ${levelColors.border || '#E6E4DD'}`,
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: 320,
          minWidth: 280,
          fontSize: 11,
          lineHeight: 1.5,
          color: '#1B1A1A',
          zIndex: 1001,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, color: '#1B1A1A' }}>
          {def.title}
        </div>
        <div style={{ marginBottom: 8, color: '#1B1A1A' }}>
          {def.description}
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#1B1A1A' }}>Thresholds:</div>
        {def.thresholds.map((t) => (
          <div key={t.level} style={{ paddingLeft: 8, fontSize: 10, color: '#1B1A1A' }}>
            Level {t.level}: {t.criteria}
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 10, fontStyle: 'italic', color: '#1B1A1A' }}>
          Scope: {def.scope}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* RP22 Parameter Tooltip (only shown when pinned and hovering) - rendered outside HUD */}
      {isHudPinned && hoveredParam && (
        <RP22Tooltip
          paramKey={hoveredParam.key}
          level={hoveredParam.level}
          hudElRef={hudElRef}
        />
      )}
      
      <div
        ref={hudElRef}
        className="seat-hud"
        style={{
          position: 'absolute',
          left: hudPosition?.x || 20,
          top: hudPosition?.y || 20,
          background: 'white',
          border: '1px solid #DCDBD6',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 44px 12px rgba(0,0,0,0.15)',
          pointerEvents: isHudPinned ? 'auto' : 'none',
          zIndex: 1000,
          minWidth: 260,
          maxWidth: 320,
          fontSize: 11,
          color: '#625143',
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          ...hudDynamicStyle
        }}
      >
      {/* Header with drag handle and eye icon */}
      <div
        onMouseDown={onHudHeaderMouseDown}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1B1A1A',
          marginBottom: 4,
          paddingBottom: 4,
          borderBottom: '1px solid #E6E4DD',
          cursor: isHudPinned ? 'move' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          {formatSeatLabel(tooltipData.seatId)}
          {isHudPinned && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: '#999' }}>(Pinned)</span>
          )}
        </div>

        {isHudPinned && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHudHiddenWhenPinned(v => !v);
            }}
            aria-label={hudHiddenWhenPinned ? 'Show HUD' : 'Hide HUD'}
            title={hudHiddenWhenPinned ? 'Show HUD (H)' : 'Hide HUD (H)'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '2px 4px',
              lineHeight: 1,
              fontSize: 14
            }}
          >
            {hudHiddenWhenPinned ? '👁️‍🗨️' : '👁️'}
          </button>
        )}
      </div>

      <BassResultsSummary compact showPriority={false} seatId={tooltipData.seatId} />

      {/* RP23 – now directly under the header, slightly larger */}
      {tooltipData.rp23 && tooltipData.rp23.formatted !== '—' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderTop: '1px solid #E6E4DD',
            fontSize: 14,         // ~25% larger than the base 11
            fontWeight: 500,
          }}
        >
          <span>RP23 Horizontal: {tooltipData.rp23.formatted}</span>
          <RP22GradingPill level={tooltipData.rp23.level} />
        </div>
      )}

      {/* RP22 Per-Seat Metrics – directly under RP23, bumped up */}
      <div
        style={{
          borderTop: '1px solid #E6E4DD',
          paddingTop: 6,
          marginTop: 4,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,       // about 20% larger than before
            marginBottom: 6,
            color: '#1B1A1A',
          }}
        >
          RP22 Per-Seat Metrics
        </div>


        {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
          const metric = tooltipData.rp22?.[key];
          if (!metric) return null;

          // Normalize level to string format ('L1', 'L2', etc.)
          const normalizeLevel = (level) => {
            if (!level) return '—';
            if (typeof level === 'string') return level;
            if (typeof level === 'number' && level >= 1 && level <= 4) return `L${level}`;
            return String(level);
          };

          const formattedValue = String(metric?.formatted || '');
          const isP10Unavailable = key === 'p10' && (
            fmt(metric) === 'N/A' ||
            formattedValue === 'N/A (insufficient data)' ||
            formattedValue.toLowerCase().includes('insufficient data')
          );
          const metricText = isP10Unavailable ? 'Not Calculated' : fmt(metric);
          const pillLevel = isP10Unavailable || metricText === 'N/A' ? 'N/A' : normalizeLevel(metric.level);

          return (
            <div key={key}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '3px 0',
                  fontSize: 12,
                }}
              >
                <span>
                  {/* Parameter label with hover to show definition */}
                  <span
                    style={{
                      cursor: isHudPinned ? 'help' : 'default',
                    }}
                    onMouseEnter={() => {
                      if (isHudPinned) {
                        setHoveredParam({ key: key.toUpperCase(), level: pillLevel });
                      }
                    }}
                    onMouseLeave={() => {
                      if (isHudPinned) {
                        setHoveredParam(null);
                      }
                    }}
                  >
                    {key.toUpperCase()}
                    </span>
                    {key === 'p16' ? (
                    `: ${(metric.worstRole || metric.hudLabel || '—')}${Number.isFinite(metric.worstAngleDeg) ? ` ${metric.worstAngleDeg}°` : ''}`
                    ) : key === 'p17' ? (
                    `: ${(metric.formatted || '—')}${Number.isFinite(metric.worstAngleDeg) ? ` ${metric.worstAngleDeg}°` : ''}${metric.worstRole ? ` · Worst: ${metric.worstRole}` : ''}`
                    ) : (
                    `: ${key === 'p10' ? (metricText || '—') : (metric.formatted || '—')}`
                    )}
                    </span>
                    <RP22GradingPill level={pillLevel} />
                    </div>


            </div>
          );
        })}
      </div>

      {/* SPL @ Seat section – same content as before, just moved below RP22 */}
      {(Object.keys(tooltipData.splAtSeat.lcr).length > 0 ||
        Object.keys(tooltipData.splAtSeat.surrounds).length > 0 ||
        Object.keys(tooltipData.splAtSeat.overheads).length > 0) && (
        <div
          style={{
            borderTop: '1px solid #E6E4DD',
            marginTop: 8,
            paddingTop: 8,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 6,
              color: '#1B1A1A',
            }}
          >
            SPL @ Seat
          </div>

          {Object.keys(tooltipData.splAtSeat.lcr).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  marginBottom: 2,
                }}
              >
                Screen:
              </div>
              {Object.entries(tooltipData.splAtSeat.lcr).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {formatDb(spl.value)}
                </div>
              ))}
              {/* Power + Radiation Mode caption */}
              <div
                style={{
                  fontSize: 10,
                  color: '#888',
                  paddingLeft: 8,
                  marginTop: 4,
                }}
              >
                {splPowerW != null ? `${splPowerW} W` : ''}
                {splPowerW != null && splRadiationMode ? ', ' : ''}
                {splRadiationMode === 'anechoic' ? 'Anechoic' : 'Half-Space'}
              </div>
            </div>
          )}

          {Object.keys(tooltipData.splAtSeat.surrounds).length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  marginBottom: 2,
                }}
              >
                Surrounds:
              </div>
              {Object.entries(tooltipData.splAtSeat.surrounds).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {formatDb(spl.value)}
                </div>
              ))}

            </div>
          )}

          {Object.keys(tooltipData.splAtSeat.overheads).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  marginBottom: 2,
                }}
              >
                Overheads:
              </div>
              {Object.entries(tooltipData.splAtSeat.overheads).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {formatDb(spl.value)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Basic info – now at the very bottom */}
      <div
        style={{
          borderTop: '1px solid #E6E4DD',
          paddingTop: 8,
          marginTop: 8,
        }}
      >
        <div>Position: {tooltipData.position}</div>
        <div>Distance to Screen: {tooltipData.distanceToScreen}</div>
        {tooltipData.distanceToMLP !== '—' && (
          <div>Distance to RSP: {tooltipData.distanceToMLP}</div>
        )}
      </div>
      </div>
    </>
  );
}