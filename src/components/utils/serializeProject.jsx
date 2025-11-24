export function serializeProject(input) {
  const {
    // Core meta
    name,

    // Room geometry
    roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    dimensions = {},

    // Screen
    screen = {},

    // Seating & layout
    seatingPositions = [],
    seatsPerRowByRow = [],
    rowSpacingM = 1.8,

    // Speakers
    placedSpeakers = [],
    selectedSpeakersByRole = {},    // NEW: canonical per-role speaker map
    speakerNodes = [],              // NEW: from SPL calculator

    // Room elements
    roomElements = [],

    // Subs & config
    frontSubsCfg = null,            // { count, model } or similar
    rearSubsCfg = null,
    dolbyLayout = "5.1",

    // Overlays / UI state
    overlays = {},
    frozenTabs = {},
    sevenBedLayoutType = "rears",
    enableFrontWides = false,

    // Overheads
    overheadGlobalModel = null,
    overheadFrontOverride = null,
    overheadMidOverride = null,
    overheadRearOverride = null,
    useFrontGlobal = true,
    useMidGlobal = true,
    useRearGlobal = true,

    // SPL / screen front plane
    splConfig = { globalPowerW: 100, globalEqHeadroomDb: 0, perRole: {} },
    screenFrontPlaneM = 0,
  } = input;

  // Build a simple persisted subwoofer description from front/rear configs
  const subArray = [];
  if (frontSubsCfg && frontSubsCfg.count > 0) {
    subArray.push({
      position: "front",
      count: Number(frontSubsCfg.count) || 0,
      model: frontSubsCfg.model || null,
    });
  }
  if (rearSubsCfg && rearSubsCfg.count > 0) {
    subArray.push({
      position: "rear",
      count: Number(rearSubsCfg.count) || 0,
      model: rearSubsCfg.model || null,
    });
  }

  const safeRoomDims = {
    widthM: Number(roomDims?.widthM || dimensions?.width) || 0,
    lengthM: Number(roomDims?.lengthM || dimensions?.length) || 0,
    heightM: Number(roomDims?.heightM || dimensions?.height) || 0,
  };

  return {
    // Meta
    name: name || "Untitled Room",

    // Room geometry (legacy + new JSON)
    room_width: safeRoomDims.widthM,
    room_length: safeRoomDims.lengthM,
    room_height: safeRoomDims.heightM,
    roomDims: JSON.stringify(safeRoomDims),

    // Screen
    screen_size: Number(screen?.visibleWidthInches) || 0,
    aspect_ratio: screen?.aspectRatio || "16:9",
    manual_dimensions: !!screen?.manualMode,
    manual_width_m: Number(screen?.manualWidthM) || 0,
    manual_height_m: Number(screen?.manualHeightM) || 0,
    screen_height_from_floor: Number(screen?.heightFromFloorM ?? 0),

    // Layout / format
    dolby_config: dolbyLayout || "5.1",

    // Seating
    seating_positions: JSON.stringify(
      Array.isArray(seatingPositions) ? seatingPositions : []
    ),
    row_spacing_m: Number(rowSpacingM) || 1.8,
    seats_per_row_by_row: JSON.stringify(
      Array.isArray(seatsPerRowByRow) ? seatsPerRowByRow : []
    ),

    // Speakers
    selected_speakers: JSON.stringify(
      Array.isArray(placedSpeakers) ? placedSpeakers : []
    ),
    selected_speakers_by_role: JSON.stringify(
      selectedSpeakersByRole && typeof selectedSpeakersByRole === "object"
        ? selectedSpeakersByRole
        : {}
    ),
    spl_speaker_nodes: JSON.stringify(
      Array.isArray(speakerNodes) ? speakerNodes : []
    ),

    // Room elements
    room_elements: JSON.stringify(
      Array.isArray(roomElements) ? roomElements : []
    ),

    // Subs
    subwoofers: JSON.stringify(subArray),

    // Overlays / UI flags
    overlays: JSON.stringify(overlays || {}),
    screen_mount_mode: "floating",
    float_depth_m: Number(screen?.floatDepthM) || 0,
    show_screen_plane: !!screen?.showScreenPlane,
    show_cavity: !!screen?.showCavity,
    speaker_clearance_m: Number(screen?.speakerClearanceM ?? 0.02) || 0.02,
    frozen_tabs: frozenTabs,
    seven_bed_layout_type: sevenBedLayoutType,
    enable_front_wides: !!enableFrontWides,

    // Overheads
    overhead_global_model: overheadGlobalModel,
    overhead_front_override: overheadFrontOverride,
    overhead_mid_override: overheadMidOverride,
    overhead_rear_override: overheadRearOverride,
    use_front_global: !!useFrontGlobal,
    use_mid_global: !!useMidGlobal,
    use_rear_global: !!useRearGlobal,

    // SPL + screen plane
    spl_config: JSON.stringify(splConfig || {}),
    screen_front_plane_m: Number(screenFrontPlaneM) || 0,
  };
}