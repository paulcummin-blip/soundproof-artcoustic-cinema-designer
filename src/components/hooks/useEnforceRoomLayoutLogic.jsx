import { useMemo } from 'react';
import { useAppState } from '../AppStateProvider';

// Utility: Clamp value within min/max
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Converts screen size (diagonal in inches) and aspect ratio to screen width in metres
const getScreenWidth = (screenSize, aspectRatio) => {
  if (!screenSize || !aspectRatio) return 0;
  const [w, h] = (aspectRatio?.split(':') || ['16', '9']).map(Number);
  if (!w || !h) return 0;
  const diagInches = screenSize;
  const widthInches = diagInches * (w / Math.sqrt(w ** 2 + h ** 2));
  return widthInches * 0.0254; // inches to metres
};

export const useEnforceRoomLayoutLogic = () => {
  const appState = useAppState();

  // Guard against missing appState
  if (!appState) return { safeSeats: [], adjustedSpeakers: [] };

  const {
    dimensions = { width: 4, length: 6, height: 2.8 },
    seatingPositions = [],
    placedSpeakers = [],
    aspectRatio = '16:9',
    screenSize = 120,
    screenWall = 'front'
  } = appState;

  return useMemo(() => {
    // Safety guard for invalid inputs
    if (!dimensions || !seatingPositions || !placedSpeakers) {
      return { safeSeats: [], adjustedSpeakers: [] };
    }

    const { length, width, height } = dimensions;

    // Clamp all seats within room boundaries, add margin
    const safeSeats = seatingPositions.map(seat => ({
      ...seat,
      x: clamp(seat.x, 0.3, length - 0.3),
      y: clamp(seat.y, 0.3, width - 0.3),
      z: clamp(seat.z, 0.2, height - 0.1)
    }));

    const screenWidth = getScreenWidth(screenSize, aspectRatio);
    const screenLeftX = (length - screenWidth) / 2;
    const screenRightX = screenLeftX + screenWidth;
    const speakerMargin = 0.1;

    const adjustedSpeakers = placedSpeakers.map(sp => {
      // If speaker has no position, skip adjustment
      if (!sp || !sp.position || typeof sp.position.x !== 'number') return sp;

      let newX = sp.position.x;
      let newY = sp.position.y;
      
      // Enforce L/R speakers to be outside the screen bounds on the front wall
      if (screenWall === 'front') {
        if (sp.role === 'L') {
            newX = clamp(newX, 0, screenLeftX - speakerMargin);
            newY = 0.1; // Snap to front wall
        }
        if (sp.role === 'R') {
            newX = clamp(newX, screenRightX + speakerMargin, length);
            newY = 0.1; // Snap to front wall
        }
        if (sp.role === 'C') {
            newY = 0.1; // Snap to front wall
        }
      }

      return { 
        ...sp, 
        position: { ...sp.position, x: newX, y: newY }
      };
    });

    return {
      safeSeats,
      adjustedSpeakers
    };
  }, [dimensions, seatingPositions, placedSpeakers, aspectRatio, screenSize, screenWall]);
};