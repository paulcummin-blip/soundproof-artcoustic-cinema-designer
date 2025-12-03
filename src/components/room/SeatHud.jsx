"use client";
import React from "react";
import { formatDb } from '@/components/utils/formatDb';

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
  // Guard: render nothing if no hovered seat or tooltip data
  if (!effectiveHoveredSeat || !tooltipData) return null;

  // Safe value formatter
  const fmt = (v) => {
    if (v == null) return "—";
    if (typeof v === "object" && "formatted" in v) {
      // If the formatted value is a SPL reading (ends with " dB"), reformat it
      const formatted = v.formatted ?? "—";
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

  return (
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
          {tooltipData.seatId} {tooltipData.isPrimary ? '(MLP)' : ''}
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
          {renderLevelBadge(tooltipData.rp23.level)}
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

        {(() => {
          console.log(
            "[HUD P16]",
            {
              seatId: effectiveHoveredSeat?.id,
              rp22Metrics: tooltipData?.rp22,
            }
          );
          return null;
        })()}
        {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
          const metric = tooltipData.rp22?.[key];
          if (!metric) return null;

          return (
            <React.Fragment key={key}>
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
                  {key === 'p16' && metric.hudLabel ? (
                    `P16: ${metric.hudLabel}`
                  ) : (
                    `${key.toUpperCase()}: ${metric.formatted || '—'}`
                  )}
                </span>
                {renderLevelBadge(metric.level || '—')}
              </div>

              {/* P16 debug info */}
              {key === 'p16' && metric.debug && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#999',
                    paddingLeft: 16,
                    paddingBottom: 3,
                    lineHeight: 1.4,
                  }}
                >
                  {['FL', 'FC', 'FR'].map((role) => {
                    const data = metric.debug.perSpeaker[role];
                    if (!data) return null;
                    const angleDisplay = Math.abs(Number(data.angleDeg) || 0);
                    return `${role} ${angleDisplay.toFixed(1)}° / ${data.lossDb ?? '—'} dB`;
                  }).filter(Boolean).join(', ')}
                  {metric.debug.worst?.role && (
                    <span> (worst: {metric.debug.worst.role})</span>
                  )}
                </div>
              )}

              {/* P17 per-speaker breakdown */}
              {key === 'p17' && metric.perSpeaker && metric.perSpeaker.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#999',
                      paddingLeft: 16,
                      paddingBottom: 3,
                      lineHeight: 1.4,
                    }}
                  >
                    {metric.perSpeaker
                      .slice()
                      .sort((a, b) => a.role.localeCompare(b.role))
                      .map(s => {
                        // Use rawAngleDeg if available (for overheads), otherwise angleDeg
                        const displayAngle = Number.isFinite(s.rawAngleDeg) ? s.rawAngleDeg : s.angleDeg;
                        const angle = Number.isFinite(displayAngle) ? displayAngle.toFixed(1) : '—';
                        const loss = s.isBeyondNonLcrLimit ? 'N/A' : (Number.isFinite(s.lossDb) ? `${s.lossDb.toFixed(1)} dB` : '—');
                        return `${s.role} ${angle}° / ${loss}`;
                      })
                      .join(', ')}
                    {metric.worstRole && Number.isFinite(metric.worstAngleDeg) && Number.isFinite(metric.worstLossDb) && (
                      <span> (worst: {metric.worstRole} {metric.worstAngleDeg.toFixed(1)}° / {metric.worstLossDb.toFixed(1)} dB)</span>
                    )}
                  </div>
                  {metric.p17HasNaAngles && (
                    <div
                      style={{
                        fontSize: 10,
                        color: '#999',
                        paddingLeft: 16,
                        paddingBottom: 3,
                        fontStyle: 'italic',
                      }}
                    >
                      N/A = &gt;41° off-axis; RP22 Level 2 limit
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
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
            <>
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
            </>
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
          <div>Distance to MLP: {tooltipData.distanceToMLP}</div>
        )}
      </div>
    </div>
  );
}