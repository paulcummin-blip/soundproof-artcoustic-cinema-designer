/**
 * buildEngineeringPublicationDesignState.js
 * -----------------------------------------
 * The curated design state handed to the Published Engineering Authority when a
 * settled design is pinned. Pure data mapping: it reads the loaded assessment and
 * returns exactly the facts the publication freezes, so the publication never has
 * to reach back into live room state.
 *
 * Project identity (client name and project reference) is part of those frozen
 * facts: the report prints it, so it must travel with the publication rather than
 * being dropped at the point the design is pinned.
 */

export default function buildEngineeringPublicationDesignState({
  appState,
  projectName,
  dolbyPreset,
  placedSpeakers,
  identity = null,
}) {
  if (!appState) return null;
  return {
    // Verified loaded assessment metadata and explicit report facts.
    name: projectName,
    // Identity is project metadata rather than design data, but it is frozen
    // with the report facts so the report can print its client and reference.
    clientName: identity?.clientName || null,
    projectReference: identity?.projectReference || null,
    dolbyLayout: dolbyPreset,
    seatingRows: appState.seatingRows,
    seatsPerRow: appState.seatsPerRow,
    rowEarHeights: appState.rowEarHeights,
    seatSpacing: appState.seatSpacing,
    viewingPriority: appState.viewingPriority,
    roomElements: appState.roomElements,
    manualExtras: appState.manualExtras,
    priceMode: appState.priceMode,
    showPrices: appState.showPrices,
    difficultyMultiplier: appState.difficultyMultiplier,
    // Room geometry
    roomDims: appState.roomDims,
    roomOrientation: appState.roomOrientation,
    screenWall: appState.screenWall,
    // Seating
    seatingPositions: appState.seatingPositions,
    rowSpacingM: appState.rowSpacingM,
    seatsPerRowByRow: appState.seatsPerRowByRow,
    seatingBlockOffset: appState.seatingBlockOffset,
    mlpBasis: appState.mlpBasis,
    linkEarPlatformHeights: appState.linkEarPlatformHeights,
    // Speakers
    selectedSpeakersByRole: appState.selectedSpeakersByRole,
    globalSurroundModel: appState.globalSurroundModel,
    sevenBedLayoutType: appState.sevenBedLayoutType,
    enableFrontWides: appState.enableFrontWides,
    extraSurroundCount: appState.extraSurroundCount,
    // Overheads
    overheadGlobalModel: appState.overheadGlobalModel,
    overheadFrontOverride: appState.overheadFrontOverride,
    overheadMidOverride: appState.overheadMidOverride,
    overheadRearOverride: appState.overheadRearOverride,
    useFrontGlobal: appState.useFrontGlobal,
    useMidGlobal: appState.useMidGlobal,
    useRearGlobal: appState.useRearGlobal,
    // Freeze report facts at the assessment producer, never at report read time.
    placedSpeakers,
    frontSubsCfg: appState.frontSubsCfg,
    rearSubsCfg: appState.rearSubsCfg,
    // Subwoofers
    subwooferInstances: appState.subwooferInstances,
    // Screen
    screen: appState.screen,
    screenFrontPlaneM: appState.screenFrontPlaneM,
    lcrAimMode: appState.lcrAimMode,
    // RSP
    rspMode: appState.rspMode,
    manualRspX_m: appState.manualRspX_m,
    manualRspY_m: appState.manualRspY_m,
    designatedRspSeatId: appState.designatedRspSeatId,
    // SPL config
    splConfig: appState.splConfig,
    targetSpl: appState.targetSpl,
    // RP22 assumptions
    assumedP15Level: appState.assumedP15Level,
    assumedP21Level: appState.assumedP21Level,
    p15ConstructionLevel: appState.p15ConstructionLevel,
    // Acoustic treatment
    acousticTreatmentEnabled: appState.acousticTreatmentEnabled,
    selectedAbfuserQty: appState.selectedAbfuserQty,
    // Aiming
    aimFrontWidesAtMLP: appState.aimFrontWidesAtMLP,
    aimRearSurroundsAtMLP: appState.aimRearSurroundsAtMLP,
    aimSideSurroundsAtMLP: appState.aimSideSurroundsAtMLP,
  };
}