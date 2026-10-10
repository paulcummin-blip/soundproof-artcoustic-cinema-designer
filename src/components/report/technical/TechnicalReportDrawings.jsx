import React from 'react';
import ReportDrawingPage from '@/components/report/ReportDrawingPage';
import FrontElevation from '@/components/room/FrontElevation';
import SideElevation from '@/components/room/SideElevation';
import SightlineGraphic from '@/components/report/SightlineGraphic';
import ScreenWallConstructionGraphic from '@/components/report/ScreenWallConstructionGraphic';

/** Existing technical drawing set; all inputs are the document's pinned authority. */
export default function TechnicalReportDrawings({ section, project, planImageDataUrl, planDimsImageDataUrl,
  planSpeakerDimsImageDataUrl, app, stableDimensions, screen, placedSpeakers, frontSubs, frontSubsCfg,
  rearSubsCfg, seats, primarySeatingPosition, canRenderSightlinePage, sightlineScreenMetrics,
  sightlineRowData, projector, exportSystemConfiguration, reportScreenFrontPlaneM }) {
  const identity = { projectName: project?.name || '', clientName: project?.client_name || '' };
  if (section === 'plans') return <>{[
    ['pdf-room-plan', 'floor-plan', 'Room Plan', planImageDataUrl, 'Room plan'],
    ['pdf-room-plan-dims', 'dimensioned-floor-plan', 'Room Dimensions', planDimsImageDataUrl, 'Room dimensions plan'],
    ['pdf-room-plan-positions', 'speaker-plan', 'Speaker Position Plan', planSpeakerDimsImageDataUrl, 'Speaker position plan'],
  ].map(([id, blockName, title, imageSrc, imageAlt]) => typeof imageSrc === 'string' && imageSrc.length > 0 && imageSrc !== '__SKIP__'
    ? <ReportDrawingPage key={id} id={id} blockName={blockName} title={title} {...identity} imageSrc={imageSrc} imageAlt={imageAlt}
      {...(id === 'pdf-room-plan-positions' ? { sheetCode: 'SP-01', status: 'NOT FOR SCALING' } : {})} /> : null)}</>;
  const s = sightlineScreenMetrics;
  return <>
    <ReportDrawingPage id="pdf-elevation-front" blockName="front-elevation" title="Elevation Drawing · Front" {...identity} sheetCode="EL-F" status="NOT FOR SCALING">
      <FrontElevation dimensions={stableDimensions} screen={screen} placedSpeakers={placedSpeakers} frontSubs={frontSubs}
        frontSubsCfg={frontSubsCfg} roomElements={(app?.roomElements || []).filter(el => el?.type !== 'projector')} />
    </ReportDrawingPage>
    {['left', 'right'].map(wall => <ReportDrawingPage key={wall} id={`pdf-elevation-${wall}`} blockName={`${wall}-elevation`}
      title={`Elevation Drawing · ${wall === 'left' ? 'Left' : 'Right'}`} {...identity} sheetCode={wall === 'left' ? 'EL-L' : 'EL-R'} status="NOT FOR SCALING">
      <SideElevation wall={wall} dimensions={stableDimensions} screen={screen} placedSpeakers={placedSpeakers} frontSubs={frontSubs}
        frontSubsCfg={frontSubsCfg} rearSubs={(app?.subwoofers || []).filter(sub => sub?.group === 'rear')}
        rearSubsCfg={rearSubsCfg} seatingPositions={seats} mlpPoint={primarySeatingPosition} roomElements={app?.roomElements || []} />
    </ReportDrawingPage>)}
    {canRenderSightlinePage && s && sightlineRowData.length > 0 && <>
      <ReportDrawingPage id="pdf-sightlines" blockName="sightline-drawing" title="Sightlines & Viewing Angles" {...identity} sheetCode="SL-01" status="NOT FOR SCALING">
        <SightlineGraphic showHeader={false} projectName={app?.projectName || ''} clientName={app?.clientName || ''}
          roomWidthM={stableDimensions.width} roomLengthM={stableDimensions.length} roomHeightM={stableDimensions.height}
          screenWidthM={s.screenWidthM} screenHeightM={s.screenHeightM} screenTotalWidthM={s.screenTotalWidthM} screenTotalHeightM={s.screenTotalHeightM}
          screenFrontPlaneY={s.screenFrontPlaneY} screenCenterHeightM={s.screenCenterHeightM} screenBottomHeightM={s.screenBottomHeightM} screenTopHeightM={s.screenTopHeightM}
          projectorLensX={projector?.x_lens_m} projectorLensY={projector?.y_lens_m} projectorLensZ={projector?.z_lens_m}
          projectorBodyWidth={projector?.body_width_m} projectorBodyHeight={projector?.body_height_m} projectorBodyDepth={projector?.body_depth_m}
          rowData={sightlineRowData} dolbyConfig={exportSystemConfiguration || ''} />
      </ReportDrawingPage>
      <ReportDrawingPage id="pdf-screen-wall-construction" blockName="screen-wall-detail" title="Screen Wall Construction Detail" {...identity} sheetCode="SW-01" status="NOT FOR SCALING">
        <ScreenWallConstructionGraphic showHeader={false} {...identity} roomWidthM={stableDimensions.width} roomHeightM={stableDimensions.height}
          screenWidthM={s.screenWidthM} screenHeightM={s.screenHeightM} screenTotalWidthM={s.screenTotalWidthM} screenTotalHeightM={s.screenTotalHeightM}
          screenBottomHeightM={s.screenBottomHeightM} screenTopHeightM={s.screenTopHeightM} screenFrontPlaneM={reportScreenFrontPlaneM}
          placedSpeakers={placedSpeakers} frontSubs={frontSubs} frontSubsCfg={app?.frontSubsCfg} primarySeatingPosition={primarySeatingPosition}
          lcrAimMode={app?.lcrAimMode} speakerClearanceM={app?.speaker_clearance_m} />
      </ReportDrawingPage>
    </>}
  </>;
}