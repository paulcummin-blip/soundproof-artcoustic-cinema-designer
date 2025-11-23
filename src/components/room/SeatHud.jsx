"use client";
import React from "react";

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
}) {
  // Guard: render nothing if no hovered seat or tooltip data
  if (!effectiveHoveredSeat || !tooltipData) return null;

  // Safe value formatter
  const fmt = (v) => {
    if (v == null) return "—";
    if (typeof v === "object" && "formatted" in v) return v.formatted ?? "—";
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

      {/* Basic info */}
      <div style={{ marginBottom: 4 }}>
        <div>Position: {tooltipData.position}</div>
        <div>Distance to Screen: {tooltipData.distanceToScreen}</div>
        {tooltipData.distanceToMLP !== '—' && (
          <div>Distance to MLP: {tooltipData.distanceToMLP}</div>
        )}
      </div>

      {/* RP23 */}
      {tooltipData.rp23.formatted !== '—' && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '4px 0',
          borderTop: '1px solid #E6E4DD'
        }}>
          <span>RP23 Horizontal: {tooltipData.rp23.formatted}</span>
          {renderLevelBadge(tooltipData.rp23.level)}
        </div>
      )}

      {/* SPL @ Seat section */}
      {(Object.keys(tooltipData.splAtSeat.lcr).length > 0 || 
        Object.keys(tooltipData.splAtSeat.surrounds).length > 0 || 
        Object.keys(tooltipData.splAtSeat.overheads).length > 0) && (
        <div style={{ 
          borderTop: '1px solid #E6E4DD',
          marginTop: '8px',
          paddingTop: '8px'
        }}>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1B1A1A' }}>
            SPL @ Seat (Target: 100W)
          </div>
          
          {Object.keys(tooltipData.splAtSeat.lcr).length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Screen:</div>
              {Object.entries(tooltipData.splAtSeat.lcr).map(([role, spl]) => (
                <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                  {role}: {spl.formatted}
                </div>
              ))}
            </div>
          )}

          {Object.keys(tooltipData.splAtSeat.surrounds).length > 0 && (
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Surrounds:</div>
          )}
            {Object.entries(tooltipData.splAtSeat.surrounds).map(([role, spl]) => (
              <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                {role}: {spl.formatted}
              </div>
            ))}
          
          {Object.keys(tooltipData.splAtSeat.overheads).length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Overheads:</div>
              {Object.entries(tooltipData.splAtSeat.overheads).map(([role, spl]) => (
                <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                  {role}: {spl.formatted}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* RP22 Metrics */}
      <div style={{ borderTop: '1px solid #E6E4DD', paddingTop: 4, marginTop: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: '#1B1A1A' }}>
          RP22 Per-Seat Metrics
        </div>
        
        {/* Always show all RP22 metrics */}
        {['p1','p4','p5','p6','p9','p10','p16','p17','p20'].map(key => {
          const metric = tooltipData.rp22?.[key];
          if (!metric) return null;
          
          return (
            <div key={key} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '2px 0',
              fontSize: '12px'
            }}>
              <span>{key.toUpperCase()}: {metric.formatted || '—'}</span>
              {renderLevelBadge(metric.level || '—')}
            </div>
          );
        })}
      </div>
    </div>
  );
}