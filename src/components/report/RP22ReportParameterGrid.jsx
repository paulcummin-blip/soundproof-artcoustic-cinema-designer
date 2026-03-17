import React, { useMemo, useCallback } from 'react';
import { rp22Parameters } from '../data/rp22Parameters';
import ParameterCard from './ParameterCard';

/**
 * RP22ReportParameterGrid
 * Renders all 21 RP22 parameters in a 3-column grid using the exact same
 * ParameterCard component and data-mapping logic as RP22CompliancePanel / RP22Report.
 */
export default function RP22ReportParameterGrid({ analysisResult, app }) {
    // ── P2 system config (mirrors RP22Report logic) ──────────────────────────
    const p2SystemConfig = React.useMemo(() => {
        const dolbyPreset = app?.dolbyLayout || "5.1";
        const base = String(dolbyPreset).split(" ")[0];
        const parts = base.split(".");
        const bedCount = parseInt(parts[0]) || 5;
        const overheadCount = parseInt(parts[2]) || 0;
        const discreteCount = bedCount + overheadCount;
        let p2Level = 'L1';
        if (discreteCount >= 15) p2Level = 'L4';
        else if (discreteCount >= 11) p2Level = 'L2';
        return { discreteSpeakerCount: discreteCount, p2Level };
    }, [app?.dolbyLayout]);

    // ── roomResult accessor (mirrors RP22Report getRoomResult) ───────────────
    const getRoomResult = React.useCallback(
        (paramId) => analysisResult?.gradedParameters?.primary?.[paramId] ?? null,
        [analysisResult]
    );

    // ── displayedLevel (mirrors RP22Report getDisplayedRoomLevel) ────────────
    const getDisplayedRoomLevel = React.useCallback((paramId) => {
        const normaliseLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            if (typeof rawLevel === 'number' && Number.isFinite(rawLevel)) {
                if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`;
                return null;
            }
            if (typeof rawLevel === 'string') {
                const m = rawLevel.trim().match(/^L([1-4])$/i);
                if (m) return `L${m[1]}`;
            }
            return null;
        };

        const res = getRoomResult(paramId);
        if (res) {
            if (res.status && typeof res.status === 'string') {
                const s = res.status.toLowerCase();
                if (s === 'no_data' || s === 'fail') return null;
            }
            const lvl = normaliseLvl(res.level);
            if (lvl) return lvl;
        }

        if (paramId === 2 && p2SystemConfig) return normaliseLvl(p2SystemConfig.p2Level);

        if (paramId === 3) {
            const p3 = analysisResult?.gradedParameters?.primary?.[3];
            if (p3 && p3.status === 'ok' && p3.level)
                return String(p3.level).toUpperCase() === 'FAIL' ? 'FAIL' : normaliseLvl(p3.level);
            return null;
        }

        if (paramId === 8) return 'L4';
        if (paramId === 11) return 'L4';

        if (paramId === 15)
            return ({ standard: 'L1', 'purpose-built': 'L2', reference: 'L3', studio: 'L4' })[
                app?.p15ConstructionLevel || 'standard'
            ] || null;

        if (paramId === 21)
            return ({ l1: 'L1', l2: 'L2', l3: 'L3', l4: 'L4' })[
                app?.p21EarlyReflectionPreset || 'l2'
            ] || null;

        return null;
    }, [analysisResult, getRoomResult, p2SystemConfig, app?.p15ConstructionLevel, app?.p21EarlyReflectionPreset]);

    // All 21 parameters ordered by id
    const orderedParams = React.useMemo(
        () => [...rp22Parameters].sort((a, b) => a.id - b.id),
        []
    );

    return (
        <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
            {orderedParams.map((param) => (
                <ParameterCard
                    key={param.id}
                    parameter={param}
                    roomResult={getRoomResult(param.id)}
                    seatResults={[]}
                    systemConfig={param.id === 2 ? p2SystemConfig : null}
                    p15ConstructionLevel={app?.p15ConstructionLevel}
                    onP15ConstructionLevelChange={app?.setP15ConstructionLevelSafe}
                    p21EarlyReflectionPreset={app?.p21EarlyReflectionPreset}
                    onP21EarlyReflectionPresetChange={app?.setP21EarlyReflectionPresetSafe}
                    displayedLevel={getDisplayedRoomLevel(param.id)}
                />
            ))}
        </div>
    );
}