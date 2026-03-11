import { useEffect } from "react";
import { debug } from "@/components/utils/consolePolyfill";
import { safeGroup, safeTable } from "@/components/utils/safeLog";
import { safeCanon, mergePreserveOverheads, speakersEqual } from "@/components/room/utils/speakerHelpers";
import { DOLBY_PRESETS, seedSpeakersFromPreset, getTargetOverheadIds, ensureAtmosOverheads } from "@/components/room/utils/dolbyHelpers";

/**
 * Reconciles placed speakers with the current Dolby preset.
 * Extracted verbatim from RoomDesigner.jsx (lines 1711–2216).
 */
export function useSpeakerReconciliation({
  appState,
  dolbyPreset,
  stableDimensions,
  setSpeakers,
  _isFrozen,
  placedSpeakers,
  _sevenBedLayoutType,
  lastPresetRef,
  _overheadGlobalModel,
  _overheadFrontOverride,
  _overheadMidOverride,
  _overheadRearOverride,
  _useFrontGlobal,
  _useMidGlobal,
  _useRearGlobal,
  loadState,
  resolvedProjectId,
  projectIdState,
  didUserRequestResetRef,
  isCleanSlateMode,
}) {
  useEffect(() => {
    // CRITICAL: Wait for autosave hydration before applying defaults
    if (!appState?.isHydrated) return;

    // STRICT GUARD: If we've just loaded a real project with an ID, NEVER auto-seed speakers
    // unless the user explicitly changed the Dolby preset or triggered a reset.
    const hasProjectId = resolvedProjectId || projectIdState;
    const presetChanged = lastPresetRef.current !== dolbyPreset;
    const resetEpochChanged = appState?.roomResetEpoch !== undefined && appState.roomResetEpoch > 0;

    if (
      loadState?.phase === "loaded" &&
      hasProjectId &&
      !presetChanged &&
      !didUserRequestResetRef.current &&
      !resetEpochChanged
    ) {
      return;
    }

    if (!dolbyPreset || _isFrozen && _isFrozen('speakers')) return;

    // --- DEBUG: reconciliation entry ---
    const normalizedPreset = dolbyPreset ?
    String(dolbyPreset).split(" ")[0].split("_")[0] :
    "";

    if (globalThis.__B44_LOGS) console.log(
      "[RD RECON] ENTER",
      {
        dolbyPreset,
        normalizedPreset,
        hasPlaced: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0
      }
    );

    if (globalThis.__B44_LOGS) console.log(
      "[RD RECON] placed roles BEFORE =",
      Array.isArray(placedSpeakers) ?
      placedSpeakers.map((s) => s.role) :
      "(no speakers)"
    );

    const noSpeakers = (placedSpeakers || []).length === 0;

    // CLEAN SLATE GUARD: Free Use / reset mode with no speakers — do not auto-seed
    if (isCleanSlateMode && noSpeakers) {
      if (globalThis.__B44_LOGS) console.log("[RD RECON] Skipping seeding — clean slate mode with no speakers.");
      return;
    }

    // Skip only if preset is unchanged AND we have speakers AND user didn't request reset
    // CRITICAL: If preset changed, ALWAYS run reconciliation
    if (!presetChanged && !noSpeakers && !didUserRequestResetRef.current) {
      return;
    }
    
    // Clear reset flag after reconciliation runs
    if (didUserRequestResetRef.current) {
      didUserRequestResetRef.current = false;
    }

    // Early ensure for Atmos layouts without existing overheads
    // IMPORTANT: do NOT wipe bed speakers just because overheads are missing.
    // Only add the missing overhead roles for the active preset.
    const targetOverheadIds = getTargetOverheadIds(dolbyPreset);
    const hasOverheadTargets = targetOverheadIds.length > 0;

    const hasAnyExistingOverheads =
    Array.isArray(placedSpeakers) &&
    placedSpeakers.some((spk) => safeCanon(spk.role || "").startsWith("T"));

    if (hasOverheadTargets && !hasAnyExistingOverheads) {
      setSpeakers((prev) => {
        const base = Array.isArray(prev) && prev.length ? prev : seedSpeakersFromPreset({
          preset: normalizedPreset,
          roomDimensions: stableDimensions,
          listeningArea: null
        });

        const withOverheads = ensureAtmosOverheads({
          placedSpeakers: base,
          dolbyPreset,
          roomDimensions: stableDimensions,
          overheadGlobalModel: _overheadGlobalModel,
          overheadFrontOverride: _overheadFrontOverride,
          overheadMidOverride: _overheadMidOverride,
          overheadRearOverride: _overheadRearOverride,
          useFrontGlobal: _useFrontGlobal,
          useMidGlobal: _useMidGlobal,
          useRearGlobal: _useRearGlobal
        });

        if (globalThis.__B44_LOGS) {
          console.log("[RD] early ensure overheads -> roles", (withOverheads || []).map((s) => safeCanon(s.role)));
        }
        return withOverheads;
      });
      return;
    }

    // Determine the expected roles based on the dolbyPreset and current sevenBedLayoutType
    // CRITICAL: Use _sevenBedLayoutType as single source of truth for 7.x wides vs rears
    const is7ChannelBed = normalizedPreset && (normalizedPreset.startsWith('7.1') || normalizedPreset.startsWith('7.2'));
    const is9ChannelBed = normalizedPreset && normalizedPreset.startsWith('9.1');

    let expectedRoles = DOLBY_PRESETS[normalizedPreset] || [];

    // For 7.x: swap SBL/SBR with LW/RW based on sevenBedLayoutType
    // For 9.x: ALWAYS include BOTH (no swapping)
    if (is7ChannelBed && _sevenBedLayoutType === 'wides') {
      expectedRoles = expectedRoles.map((role) => {
        if (role === 'SBL') return 'LW';
        if (role === 'SBR') return 'RW';
        return role;
      });
    }

    if (globalThis.__B44_LOGS) {
      console.log('[RD RECON] Layout decision:', {
        normalizedPreset,
        is7ChannelBed,
        is9ChannelBed,
        sevenBedLayoutType: _sevenBedLayoutType,
        expectedRoles
      });
    }

    const currentRolesSet = new Set((Array.isArray(placedSpeakers) ? placedSpeakers : []).map((s) => safeCanon(s?.role)));
    const expectedRolesSet = new Set((Array.isArray(expectedRoles) ? expectedRoles : []).map((r) => safeCanon(r)));

    // Check if current roles match expected roles — strip numbered extra surrounds before comparing
    const baseRoleSet = new Set([...currentRolesSet].filter(r => !/^(SL|SR)\d+$/.test(r)));
    const hasCorrectRoles = baseRoleSet.size === expectedRolesSet.size &&
    [...expectedRolesSet].every((role) => baseRoleSet.has(role));

    if (globalThis.__B44_LOGS) console.log(
      "[RD RECON] expectedRoles =",
      expectedRoles,
      "hasCorrectRoles =",
      hasCorrectRoles,
      "noSpeakers =",
      noSpeakers
    );

    if (!hasCorrectRoles || noSpeakers) {
      // GUARD: For Atmos layouts with existing bed speakers, don't full-reseed
      const parts = String(normalizedPreset || '').split('.');
       const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
       const major = parseInt(String(normalizedPreset || '').split('.')[0], 10) || 5;

       if (heights > 0 && major < 9 && Array.isArray(placedSpeakers) && placedSpeakers.length) {
        setSpeakers((prev) => {
          const withOverheads = ensureAtmosOverheads({
            placedSpeakers: prev,
            dolbyPreset,
            roomDimensions: stableDimensions,
            overheadGlobalModel: _overheadGlobalModel,
            overheadFrontOverride: _overheadFrontOverride,
            overheadMidOverride: _overheadMidOverride,
            overheadRearOverride: _overheadRearOverride,
            useFrontGlobal: _useFrontGlobal,
            useMidGlobal: _useMidGlobal,
            useRearGlobal: _useRearGlobal
          });
          if (speakersEqual(prev, withOverheads)) return prev;
          return withOverheads;
        });
        return;
      }

      if (globalThis.__B44_LOGS) console.log(
        "[RD RECON] about to reseed using normalizedPreset =",
        normalizedPreset
      );
      if (globalThis.__B44_LOGS) debug(`[Speakers] Reconciling speakers for ${dolbyPreset} (${presetChanged ? 'preset changed' : 'role mismatch'})`);
      // Seed with the canonical Dolby preset (which means SBL/SBR for 7.x)
      let seededSpeakers = seedSpeakersFromPreset({
        preset: normalizedPreset,
        roomDimensions: stableDimensions,
        listeningArea: null
      });

      // If it's a 7.x bed and the user wants 'wides', transform the seeded speakers
      if (is7ChannelBed && _sevenBedLayoutType === 'wides') {
        seededSpeakers = seededSpeakers.
        filter((s) => s.role !== 'SBL' && s.role !== 'SBR').
        concat([
        { id: 'LW', role: 'LW', label: 'LW', model: undefined, position: { x: stableDimensions.width * 0.15, y: stableDimensions.length * 0.4, z: 1.1 } },
        { id: 'RW', role: 'RW', label: 'RW', model: undefined, position: { x: stableDimensions.width * 0.85, y: stableDimensions.length * 0.4, z: 1.1 } }]
        );
      }

      setSpeakers((prev) => {
        const hint = typeof window !== 'undefined' && window.__SURROUND_MODEL_HINT_ || null;

        // targetOverheadIds already computed above, reuse it
        const targetSet = new Set(targetOverheadIds.map((id) => id.toUpperCase()));

        if (globalThis.__B44_LOGS) debug(`[Speakers] Target overheads for ${dolbyPreset}: [${targetOverheadIds.join(', ')}]`);

        // Known overhead roles (for filtering)
        const knownOverheadRoles = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR', 'TL', 'TR', 'TFC', 'TRC', 'TBC', 'TBL', 'TBR']);

        // Separate existing speakers into bed layer and overheads
        const prevBedSpeakers = (prev || []).filter((s) => !knownOverheadRoles.has(safeCanon(s.role)));
        const existingOverheads = (prev || []).filter((s) => knownOverheadRoles.has(safeCanon(s.role)));

        // [B44 FIX] Remove only the surround roles that are NOT required by the current layout
        const major = parseInt(String(dolbyPreset || '').split('.')[0], 10) || 5;
        const is9xLayout = major >= 9;
        // sevenBedLayoutType ONLY applies to 7.x. 9.x always requires BOTH rears AND wides.
        const useWidesInsteadOfRears = !is9xLayout && _sevenBedLayoutType === 'wides';

        const wantsRears = is9xLayout || (major === 7 && !useWidesInsteadOfRears);
        const wantsWides = is9xLayout || (major === 7 && useWidesInsteadOfRears);

        // NEW: bed speakers must come from seededSpeakers (canonical roles for the new preset)
        // But filter out only what we DON'T want
        const bedSpeakers = (seededSpeakers || []).
        filter((s) => !knownOverheadRoles.has(safeCanon(s.role))).
        filter((s) => {
          const canon = safeCanon(s.role);
          if (canon === 'SBL' || canon === 'SBR') return wantsRears;
          if (canon === 'LW' || canon === 'RW') return wantsWides;
          return true;
        });

        // Shared validity gate — one definition, used everywhere in this closure
        const isValidSurroundModel = (m) => {
          const s = String(m ?? '').trim().toLowerCase();
          return !!s && s !== 'off' && s !== 'none';
        };

        // Hoist these early so pushIfMissing can use them
        const surroundRolesSet = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
        const globalSurroundModelEarly = appState?.globalSurroundModel;
        const anySurroundModelEarly = prevBedSpeakers
          .filter((s) => surroundRolesSet.has(safeCanon(s.role)))
          .find((s) => isValidSurroundModel(s.model))?.model;

        // Pick best available surround model for a newly created role
        const pickSurroundModel = () =>
          isValidSurroundModel(globalSurroundModelEarly) ? globalSurroundModelEarly
          : isValidSurroundModel(anySurroundModelEarly)  ? anySurroundModelEarly
          : undefined;

        // [B44 FIX] Ensure required surround roles exist even if seededSpeakers is missing them
        const have = new Set(bedSpeakers.map((s) => safeCanon(s.role)));

        const pushIfMissing = (role) => {
          if (have.has(role)) return;

          bedSpeakers.push({
            id: role,
            role,
            label: role,
            model: surroundRolesSet.has(safeCanon(role)) ? pickSurroundModel() : undefined,
            position: null // SpeakerPlacement / resetSurroundPositions will hydrate
          });

          have.add(role);
        };

        // Sides always required for 5.x+
        if (major >= 5) {
          pushIfMissing('SL');
          pushIfMissing('SR');
        }

        // Rears + Wides depending on layout
        if (wantsRears) {
          pushIfMissing('SBL');
          pushIfMissing('SBR');
        }
        if (wantsWides) {
          pushIfMissing('LW');
          pushIfMissing('RW');
        }

        if (globalThis.__B44_LOGS) debug(`[Speakers] Existing: ${prevBedSpeakers.length} prev bed + ${existingOverheads.length} overhead (${existingOverheads.map((s) => s.role).join(', ')})`);
        if (globalThis.__B44_LOGS) debug(`[Speakers] Seeded: ${bedSpeakers.length} bed (from new preset)`);

        // Keep only overheads that are in the target set
        const keptOverheads = existingOverheads.filter((s) => targetSet.has(safeCanon(s.role)));

        // Create map of existing overheads by canonical role
        const overheadMap = new Map(keptOverheads.map((s) => [safeCanon(s.role), s]));

        // Create map from PREVIOUS bed speakers for model preservation
        const byCanonPrev = new Map(prevBedSpeakers.map((s) => [safeCanon(s.role), s]));

        // Separate seeded speakers into bed-layer and overheads
        const seededBed = (seededSpeakers || []).filter((s) => !knownOverheadRoles.has(safeCanon(s.role)));
        const seededOverheads = (seededSpeakers || []).filter((s) => knownOverheadRoles.has(safeCanon(s.role)));

        if (globalThis.__B44_LOGS) debug(`[Speakers] Seeded: ${seededBed.length} bed + ${seededOverheads.length} overhead (${seededOverheads.map((s) => s.role).join(', ')})`);

        // Process bed-layer speakers (preserve models from previous)
        // For surround roles without models, try to inherit from any existing surround speaker OR globalSurroundModel
        // NOTE: surroundRoles / globalSurroundModel / anySurroundModel / isValidSurroundModel
        //       are already declared above in the pushIfMissing block — reuse them.
        const surroundRoles = surroundRolesSet;
        const globalSurroundModel = globalSurroundModelEarly;
        const anySurroundModel = anySurroundModelEarly;

        // [B44 FIX: SYMMETRIC PAIR MODEL] Resolve one shared model per mirrored surround pair
        // BEFORE nextBed.map so that SL/SR, SBL/SBR, and LW/RW always leave reconciliation
        // with matching models. The old per-role prevMatch check allowed one side to inherit a
        // prior model while its mirror partner did not, causing asymmetric wall-hugging downstream.
        const SURROUND_MIRROR_PAIRS = [['SL', 'SR'], ['SBL', 'SBR'], ['LW', 'RW']];
        const pairModelMap = new Map();
        for (const [roleA, roleB] of SURROUND_MIRROR_PAIRS) {
          const prevA = byCanonPrev.get(roleA);
          const prevB = byCanonPrev.get(roleB);
          // Priority: valid prev model from either side → global → any → hint
          const pairModel =
            isValidSurroundModel(prevA?.model)     ? prevA.model :
            isValidSurroundModel(prevB?.model)     ? prevB.model :
            isValidSurroundModel(globalSurroundModel) ? globalSurroundModel :
            isValidSurroundModel(anySurroundModel) ? anySurroundModel :
            isValidSurroundModel(hint)             ? hint :
            undefined;
          pairModelMap.set(roleA, pairModel);
          pairModelMap.set(roleB, pairModel);
        }

        // [B44 FIX] Use bedSpeakers (already filtered and ensured) instead of seededBed
        const nextBed = bedSpeakers.map((seed) => {
          const canonRole = safeCanon(seed.role);
          const prevMatch = byCanonPrev.get(canonRole);

          let finalModel = seed.model; // Start with seed default

          // For surround roles: use symmetric pair-resolved model to prevent left/right divergence
          if (surroundRoles.has(canonRole)) {
            const pairModel = pairModelMap.get(canonRole);
            if (isValidSurroundModel(pairModel)) {
              finalModel = pairModel;
            } else if (isValidSurroundModel(globalSurroundModel)) {
              finalModel = globalSurroundModel;
            } else if (isValidSurroundModel(anySurroundModel)) {
              finalModel = anySurroundModel;
            } else if (isValidSurroundModel(hint)) {
              finalModel = hint;
            }

            if (globalThis.__B44_LOGS) {
              console.log(`[RD RECON] Surround model for ${canonRole}:`, {
                prevModel: prevMatch?.model,
                pairModel,
                globalSurroundModel,
                anySurroundModel,
                hint,
                finalModel,
                willRender: !!(finalModel && String(finalModel).trim().toLowerCase() !== 'off' && String(finalModel).trim().toLowerCase() !== 'none')
              });
            }
          } else {
            finalModel = prevMatch?.model ?? seed.model;
          }

          const prevPos = prevMatch?.position;
          const seedPos = seed?.position;
          const prevHasXY = prevPos && Number.isFinite(prevPos.x) && Number.isFinite(prevPos.y);
          const seedHasXY = seedPos && Number.isFinite(seedPos.x) && Number.isFinite(seedPos.y);
          const finalPosition = !seedHasXY && prevHasXY ? prevPos : seedPos;
          const prevRot = prevMatch?.rotation;
          const seedRot = seed?.rotation;
          const finalRotation = seedRot ?? prevRot;

          return {
            ...seed,
            model: finalModel,
            position: finalPosition,
            rotation: finalRotation,
            draggable: true
          };
        });

        // Build final overhead list: reuse existing positions if available, otherwise use seeded defaults
        const nextOverheads = [];
        for (const targetId of targetOverheadIds) {
          const canonId = targetId.toUpperCase();
          const existing = overheadMap.get(canonId);

          if (existing) {
            if (globalThis.__B44_LOGS) debug(`[Speakers] Reusing existing overhead: ${canonId}`);
            nextOverheads.push(existing);
          } else {
            const seeded = seededOverheads.find((s) => safeCanon(s.role) === canonId);
            if (seeded) {
              let modelFromOverrides = undefined;

              if (['TFL', 'TFR', 'TFC'].includes(canonId)) {
                modelFromOverrides = _useFrontGlobal ? _overheadGlobalModel : _overheadFrontOverride || _overheadGlobalModel;
              } else if (['TML', 'TMR'].includes(canonId)) {
                modelFromOverrides = _useMidGlobal ? _overheadGlobalModel : _overheadMidOverride || _overheadGlobalModel;
              } else if (['TRL', 'TRR', 'TRC'].includes(canonId)) {
                modelFromOverrides = _useRearGlobal ? _overheadGlobalModel : _overheadRearOverride || _overheadGlobalModel;
              }

              const finalModel = modelFromOverrides || _overheadGlobalModel || seeded.model;
              if (globalThis.__B44_LOGS) debug(`[Speakers] Creating new overhead: ${canonId} with model ${finalModel}`);
              nextOverheads.push({ ...seeded, model: finalModel, draggable: true });
            } else {
              if (globalThis.__B44_LOGS) debug(`[Speakers] WARNING: Target overhead ${canonId} not found in seeded speakers!`);
            }
          }
        }

        let nextList = [...nextBed, ...nextOverheads];

        if (globalThis.__B44_LOGS) debug(`[Speakers] Final: ${nextBed.length} bed + ${nextOverheads.length} overhead = ${nextList.length} total`);
        if (globalThis.__B44_LOGS) console.log("[RD] RECONCILE nextList:", nextList.map((s) => s.role));
        if (globalThis.__B44_LOGS) console.log("[RD RECON] OUTPUT roles =", nextList.map((s) => s.role));

        if (globalThis.__B44_LOGS) safeGroup('[Speakers] Reconciliation result', () => {
          if (globalThis.__B44_LOGS) safeTable(nextList.map((s) => ({ role: s.role, model: s.model ?? '(none)', hasPosition: !!s.position })));
        });

        // NEW: guarantee Atmos overheads exist & have models,
        // independent of surround model selection.
        let withOverheads = ensureAtmosOverheads({
          placedSpeakers: nextList,
          dolbyPreset,
          roomDimensions: stableDimensions,
          overheadGlobalModel: _overheadGlobalModel,
          overheadFrontOverride: _overheadFrontOverride,
          overheadMidOverride: _overheadMidOverride,
          overheadRearOverride: _overheadRearOverride,
          useFrontGlobal: _useFrontGlobal,
          useMidGlobal: _useMidGlobal,
          useRearGlobal: _useRearGlobal
        });

        // CRITICAL: Final safety pass - ensure surround roles NEVER lose their model
        const surroundRolesToProtect = surroundRolesSet;
        const globalSurroundModelFinal = appState?.globalSurroundModel;

        if (isValidSurroundModel(globalSurroundModelFinal)) {
          withOverheads = withOverheads.map((spk) => {
            const canonRole = safeCanon(spk.role);
            if (!surroundRolesToProtect.has(canonRole)) return spk;
            if (!isValidSurroundModel(spk.model)) {
              return { ...spk, model: globalSurroundModelFinal };
            }
            return spk;
          });
        }

        // DEBUG: Log final state before commit
        if (globalThis.__B44_LOGS) {
          const bedOnly = withOverheads.filter((s) => surroundRolesToProtect.has(safeCanon(s.role)));
          console.log('[RD RECON] FINAL COMMIT:', {
            dolbyLayout: dolbyPreset,
            sevenBedLayoutType: _sevenBedLayoutType,
            expectedRoles: expectedRoles,
            surroundRolesInOutput: bedOnly.map((s) => ({
              role: s.role,
              canon: safeCanon(s.role),
              model: s.model || '(none)'
            }))
          });
        }

        // [B44 FINAL FIX] Enforce required surround roles in the FINAL list
        const final = Array.isArray(withOverheads) ? [...withOverheads] : [];
        const haveFinal = new Set(final.map((s) => safeCanon(s?.role)));

        const ensureFinal = (role) => {
          if (haveFinal.has(role)) return;
          const fallbackModel = surroundRolesSet.has(safeCanon(role)) ? pickSurroundModel() : undefined;
          final.push({ id: role, role, label: role, model: fallbackModel, position: null });
          haveFinal.add(role);
        };

        if (wantsRears) { ensureFinal('SBL'); ensureFinal('SBR'); }
        if (wantsWides) { ensureFinal('LW'); ensureFinal('RW'); }

        if (globalThis.__B44_LOGS) {
          debug(`[Speakers][FINAL] major=${major} wantsRears=${wantsRears} wantsWides=${wantsWides} roles=${final.map((s) => safeCanon(s.role)).join(', ')}`);
        }

        if (speakersEqual(prev, final)) return prev;
        return final;
      });
    }
  }, [
    appState?.isHydrated,
    dolbyPreset, stableDimensions, setSpeakers, _isFrozen, placedSpeakers, _sevenBedLayoutType, lastPresetRef,
    _overheadGlobalModel, _overheadFrontOverride, _overheadMidOverride, _overheadRearOverride,
    _useFrontGlobal, _useMidGlobal, _useRearGlobal, loadState?.phase, appState?.roomResetEpoch
  ]);
}