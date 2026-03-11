import React, { useMemo } from 'react';
import { Eye, Ruler } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { calculateViewingAngle, assignRP23Level } from '@/components/utils/viewingAngleUtils';
import RP22GradingPill from '../ui/RP22GradingPill';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function ViewingAnglePanel({
  screen,
  seatingPositions,
  viewingDistanceOffsetM,
  mlpOverride,
  mlpDotOffsetM,
  showMlpRuler = false,
  onShowMlpRulerChange
}) {
  // Pull derived MLP from app state
  const { mlpY_m, screenFrontPlaneM: appScreenFrontPlaneM } = useAppState() || {};

  // Use the published final screen front plane first.
  // Priority:
  // 1) appState.screenFrontPlaneM
  // 2) screen.screenPlaneY_m
  // 3) screen.floatDepthM
  // 4) 0
  const screenFrontPlaneM = Number.isFinite(Number(appScreenFrontPlaneM))
    ? Number(appScreenFrontPlaneM)
    : Number.isFinite(Number(screen?.screenPlaneY_m))
      ? Number(screen.screenPlaneY_m)
      : Number(screen?.floatDepthM ?? 0);

  const rp23Data = useMemo(() => {
    // Derive effective viewer Y: prefer the visible RSP/primary-seat override,
    // fall back to mlpY_m from app state.
    const effectiveViewerY = Number.isFinite(mlpOverride?.y)
      ? mlpOverride.y
      : (Number.isFinite(mlpY_m) ? mlpY_m : null);

    if (effectiveViewerY === null || !Number.isFinite(screenFrontPlaneM)) {
      return null;
    }

    const visibleWidthInches = screen?.visibleWidthInches || 100;
    const aspectRatio = screen?.aspectRatio || "16:9";

    // Use the exact same inputs as dot placement
    const computedAngle = calculateViewingAngle(
      { y: effectiveViewerY }, // viewer position (follows visible RSP/seat)
      visibleWidthInches, // visible width in inches
      aspectRatio, // aspect ratio
      { y: screenFrontPlaneM } // screen front plane Y
    );

    if (computedAngle == null) return null;

    const viewerDistance = Math.abs(effectiveViewerY - screenFrontPlaneM);
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
  }, [mlpY_m, mlpOverride, screenFrontPlaneM, screen?.visibleWidthInches, screen?.aspectRatio]);

  if (!rp23Data) {
    return (
      <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-500">
          Calculating viewing angle...
        </p>
      </div>);

  }

  return (
    <div className="space-y-4">
      {/* RSP Position Ruler Toggle */}
      <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ border: '1px solid #E6E4DD', backgroundColor: '#F8F8F7' }}>
        <Label htmlFor="mlp-ruler-toggle" className="text-sm" style={{ color: '#3E4349', cursor: 'pointer' }}>
          RSP Position Ruler
        </Label>
        <Switch
          id="mlp-ruler-toggle"
          checked={showMlpRuler}
          onCheckedChange={onShowMlpRulerChange}
        />

      </div>

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

      {(() => {
        const colors = getLevelColors(rp23Data.level);
        const label = rp23Data.level >= 1 && rp23Data.level <= 4 ?
        `RP23 Viewing Angle: Level ${rp23Data.level}` :
        'RP23 Viewing Angle: FAIL';
        return (
          <div style={{
            border: `1px solid ${colors.border || '#E6E4DD'}`,
            background: colors.bg,
            borderRadius: 8,
            padding: '12px'
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
              {label}
            </div>
          </div>);

      })()}
    </div>);

}