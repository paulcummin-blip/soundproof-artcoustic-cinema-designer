// utils/defaultSystem.js
export function generateDefaultSystem() {
  // Screen size: 100" diagonal, 16:9 aspect (2.21m x 1.24m)
  const screenWidthM = 2.21;
  const screenHeightM = 1.24;

  // Room size with good front/rear spacing for 1 row
  const room = { 
    width: 4.5, 
    length: 6.0, 
    height: 2.8 
  };

  // Seating: 1 row of 3, center seat = MLP
  const seatingRowY = 3.5;
  const seatSpacing = 0.6;
  const seating = [
    { 
      id: 'seat-left', 
      x: room.width/2 - seatSpacing, 
      y: seatingRowY, 
      z: 1.2,
      isPrimary: false,
      rowNumber: 1,
      seatNumber: 1
    },
    { 
      id: 'seat-center', 
      x: room.width/2, 
      y: seatingRowY, 
      z: 1.2,
      isPrimary: true,
      rowNumber: 1,
      seatNumber: 2
    },
    { 
      id: 'seat-right', 
      x: room.width/2 + seatSpacing, 
      y: seatingRowY, 
      z: 1.2,
      isPrimary: false,
      rowNumber: 1,
      seatNumber: 3
    }
  ];

  // MLP reference point
  const mlp = seating.find(s => s.isPrimary);
  const refDist = 2.8; // distance from MLP to L/C/R line

  // RP22-compliant speaker positions
  // L/R at ±22-30° from MLP (using 25° for optimal placement)
  const lrAngleDeg = 25;
  const lrAngleRad = lrAngleDeg * Math.PI / 180;
  
  // Surrounds at ±90-110° from MLP (using 100° for good RP22 P5 compliance)
  const surroundAngleDeg = 100;
  const surroundAngleRad = surroundAngleDeg * Math.PI / 180;
  const surroundDist = 1.5;

  const speakers = [
    // LCR on screen wall
    { 
      id: 'L', 
      role: 'L', 
      label: 'L',
      position: { 
        x: mlp.x - Math.sin(lrAngleRad) * refDist, 
        y: mlp.y - Math.cos(lrAngleRad) * refDist, 
        z: 1.2 
      }
    },
    { 
      id: 'C', 
      role: 'C', 
      label: 'C',
      position: { 
        x: mlp.x, 
        y: 0.1, // Close to front wall
        z: 1.2 
      }
    },
    { 
      id: 'R', 
      role: 'R', 
      label: 'R',
      position: { 
        x: mlp.x + Math.sin(lrAngleRad) * refDist, 
        y: mlp.y - Math.cos(lrAngleRad) * refDist, 
        z: 1.2 
      }
    },

    // Side Surrounds at ±100° for good P5 compliance
    { 
      id: 'LS', 
      role: 'LS', 
      label: 'LS',
      position: { 
        x: mlp.x - Math.sin(surroundAngleRad) * surroundDist, 
        y: mlp.y + Math.cos(surroundAngleRad) * surroundDist, 
        z: 1.2 
      }
    },
    { 
      id: 'RS', 
      role: 'RS', 
      label: 'RS',
      position: { 
        x: mlp.x + Math.sin(surroundAngleRad) * surroundDist, 
        y: mlp.y + Math.cos(surroundAngleRad) * surroundDist, 
        z: 1.2 
      }
    }
  ];

  // Subwoofer: front left corner with proper wall clearance
  const subs = [
    { 
      id: 'SUB1', 
      role: 'SUB', 
      label: 'SUB',
      position: { x: 0.3, y: 0.3, z: 0.1 },
      placement: 'front',
      phaseAdjust: 0,
      delay: 0
    }
  ];

  // Screen configuration
  const screen = {
    visibleWidthInches: 100,
    overallWidthCm: Math.round(screenWidthM * 100), // Convert to cm
    overallHeightCm: Math.round(screenHeightM * 100),
    aspectRatio: '16:9'
  };

  // Default room elements (empty for clean start)
  const roomElements = [];

  return { 
    dimensions: room, 
    seatingPositions: seating, 
    screen, 
    screenHeight: 0.5, // Screen height from floor
    dolbyConfig: '5.1',
    subwoofers: subs,
    roomElements
  };
}