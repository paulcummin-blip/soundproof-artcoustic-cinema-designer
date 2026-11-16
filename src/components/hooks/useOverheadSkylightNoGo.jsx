// components/hooks/useOverheadSkylightNoGo.jsx
// Active no-go enforcement for overhead auto-placement: nudges any in-ceiling
// speaker whose plan footprint lands inside a ceiling skylight opening out of
// it. Wall elements and manually-positioned (positionSource === 'user')
// speakers are never moved, so existing placement behaviour is preserved.
//
// The nudge runs only when the designer is not actively dragging, and writes
// only when at least one speaker actually moved — so it cannot loop or fight
// the drag pipeline.

import { useEffect } from 'react';
import { nudgeOverheadsOutOfSkylights } from '@/components/room/rv/utils/skylightGeometry';

export function useOverheadSkylightNoGo({
  placedSpeakers,
  onSetSpeakers,
  roomElements,
  widthM,
  lengthM,
  heightM,
  getModelDimsM,
  isAnyDraggingRef,
}) {
  useEffect(() => {
    if (typeof onSetSpeakers !== 'function') return;
    if (!Array.isArray(placedSpeakers) || !Array.isArray(roomElements)) return;
    // Never reposition while a drag is in progress.
    if (isAnyDraggingRef?.current) return;

    const skylights = roomElements.filter((el) => el?.type === 'skylight');
    if (skylights.length === 0) return;

    const { changed, speakers } = nudgeOverheadsOutOfSkylights(
      placedSpeakers,
      skylights,
      { widthM, lengthM, heightM, getModelDimsM },
    );
    if (changed) onSetSpeakers(speakers);
  }, [placedSpeakers, onSetSpeakers, roomElements, widthM, lengthM, heightM, getModelDimsM, isAnyDraggingRef]);
}

export default useOverheadSkylightNoGo;