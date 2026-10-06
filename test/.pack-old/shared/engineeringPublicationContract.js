/** Versioned, pure producer contract. Mirrored server/client; no defaults or live report fallback. */
export const PUBLICATION_CONTRACT_VERSION = 2;
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const stated = value => value !== null && value !== undefined && String(value).trim() !== '';
const numeric = value => stated(value) && Number.isFinite(Number(value));
const level = value => String(value) === '0' ? 'FAIL' : /^[1-4]$/.test(String(value)) ? 'L' + value : value;
const rank = value => value === 'FAIL' ? 0 : /^L[1-4]$/.test(String(value)) ? Number(String(value).slice(1)) : -1;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const rowCounts = seats => {
  const rows = new Map();
  for (const seat of seats || []) {
    const row = seat.rowNumber ?? seat.row;
    if (!stated(row)) return null;
    rows.set(String(row), (rows.get(String(row)) || 0) + 1);
  }
  return [...rows.entries()].sort((a,b) => Number(a[0])-Number(b[0])).map(item => item[1]);
};
export function buildFrozenReportProject(state, { projectId, versionId } = {}) {
  const d = state || {}, errors = [];
  const requireField = (path, ok) => { if (!ok) errors.push(path + ' is missing or invalid'); };
  requireField('project_id', stated(projectId)); requireField('version_id', stated(versionId));
  requireField('name', stated(d.name) && d.name !== 'Untitled Room');
  requireField('version_name', stated(d.versionName));
  for (const key of ['widthM','lengthM','heightM']) requireField('roomDims.'+key, numeric(d.roomDims?.[key]) && Number(d.roomDims[key]) > 0);
  requireField('screen.visibleWidthInches', numeric(d.screen?.visibleWidthInches) && Number(d.screen.visibleWidthInches)>0);
  requireField('screen.aspectRatio', stated(d.screen?.aspectRatio));
  requireField('screen.manualMode', typeof d.screen?.manualMode === 'boolean');
  requireField('screen.heightFromFloorM', numeric(d.screen?.heightFromFloorM));
  requireField('screen.mountMode', stated(d.screen?.mountMode));
  if (d.screen?.manualMode === true) requireField('screen.manualWidthM', numeric(d.screen?.manualWidthM) && Number(d.screen.manualWidthM)>0);
  requireField('screenFrontPlaneM', numeric(d.screenFrontPlaneM));
  requireField('dolbyLayout', stated(d.dolbyLayout));
  requireField('seatingPositions', Array.isArray(d.seatingPositions) && d.seatingPositions.length>0);
  const counts = rowCounts(d.seatingPositions);
  requireField('seatingPositions[].row', !!counts);
  requireField('seatingRows', Number(d.seatingRows) === counts?.length);
  requireField('seatsPerRowByRow', same(d.seatsPerRowByRow, counts));
  requireField('placedSpeakers', Array.isArray(d.placedSpeakers) && d.placedSpeakers.length>0);
  for(const [i, speaker] of (d.placedSpeakers || []).entries()) {
    requireField('placedSpeakers['+i+'].model', stated(speaker.model));
    requireField('placedSpeakers['+i+'].role', stated(speaker.role));
    for(const axis of ['x','y','z']) requireField('placedSpeakers['+i+'].position.'+axis, numeric(speaker.position?.[axis]));
  }
  requireField('subwooferInstances', Array.isArray(d.subwooferInstances));
  requireField('acousticTreatmentEnabled', typeof d.acousticTreatmentEnabled === 'boolean');
  requireField('selectedAbfuserQty', numeric(d.selectedAbfuserQty) && Number(d.selectedAbfuserQty)>=0);
  if (errors.length) return { reportProject:null, missing:errors };
  // Explicit field mapping only. All facts belong to the selected, loaded assessment.
  const reportProject = {
    project_id:projectId, version_id:versionId, version_name:d.versionName, name:d.name,
    roomDims:JSON.stringify(d.roomDims), room_width:Number(d.roomDims.widthM),
    room_length:Number(d.roomDims.lengthM), room_height:Number(d.roomDims.heightM),
    screen_size:Number(d.screen.visibleWidthInches), aspect_ratio:d.screen.aspectRatio,
    manual_dimensions:d.screen.manualMode, manual_width_m:d.screen.manualWidthM,
    manual_height_m:d.screen.manualHeightM, screen_width_m:d.screen.manualMode ? d.screen.manualWidthM : Number(d.screen.visibleWidthInches)*0.0254,
    screen_height_from_floor:d.screen.heightFromFloorM, screen_mount_mode:d.screen.mountMode,
    screen_front_plane_m:d.screenFrontPlaneM, border_thickness_m:d.screen.borderThicknessM,
    float_depth_m:d.screen.floatDepthM, speaker_clearance_m:d.screen.speakerClearanceM,
    tv_width_mm:d.screen.tvWidthMm, tv_preset_key:d.screen.tvPresetKey,
    seating_positions:copy(d.seatingPositions), seating_rows:d.seatingRows,
    seats_per_row_by_row:copy(d.seatsPerRowByRow), seats_per_row:d.seatsPerRow,
    row_ear_heights:copy(d.rowEarHeights), row_spacing_m:d.rowSpacingM,
    seat_spacing:d.seatSpacing, seating_block_offset:d.seatingBlockOffset,
    dolby_config:d.dolbyLayout, selected_speakers:copy(d.placedSpeakers),
    subwooferInstances:copy(d.subwooferInstances), front_subs_cfg:copy(d.frontSubsCfg), rear_subs_cfg:copy(d.rearSubsCfg),
    acoustic_treatment_enabled:d.acousticTreatmentEnabled, selected_abfuser_qty:d.selectedAbfuserQty,
    room_elements:copy(d.roomElements), spl_config:copy(d.splConfig),
    rsp_mode:d.rspMode, manual_rsp_x_m:d.manualRspX_m, manual_rsp_y_m:d.manualRspY_m,
    designated_rsp_seat_id:d.designatedRspSeatId, viewing_priority:d.viewingPriority,
    selected_speakers_by_role:copy(d.selectedSpeakersByRole),
    global_surround_model:d.globalSurroundModel, overhead_global_model:d.overheadGlobalModel,
    assumed_p15_level:d.assumedP15Level, assumed_p21_level:d.assumedP21Level,
    manual_extras:copy(d.manualExtras), price_mode:d.priceMode, show_prices:d.showPrices,
    difficulty_multiplier:d.difficultyMultiplier, lcr_aim_mode:d.lcrAimMode,
  };
  return { reportProject, missing:[] };
}
function chooseSeat(rows, id) {
  return [...rows].sort((a,b) => rank(level(a.level))-rank(level(b.level))
    || ((id===10 || id===20) ? Number(b.value)-Number(a.value) : 0))[0] || null;
}
function atomicRow(row, id, scope, publication) {
  if (!row) return null;
  const bass = [14,18,19,20].includes(id);
  return {
    key:'P'+id, parameter_id:id, title:row.title || 'RP22 P'+id, scope,
    value:row.formatted ?? row.valueFormatted ?? row.hudLabel ?? row.value ?? '—',
    raw_value:row.value ?? row.rawValue ?? null, unit:row.unit ?? ({1:'m',4:'dB',5:'deg',6:'dB',8:'none',9:'deg',10:'dB',15:'NCB',16:'dB',17:'dB',20:'dB',21:'dB'})[id] ?? null, level:level(row.level) ?? '—',
    limiting_group:row.limitingGroup ?? row.seatId ?? null,
    context:row.detail ?? row.note ?? (row.seatId ? 'Limiting seat '+row.seatId : scope),
    authority_fingerprint:bass ? publication?.provenance?.bass_fingerprint : publication?.engineering_fingerprint,
    authority_timestamp:publication?.published_at,
    source_type:bass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
    source_row:copy(row),
  };
}
/** Runs BEFORE durable write. Every pair is copied from one complete source row. */
export function buildAtomicParameterIndex(publication) {
  // A publication that has not loaded yet (undefined) or does not exist (null)
  // has no parameter index at all. Auditing it is a blocked state, never a crash.
  if (!publication || typeof publication !== 'object') return {};
  const summary=publication.engineering_summary, index={};
  for(let id=1;id<=21;id++) {
    const seats=summary?.project?.reportCounts?.seatResultsByParameter?.['p'+id] || [];
    const room=summary?.roomResultsByParameter?.[id];
    const source=(id===10 || id===20 || !room) ? chooseSeat(seats,id) : room;
    const scope=(id===10 || id===20 || !room) ? 'project' : id===19 ? 'rsp' : 'room';
    const item=atomicRow(source,id,scope,publication);
    if (!item) continue;
    item.supporting_per_seat=seats.map(row => ({ ...atomicRow(row,id,'per-seat',publication), seat_id:row.seatId, row:row.row, column:row.column, priority:row.priority }));
    item.scopes={
      primary:atomicRow(chooseSeat(seats.filter(row=>row.priority==='primary' || row.isPrimary===true),id),id,'primary',publication),
      secondary:atomicRow(chooseSeat(seats.filter(row=>row.priority!=='primary' && row.isPrimary!==true),id),id,'secondary',publication),
    };
    index['P'+id]=item;
  }
  return index;
}
/** The structured states a publication audit can report. Never a thrown error. */
export const PUBLICATION_AUDIT_STATUS = Object.freeze({
  CHECKING:'checking', MISSING:'missing', INCOMPLETE:'incomplete', BLOCKED:'blocked', COMPLETE:'complete',
});
function blockedAudit(status, missing, reason) {
  return { allowed:false, blocked:true, status, missing, missing_fields:[...missing], reason };
}
export function auditPublicationContract(publication) {
  // Cold load: the durable publication has not resolved yet. Report generation
  // stays fail-closed and the page shows a checking state instead of crashing.
  if (publication === undefined) return blockedAudit(PUBLICATION_AUDIT_STATUS.CHECKING, ['engineering_authority'],
    'Engineering authority is still loading. Reports and proposals stay blocked until it resolves.');
  if (publication === null) return blockedAudit(PUBLICATION_AUDIT_STATUS.MISSING, ['engineering_authority'],
    'No saved engineering assessment exists for this version. Run the assessment before generating reports.');
  const missing=[], fail=(path,reason='is missing or invalid')=>missing.push(path+' '+reason);
  if (publication?.publication_contract_version!==PUBLICATION_CONTRACT_VERSION) fail('publication_contract_version');
  const report=publication?.report_snapshot, p=report?.report_project;
  for(const field of ['engineering_fingerprint','published_at','engine_version','rp22_version','algorithm_version']) if(!stated(publication?.[field]) || publication[field]==='unknown') fail(field);
  if(!publication?.engineering_summary?.viewing) fail('engineering_summary.viewing');
  if(!report?.priceData) fail('report_snapshot.priceData');
  if(!report?.analysisResult || !Object.keys(report.analysisResult).length) fail('report_snapshot.analysisResult');
  if(!stated(publication?.provenance?.bass_fingerprint)) fail('provenance.bass_fingerprint');
  if(!p) fail('report_snapshot.report_project');
  else {
    for(const key of ['project_id','version_id','version_name','name','roomDims','screen_size','aspect_ratio','dolby_config']) if(!stated(p[key])) fail('report_project.'+key);
    if(p.name==='Untitled Room') fail('report_project.name','is a placeholder');
    let dims=null; try { dims=typeof p.roomDims==='string'?JSON.parse(p.roomDims):p.roomDims; } catch {}
    for(const [axis,field] of [['widthM','room_width'],['lengthM','room_length'],['heightM','room_height']]) if(!numeric(dims?.[axis]) || Number(dims[axis])!==Number(p[field])) fail('report_project.'+field,'conflicts with roomDims');
    if(p.manual_dimensions!==true && Math.abs(Number(p.screen_width_m)-Number(p.screen_size)*0.0254)>1e-8) fail('report_project.screen_width_m','conflicts with screen_size');
    for(const key of ['room_width','room_length','room_height','screen_width_m']) if(!numeric(p[key]) || Number(p[key])<=0) fail('report_project.'+key);
    const counts=rowCounts(report?.seatingPositions);
    if(!counts || Number(p.seating_rows)!==counts.length || !same(p.seats_per_row_by_row,counts)) fail('report_project.seating_rows / seats_per_row_by_row','conflicts with seatingPositions');
    if(!same(p.seating_positions,report?.seatingPositions)) fail('report_project.seating_positions','conflicts with seatingPositions');
    if(!same(p.selected_speakers,report?.placedSpeakers)) fail('report_project.selected_speakers','conflicts with placedSpeakers');
    const parts=String(p.dolby_config).split('.').map(Number);
    const speakers=report?.placedSpeakers || [], overheads=speakers.filter(s=>/^T|^OH/.test(s.role || '')).length;
    // The middle channel-format digit describes LFE channels, not physical sub count.
    if(parts.length<2 || parts[0]!==speakers.length-overheads || (parts[2] || 0)!==overheads) fail('report_project.dolby_config','conflicts with speaker roles');
    if(!Array.isArray(p.subwooferInstances)) fail('report_project.subwooferInstances');
    for(const [i,sub] of (p.subwooferInstances || []).entries()) {
      if(!stated(sub.id) || !stated(sub.model) || !numeric(sub.position?.x) || !numeric(sub.position?.y) || typeof sub.enabled!=='boolean') fail('report_project.subwooferInstances['+i+']');
    }
    for(const [key,rows] of Object.entries(publication?.engineering_summary?.project?.reportCounts?.seatResultsByParameter || {})) for(const row of rows) {
      const seat=(report.seatingPositions || []).find(item=>item.id===row.seatId);
      if(!seat || String(seat.rowNumber ?? seat.row)!==String(row.row)) fail('engineering_summary.'+key+'.'+row.seatId,'conflicts with frozen seat/row identity');
    }
    if(typeof p.acoustic_treatment_enabled!=='boolean' || !numeric(p.selected_abfuser_qty)) fail('report_project.acoustic_treatment');
  }
  const expected=buildAtomicParameterIndex(publication);
  for(let id=1;id<=21;id++) {
    const key='P'+id, item=publication?.parameter_index?.[key];
    if(!item) { fail('parameter_index.'+key); continue; }
    for(const field of ['key','title','scope','value','level','authority_fingerprint','authority_timestamp','source_type']) if(!stated(item[field])) fail('parameter_index.'+key+'.'+field);
    const explicitNA = item.source_row?.applicable === false && item.level === 'N/A';
    if (!/^L[1-4]$/.test(String(item.level)) && item.level !== 'FAIL' && !explicitNA) fail('parameter_index.'+key+'.level','is not a terminal published result');
    if (item.value === '—' || item.value === '' || ['provisional','pending','calculating','no_data'].includes(item.source_row?.status)) fail('parameter_index.'+key+'.value','is not a terminal published result');
    // Re-derive ONLY for validation, never as read-time authority.
    if(!same(item,expected[key])) fail('parameter_index.'+key,'conflicts with its source row/provenance');
  }
  const allowed=missing.length===0;
  return {
    allowed,
    blocked:!allowed,
    status:allowed ? PUBLICATION_AUDIT_STATUS.COMPLETE : PUBLICATION_AUDIT_STATUS.INCOMPLETE,
    missing,
    missing_fields:[...missing],
    reason:allowed ? null : missing[0],
  };
}