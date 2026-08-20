import React, { useMemo, useSyncExternalStore } from 'react';
import { Eye, Ruler } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { calculateViewingAngle, assignRP23Level, buildPerRowViewingData } from '@/components/utils/viewingAngleUtils';
import { buildViewingPrioritySummary, describeViewingBalance } from '@/components/utils/viewingPriorityAuthority';
import RP22GradingPill from '../ui/RP22GradingPill';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { subscribeSeatDragLive, getSeatDragLive } from '@/components/state/seatDragLiveStore';

export default function ViewingAnglePanel({
  screen,
  seatingPositions,
  viewingDistanceOffsetM,
  mlpOverride,
  mlpDotOffsetM,
  showMlpRuler = false,
  onShowMlpRulerChange,
  viewingPriority = "balanced",
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

  // Live draft seat positions during a longitudinal seat/row drag.
  // Pure geometry only — no bass / RP22 / ASDR recalculation is triggered.
  // When a drag is active, the per-row table (angle, distance, RP23, balance)
  // updates continuously from the transient pointer positions; on release the
  // committed seatingPositions take over and match the last live preview.
  const liveDrag = useSyncExternalStore(subscribeSeatDragLive, getSeatDragLive);
  const liveSeats = (liveDrag?.active && Array.isArray(liveDrag?.seats)) ? liveDrag.seats : null;
  const effectiveSeatingPositions = liveSeats || seatingPositions;

  // Canonical per-row analysis shared with Stage D recommendation evaluation.
  const perRowData = useMemo(
    () => buildPerRowViewingData({
      seatingPositions: effectiveSeatingPositions,
      screen,
      screenFrontPlaneM,
    }),
    [effectiveSeatingPositions, screen, screenFrontPlaneM]
  );

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
            const levelNum = row.rp23Level ? parseInt(row.rp23Level.replace('L', ''), 10) : 0;
            const colors = getLevelColors(levelNum);
            const levelLabel = row.rp23Level ?? 'Fail';
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
                  {row.viewingAngleDeg != null ? `${row.viewingAngleDeg.toFixed(1)}°` : '—'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1B1A1A', letterSpacing: '-0.5px' }}>
                  {`${row.viewingDistanceM.toFixed(2)} m`}
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

          {/* VIEWING BALANCE summary — multi-row only. No fake RP23 balance level. */}
          {perRowData.length >= 2 && (() => {
          const summary = buildViewingPrioritySummary(perRowData, viewingPriority);
          const balanceText = describeViewingBalance(summary);
          if (!balanceText) return null;
          return (
          <div style={{
            border: '1px solid #C1B6AD',
            borderRadius: 8,
            padding: '8px 12px',
            backgroundColor: '#F8F8F7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#625143', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Viewing Balance
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1B1A1A', textAlign: 'right' }}>
              {balanceText}
            </span>
          </div>
          );
          })()}
          </div>);

          }