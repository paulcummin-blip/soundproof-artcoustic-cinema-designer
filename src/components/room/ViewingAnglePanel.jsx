import React, { useMemo } from 'react';
import { Eye, Ruler } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { calculateViewingAngle, assignRP23Level } from '@/components/utils/viewingAngleUtils';
import RP22GradingPill from '../ui/RP22GradingPill';

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
    <div className="space-y-4">
      <h3 className="text-base font-medium flex items-center gap-2" style={{ color: '#1B1A1A' }}>
        <Eye className="w-5 h-5" style={{ color: '#625143' }} />
        Viewing Angle Analysis
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg" style={{ border: '1px solid #C1B6AD', backgroundColor: '#F8F8F7' }}>
          <div className="text-xs mb-1" style={{ color: '#625143' }}>Horizontal FOV</div>
          <div className="text-2xl font-bold" style={{ color: '#1B1A1A' }}>
            {rp23Data.angle.toFixed(1)}°
          </div>
        </div>

        <div className="p-4 rounded-lg" style={{ border: '1px solid #C1B6AD', backgroundColor: '#F8F8F7' }}>
          <div className="text-xs mb-1" style={{ color: '#625143' }}>Viewing Distance</div>
          <div className="text-2xl font-bold" style={{ color: '#1B1A1A' }}>
            {rp23Data.distance.toFixed(2)}m
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #DCDBD6', background: '#fff', borderRadius: 8 }}>
        <div style={{ padding: '12px 12px 0 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1B1A1A' }}>
            RP23 Viewing Angle: Level {rp23Data.level}
          </div>
          <div style={{ fontSize: 12, color: '#625143', marginTop: 4 }}>
            Target: 50–65° (Level 4)
          </div>
        </div>
        <div style={{ padding: '8px 12px 12px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#625143' }}>Achieved</span>
              <span style={{ 
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                fontSize: 12,
                color: '#3E4349'
              }}>
                {rp23Data.angle.toFixed(1)}°
              </span>
            </div>
            <span style={{
              border: '1px solid #C1B6AD',
              borderRadius: 9999,
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
              background: rp23Data.level === 4 ? '#F6F3EE' : rp23Data.level === 3 ? '#E9ECEF' : rp23Data.level === 2 ? '#EFEAE4' : '#FBE9E7',
              color: rp23Data.level === 4 ? '#213428' : rp23Data.level === 3 ? '#3E4349' : rp23Data.level === 2 ? '#625143' : '#A7302F'
            }}>
              L{rp23Data.level}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}