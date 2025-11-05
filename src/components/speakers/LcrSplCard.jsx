import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { splAtPointDb, distanceBetween } from '@/components/utils/spl/seatSpl';

export default function LcrSplCard({ role, label }) {
  const appState = useAppState();
  
  // Get MLP position as the reference seat
  const mlpY_m = appState?.mlpY_m || 3.0; // Fallback if not computed
  const roomWidth = Number(appState?.dimensions?.width || 4.5);
  const mlpPos = { x: roomWidth / 2, y: mlpY_m }; // MLP at room centerline

  // Get global SPL settings
  const globalPowerW = appState?.splConfig?.globalPowerW || 100;
  const globalEqHeadroomDb = appState?.splConfig?.globalEqHeadroomDb || 0;

  // Get per-role overrides if they exist
  const roleConfig = appState?.splConfig?.perRole?.[role];
  const useGlobal = roleConfig?.useGlobal !== false;
  const powerW = useGlobal ? globalPowerW : (roleConfig?.powerW || globalPowerW);
  const eqHeadroomDb = useGlobal ? globalEqHeadroomDb : (roleConfig?.eqHeadroomDb || globalEqHeadroomDb);

  // Find the placed speaker for this role
  const placedSpeakers = appState?.speakerSystem?.placedSpeakers || [];
  const speaker = useMemo(() => {
    const canonical = { 'L': 'FL', 'C': 'FC', 'R': 'FR' }[role] || role;
    return placedSpeakers.find(s => {
      const sRole = String(s?.role || '').toUpperCase();
      return sRole === canonical || sRole === role;
    });
  }, [placedSpeakers, role]);

  // Calculate SPL at MLP using speaker-to-seat distance
  const { splDb, distanceM, sensitivity, modelLabel } = useMemo(() => {
    // Check if speaker is placed with valid position
    if (!speaker?.position || !Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
      return { splDb: null, distanceM: null, sensitivity: null, modelLabel: null };
    }

    // Get speaker model metadata
    const modelId = speaker.model;
    if (!modelId) {
      return { splDb: null, distanceM: null, sensitivity: null, modelLabel: 'No model' };
    }

    const meta = getSpeakerModelMeta(modelId);
    const sensitivity = meta?.sensitivity_dB_1w1m || meta?.sensitivity_dB_2p83;
    
    if (!Number.isFinite(sensitivity)) {
      return { splDb: null, distanceM: null, sensitivity: null, modelLabel: meta?.label || modelId };
    }

    // Calculate actual distance from speaker to MLP
    const speakerPos = { x: speaker.position.x, y: speaker.position.y };
    const distanceM = distanceBetween(speakerPos, mlpPos);

    // Calculate SPL at MLP
    const splDb = splAtPointDb({
      speakerPos,
      seatPos: mlpPos,
      sens1w1mDb: sensitivity,
      powerW,
    });

    return {
      splDb,
      distanceM,
      sensitivity,
      modelLabel: meta?.label || modelId
    };
  }, [speaker, mlpPos, powerW]);

  // Apply EQ headroom
  const finalSplDb = Number.isFinite(splDb) ? splDb - eqHeadroomDb : null;

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="w-4 h-4" style={{ color: '#625143' }} />
          {label} SPL @ MLP
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-2xl font-bold" style={{ color: '#1B1A1A' }}>
            {Number.isFinite(finalSplDb) ? `${finalSplDb.toFixed(1)} dB` : '—'}
          </div>
          
          <div className="text-xs" style={{ color: '#625143' }}>
            {speaker?.position && Number.isFinite(speaker.position.x) ? (
              <>
                <div>Model: {modelLabel || 'Unknown'}</div>
                {Number.isFinite(sensitivity) && (
                  <div>Sensitivity: {sensitivity.toFixed(1)} dB @ 1W/1m</div>
                )}
                <div>Power: {powerW}W</div>
                {eqHeadroomDb > 0 && (
                  <div>EQ Headroom: -{eqHeadroomDb} dB</div>
                )}
                {Number.isFinite(distanceM) && (
                  <div>Distance to MLP: {distanceM.toFixed(2)}m</div>
                )}
              </>
            ) : (
              <div>Not placed</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}