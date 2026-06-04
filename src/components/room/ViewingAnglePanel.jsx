import React, { useMemo } from 'react';
import { Eye, Ruler } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { calculateViewingAngle, assignRP23Level, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
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

  // Use the live visual screen plane first.
  // Priority:
  // 1) screen.screenPlaneY_m  (live visual plane — most accurate)
  // 2) appState.screenFrontPlaneM
  // 3) screen.frontPlaneM
  // 4) screen.floatDepthM
  // 5) 0
  const screenFrontPlaneM = Number.isFinite(Number(screen?.screenPlaneY_m))
    ? Number(screen.screenPlaneY_m)
    : Number.isFinite(Number(appScreenFrontPlaneM))
      ? Number(appScreenFrontPlaneM)
      : Number.isFinite(Number(screen?.frontPlaneM))
        ? Number(screen.frontPlaneM)
        : Number(screen?.floatDepthM ?? 0);

  const rp23Data = useMemo(() => {
    // Prefer live mlpOverride.y (from current seatingPositions — updates live during drag).
    // Fall back to mlpY_m from app state when no override is present.
    const effectiveViewerY =
      mlpOverride && Number.isFinite(Number(mlpOverride.y))
        ? Number(mlpOverride.y)
        : Number.isFinite(mlpY_m) ? mlpY_m : null;

    if (effectiveViewerY === null || !Number.isFinite(screenFrontPlaneM)) {
      return null;
    }

    const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
    const tvKey = screen?.tvPresetKey;
    const tvMm = Number(screen?.tvWidthMm);
    const visibleWidthInches = (() => {
      if (tvKey && TV_KEY_TO_INCHES[tvKey]) return TV_KEY_TO_INCHES[tvKey];
      if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;
      return Number(screen?.visibleWidthInches) || 100;
    })();
    const aspectRatio = screen?.aspectRatio || "16:9";

    // Compute angle using only the true RSP position (mlpY_m)
    const computedAngle = calculateViewingAngle(
      { y: effectiveViewerY }, // true RSP viewer position
      visibleWidthInches,
      aspectRatio,
      { y: screenFrontPlaneM }
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
  // mlpOverride drives effectiveViewerY live during seat drag — must be in deps.
  // mlpY_m is the fallback when no override exists (updated after mouseup).
  // seatingPositions triggers recompute on every drag tick via mlpOverride.
  }, [mlpOverride, mlpY_m, screenFrontPlaneM, screen?.visibleWidthInches, screen?.aspectRatio, screen?.tvPresetKey, screen?.tvWidthMm]);

  // Per-row analysis — groups seatingPositions by rowNumber, computes row centre, FOV, distance, level.
  // Updates live because seatingPositions changes on every drag tick (via mlpOverride path upstream).
  const perRowData = useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return [];

    const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
    const tvKey = screen?.tvPresetKey;
    const tvMm = Number(screen?.tvWidthMm);
    const visibleWidthInches = (() => {
      if (tvKey && TV_KEY_TO_INCHES[tvKey]) return TV_KEY_TO_INCHES[tvKey];
      if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;
      return Number(screen?.visibleWidthInches) || 100;
    })();

    // Group seats by rowNumber (key used: seat.rowNumber, integer 1-based)
    const byRow = {};
    for (const seat of seatingPositions) {
      const rn = seat.rowNumber ?? 1;
      if (!byRow[rn]) byRow[rn] = [];
      byRow[rn].push(seat);
    }

    const rowNumbers = Object.keys(byRow).map(Number).sort((a, b) => a - b);

    return rowNumbers.map(rn => {
      const seats = byRow[rn];
      // Row centre = average X and Y of all seats in that row
      const centreX = seats.reduce((s, seat) => s + (Number(seat.x) || 0), 0) / seats.length;
      const centreY = seats.reduce((s, seat) => s + (Number(seat.y) || 0), 0) / seats.length;

      const distToScreen = Math.max(0, centreY - screenFrontPlaneM);
      const angle = calculateViewingAngle(
        { y: centreY },
        visibleWidthInches,
        screen?.aspectRatio || '16:9',
        { y: screenFrontPlaneM }
      );
      const levelCode = angle != null ? rp23LevelForAngleDeg(angle) : null;

      return {
        rowNumber: rn,
        angle,
        distToScreen,
        levelCode, // 'L1'|'L2'|'L3'|'L4'|null
      };
    });
  }, [seatingPositions, screenFrontPlaneM, screen?.screenPlaneY_m, screen?.frontPlaneM, screen?.floatDepthM, screen?.visibleWidthInches, screen?.aspectRatio, screen?.tvPresetKey, screen?.tvWidthMm]);

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

      <h3 className="text-base font-medium flex items-center gap-2 mb-4" style={{ color: '#1B1A1A' }}>
        <Eye className="w-5 h-5" style={{ color: '#625143' }} />
        Viewing Angle Analysis
      </h3>

      {/* Row table — always shown (1 row = single row, 2+ rows = all rows) */}
      {perRowData.length >= 1 && (
        <div style={{ border: '1px solid #C1B6AD', borderRadius: 8, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 70px', gap: 0, backgroundColor: '#EDECEA', padding: '5px 10px' }}>
            {['Row', 'Viewing Angle', 'Distance to Screen', 'RP23'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 600, color: '#625143', textAlign: h === 'RP23' ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          {perRowData.map((row, idx) => {
            const levelNum = row.levelCode ? parseInt(row.levelCode.replace('L', ''), 10) : 0;
            const colors = getLevelColors(levelNum);
            const levelLabel = row.levelCode ?? 'Fail';
            const isEven = idx % 2 === 1;
            return (
              <div
                key={row.rowNumber}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr 1fr 70px',
                  gap: 0,
                  padding: '8px 10px',
                  backgroundColor: isEven ? '#F8F8F7' : '#FFFFFF',
                  borderTop: '1px solid #E6E4DD',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 13, color: '#625143', fontWeight: 600 }}>R{row.rowNumber}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1B1A1A', letterSpacing: '-0.5px' }}>
                  {row.angle != null ? `${row.angle.toFixed(1)}°` : '—'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1B1A1A', letterSpacing: '-0.5px' }}>
                  {`${row.distToScreen.toFixed(2)} m`}
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: colors.text,
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border || colors.bg}`,
                  borderRadius: '6px',
                  padding: '6px 12px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: '1.2',
                  minWidth: '40px'
                }}>
                  {levelLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>);

}