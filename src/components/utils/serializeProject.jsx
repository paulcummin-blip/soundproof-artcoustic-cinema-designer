export function serializeProject(input = {}) {
  const {
    // meta
    name, // we will NOT write name for existing projects

    // geometry + screen
    roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    dimensions = {},
    screen = {},
    screenHeight = 0.5,

    // layout + content
    seatingPositions = [],
    placedSpeakers = [],
    roomElements = [],
    subwoofers = [],

    // audio layout
    dolbyLayout = "5.1",
    overlays = {},
    frozenTabs = {},
    sevenBedLayoutType = "rears",

    // speakers by role / SPL config
    speakerSelections = {},
    selectedSpeakersByRole,      // alias from RoomDesigner
    splConfig = { globalPowerW: 100, globalEqHeadroomDb: 0, perRole: {} },
    spl_speaker_nodes,           // alias from RoomDesigner

    // wides + rows
    enableFrontWides = false,
    rowSpacingM = 1.8,
    seatsPerRowByRow = [],

    // overheads
    overheadGlobalModel = null,
    overheadFrontOverride = null,
    overheadMidOverride = null,
    overheadRearOverride = null,
    useFrontGlobal = true,
    useMidGlobal = true,
    useRearGlobal = true,

    // screen plane / cavity
    screenFrontPlaneM = 0,
  } = input || {};

  const effectiveRoomDims = roomDims || {};
  const effectiveSpeakerSelections =
    selectedSpeakersByRole || speakerSelections || {};

  return {
    // IMPORTANT: do NOT let RoomDesigner rename projects any more.
    // (Projects page owns name/client_name.)
    // name: name || "Untitled Room",

    // basic dimensions
    room_width:
      Number(effectiveRoomDims.widthM || dimensions.width) || 0,
    room_length:
      Number(effectiveRoomDims.lengthM || dimensions.length) || 0,
    room_height:
      Number(effectiveRoomDims.heightM || dimensions.height) || 0,
    roomDims: JSON.stringify(effectiveRoomDims),

    // screen
    screen_size: Number(screen.visibleWidthInches) || 0,
    aspect_ratio: screen.aspectRatio || "16:9",
    manual_dimensions: !!screen.manualMode,
    manual_width_m: Number(screen.manualWidthM) || 0,
    manual_height_m: Number(screen.manualHeightM) || 0,
    screen_height_from_floor: Number(screen.heightFromFloorM ?? 0),

    // seating + speakers
    dolby_config: dolbyLayout || "5.1",
    seating_positions: JSON.stringify(seatingPositions || []),
    selected_speakers: JSON.stringify(placedSpeakers || []),
    room_elements: JSON.stringify(roomElements || []),
    subwoofers: JSON.stringify(subwoofers || []),

    // overlays / visual options
    overlays: JSON.stringify(overlays || {}),
    screen_mount_mode: "floating",
    float_depth_m: Number(screen.floatDepthM) || 0,
    show_screen_plane: !!screen.showScreenPlane,
    show_cavity: !!screen.showCavity,
    speaker_clearance_m:
      Number(screen.speakerClearanceM ?? 0.02) || 0.02,

    frozen_tabs: frozenTabs,
    seven_bed_layout_type: sevenBedLayoutType,

    // matches Project.json: selected_speakers_by_role
    selected_speakers_by_role: JSON.stringify(
      effectiveSpeakerSelections || {}
    ),

    enable_front_wides: !!enableFrontWides,

    row_spacing_m: Number(rowSpacingM) || 1.8,
    seats_per_row_by_row: JSON.stringify(seatsPerRowByRow || []),

    overhead_global_model: overheadGlobalModel,
    overhead_front_override: overheadFrontOverride,
    overhead_mid_override: overheadMidOverride,
    overhead_rear_override: overheadRearOverride,
    use_front_global: useFrontGlobal,
    use_mid_global: useMidGlobal,
    use_rear_global: useRearGlobal,

    spl_config: JSON.stringify(splConfig || {}),
    spl_speaker_nodes: JSON.stringify(spl_speaker_nodes || []),

    screen_front_plane_m: Number(screenFrontPlaneM) || 0,
  };
}