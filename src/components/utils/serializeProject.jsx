// components/utils/serializeProject.js
//
// Single source of truth for how a Room Designer project
// is written into the Project entity.
//
// INPUT: plain JS values from appState + local state
// OUTPUT: flat object that matches entities/Project.json

// Helper: safely parse JSON strings or return native types unchanged
function safeParseJson(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  return value;
}

// Helper: ensure array return (backward compatible with stringified arrays)
function asArray(value) {
  const parsed = safeParseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

// Helper: ensure object return (backward compatible with stringified objects)
function asObject(value) {
  const parsed = safeParseJson(value);
  return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
}

export function serializeProject(input = {}) {
  const {
    // Meta (RoomDesigner is NOT allowed to rename an existing project)
    name,

    // Geometry / room
    roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },

    // Legacy dimensions – kept for backwards compatibility
    dimensions = {},

    // Screen config
    screen = {},

    // Seating & layout
    seatingPositions = [],
    seatsPerRowByRow = [],
    rowSpacingM = 1.8,
    seatingRows = 1,
    seatsPerRow = 1,
    seatSpacing = 0.6,
    mlpBasis = "middle",
    seatingBlockOffset = 0,
    rowEarHeights = [],

    // Speakers / subs / elements
    placedSpeakers = [],
    roomElements = [],
    subwoofers = [],

    // Config + overlays
    dolbyLayout = "5.1",
    overlays = {},
    frozenTabs = {},
    sevenBedLayoutType = "rears",

    // Speaker selection & SPL
    speakerSelections = {},
    selectedSpeakersByRole = {},
    speakerNodes = [],
    splConfig = { globalPowerW: 100, globalEqHeadroomDb: 0, perRole: {} },
    globalSurroundModel = null,
    extraSurroundCount = 0,

    // Front wides / bed layout
    enableFrontWides = false,
    lcrAimMode = "angled",

    // Overheads
    overheadGlobalModel = null,
    overheadFrontOverride = null,
    overheadMidOverride = null,
    overheadRearOverride = null,
    useFrontGlobal = true,
    useMidGlobal = true,
    useRearGlobal = true,

    // Screen plane
    screenFrontPlaneM = 0,

    // Subwoofer config (stored as JSON blobs for now)
    frontSubsCfg = null,
    rearSubsCfg = null,

    // P12 result (from app state, written by LCRPanel)
    p12Mode = null,
    p12Level = null,
  } = input;

  // Normalised room dims (support legacy dimensions as a fallback)
  const widthM =
    Number(roomDims?.widthM) ||
    Number(dimensions?.width) ||
    0;
  const lengthM =
    Number(roomDims?.lengthM) ||
    Number(dimensions?.length) ||
    0;
  const heightM =
    Number(roomDims?.heightM) ||
    Number(dimensions?.height) ||
    0;

  // Screen
  const visibleWidthInches = Number(screen?.visibleWidthInches) || 0;
  const aspectRatio = screen?.aspectRatio || "16:9";
  const manualMode = !!screen?.manualMode;
  const manualWidthM = Number(screen?.manualWidthM) || 0;
  const manualHeightM = Number(screen?.manualHeightM) || 0;
  const screenHeightFromFloorM =
    typeof screen?.heightFromFloorM === "number"
      ? screen.heightFromFloorM
      : 0.5;
  const floatDepthM = Number(screen?.floatDepthM) || 0;
  const speakerClearanceM =
    Number(screen?.speakerClearanceM ?? 0.02) || 0.02;
  const showScreenPlane = !!screen?.showScreenPlane;
  const showCavity = !!screen?.showCavity;

  // Helper to JSON-stringify safely
  const j = (value, fallback) => {
    try {
      if (value == null) return fallback ?? null;
      return JSON.stringify(value);
    } catch (e) {
      return fallback ?? null;
    }
  };

  return {
    // Meta
    name: name || "Untitled Room",

    // Room dims (canonical + legacy)
    room_width: widthM,
    room_length: lengthM,
    room_height: heightM,
    roomDims: j(
      {
        widthM,
        lengthM,
        heightM,
      },
      null
    ),

    // Screen
    screen_size: visibleWidthInches,
    aspect_ratio: aspectRatio,
    manual_dimensions: manualMode,
    manual_width_m: manualWidthM,
    manual_height_m: manualHeightM,
    screen_height_from_floor: screenHeightFromFloorM,
    screen_mount_mode: screen?.mountMode || "floating",
    float_depth_m: floatDepthM,
    show_screen_plane: showScreenPlane,
    show_cavity: showCavity,
    speaker_clearance_m: speakerClearanceM,
    screen_front_plane_m: Number(screenFrontPlaneM) || 0,

    // Seating & layout
    seating_positions: asArray(seatingPositions),
    row_spacing_m: Number(rowSpacingM) || 1.8,
    seats_per_row_by_row: asArray(seatsPerRowByRow),
    seating_rows: Number(seatingRows) || 1,
    seats_per_row: Number(seatsPerRow) || 1,
    seat_spacing: Number(seatSpacing) || 0.6,
    mlp_basis: typeof mlpBasis === "string" ? mlpBasis : "middle",
    seating_block_offset: Number(seatingBlockOffset) || 0,
    row_ear_heights: asArray(rowEarHeights),

    // Dolby / bed layout
    dolby_config: dolbyLayout || "5.1",
    seven_bed_layout_type: sevenBedLayoutType,
    lcr_aim_mode: lcrAimMode,
    enable_front_wides: !!enableFrontWides,
    global_surround_model: globalSurroundModel,
    extra_surround_count: Number.isFinite(Number(extraSurroundCount)) ? Number(extraSurroundCount) : 0,

    // Speakers & subs
    // Audit: ensure each placed speaker retains id, role, model, position.x/y/z
    selected_speakers: asArray(placedSpeakers).map((spk) => {
      if (!spk || typeof spk !== 'object') return spk;
      const pos = spk.position || {};
      return {
        ...spk,
        id: spk.id ?? spk.role ?? '',
        role: spk.role ?? '',
        model: spk.model ?? '',
        position: {
          ...pos,
          x: typeof pos.x === 'number' ? pos.x : 0,
          y: typeof pos.y === 'number' ? pos.y : 0,
          z: typeof pos.z === 'number' ? pos.z : 0,
        },
      };
    }),
    selected_speakers_by_role: asObject(selectedSpeakersByRole),
    spl_speaker_nodes: asArray(speakerNodes),
    room_elements: asArray(roomElements),
    subwoofers: asArray(subwoofers),

    // Sub configs must be objects to match Project schema.
    // Do not stringify. Do not inject defaults. If unset/null, omit entirely.
    ...(frontSubsCfg && typeof frontSubsCfg === "object" ? { front_subs_cfg: frontSubsCfg } : {}),
    ...(rearSubsCfg && typeof rearSubsCfg === "object" ? { rear_subs_cfg: rearSubsCfg } : {}),

    // Overlays / UI state
    overlays: asObject(overlays),
    frozen_tabs: j(frozenTabs || {}, "{}"),

    // Overheads
    overhead_global_model: overheadGlobalModel,
    overhead_front_override: overheadFrontOverride,
    overhead_mid_override: overheadMidOverride,
    overhead_rear_override: overheadRearOverride,
    use_front_global: !!useFrontGlobal,
    use_mid_global: !!useMidGlobal,
    use_rear_global: !!useRearGlobal,

    // SPL config (merged with current P12 result if available)
    spl_config: {
      ...asObject(splConfig),
      ...(p12Mode != null ? { p12_mode: p12Mode } : {}),
      ...(p12Level != null ? { p12_level: p12Level } : {}),
    },
  };
}