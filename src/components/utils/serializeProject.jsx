// Normalises values so RoomDesigner can safely call this with
//  - raw objects/arrays, OR
//  - JSON.stringified data
// and always write valid Project fields.
export function serializeProject(input = {}) {
  const {
    // meta
    name,                    // we won't actually write name from here any more

    // geometry + screen
    roomDims,
    dimensions = {},
    screen = {},
    screenHeight = 0.5,

    // layout + content
    seatingPositions,
    placedSpeakers,
    roomElements,
    subwoofers,

    // audio layout
    dolbyLayout,
    dolbyPreset,             // alias – some callers pass this
    overlays,
    frozenTabs = {},
    sevenBedLayoutType = "rears",

    // speakers by role / SPL config
    speakerSelections,
    selectedSpeakersByRole,  // alias from some callers
    splConfig,
    spl_config,              // alias in case something already wrote it

    // wides + rows
    enableFrontWides = false,
    rowSpacingM,
    row_spacing_m,           // alias from some callers
    seatsPerRowByRow,
    seats_per_row_by_row,    // alias from some callers

    // overheads
    overheadGlobalModel = null,
    overheadFrontOverride = null,
    overheadMidOverride = null,
    overheadRearOverride = null,
    useFrontGlobal = true,
    useMidGlobal = true,
    useRearGlobal = true,

    // screen plane / cavity
    screenFrontPlaneM,
    screen_front_plane_m,    // alias
  } = input || {};

  // ---------- helpers ----------
  const parseMaybeJsonArray = (val, fallback = []) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const parseMaybeJsonObject = (val, fallback = {}) => {
    if (val && typeof val === "object" && !Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const normalisedRoomDims = (() => {
    if (typeof roomDims === "string") {
      try {
        return JSON.parse(roomDims);
      } catch {
        // fall through to default
      }
    }
    if (roomDims && typeof roomDims === "object") return roomDims;
    return { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  })();

  const effectiveDolby =
    dolbyLayout || dolbyPreset || "5.1";

  const effectiveRowSpacing =
    typeof row_spacing_m === "number"
      ? row_spacing_m
      : typeof rowSpacingM === "number"
      ? rowSpacingM
      : 1.8;

  const effectiveSeatsPerRow = (() => {
    if (Array.isArray(seatsPerRowByRow)) return seatsPerRowByRow;
    return parseMaybeJsonArray(seats_per_row_by_row, []);
  })();

  const effectiveSpeakerSelections = parseMaybeJsonObject(
    speakerSelections ?? selectedSpeakersByRole,
    {}
  );

  const effectiveSplConfig =
    spl_config ??
    splConfig ?? {
      globalPowerW: 100,
      globalEqHeadroomDb: 0,
      perRole: {},
    };

  const effectiveScreenFrontPlane =
    typeof screen_front_plane_m === "number"
      ? screen_front_plane_m
      : typeof screenFrontPlaneM === "number"
      ? screenFrontPlaneM
      : 0;

  const normalisedSeating = parseMaybeJsonArray(seatingPositions, []);
  const normalisedPlacedSpeakers = parseMaybeJsonArray(placedSpeakers, []);
  const normalisedRoomElements = parseMaybeJsonArray(roomElements, []);
  const normalisedSubwoofers = parseMaybeJsonArray(subwoofers, []);
  const normalisedOverlays = parseMaybeJsonObject(overlays, {});

  // ---------- final Project payload ----------
  return {
    // IMPORTANT: do NOT write name/client_name here – Projects owns those
    // name: name || "Untitled Room",

    // basic dimensions
    room_width:
      Number(normalisedRoomDims?.widthM || dimensions?.width) || 0,
    room_length:
      Number(normalisedRoomDims?.lengthM || dimensions?.length) || 0,
    room_height:
      Number(normalisedRoomDims?.heightM || dimensions?.height) || 0,
    roomDims: JSON.stringify(normalisedRoomDims),

    // screen
    screen_size: Number(screen?.visibleWidthInches) || 0,
    aspect_ratio: screen?.aspectRatio || "16:9",
    manual_dimensions: !!screen?.manualMode,
    manual_width_m: Number(screen?.manualWidthM) || 0,
    manual_height_m: Number(screen?.manualHeightM) || 0,
    screen_height_from_floor: Number(screen?.heightFromFloorM ?? 0),

    // seating + speakers
    dolby_config: effectiveDolby,
    seating_positions: JSON.stringify(normalisedSeating),
    selected_speakers: JSON.stringify(normalisedPlacedSpeakers),
    room_elements: JSON.stringify(normalisedRoomElements),
    subwoofers: JSON.stringify(normalisedSubwoofers),

    // overlays / visual options
    overlays: JSON.stringify(normalisedOverlays),
    screen_mount_mode: "floating",
    float_depth_m: Number(screen?.floatDepthM) || 0,
    show_screen_plane: !!screen?.showScreenPlane,
    show_cavity: !!screen?.showCavity,
    speaker_clearance_m:
      Number(screen?.speakerClearanceM ?? 0.02) || 0.02,

    frozen_tabs: frozenTabs,
    seven_bed_layout_type: sevenBedLayoutType,

    // NOTE: Project.json calls this "selected_speakers_by_role"
    selected_speakers_by_role: JSON.stringify(effectiveSpeakerSelections),

    enable_front_wides: !!enableFrontWides,

    row_spacing_m: effectiveRowSpacing,
    seats_per_row_by_row: JSON.stringify(effectiveSeatsPerRow),

    overhead_global_model: overheadGlobalModel,
    overhead_front_override: overheadFrontOverride,
    overhead_mid_override: overheadMidOverride,
    overhead_rear_override: overheadRearOverride,
    use_front_global: useFrontGlobal,
    use_mid_global: useMidGlobal,
    use_rear_global: useRearGlobal,

    spl_config: JSON.stringify(effectiveSplConfig),

    screen_front_plane_m: effectiveScreenFrontPlane,
  };
}