import React, { useMemo } from 'react';

import { useAppState } from '@/components/AppStateProvider';
import { calculateViewingAngle, assignRP23Level } from '@/components/utils/viewingAngleUtils';


export default function ViewingAnglePanel({
  screen,
  seatingPositions,
  viewingDistanceOffsetM,
  mlpOverride,
  mlpDotOffsetM
}) {
  // Pull derived MLP and screen plane from app state (single source of truth)
  const { mlpY_m, screenFrontPlaneM } = useAppState() || {};

  const rp23Data = useMemo(() => {
    // Must have both the MLP Y and the screen front plane
    if (!Number.isFinite(mlpY_m) || !Number.isFinite(screenFrontPlaneM)) {
      return null;
    }

    const visibleWidthInches = screen?.visibleWidthInches || 100;
    const aspectRatio = screen?.aspectRatio || "16:9";

    // Use the exact same inputs as dot placement
    const computedAngle = calculateViewingAngle(
      { y: mlpY_m },                    // viewer position (the green dot)
      visibleWidthInches,               // visible width in inches
      aspectRatio,                      // aspect ratio
      { y: screenFrontPlaneM }          // screen front plane Y
    );

    if (computedAngle == null) return null;

    const viewerDistance = Math.abs(mlpY_m - screenFrontPlaneM);
    const rp23Level = assignRP23Level(computedAngle);

    // Optional diagnostics (guarded)
    if (typeof window !== 'undefined' && window.__DIAG__RP23) {
      const widthM = visibleWidthInches * 0.0254;
      const d = Math.max(viewerDistance, 1e-6);
      console.log('[RP23-angle] widthM=%o mlpY=%o planeFrontY=%o d=%o angle=%o',
        widthM, mlpY_m, screenFrontPlaneM, d,
        2 * Math.atan(widthM / (2 * d)) * 180 / Math.PI
      );
    }

    return {
      angle: computedAngle,
      distance: viewerDistance,
      level: rp23Level.level,
      label: rp23Level.label,
      color: rp23Level.color
    };
  }, [mlpY_m, screenFrontPlaneM, screen?.visibleWidthInches, screen?.aspectRatio]);

  if (!rp23Data) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500">
          Calculating viewing angle...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div style={{ border: '1px solid #E6E4DD', borderRadius: 12, padding: 16, background: '#fff' }}>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#1B1A1A', fontWeight: 700 }}>
          RP23 Viewing Angle: Level {rp23Data.level}
        </div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: '#61656B', marginTop: 6 }}>
          Target: 50–65°. Current angle: {rp23Data.angle.toFixed(1)}°
        </div>
      </div>
    </div>
  );
}