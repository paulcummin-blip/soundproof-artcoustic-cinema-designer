import React, { useMemo } from 'react';

export default function SpeakerDirectivityMap({ 
  horizontalAngle = 90, 
  verticalAngle = 90,
  speakerType = 'main',
  tweeterTilt = 0
}) {
  
  const heatmapData = useMemo(() => {
    const data = [];
    const centerX = 50; // Center of the 100x100 grid
    const centerY = 50;
    
    for (let x = 0; x < 100; x++) {
      for (let y = 0; y < 100; y++) {
        let angle, intensity;
        
        if (speakerType === 'overhead') {
          // For overhead speakers, calculate angle from vertical axis with tweeter tilt
          const dx = x - centerX;
          const dy = y - centerY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Convert grid coordinates to angle from vertical
          const angleFromVertical = (distance / 50) * 90; // 0-90° mapping
          
          // Apply tweeter tilt correction
          const correctedAngle = Math.abs(angleFromVertical - tweeterTilt);
          angle = correctedAngle;
          
          // Calculate intensity based on vertical dispersion cone
          const halfBeamwidth = verticalAngle / 2;
          if (angle <= halfBeamwidth) {
            intensity = 1.0; // Full intensity within beam
          } else if (angle <= halfBeamwidth * 1.5) {
            intensity = 0.7 - (angle - halfBeamwidth) / (halfBeamwidth * 0.5) * 0.4; // Gradual rolloff
          } else {
            intensity = 0.3 - Math.min((angle - halfBeamwidth * 1.5) / 30, 0.25); // Beyond beam
          }
        } else {
          // Original logic for bed layer speakers
          const dx = Math.abs(x - centerX);
          const dy = Math.abs(y - centerY);
          
          const horizontalAngleFromCenter = (dx / 50) * 90;
          const verticalAngleFromCenter = (dy / 50) * 90;
          
          const hHalf = horizontalAngle / 2;
          const vHalf = verticalAngle / 2;
          
          let hIntensity = horizontalAngleFromCenter <= hHalf ? 1.0 : Math.max(0.2, 1.0 - (horizontalAngleFromCenter - hHalf) / 30);
          let vIntensity = verticalAngleFromCenter <= vHalf ? 1.0 : Math.max(0.2, 1.0 - (verticalAngleFromCenter - vHalf) / 30);
          
          intensity = Math.min(hIntensity, vIntensity);
        }
        
        intensity = Math.max(0, Math.min(1, intensity));
        data.push({ x, y, intensity });
      }
    }
    return data;
  }, [horizontalAngle, verticalAngle, speakerType, tweeterTilt]);

  const getColor = (intensity) => {
    if (intensity >= 0.8) return '#22c55e'; // Green - full coverage
    if (intensity >= 0.6) return '#eab308'; // Yellow - good coverage  
    if (intensity >= 0.4) return '#f97316'; // Orange - reduced coverage
    return '#ef4444'; // Red - poor coverage
  };

  return (
    <div className="w-full">
      <h4 className="text-white font-medium mb-2 flex items-center gap-2">
        Coverage Pattern Visualization
        {speakerType === 'overhead' && tweeterTilt > 0 && (
          <span className="text-xs text-blue-400">({tweeterTilt}° tweeter tilt applied)</span>
        )}
      </h4>
      <div className="relative bg-zinc-800 rounded-lg p-4">
        <svg width="300" height="300" className="mx-auto">
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#374151" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="300" height="300" fill="url(#grid)" />
          
          {/* Heat map */}
          {heatmapData.map((point, index) => (
            <rect
              key={index}
              x={point.x * 3}
              y={point.y * 3}
              width="3"
              height="3"
              fill={getColor(point.intensity)}
              opacity={0.7}
            />
          ))}
          
          {/* Center point (speaker location) */}
          <circle cx="150" cy="150" r="4" fill="white" stroke="#1f2937" strokeWidth="2" />
          
          {/* Tweeter tilt indicator for overhead speakers */}
          {speakerType === 'overhead' && tweeterTilt > 0 && (
            <>
              <line x1="150" y1="150" x2="150" y2="120" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrowhead)" />
              <text x="155" y="135" fill="#3b82f6" fontSize="10">{tweeterTilt}° tilt</text>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
              </defs>
            </>
          )}
        </svg>
        
        {/* Legend */}
        <div className="mt-4 flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-zinc-300">Full Coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span className="text-zinc-300">Good Coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span className="text-zinc-300">Reduced Coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-zinc-300">Poor Coverage</span>
          </div>
        </div>
        
        <p className="text-center text-xs text-zinc-400 mt-2">
          {speakerType === 'overhead' 
            ? 'Overhead coverage pattern (view from below, showing dispersion cone)' 
            : 'Horizontal coverage pattern (±' + horizontalAngle/2 + '° optimal window)'}
        </p>
      </div>
    </div>
  );
}