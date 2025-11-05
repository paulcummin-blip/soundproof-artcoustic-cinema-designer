
import React from 'react';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

// This component is for plan view only. It draws the screen, cavity, and speakers behind it.
export default function LCRBehindScreen({ screen, toPx, speakers }) {
  if (!screen || !toPx) return null;

  const {
    widthM,
    heightM,
    cavityWidthM,
    cavityHeightM,
    cavityDepthM,
    screenX,
    screenY,
    cavityX,
    cavityY
  } = screen.plan || {};

  const [sx, sy] = toPx(screenX, screenY);
  const sw = toPx(screenX + widthM, screenY)[0] - sx;
  const sh = toPx(screenX, screenY + heightM)[1] - sy;

  const [cx, cy] = toPx(cavityX, cavityY);
  const cw = toPx(cavityX + cavityWidthM, cavityY)[0] - cx;
  const ch = toPx(cavityX, cavityY + cavityHeightM)[1] - cy;

  // FIX: Safely get both front subs from the filtered array
  const frontSubs = (speakers || []).filter(s => s.role && (s.role.toUpperCase().startsWith('SUB') || s.role.toUpperCase() === 'LFE'));
  const frontSub1 = frontSubs[0] || null;
  const frontSub2 = frontSubs[1] || null; // This corrects the undefined variable crash

  const lcrSpeakers = (speakers || []).filter(s => ['FL','FC','FR'].includes(s.role));

  // Helper to convert a length from meters to pixels
  // Assuming toPx(x, y) returns [x_pixels, y_pixels]
  // And toPx(0,0) is origin in pixels.
  // So, toPx(lengthM, 0)[0] - toPx(0,0)[0] should give lengthM in pixels.
  const toPxLength = (lengthM) => {
    // If the scaling is uniform, just convert from origin
    // A more robust way might be to take a point and point + length
    // But given how width and height are calculated (sw = toPx(x+w)[0] - toPx(x)[0]),
    // this simplified form is consistent if toPx(0,0) maps to a fixed origin.
    // For now, let's assume toPx(0,0) is origin and scale factor can be derived from it.
    // However, if the toPx function is directly a scaling, then toPx(lengthM, 0)[0] will be lengthM scaled.
    // For safety, let's try to infer from sw = toPx(screenX + widthM, screenY)[0] - sx;
    // This implies that differences in meters translate directly to differences in pixels.
    // So, a length of X meters will correspond to toPx(X, 0)[0] - toPx(0, 0)[0].
    // Given the example in the outline uses toPx(0.5,0)[0] for width, it means toPx(length,0)[0] directly gives the length in pixels.
    return toPx(lengthM, 0)[0];
  }


  return (
    <g className="screen-and-cavity-elements" pointerEvents="none">
      {screen.showCavity && cavityWidthM > 0 && (
        <rect x={cx} y={cy} width={cw} height={ch} fill="rgba(0,0,0,0.08)" stroke="rgba(0,0,0,0.2)" strokeWidth="1" strokeDasharray="2,2" />
      )}
      <rect x={sx} y={sy} width={sw} height={sh} fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
      <rect x={sx} y={sy} width={sw} height={sh} fill="none" stroke="rgba(0,0,0,0.9)" strokeWidth="2.5" strokeDasharray="8,6" />

      {lcrSpeakers.map(spk => {
        const [speakerX, speakerY] = toPx(spk.position.x, spk.position.y);
        const speakerRadiusPx = toPxLength(0.08);
        const fontSizePx = toPxLength(0.15);
        const textOffsetYPx = toPxLength(0.03);

        return (
          <g key={spk.id} transform={`translate(${speakerX}, ${speakerY})`}>
              <circle r={speakerRadiusPx} fill="#3E4349" />
              <text y={textOffsetYPx} fontSize={fontSizePx} textAnchor="middle" fill="#FFFFFF" style={{ userSelect: 'none' }}>
                {spk.role.replace('F', '')} {/* Display C, L, R instead of FC, FL, FR */}
              </text>
          </g>
        )
      })}

      {/* FIX: Use the new, safe variables and guard rendering */}
      {frontSub1 && (
         <rect
           x={toPx(frontSub1.position.x - 0.25, 0)[0]}
           y={toPx(0, frontSub1.position.y - 0.25)[1]}
           width={toPxLength(0.5)}
           height={toPxLength(0.5)}
           fill="rgba(255,0,0,0.2)"
         />
      )}
       {frontSub2 && (
         <rect
           x={toPx(frontSub2.position.x - 0.25, 0)[0]}
           y={toPx(0, frontSub2.position.y - 0.25)[1]}
           width={toPxLength(0.5)}
           height={toPxLength(0.5)}
           fill="rgba(255,0,0,0.2)"
         />
      )}
    </g>
  );
}
