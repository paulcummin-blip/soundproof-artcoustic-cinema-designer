/** Presentation adapter only: never read newer geometry alongside a frozen publication. */
import { getSpeakerVisibilityFor } from '@/components/AppStateProvider';
export function frozenReportAppState(live, publication) {
  const p = publication?.report_snapshot?.report_project;
  if (!p) return live;
  let roomDims;
  try { roomDims = typeof p.roomDims === 'string' ? JSON.parse(p.roomDims) : p.roomDims; } catch { roomDims = null; }
  const screen = p.report_screen || {
    visibleWidthInches:p.screen_size, aspectRatio:p.aspect_ratio, manualMode:p.manual_dimensions,
    manualWidthM:p.manual_width_m, manualHeightM:p.manual_height_m, heightFromFloorM:p.screen_height_from_floor,
    mountMode:p.screen_mount_mode, screenPlaneY_m:p.screen_front_plane_m, floatDepthM:p.float_depth_m,
    borderThicknessM:p.border_thickness_m, speakerClearanceM:p.speaker_clearance_m,
    tvPresetKey:p.tv_preset_key, tvWidthMm:p.tv_width_mm,
  };
  const seats = p.seating_positions || [];
  const visibility = getSpeakerVisibilityFor(p.dolby_config, p.seven_bed_layout_type);
  const rowCenters = [...new Set(seats.map(s => String(s.rowNumber ?? s.row)))].map(row => {
    const entries = seats.filter(s => String(s.rowNumber ?? s.row) === row);
    return entries.reduce((sum,s) => sum + Number(s.y),0) / entries.length;
  });
  return { ...live,
    roomDims, screen, screenFrontPlaneM:p.screen_front_plane_m, speaker_clearance_m:p.speaker_clearance_m,
    screenHeight:p.manual_height_m, seatingPositions:seats, seatingRows:p.seating_rows,
    seatsPerRow:p.seats_per_row, seatsPerRowByRow:p.seats_per_row_by_row, rowEarHeights:p.row_ear_heights || [],
    rowSpacingM:p.row_spacing_m, rowCentersM:rowCenters, seatSpacing:p.seat_spacing,
    seatingBlockOffset:p.seating_block_offset, mlpBasis:p.mlp_basis,
    dolbyConfig:p.dolby_config, dolbyLayout:p.dolby_config, sevenBedLayoutType:p.seven_bed_layout_type,
    speakerSystem:{ placedSpeakers:p.selected_speakers || [] },
    subwooferInstances:p.subwooferInstances || [],
    subwoofers:(p.subwooferInstances || []).filter(s => s.enabled !== false).map(s => ({
      ...s, group:s.legacyGroup || s.group, position:{ ...s.position }, model:s.model,
    })),
    frontSubsCfg:p.front_subs_cfg, rearSubsCfg:p.rear_subs_cfg, roomElements:p.room_elements || [],
    rspMode:p.rsp_mode, manualRspX_m:p.manual_rsp_x_m, manualRspY_m:p.manual_rsp_y_m,
    designatedRspSeatId:p.designated_rsp_seat_id, mlpY_m:null, mlp:null,
    splConfig:p.spl_config, p12Mode:p.spl_config?.p12_mode, lcrAimMode:p.lcr_aim_mode,
    aimFrontWidesAtMLP:p.aim_front_wides_at_mlp, aimSideSurroundsAtMLP:p.aim_side_surrounds_at_mlp,
    aimRearSurroundsAtMLP:p.aim_rear_surrounds_at_mlp,
    acousticTreatmentEnabled:p.acoustic_treatment_enabled, selectedAbfuserQty:p.selected_abfuser_qty,
    abfuserQtySource:'frozen-publication', legacyAbfuserAutoQty:0,
    getSpeakerVisibility:role => visibility.has(String(role || '').toUpperCase()),
    projectName:p.name,
    reportEngineeringFingerprint:publication.engineering_fingerprint, reportVersionId:p.version_id,
  };
}
