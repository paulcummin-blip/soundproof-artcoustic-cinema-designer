"use client";
import React, { useState } from "react";
import { formatDb } from '@/components/utils/formatDb';
import { getRP22Definition } from '@/components/data/rp22Definitions';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { formatSeatLabel } from '@/components/utils/seatLabel';

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

  // Track which parameter is being hovered for tooltip
  const [hoveredParam, setHoveredParam] = useState(null);

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
          {formatSeatLabel(tooltipData.seatId)} {tooltipData.isPrimary ? '(RSP)' : ''}
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
                        setHoveredParam({ key: key.toUpperCase(), level: normalizeLevel(metric.level) });
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
                    {key === 'p16' && metric.hudLabel ? (
                    `: ${metric.hudLabel}`
                    ) : (
                    `: ${metric.formatted || '—'}`
                    )}
                    </span>
                    {renderLevelBadge(normalizeLevel(metric.level))}
                    </div>

                    {/* P5 debug info */}
                    {key === 'p5' && isHudPinned && metric?.debugLine && (
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2, marginLeft: 8 }}>
                        P5 debug: {metric.debugLine}
                      </div>
                    )}

                    {/* P16 debug info */}
              {key === 'p16' && metric?.perSpeaker && metric.perSpeaker.length > 0 && (
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
                      const angle = Math.floor(s?.angleDeg || 0);
                      const loss = s?.lossLabel || '—';
                      const text = `${s.role} ${angle}° / ${loss}`;
                      const isWorst = metric?.worstRole === s.role;
                      return isWorst ? <strong key={s.role}>{text}</strong> : <span key={s.role}>{text}</span>;
                    })
                    .reduce((acc, item, i, arr) => {
                      if (i === 0) return [item];
                      return [...acc, ', ', item];
                    }, [])}
                  {metric?.worstRole && (
                    <strong> (worst: {metric.worstRole})</strong>
                  )}
                </div>
              )}

              {/* P17 per-speaker breakdown - no separate "Worst group" line */}
              {key === 'p17' && metric?.perSpeaker && metric.perSpeaker.length > 0 && (
                <div>
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
                const displayAngle = Number.isFinite(s?.rawAngleDeg) ? s.rawAngleDeg : s?.angleDeg;
                const angle = Number.isFinite(displayAngle)
                  ? String(Math.floor(Math.abs(displayAngle) + 1e-9))
                  : '—';
                const loss = s?.isBeyondNonLcrLimit ? 'N/A' : (Number.isFinite(s?.lossDb) ? `${s.lossDb.toFixed(1)} dB` : '—');
                const text = `${s.role} ${angle}° / ${loss}`;
                const isWorst = metric?.worstRole === s.role;
                return isWorst ? <strong key={s.role}>{text}</strong> : <span key={s.role}>{text}</span>;
              })
              .reduce((acc, item, i, arr) => {
                if (i === 0) return [item];
                return [...acc, ', ', item];
              }, [])}
                    {metric?.worstRole && Number.isFinite(metric?.worstAngleDeg) && Number.isFinite(metric?.worstLossDb) && (
                      <strong> (worst: {metric.worstRole} {String(Math.floor(Math.abs(metric.worstAngleDeg) + 1e-9))}° / {metric.worstLossDb.toFixed(1)} dB)</strong>
                    )}
                  </div>
                  {/* Debug info for first overhead speaker */}
                  {metric.perSpeaker.length > 0 && metric.perSpeaker[0].debug && (
                    <div
                      style={{
                        fontSize: 9,
                        color: '#aaa',
                        paddingLeft: 16,
                        paddingTop: 3,
                        fontFamily: 'monospace',
                      }}
                    >
                      DEBUG: model={metric.perSpeaker[0].debug.modelKey || '?'}, 
                      raw={metric.perSpeaker[0].debug.rawAngleDeg?.toFixed(1) || '?'}°, 
                      aim={metric.perSpeaker[0].debug.aimOffsetDeg || '?'}°, 
                      eff={metric.perSpeaker[0].debug.effectiveAngleDeg?.toFixed(1) || '?'}°, 
                      windows={metric.perSpeaker[0].debug.dispersionWindows ? 
                        `${metric.perSpeaker[0].debug.dispersionWindows.minus1p5dB}/${metric.perSpeaker[0].debug.dispersionWindows.minus3dB}/${metric.perSpeaker[0].debug.dispersionWindows.minus5dB}` : 
                        'none'}
                    </div>
                  )}
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
                  {/* LW/RW Debug Readout */}
                  {(() => {
                    const lwData = metric.perSpeaker.find(s => s.role === 'LW');
                    const rwData = metric.perSpeaker.find(s => s.role === 'RW');
                    const hasDebug = (lwData?.debug || rwData?.debug);
                    
                    if (!hasDebug) return null;
                    
                    const formatDbgVal = (v) => Number.isFinite(v) ? v.toFixed(1) : '—';
                    const formatFlags = (flags) => {
                      if (!flags) return 'FW:—,SS:—,RS:—';
                      return `FW:${flags.aimFrontWidesAtMLP ? 'Y' : 'N'},SS:${flags.aimSideSurroundsAtMLP ? 'Y' : 'N'},RS:${flags.aimRearSurroundsAtMLP ? 'Y' : 'N'}`;
                    };
                    
                    return (
                      <div
                        style={{
                          fontSize: 9,
                          color: '#aaa',
                          paddingLeft: 16,
                          paddingTop: 4,
                          fontFamily: 'monospace',
                          lineHeight: 1.5,
                        }}
                      >
                        {lwData?.debug && (
                          <div>
                            LW dbg: seatAz={formatDbgVal(lwData.debug.seatAzDeg)} aim={formatDbgVal(lwData.debug.aimDegRaw)} offAxis={formatDbgVal(lwData.debug.offAxisDegComputed)} canon={lwData.debug.canonRoleUsed || '—'} flags={formatFlags(lwData.debug.aimFlagsSeen)}
                          </div>
                        )}
                        {rwData?.debug && (
                          <div>
                            RW dbg: seatAz={formatDbgVal(rwData.debug.seatAzDeg)} aim={formatDbgVal(rwData.debug.aimDegRaw)} offAxis={formatDbgVal(rwData.debug.offAxisDegComputed)} canon={rwData.debug.canonRoleUsed || '—'} flags={formatFlags(rwData.debug.aimFlagsSeen)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
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