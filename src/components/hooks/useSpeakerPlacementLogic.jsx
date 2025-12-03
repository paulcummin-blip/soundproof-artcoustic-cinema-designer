import { useAppState } from "../AppStateProvider";
import { audioConfigurations } from "../data/audioConfigurations";
import { useMemo, useState, useEffect } from "react";
import { applyOverheadPlacement } from '../utils/overheadPlacement';
import { centerX, wallAnchorX, wallAnchorY } from '../utils/geom';
import { viewingDimsM } from '../utils/viewingAndScreenMetrics';
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";

function computeBedRoleFlags(dolbyConfig, sevenBedLayoutType) {
    const cfg = String(dolbyConfig || '').trim();
    const is5 = cfg.startsWith('5.');
    const is7 = cfg.startsWith('7.');
    const is9OrMore = /^\d+\./.test(cfg) && !is5 && !is7;

    const sides = true;
    const rears = is5 ? false : is7 ? (sevenBedLayoutType === 'rears') : is9OrMore ? true : false;
    const wides = is5 ? false : is7 ? (sevenBedLayoutType === 'wides') : is9OrMore ? true : false;

    return { sides, rears, wides, is5, is7, is9OrMore };
}

export function useSpeakerPlacementLogic(initialSpeakers = [], dimensionsOverride, dolbyConfigOverride, sevenBedLayoutOverride, selectedSpeakers, subPlacement) {
    const {
        dimensions: appDimensions,
        dolbyConfig: appDolbyConfig,
        seatingPositions: appSeatingPositions,
        overheadOffsetM: appOverheadOffsetM,
        sevenBedLayoutType: appSevenBedLayoutType,
        screen: appScreen
    } = useAppState();

    // Use overrides if provided, otherwise use app state values
    const dimensions = dimensionsOverride || appDimensions;
    const dolbyConfig = dolbyConfigOverride || appDolbyConfig;
    const sevenBedLayoutType = sevenBedLayoutOverride || appSevenBedLayoutType;

    // These typically come from app state and are not commonly overridden in this hook's context
    const seatingPositions = appSeatingPositions;
    const overheadOffsetM = appOverheadOffsetM;
    const screen = appScreen;

    const [placedSpeakers, setPlacedSpeakers] = useState([]);

    // Derived room dimensions (from original useMemo structure)
    const w = dimensions?.width ?? 4;
    const l = dimensions?.length ?? 6;
    const h = dimensions?.height ?? 2.7;

    const roomBoxWithHeight = useMemo(() => ({ xMin: 0, xMax: w, yMin: 0, yMax: l, zMin: 0, zMax: h }), [w, l, h]);

    const mlp = useMemo(() => {
        const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
        return seats.find(s => s.isPrimary) || seats[Math.floor(seats.length / 2)] || { x: w / 2, y: l * 0.58, z: 1.2, isVirtualMLP: true };
    }, [seatingPositions, w, l]);

    useEffect(() => {
        // Early returns and setup
        if (!dimensions || !dolbyConfig) {
            setPlacedSpeakers([]);
            return;
        }

        let nextSpeakers = initialSpeakers.length > 0 ? [...initialSpeakers] : [];

        // If no initialSpeakers are provided, generate them using the original logic
        if (nextSpeakers.length === 0) {
            const flags = computeBedRoleFlags(dolbyConfig, sevenBedLayoutType);
            const EAR_Z = 1.2;

            const { viewWm } = viewingDimsM(screen?.visibleWidthInches, screen?.aspectRatio);
            const screenY = 0.10;
            const cx = w / 2;
            const insetM = 0.15; // inside the viewing edge

            const leftViewEdgeX = cx - (viewWm / 2);
            const rightViewEdgeX = cx + (viewWm / 2);

            const Lx = leftViewEdgeX + insetM;
            const Rx = rightViewEdgeX - insetM;

            nextSpeakers.push(
                { id: "L", role: "L", label: "L", position: { x: Lx, y: screenY, z: EAR_Z } },
                { id: "C", role: "C", label: "C", position: { x: cx, y: screenY, z: EAR_Z } },
                { id: "R", role: "R", label: "R", position: { x: Rx, y: screenY, z: EAR_Z } },
            );

            // [B44] Legacy bed-surround placement disabled.
            // Bed-layer geometry (SL/SR/SBL/SBR/LW/RW) is fully handled by SpeakerPlacement / resetSurroundPositions.
            // Side Surrounds, Rear Surrounds, and Wides are NO LONGER auto-placed here.
            // (Removed original code blocks for sides, rears, and wides placement)

            const config = audioConfigurations[dolbyConfig];
            if (config?.speakers) {
                const overheadsFromConfig = config.speakers.filter(s => s.role.startsWith('T'));
                overheadsFromConfig.forEach(s => {
                    nextSpeakers.push({ id: s.role, role: s.role, label: s.role, position: { x: cx, y: l / 2, z: h - 0.3 } });
                });
            }

            const overheadCount = nextSpeakers.filter(s => s.role.startsWith('T')).length;
            if (overheadCount > 0) {
                nextSpeakers = applyOverheadPlacement({
                    speakers: nextSpeakers,
                    seating: { mlp },
                    roomBox: roomBoxWithHeight,
                    overheadCount,
                    offsetM: overheadOffsetM || 0
                });
            }
        }


        // Apply master selections
        if (selectedSpeakers) {
            if (selectedSpeakers.lcr) {
                // Assuming selectedSpeakers.lcr directly provides the model name
                nextSpeakers.forEach(spk => {
                    const role = spk.role.toUpperCase();
                    if (['L', 'C', 'R'].includes(role)) {
                        spk.model = selectedSpeakers.lcr;
                    }
                });
            }
            if (selectedSpeakers.surround) {
                nextSpeakers.forEach(spk => {
                    const role = spk.role.toUpperCase();
                    // Original code uses LRS, RRS, LS, RS, LW, RW for surrounds/rears/wides
                    if (['LS', 'RS', 'LRS', 'RRS', 'LW', 'RW'].includes(role)) {
                        // UPSTREAM FIX: Resolve to the surround model key before storing it
                        spk.model = resolveSurroundModel(selectedSpeakers.surround, role);
                    }
                });
            }
            if (selectedSpeakers.height) {
                // Ensure overhead speakers have the model ID stored correctly
                nextSpeakers.forEach(spk => {
                    const role = spk.role.toUpperCase();
                    if (role.startsWith('T')) {
                        // Store the model name/key that will be used for registry lookup
                        spk.model = selectedSpeakers.height;
                    }
                });
            }
        }

        // Apply overrides
        if (selectedSpeakers?.overrides) {
            Object.entries(selectedSpeakers.overrides).forEach(([role, model]) => {
                const targetSpeaker = nextSpeakers.find(spk => spk.role.toUpperCase() === role.toUpperCase());
                if (targetSpeaker) {
                    // UPSTREAM FIX: Also resolve overrides for surround roles
                    if (['LS', 'RS', 'LRS', 'RRS', 'LW', 'RW'].includes(role.toUpperCase())) {
                        targetSpeaker.model = resolveSurroundModel(model, role);
                    } else {
                        targetSpeaker.model = model;
                    }
                }
            });
        }

        // [B44] Apply final position clamping - NO room-center fallback for surrounds
        nextSpeakers = nextSpeakers.map((s, i) => {
            const role = s?.role ?? `SPK${i + 1}`;
            const p = s?.position ?? {};

            const isOverhead = String(role).startsWith('T');
            const isLCR = ['L', 'C', 'R'].includes(String(role).toUpperCase());

            const hasFiniteXY = Number.isFinite(p.x) && Number.isFinite(p.y);

            // For LCR + overheads we can safely invent a centred fallback
            if (!hasFiniteXY && (isLCR || isOverhead)) {
                const fallbackX = w / 2;
                const fallbackY = isOverhead ? (l / 2) : (l * 0.58);
                const z = Number.isFinite(p.z) ? p.z : (isOverhead ? h - 0.3 : 1.2);
                return {
                    ...s,
                    role,
                    position: {
                        x: Math.max(0.08, Math.min(w - 0.08, fallbackX)),
                        y: Math.max(0.08, Math.min(l - 0.08, fallbackY)),
                        z,
                    },
                };
            }

            // For all other roles (surrounds, subs, etc.) we NEVER invent a centre position.
            // If x/y are missing, leave them as-is so downstream logic (SpeakerPlacement)
            // can decide what to do.
            const x = hasFiniteXY ? Math.max(0.08, Math.min(w - 0.08, Number(p.x))) : p.x;
            const y = hasFiniteXY ? Math.max(0.08, Math.min(l - 0.08, Number(p.y))) : p.y;
            const z = Number.isFinite(p.z) ? p.z : (isOverhead ? h - 0.3 : 1.2);

            return { ...s, role, position: { x, y, z } };
        });

        // Subwoofer logic remains here - it was not explicitly in the original provided code for this section,
        // but the placeholder implies it might exist elsewhere or is to be added.
        // For now, we proceed as if the outline refers to the surrounding context for `setPlacedSpeakers`.

        setPlacedSpeakers(nextSpeakers);

    }, [
        initialSpeakers,
        dimensions, // dimensionsOverride or appDimensions
        dolbyConfig, // dolbyConfigOverride or appDolbyConfig
        sevenBedLayoutType, // sevenBedLayoutOverride or appSevenBedLayoutType
        selectedSpeakers,
        subPlacement,
        seatingPositions, // appSeatingPositions
        overheadOffsetM, // appOverheadOffsetM
        screen, // appScreen
        w, l, h, // Derived from dimensions
        mlp, // Memoized
        roomBoxWithHeight // Memoized
    ]);

    return [placedSpeakers, setPlacedSpeakers];
}