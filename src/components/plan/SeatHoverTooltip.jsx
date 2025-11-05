import React, { useMemo } from 'react';
import { calculateViewingAngle, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
import { useAppState } from '@/components/AppStateProvider';

export default function SeatHoverTooltip({ seat, screen, canvasX, canvasY }) {
  const { screenFrontPlaneM } = useAppState() || {};

  const rp23Data = useMemo(() => {
    if (!seat || !Number.isFinite(screenFrontPlaneM)) return null;

    const visibleWidthInches = screen?.visibleWidthInches || 100;
    const aspectRatio = screen?.aspectRatio || "16:9";

    // Calculate horizontal FOV using the same inputs as the panel
    const angleDeg = calculateViewingAngle(
      { y: seat.y },                    // viewer = hovered seat
      visibleWidthInches,               // same visible width used everywhere
      aspectRatio,                      // aspect ratio
      { y: screenFrontPlaneM }          // screen = front plane
    );

    if (angleDeg == null) return null;

    // Map angle to RP23 level
    const level = rp23LevelForAngleDeg(angleDeg);
    
    // Calculate viewing distance
    const distance = Math.abs(seat.y - screenFrontPlaneM);

    return { angleDeg, level, distance };
  }, [seat, screen?.visibleWidthInches, screen?.aspectRatio, screenFrontPlaneM]);

  if (!seat || !rp23Data) return null;

  const levelDisplay = rp23Data.level || '—';
  const levelColor = {
    'L4': '#10B981', // green
    'L3': '#3B82F6', // blue
    'L2': '#F59E0B', // yellow
    'L1': '#F97316', // orange
  }[rp23Data.level] || '#6B7280'; // gray for out of range

  return (
    <div
      style={{
        position: 'absolute',
        left: canvasX + 12,
        top: canvasY - 8,
        pointerEvents: 'none',
        zIndex: 1000,
        backgroundColor: 'rgba(27, 26, 26, 0.95)',
        color: '#FFFFFF',
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        minWidth: '180px',
      }}
    >
      <div style={{ marginBottom: '6px', fontWeight: 'bold', fontSize: '13px' }}>
        {seat.id || `Seat ${seat.seatNumber || ''}`}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: '11px' }}>
        <span style={{ color: '#C1B6AD' }}>Position:</span>
        <span>X: {seat.x?.toFixed(2)}m, Y: {seat.y?.toFixed(2)}m</span>
        
        <span style={{ color: '#C1B6AD' }}>Distance:</span>
        <span>{rp23Data.distance.toFixed(2)}m</span>
        
        <span style={{ color: '#C1B6AD' }}>RP23 Horizontal Angle:</span>
        <span>{rp23Data.angleDeg.toFixed(1)}°</span>
        
        <span style={{ color: '#C1B6AD' }}>Level:</span>
        <span style={{ 
          color: levelColor, 
          fontWeight: 'bold',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }}>
          {levelDisplay}
        </span>
      </div>
      
      {seat.isPrimary && (
        <div style={{ 
          marginTop: '6px', 
          paddingTop: '6px', 
          borderTop: '1px solid rgba(193, 182, 173, 0.3)',
          color: '#10B981',
          fontSize: '10px',
          fontWeight: 'bold'
        }}>
          ● MLP (Primary Listening Position)
        </div>
      )}
    </div>
  );
}