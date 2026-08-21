// Shared project hydration helper — used by both RoomDesigner (via useProjectLoader)
// and RP22Report for direct project loading.
// Extracted from components/hooks/useProjectLoader.js hydrateFromProject(...).
// Do not add logic here; keep it a pure pass-through to existing setters.

import { parseProjectJson } from "@/components/roomdesigner/RoomDesignerHelpers";
import {
  normaliseLegacySubwoofers,
  bassInputAdapter,
  validateInstances,
} from "@/components/utils/subwooferInstanceMigration";
import { MIGRATION_STATE, INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import { migrateP12Mode } from "@/components/utils/p12ModeAuthority";
import { resolveVisibleWidthInches } from "@/components/hooks/useSeatingRebuild";

const parseMaybe = (val, fallback) => {
  if (val == null) return fallback;
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return val;
  if (typeof val === "string" && val.trim()) {
    try { return JSON.parse(val); } catch { /* ignore */ }
  }
  return fallback;
};

/**
 * Hydrates all app state setters from a raw Project entity object.
 * Mirrors the hydrateFromProject logic in useProjectLoader exactly.
 *
 * @param {Object} p  - Raw project entity from the database
 * @param {Object} appState - From useAppState()
 * @param {Object} setters  - Additional setters that may not be on appState
 *   {
 *     setScreen, setDolbyConfig, setDolbyPreset, setSevenBedLayoutType,
 *     setLcrAimMode, setEnableFrontWides,
 *     setOverheadGlobalModel, setOverheadFrontOverride, setOverheadMidOverride, setOverheadRearOverride,
 *     setUseFrontGlobal, setUseMidGlobal, setUseRearGlobal,
 *     setRowSpacingM, setSeatsPerRowByRow,
 *     setOverlays, setSeatingPositions, setRoomElements,
 *     setFrontSubsCfg, setRearSubsCfg,
 *     setSelectedSpeakersByRole, setSpeakerNodes,
 *     setSpeakerSystem,
 *     setFreeMoveLcr, (optional)
 *   }
 */
export function hydrateProjectIntoAppState(p, appState, setters = {}) {
  if (!p) return;

  // HYDRATION PROTECTION: At the start of every project load, clear previous
  // subwoofer state so a previous project never leaks into the next project.
  if (typeof appState?.setSubwooferInstancesStatus === "function") {
    appState.setSubwooferInstancesStatus(INSTANCE_STATUS.UNINITIALISED);
  }
  if (typeof appState?.setSubwooferInstances === "function") {
    appState.setSubwooferInstances([]);
  }
  if (typeof appState?.setSubwoofers === "function") {
    appState.setSubwoofers([]);
  }

  const {
    setScreen,
    setDolbyConfig,
    setDolbyPreset,
    setSevenBedLayoutType,
    setLcrAimMode,
    setEnableFrontWides,
    setOverheadGlobalModel,
    setOverheadFrontOverride,
    setOverheadMidOverride,
    setOverheadRearOverride,
    setUseFrontGlobal,
    setUseMidGlobal,
    setUseRearGlobal,
    setRowSpacingM,
    setSeatsPerRowByRow,
    setSeatingRows,
    setSeatsPerRow,
    setSeatSpacing,
    setMlpBasis,
    setSeatingBlockOffset,
    setRowEarHeights,
    setOverlays,
    setSeatingPositions,
    setRoomElements,
    setFrontSubsCfg,
    setRearSubsCfg,
    setSelectedSpeakersByRole,
    setSpeakerNodes,
    setSpeakerSystem,
    setFreeMoveLcr,
    setGlobalSurroundModel,
    setExtraSurroundCount,
    setRspMode,
    setManualRspY_m,
    setManualRspX_m,
  } = setters;

  // 1) ROOM DIMS
  if (appState?.setRoomDims) {
    let nextWidthM, nextLengthM, nextHeightM;
    if (p.roomDims) {
      try {
        const parsed = JSON.parse(p.roomDims);
        nextWidthM = Number(parsed?.widthM ?? parsed?.width) || Number(p?.room_width) || 4.5;
        nextLengthM = Number(parsed?.lengthM ?? parsed?.length) || Number(p?.room_length) || 6.0;
        nextHeightM = Number(parsed?.heightM ?? parsed?.height) || Number(p?.room_height) || 2.4;
      } catch {
        nextWidthM = Number(p?.room_width) || 4.5;
        nextLengthM = Number(p?.room_length) || 6.0;
        nextHeightM = Number(p?.room_height) || 2.4;
      }
    } else {
      nextWidthM = Number(p?.room_width) || 4.5;
      nextLengthM = Number(p?.room_length) || 6.0;
      nextHeightM = Number(p?.room_height) || 2.4;
    }
    appState.setRoomDims({ widthM: nextWidthM, lengthM: nextLengthM, heightM: nextHeightM });
  }

  // 2) SCREEN
  const screenSizeInches = Number(p?.screen_size) || 120;
  const aspectRatio = p?.aspect_ratio || "16:9";
  const hasTvPreset = !!p?.tv_preset_key;
  if (typeof setScreen === "function") {
    setScreen((prev) => ({
      ...prev,
      // For TV presets, derive visibleWidthInches from the canonical preset key/mm
      // so live state stays coherent with persisted tv_preset_key/tv_width_mm.
      // For projector/manual projects (no tv_preset_key), restore screen_size directly.
      visibleWidthInches: hasTvPreset
        ? resolveVisibleWidthInches({
            tvPresetKey: p?.tv_preset_key ?? null,
            tvWidthMm: Number(p?.tv_width_mm) || null,
            visibleWidthInches: screenSizeInches,
          })
        : screenSizeInches,
      aspectRatio,
      manualMode: !!p?.manual_dimensions,
      manualWidthM: Number(p?.manual_width_m) || 0,
      manualHeightM: Number(p?.manual_height_m) || 0,
      mountMode: p?.screen_mount_mode || "floating",
      floatDepthM: Number(p?.float_depth_m) || 0.2,
      showScreenPlane: !!p?.show_screen_plane,
      showCavity: !!p?.show_cavity,
      speakerClearanceM: Number(p?.speaker_clearance_m) || 0.02,
      heightFromFloorM: typeof p?.screen_height_from_floor === "number" ? p.screen_height_from_floor : 0.5,
      tvPresetKey: p?.tv_preset_key ?? null,
      tvWidthMm: Number(p?.tv_width_mm) || null,
      borderThicknessM: Number(p?.border_thickness_m) || 0.08,
    }));
  }

  // 3) LAYOUT / DOLBY
  if (typeof setDolbyConfig === "function") setDolbyConfig(p?.dolby_config || "5.1");
  if (typeof setDolbyPreset === "function") setDolbyPreset(p?.dolby_config || "5.1");
  if (typeof setSevenBedLayoutType === "function") setSevenBedLayoutType(p?.seven_bed_layout_type || "rears");

  const hydratedLcrAimMode = p?.lcr_aim_mode;
  if ((hydratedLcrAimMode === "flat" || hydratedLcrAimMode === "angled") && typeof setLcrAimMode === "function") {
    setLcrAimMode(hydratedLcrAimMode);
  }
  if (typeof setEnableFrontWides === "function") setEnableFrontWides(p?.enable_front_wides ?? false);
  if (typeof setFreeMoveLcr === "function") setFreeMoveLcr(!!p?.free_move_lcr);

  if (typeof setGlobalSurroundModel === "function") {
    setGlobalSurroundModel(p?.global_surround_model || null);
  }

  if (typeof setExtraSurroundCount === "function") {
    const nextExtraCount = Number(p?.extra_surround_count);
    setExtraSurroundCount(Number.isFinite(nextExtraCount) ? nextExtraCount : 0);
  }

  const rowSpacing = Number(p?.row_spacing_m) || 1.8;
  if (typeof setRowSpacingM === "function") setRowSpacingM(rowSpacing);

  const seatsPerRowByRowData = parseMaybe(p?.seats_per_row_by_row, []);
  if (Array.isArray(seatsPerRowByRowData) && typeof setSeatsPerRowByRow === "function") {
    setSeatsPerRowByRow(seatsPerRowByRowData);
  }

  const seatingRows = Number(p?.seating_rows);
  if (Number.isFinite(seatingRows) && typeof setSeatingRows === "function") setSeatingRows(seatingRows);

  const seatsPerRow = Number(p?.seats_per_row);
  if (Number.isFinite(seatsPerRow) && typeof setSeatsPerRow === "function") setSeatsPerRow(seatsPerRow);

  const seatSpacing = Number(p?.seat_spacing);
  if (Number.isFinite(seatSpacing) && typeof setSeatSpacing === "function") setSeatSpacing(seatSpacing);

  if (typeof p?.mlp_basis === "string" && typeof setMlpBasis === "function") setMlpBasis(p.mlp_basis);

  const seatingBlockOffset = Number(p?.seating_block_offset);
  if (Number.isFinite(seatingBlockOffset) && typeof setSeatingBlockOffset === "function") setSeatingBlockOffset(seatingBlockOffset);

  const rowEarHeights = parseMaybe(p?.row_ear_heights, []);
  if (Array.isArray(rowEarHeights) && typeof setRowEarHeights === "function") setRowEarHeights(rowEarHeights);

  // 3b) LINK EAR & PLATFORM HEIGHTS — persisted per-project
  if (typeof appState?.setLinkEarPlatformHeights === "function") {
    appState.setLinkEarPlatformHeights(typeof p?.link_ear_platform_heights === "boolean" ? p.link_ear_platform_heights : true);
  }

  // 4) OVERHEAD CONFIG
  if (typeof setOverheadGlobalModel === "function") setOverheadGlobalModel(p?.overhead_global_model || null);
  if (typeof setOverheadFrontOverride === "function") setOverheadFrontOverride(p?.overhead_front_override || null);
  if (typeof setOverheadMidOverride === "function") setOverheadMidOverride(p?.overhead_mid_override || null);
  if (typeof setOverheadRearOverride === "function") setOverheadRearOverride(p?.overhead_rear_override || null);
  if (typeof setUseFrontGlobal === "function") setUseFrontGlobal(typeof p?.use_front_global === "boolean" ? p.use_front_global : true);
  if (typeof setUseMidGlobal === "function") setUseMidGlobal(typeof p?.use_mid_global === "boolean" ? p.use_mid_global : true);
  if (typeof setUseRearGlobal === "function") setUseRearGlobal(typeof p?.use_rear_global === "boolean" ? p.use_rear_global : true);

  // 5) OVERLAYS
  const defaultOverlays = {
    LCR: false, FRONT_WIDE: false, SIDE_SURROUND: false, REAR_SURROUND: false,
    OVERHEADS_2: false, OVERHEADS_4: false, OVERHEADS_6: false, RP22_ANGLES: false,
    enableDolbyZones: false, ROOM_DIMS: false,
  };
  const overlaysData = parseMaybe(p?.overlays, defaultOverlays);
  const normalisedOverlays = { ...defaultOverlays, ...overlaysData };
  // Stage 1: Normalise overhead toggle fields to strict booleans — legacy object
  // values must not pass through as overlay toggles to RP22ZonesOverlay.
  for (const key of ['OVERHEADS_2', 'OVERHEADS_4', 'OVERHEADS_6']) {
    normalisedOverlays[key] = typeof normalisedOverlays[key] === 'boolean' ? normalisedOverlays[key] : defaultOverlays[key];
  }
  if (typeof setOverlays === "function") setOverlays(normalisedOverlays);

  // 6) SEATING
  const sp = parseMaybe(p?.seating_positions, []);
  if (Array.isArray(sp) && typeof setSeatingPositions === "function") setSeatingPositions(sp);

  // 7) ROOM ELEMENTS
  const re = parseMaybe(p?.room_elements, []);
  if (typeof setRoomElements === "function") setRoomElements(Array.isArray(re) ? re : []);

  // 8) SUB CONFIG
  if (typeof setFrontSubsCfg === "function" && typeof setRearSubsCfg === "function") {
    const defaultInactive = { model: null, count: 0, positions: [], tuning: [] };
    const frontCfgRaw = parseProjectJson((p?.front_subs_cfg ?? p?.frontSubsCfg), null);
    const rearCfgRaw = parseProjectJson((p?.rear_subs_cfg ?? p?.rearSubsCfg), null);
    const loadedSubs = parseProjectJson(p?.subwoofers, []);
    const subsList = Array.isArray(loadedSubs) ? loadedSubs : [];
    const frontSubs = subsList.filter(s => (s?.group === "front") || String(s?.role || "").startsWith("SUBF"));
    const rearSubs = subsList.filter(s => (s?.group === "rear") || String(s?.role || "").startsWith("SUBR"));

    const isCfgUsable = (cfg) => {
      if (!cfg || typeof cfg !== "object") return false;
      const hasModel = typeof cfg.model === "string" && cfg.model.trim().length > 0;
      const hasCount = Number.isFinite(Number(cfg.count)) && Number(cfg.count) > 0;
      return hasModel || hasCount;
    };
    const deriveCfgFromSubs = (subs) => {
      if (!subs.length) return null;
      const model = String(subs?.[0]?.model || "SUB2-12").trim() || "SUB2-12";
      const positions = subs
        .map(s => ({ x: Number(s?.position?.x), y: Number(s?.position?.y) }))
        .filter(pos => Number.isFinite(pos.x) && Number.isFinite(pos.y));
      return { model, count: subs.length, positions, tuning: [] };
    };

    setFrontSubsCfg(isCfgUsable(frontCfgRaw) ? frontCfgRaw : (deriveCfgFromSubs(frontSubs) || defaultInactive));
    setRearSubsCfg(isCfgUsable(rearCfgRaw) ? rearCfgRaw : (deriveCfgFromSubs(rearSubs) || defaultInactive));

    // Stage 1: Subwoofer instance migration — authority rules A/B/C.
    //
    // A) Valid subwooferInstances exist → instances are canonical.
    //    Analysis uses instances. Save uses instances. CFG cannot overwrite
    //    IDs, models, positions, enabled state, or calibration.
    //
    // B) Instances absent → normalise legacy CFG once into runtime instances.
    //    Do NOT autosave merely because migration occurred. Persist on the
    //    next normal user save.
    //
    // C) Instances present but malformed → report an explicit migration/load
    //    error. Do NOT silently replace from CFG. Do NOT autosave corrupted
    //    or substituted data.
    //
    // D) Both sources exist and disagree → subwooferInstances wins; CFG
    //    remains compatibility data only.
    const roomDimsForNorm = {
      widthM: Number(p?.room_width) || 4.5,
      lengthM: Number(p?.room_length) || 6.0,
      heightM: Number(p?.room_height) || 2.4,
    };

    // Detect field presence directly from the project object BEFORE parsing.
    // parseProjectJson swallows parse errors (returns fallback), so we cannot
    // distinguish "field absent" from "field present but unparseable" after
    // parsing. Malformed-present data must never migrate from CFG.
    const instanceFieldPresent =
      Object.prototype.hasOwnProperty.call(p, "subwooferInstances") &&
      p.subwooferInstances !== undefined &&
      p.subwooferInstances !== null;

    let rawInstances = null;
    let parseFailed = false;
    if (instanceFieldPresent) {
      const raw = p.subwooferInstances;
      if (Array.isArray(raw)) {
        rawInstances = raw;
      } else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            rawInstances = parsed;
          } else {
            parseFailed = true;
          }
        } catch {
          parseFailed = true;
        }
      } else {
        // object, number, boolean, etc. — not a valid instances array
        parseFailed = true;
      }
    }

    // Distinguish: field absent, parse failed, valid empty array, malformed present array
    const instancesAbsent = !instanceFieldPresent;
    const instancesPresent = Array.isArray(rawInstances) && rawInstances.length > 0;
    const instancesEmptyValid = Array.isArray(rawInstances) && rawInstances.length === 0;
    const validation = validateInstances(rawInstances);

    if (parseFailed) {
      // Rule C (parse failure): field present but unparseable or not an array — ERROR.
      // Do NOT substitute CFG, do NOT migrate, do NOT autosave.
      const errMsg = `[subwooferInstanceMigration] Rule C: project "${p?.id || p?.name || "?"}" has subwooferInstances field present but unparseable or not an array. ` +
        `Instances were cleared. CFG was NOT substituted. Bass/RP22 analysis is blocked for this project.`;
      console.error(errMsg);
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new CustomEvent("subwoofer-instance-migration-error", {
            detail: { projectId: p?.id, errors: ["subwooferInstances present but unparseable or not an array"], fatal: true },
          }));
        } catch { /* ignore */ }
      }
      if (typeof appState?.setSubwooferInstances === "function") {
        appState.setSubwooferInstances([]);
      }
      if (typeof appState?.setSubwoofers === "function") {
        appState.setSubwoofers([]);
      }
      if (typeof appState?.setSubwooferInstancesStatus === "function") {
        appState.setSubwooferInstancesStatus(INSTANCE_STATUS.ERROR);
      }
      if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
        appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
      }
    } else if (instancesPresent && !validation.valid) {
      // Rule C: malformed instances — clear ALL subwoofer state, block analysis,
      // expose error, do NOT substitute CFG, do NOT autosave.
      const errMsg = `[subwooferInstanceMigration] Rule C: project "${p?.id || p?.name || "?"}" has malformed subwooferInstances. ` +
        `Errors: ${validation.errors.join("; ")}. ` +
        `Instances were cleared. CFG was NOT substituted. Bass/RP22 analysis is blocked for this project.`;
      console.error(errMsg);
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new CustomEvent("subwoofer-instance-migration-error", {
            detail: { projectId: p?.id, errors: validation.errors, fatal: true },
          }));
        } catch { /* ignore */ }
      }
      // Clear subwooferInstances and runtime subwoofers
      if (typeof appState?.setSubwooferInstances === "function") {
        appState.setSubwooferInstances([]);
      }
      if (typeof appState?.setSubwoofers === "function") {
        appState.setSubwoofers([]);
      }
      // Set authority status to ERROR — blocks analysis and autosave
      if (typeof appState?.setSubwooferInstancesStatus === "function") {
        appState.setSubwooferInstancesStatus(INSTANCE_STATUS.ERROR);
      }
      if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
        appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
      }
    } else if (instancesPresent && validation.valid) {
      // Rule A/D: valid persisted instances — use directly, ignore CFG for analysis.
      if (typeof appState?.setSubwooferInstances === "function") {
        appState.setSubwooferInstances(rawInstances);
      }
      if (typeof appState?.setSubwoofers === "function") {
        appState.setSubwoofers(bassInputAdapter(rawInstances));
      }
      if (typeof appState?.setSubwooferInstancesStatus === "function") {
        appState.setSubwooferInstancesStatus(INSTANCE_STATUS.VALID);
      }
      // Already persisted — no migration needed
      if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
        appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.PERSISTED);
      }
    } else if (instancesEmptyValid) {
      // Valid empty array — project intentionally has zero subwoofers
      if (typeof appState?.setSubwooferInstances === "function") {
        appState.setSubwooferInstances([]);
      }
      if (typeof appState?.setSubwoofers === "function") {
        appState.setSubwoofers([]);
      }
      if (typeof appState?.setSubwooferInstancesStatus === "function") {
        appState.setSubwooferInstancesStatus(INSTANCE_STATUS.VALID);
      }
      if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
        appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.PERSISTED);
      }
    } else {
      // Rule B: instances absent — normalise from CFG once into runtime instances.
      // Do NOT autosave merely because migration occurred.
      const frontCfgForNorm = isCfgUsable(frontCfgRaw) ? frontCfgRaw : deriveCfgFromSubs(frontSubs);
      const rearCfgForNorm = isCfgUsable(rearCfgRaw) ? rearCfgRaw : deriveCfgFromSubs(rearSubs);
      if (frontCfgForNorm || rearCfgForNorm) {
        const migrated = normaliseLegacySubwoofers(frontCfgForNorm, rearCfgForNorm, roomDimsForNorm, null);
        if (migrated.length > 0) {
          if (typeof appState?.setSubwooferInstances === "function") {
            appState.setSubwooferInstances(migrated);
          }
          if (typeof appState?.setSubwoofers === "function") {
            appState.setSubwoofers(bassInputAdapter(migrated));
          }
          // Authority status is VALID (instances are now canonical)
          if (typeof appState?.setSubwooferInstancesStatus === "function") {
            appState.setSubwooferInstancesStatus(INSTANCE_STATUS.VALID);
          }
          // Mark as runtime_migrated — autosave must ignore this initial change
          if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
            appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.RUNTIME_MIGRATED);
          }
        } else {
          // Migration produced zero instances — valid empty
          if (typeof appState?.setSubwooferInstances === "function") {
            appState.setSubwooferInstances([]);
          }
          if (typeof appState?.setSubwooferInstancesStatus === "function") {
            appState.setSubwooferInstancesStatus(INSTANCE_STATUS.VALID);
          }
          if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
            appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
          }
        }
      } else if (subsList.length && typeof appState?.setSubwoofers === "function") {
        // Fallback: no instances and no usable CFG — use legacy subsList.
        appState.setSubwoofers(subsList);
        if (typeof appState?.setSubwooferInstancesStatus === "function") {
          appState.setSubwooferInstancesStatus(INSTANCE_STATUS.ABSENT_LEGACY);
        }
        if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
          appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
        }
      } else {
        // No instances, no CFG, no legacy subs — valid empty
        if (typeof appState?.setSubwooferInstances === "function") {
          appState.setSubwooferInstances([]);
        }
        if (typeof appState?.setSubwooferInstancesStatus === "function") {
          appState.setSubwooferInstancesStatus(INSTANCE_STATUS.VALID);
        }
        if (typeof appState?.setSubwooferInstanceMigrationState === "function") {
          appState.setSubwooferInstanceMigrationState(MIGRATION_STATE.NONE);
        }
      }
    }
  }

  // 9) SPEAKER ROLES + SPL NODES
  if (typeof setSelectedSpeakersByRole === "function") {
    setSelectedSpeakersByRole(parseMaybe(p?.selected_speakers_by_role, {}));
  }

  // Parse spl_speaker_nodes once — used both for setSpeakerNodes and position merge below.
  const speakerNodes = (() => {
    const nodes = parseMaybe(p?.spl_speaker_nodes, []);
    return Array.isArray(nodes) ? nodes : [];
  })();

  if (typeof setSpeakerNodes === "function") {
    setSpeakerNodes(speakerNodes);
  }

  // Build a canonical role → node position map.
  // Handles aliases: FC / C / Centre / Center all resolve to the same key.
  // Used only for the merge lookup — original role values are never mutated.
  const normalizeSpeakerRole = (r) => {
    if (!r) return "";
    const u = String(r).toUpperCase().trim();
    if (u === "C" || u === "CENTRE" || u === "CENTER" || u === "FC") return "FC";
    return u;
  };
  const nodePositionByCanonRole = new Map();
  speakerNodes.forEach(node => {
    const key = normalizeSpeakerRole(node?.role ?? node?.channel);
    if (!key) return;
    const x = Number(node.x), y = Number(node.y), z = Number(node.z);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      nodePositionByCanonRole.set(key, { x, y, z });
    }
  });

  // 10) SPL CONFIG
  if (typeof appState?.setSplConfig === "function") {
    const splCfg = parseMaybe(p?.spl_config, null);
    const defaultSplConfig = {
      lcrW: 100, surroundsW: 100, overheadsW: 100, globalPowerW: 100,
      globalEqHeadroomDb: 0, radiationMode: 'half-space', p13Mode: 'minimum', perRole: {}
    };
    appState.setSplConfig(splCfg || defaultSplConfig);
  }

  // 10b) P12 mode/level (stored inside spl_config on the entity)
  // Legacy vocabulary migration: half-space -> minimum, anechoic -> recommended.
  // Unknown/missing -> minimum. This is the ONLY place radiation vocabulary is
  // translated to p12Mode; after hydration the two authorities are independent.
  if (typeof appState?.setP12Mode === "function") {
    appState.setP12Mode(migrateP12Mode(p?.spl_config?.p12_mode ?? null));
  }
  if (typeof appState?.setP12Level === "function") {
    appState.setP12Level(p?.spl_config?.p12_level ?? null);
  }

  // 10c) screenFrontPlaneM — restore persisted value so signature matches on first autosave tick
  if (typeof appState?.setScreenFrontPlaneM === "function") {
    const sfp = Number(p?.screen_front_plane_m);
    appState.setScreenFrontPlaneM(Number.isFinite(sfp) ? sfp : 0);
  }

  // 10d) RSP MODE + MANUAL RSP POSITION (x, y)
  if (typeof setRspMode === "function") {
    setRspMode(p?.rsp_mode || "auto_from_screen");
  }
  if (typeof setManualRspY_m === "function") {
    const y = Number(p?.manual_rsp_y_m);
    setManualRspY_m(Number.isFinite(y) ? y : null);
  }
  if (typeof setManualRspX_m === "function") {
    const x = Number(p?.manual_rsp_x_m);
    setManualRspX_m(Number.isFinite(x) ? x : null);
  }

  // 10e) VIEWING PRIORITY (multi-row viewing intent) — project-scoped
  if (typeof appState?.setViewingPriority === "function") {
    const vp = typeof p?.viewing_priority === "string" && p.viewing_priority
      ? p.viewing_priority
      : "balanced";
    appState.setViewingPriority(vp);
  }

  // 10e2) P15/P21 MANUAL DESIGN ESTIMATES
  if (typeof appState?.setP15ConstructionLevelSafe === "function") {
    const p15 = p?.p15_construction_level;
    const P15_ALLOWED = new Set(["standard", "purpose-built", "reference", "studio"]);
    appState.setP15ConstructionLevelSafe(P15_ALLOWED.has(p15) ? p15 : "purpose-built");
  }
  if (typeof appState?.setP21EarlyReflectionPresetSafe === "function") {
    const p21 = p?.p21_early_reflection_preset;
    const P21_ALLOWED = new Set(["l1", "l2", "l3", "l4"]);
    appState.setP21EarlyReflectionPresetSafe(P21_ALLOWED.has(p21) ? p21 : "l3");
  }

  // 10f) ACOUSTIC TREATMENT (Abfuser product selection)
  if (typeof appState?.setAcousticTreatmentEnabled === "function") {
    appState.setAcousticTreatmentEnabled(!!p?.acoustic_treatment_enabled);
  }
  if (typeof appState?.setSelectedAbfuserQty === "function") {
    const qty = Number(p?.selected_abfuser_qty);
    appState.setSelectedAbfuserQty(Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0);
  }
  if (typeof appState?.setAbfuserQtySource === "function") {
    const src = p?.abfuser_qty_source;
    appState.setAbfuserQtySource(src === "user" ? "user" : "recommended");
  }

  // 11) PLACED SPEAKERS
  const loadedSpeakers = (() => {
    const v1 = parseMaybe(p?.selected_speakers, null);
    if (Array.isArray(v1)) return v1;
    const legacy = parseMaybe(p?.placedSpeakers, null);
    if (Array.isArray(legacy)) return legacy;
    return null;
  })();

  if (typeof setSpeakerSystem === "function") {
    // Merge spl_speaker_nodes positions into placedSpeakers.
    // spl_speaker_nodes is the position authority — it contains the live x/y/z
    // set by the Room Designer (e.g. FC z=0.59m). selected_speakers may have
    // stale or missing position.z, causing FrontElevation to fall back to 1.2m.
    const mergedSpeakers = Array.isArray(loadedSpeakers)
      ? loadedSpeakers.map(spk => {
          const nodePos = nodePositionByCanonRole.get(normalizeSpeakerRole(spk?.role));
          if (!nodePos) return spk;
          return {
            ...spk,
            position: {
              ...(spk.position || {}),
              x: nodePos.x,
              y: nodePos.y,
              z: nodePos.z,
            },
          };
        })
      : [];

    console.log('[HYDRATE speakers]', {
      extra_surround_count: p?.extra_surround_count,
      global_surround_model: p?.global_surround_model,
      roles: mergedSpeakers.map(s => `${s?.role} z=${s?.position?.z}`),
    });
    setSpeakerSystem((prev) => ({
      ...(prev || {}),
      placedSpeakers: mergedSpeakers,
    }));
  }
}