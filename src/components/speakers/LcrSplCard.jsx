import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getSeatSplMetrics, getMlpSeat, computeSingleSeatSplAtDistance } from '@/components/utils/spl/centralSplEngine';
import { formatDb } from '@/components/utils/formatDb';
import { isCentreCabinetRole, DUAL_CENTRE_SPL_GAIN_DB } from '@/components/utils/frontStageModeAuthority';

export default function LcrSplCard({ role, label, allSeatSplMetrics, integratedLcrMode = false, dualCentre = false }) {
  const appState = useAppState();
  
  // Get MLP seat and its SPL data
  const mlpSeat = useMemo(() => {
    return getMlpSeat(appState?.seatingPositions || []);
  }, [appState?.seatingPositions]);

  const mlpSplData = useMemo(() => {
    if (!allSeatSplMetrics) return null;
    
    // Prefer synthetic "mlp" entry (green dot), fallback to mlpSeat
    const mlpMetrics = getSeatSplMetrics(allSeatSplMetrics, "mlp");
    if (mlpMetrics) return mlpMetrics;
    
    if (mlpSeat) {
      return getSeatSplMetrics(allSeatSplMetrics, mlpSeat.id);
    }
    
    return null;
  }, [mlpSeat, allSeatSplMetrics]);

  // Find the placed speaker for this role
  const placedSpeakers = appState?.speakerSystem?.placedSpeakers || [];
  const speaker = useMemo(() => {
    const canonical = { 'L': 'FL', 'C': 'FC', 'R': 'FR' }[role] || role;
    const direct = placedSpeakers.find(s => {
      const sRole = String(s?.role || '').toUpperCase();
      return sRole === canonical || sRole === role;
    });
    if (direct) return direct;
    // Dual centre (TV): there is no single FC speaker — the centre channel's own
    // cabinet is the speaker this card states (FCL and FCR carry the same model).
    return placedSpeakers.find(s => isCentreCabinetRole(s?.role) && s?.model) || null;
  }, [placedSpeakers, role]);

  // Get SPL value from centralized data
  const canonicalRole = { 'L': 'FL', 'C': 'FC', 'R': 'FR' }[role] || role;
  const isFlankingRole = integratedLcrMode && (canonicalRole === 'FL' || canonicalRole === 'FR');
  const splLookupRole = isFlankingRole ? 'FC' : canonicalRole;
  const splEntry = mlpSplData?.screen?.[splLookupRole];
  const splValue = splEntry?.value;
  const theoreticalValue = splEntry?.theoretical;
  const finalSplDb = Number.isFinite(splValue) ? splValue : null;
  const finalTheoreticalDb = Number.isFinite(theoreticalValue) ? theoreticalValue : null;
  const isOutputLimited = finalSplDb !== null && finalTheoreticalDb !== null && (finalTheoreticalDb - finalSplDb) > 3;

  // Get speaker metadata for display
  const { distanceM, sensitivity, modelLabel } = useMemo(() => {
    if (!speaker?.position || !Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }

    if (!mlpSeat) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }

    const modelId = speaker.model;
    if (!modelId) {
      return { distanceM: null, sensitivity: null, modelLabel: 'No model' };
    }

    const meta = getSpeakerModelMeta(modelId);
    const sensitivity = meta?.sensitivity_dB_1w1m || meta?.sensitivity_dB_2p83;

    // Calculate distance
    const dx = speaker.position.x - (mlpSeat.x || mlpSeat.position?.x || 0);
    const dy = speaker.position.y - (mlpSeat.y || mlpSeat.position?.y || 0);
    const dz = (speaker.position.z || 1.2) - (mlpSeat.z || mlpSeat.position?.z || 1.2);
    const distanceM = Math.hypot(dx, dy, dz);

    return {
      distanceM,
      sensitivity,
      modelLabel: meta?.label || modelId
    };
  }, [speaker, mlpSeat]);

  // Get power and EQ settings for display
  const effectiveSplInputs = appState?.getEffectiveSplInputs?.(canonicalRole) || {};
  const powerW = effectiveSplInputs.powerW || 100;
  const eqHeadroomDb = effectiveSplInputs.eqHeadroomDb || 0;

  // Dual centre (TV): the card states the selected cabinet's own SPL — the
  // existing single-speaker calculation at the centre-channel amplifier power —
  // plus the fixed allowance for the arrangement. No summation model is
  // introduced, and the figure is presentation only: it never feeds the RP22 /
  // P12 authority.
  const dualCentreDb = useMemo(() => {
    if (!dualCentre || !speaker?.model || !Number.isFinite(distanceM)) return null;
    const result = computeSingleSeatSplAtDistance({
      speakerModelId: speaker.model,
      distance_m: distanceM,
      powerW,
      radiationMode: effectiveSplInputs.radiationMode,
      screenLoss_dB: effectiveSplInputs.screenLoss_dB || 0,
      eqHeadroom_dB: eqHeadroomDb,
    });
    const base = result?.spl_continuous_db_at_seat;
    return Number.isFinite(base) ? base + DUAL_CENTRE_SPL_GAIN_DB : null;
  }, [dualCentre, speaker, distanceM, powerW, effectiveSplInputs, eqHeadroomDb]);

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1">
          <Volume2 className="w-3 h-3" style={{ color: '#625143' }} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {!isFlankingRole && !speaker?.model ? (
          <div className="text-xs text-[#625143] mt-1">Select LCR model</div>
        ) : !isFlankingRole && !speaker?.position ? (
          <div className="text-xs text-[#625143] mt-1">Not placed</div>
        ) : (
          <>
            <div className="text-lg font-bold" style={{ color: '#1B1A1A' }}>
              {formatDb(dualCentreDb !== null ? dualCentreDb : finalSplDb)}
            </div>
            {dualCentreDb !== null && (
              <div className="text-xs mt-0.5" style={{ color: '#625143' }}>
                Two cabinets · +{DUAL_CENTRE_SPL_GAIN_DB} dB
              </div>
            )}
            {dualCentreDb === null && isOutputLimited && (
              <div className="text-xs mt-0.5" style={{ color: '#b08060' }}>
                Output limited by speaker
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}