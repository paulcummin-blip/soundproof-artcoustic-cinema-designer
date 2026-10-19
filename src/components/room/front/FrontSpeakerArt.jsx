import React from "react";
import { Q43FaceIcon, Q45FaceIcon, Q85FaceIcon, Q63FaceIcon, Evolve11FaceIcon, Evolve21FaceIcon, Evolve31FaceIcon, Evolve42FaceIcon, Evolve63FaceIcon, Evolve84FaceIcon, C1FaceIcon, C41FaceIcon, MultiSoundbarArtworkFaceIcon, MultiSoundbar77ArtworkFaceIcon, MultiSoundbar65ArtworkFaceIcon, MultiSoundbar100ArtworkFaceIcon } from "@/components/report/SpeakerFaceIcons";
import { C41_1222FaceIcon, C41_1441FaceIcon, C41_1711FaceIcon } from "@/components/report/C41ArtworkFaceIcons";
import ProductArtwork from "@/components/report/ProductArtwork";
import { elevationArtFitRatio } from "@/components/report/elevation/elevationArtAuthority";
import { isManualOverrideActive } from "@/components/models/screen/resolveEffectiveScreen";
import { HIGHLIGHT_GREEN } from "@/components/state/speakerSelectionStore";

/**
 * drawFrontSpeakerArt — one loudspeaker drawn in the XZ front-elevation plane.
 *
 * Extracted from FrontElevation so the drawing file stays a manageable size. It
 * is a pure renderer: every value it needs arrives as an argument, and it holds
 * no state of its own. The same call serves the LCR speakers and the front
 * subwoofers.
 *
 * @param {object} opts - the speaker's own geometry and drawing options
 * @param {object} ctx  - the elevation's drawing context (unit→pixel mapping,
 *                        room width and screen geometry)
 *
 * opts:
 *   key, cx, cy, sw, sh, isRound, fill, stroke, label, zM, modelKey,
 *   tvPresetKey, labelInsideBox, labelY, onMouseDown, vertical,
 *   cabinetLengthMm, labelHighlighted
 * ctx:
 *   rx, ry, roomW, drawW, drawH, screenCenterX, overallW, screen, labelColor
 *
 * `labelHighlighted` is the movement cue: a speaker that is moving right now
 * wears its green label, and is marked by nothing else — no outline is drawn.
 */
export function drawFrontSpeakerArt(opts, ctx) {
  const {
    key, cx, cy, sw, sh, isRound, fill, stroke, label, zM, modelKey,
    tvPresetKey: speakerTvPreset, labelInsideBox = false, labelY, onMouseDown,
    vertical = false, cabinetLengthMm = null, labelHighlighted = false,
  } = opts || {};
  const { rx, ry, roomW, drawW, screenCenterX, overallW, screen, labelColor } = ctx || {};

  const sx = cx - sw / 2;
  const sy = cy - sh / 2;
  // The movement cue: a moving speaker is identified by its green label, and by
  // nothing else. No outline is ever drawn around it.
  const labelFill = labelHighlighted ? HIGHLIGHT_GREEN : labelColor;

  // Detect Artcoustic models for face icon rendering
  const mk = modelKey || "";
  const isQ43 = mk.includes("q4-3");
  const isQ45 = mk.includes("q4-5");
  const isQ85 = mk.includes("q8-5");
  const isQ63 = mk.includes("q6-3");
  const isEv11 = mk.includes("evolve-1-1");
  const isEv21 = !isEv11 && mk.includes("evolve-2-1");
  const isEv31 = !isEv11 && mk.includes("evolve-3-1");
  const isEv42 = mk.includes("evolve-4-2");
  const isEv63 = !isEv31 && mk.includes("evolve-6-3");
  const isEv84 = mk.includes("evolve-8-4");
  const isC41 = mk.includes("c4-1");
  // The 1222 mm, 1441 mm and 1711 mm C4-1 cabinets each have their own
  // approved artwork; every other C4-1 length keeps the existing drawing.
  const isC41_1222 = isC41 && Number(cabinetLengthMm) === 1222;
  const isC41_1441 = isC41 && Number(cabinetLengthMm) === 1441;
  const isC41_1711 = isC41 && Number(cabinetLengthMm) === 1711;
  // The C-1 is its own product ("c-1"); "c4-1" never contains that key.
  const isC1 = mk.includes("c-1");
  const isMultiSoundbar = mk.includes("multi-lcr") || mk.includes("multi-mono");
  const isTv65 = speakerTvPreset === "tv65";
  const isTv77 = speakerTvPreset === "tv77";
  const isTv83 = speakerTvPreset === "tv83";
  const isTv100 = speakerTvPreset === "tv100";
  const isManualScreen = isManualOverrideActive(screen);
  const useMulti65Artwork = isMultiSoundbar && isTv65;
  const useMulti83Artwork = isMultiSoundbar && (isTv83 || isManualScreen);
  const useMulti77Artwork = isMultiSoundbar && isTv77;
  const useMulti100Artwork = isMultiSoundbar && isTv100;
  const useMultiArtwork = useMulti65Artwork || useMulti83Artwork || useMulti77Artwork || useMulti100Artwork;

  // Full-width Multi Soundbar artwork — renders the dedicated technical line
  // drawing at exactly the screen's rendered width. ViewBox and aspect
  // ratios match each source image's NATIVE pixel dimensions to prevent
  // preserveAspectRatio="meet" from letterboxing the artwork inside the
  // screen-width container. SVG threshold filters (not CSS filters) produce
  // pure black-and-white from the grey source screenshots.
  if (useMultiArtwork) {
    const screenOW = (overallW / roomW) * drawW;
    const aspectRatio = useMulti65Artwork ? (1544 / 118) : useMulti77Artwork ? (1588 / 106) : useMulti100Artwork ? (1722 / 90) : (1558 / 90);
    const artworkW = screenOW;
    const artworkH = screenOW / aspectRatio;
    const artworkX = rx(screenCenterX) - artworkW / 2;
    const artworkY = cy - artworkH / 2;
    const ArtworkComponent = useMulti65Artwork ? MultiSoundbar65ArtworkFaceIcon : useMulti77Artwork ? MultiSoundbar77ArtworkFaceIcon : useMulti100Artwork ? MultiSoundbar100ArtworkFaceIcon : MultiSoundbarArtworkFaceIcon;
    return (
      <g key={key} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: 'grab', userSelect: 'none' } : undefined}>
        <ArtworkComponent x={artworkX} y={artworkY} width={artworkW} height={artworkH} />
        <text x={rx(screenCenterX)} y={labelY ?? (artworkY - 10)} textAnchor="middle" fontSize={9} fill={labelFill} fontWeight={700} letterSpacing="0.04em">
          {label}
        </text>
      </g>
    );
  }

  const hasFaceIcon = isQ43 || isQ45 || isQ85 || isQ63 || isEv11 || isEv21 || isEv31 || isEv42 || isEv63 || isEv84 || isC41 || isC1;

  // C4-1, C-1 and Multi Soundbar icons are cropped to their own cabinet edges,
  // so their drawing fills the boundary box exactly (ratio 1.0). The Q 6-3
  // artwork is cropped to its cabinet outline in the same way, so it also
  // fills the box exactly: its cabinet face is square (280 × 280 mm) and so is
  // the crop, so the box is the cabinet's own footprint. Every other
  // Artcoustic PNG still carries internal page padding and is enlarged to
  // compensate.
  // The figure comes from the ONE elevation crop authority, read for the
  // artwork this model actually draws: a normalised artwork is drawn AT the
  // cabinet's footprint (its page is cropped away), while an artwork with no
  // trustworthy crop keeps the long-standing enlargement (its page is still
  // inside the box). It is not repeated at the draw site.
  const faceIconArtworkKey = isC41 ? (isC41_1222 ? "c41_1222" : isC41_1441 ? "c41_1441" : isC41_1711 ? "c41_1711" : "c41")
    : isC1 ? "c1"
      : isQ63 ? "q63"
        : isQ45 ? "q45"
          : isQ85 ? "q85"
            : isQ43 ? "q43"
              : isEv21 ? "evolve_2_1"
                : isEv31 ? "evolve_3_1"
                  : isEv42 ? "evolve_4_2"
                    : isEv63 ? "evolve_6_3"
                      : isEv84 ? "evolve_8_4"
                        : null;
  const FACE_ICON_VISIBLE_RATIO = elevationArtFitRatio(faceIconArtworkKey);
  // A vertically mounted cabinet draws the SAME face rotated a quarter turn:
  // the face icon's own long axis is the box's height, and the whole icon is
  // turned 90° about the cabinet centre, so the drawn footprint is the cabinet's
  // rotated width × height (the dimension labels read from the same box).
  const iconBoxW = vertical ? sh : sw;
  const iconBoxH = vertical ? sw : sh;
  const adjustedW = hasFaceIcon ? iconBoxW / FACE_ICON_VISIBLE_RATIO : iconBoxW;
  const adjustedH = hasFaceIcon ? iconBoxH / FACE_ICON_VISIBLE_RATIO : iconBoxH;
  const adjustedX = hasFaceIcon ? cx - adjustedW / 2 : sx;
  const adjustedY = hasFaceIcon ? cy - adjustedH / 2 : sy;

  const renderFaceIcon = () => {
    if (isC1) return <C1FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    // Every C4-1 artwork is drawn at the cabinet's installed footprint (and
    // rotated with the cabinet when it is mounted vertically) — never
    // stretched onto another cabinet's shape.
    if (isC41 && isC41_1222) return <C41_1222FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isC41 && isC41_1441) return <C41_1441FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isC41 && isC41_1711) return <C41_1711FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isC41) return <C41FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isQ43) return <Q43FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isQ45) return <Q45FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isQ85) return <Q85FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    // The Q 6-3 artwork is cropped to its cabinet outline, so it is drawn at
    // the cabinet's own footprint — the face fills the box edge to edge.
    if (isQ63) return <Q63FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv11) return <Evolve11FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv21) return <Evolve21FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv31) return <Evolve31FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv42) return <Evolve42FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv63) return <Evolve63FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    if (isEv84) return <Evolve84FaceIcon x={adjustedX} y={adjustedY} width={adjustedW} height={adjustedH} />;
    return null;
  };

  return (
    <g key={key} onMouseDown={onMouseDown} style={onMouseDown ? { cursor: 'grab', userSelect: 'none' } : undefined}>
      {/* Body */}
      {hasFaceIcon ? (
        <g transform={vertical ? `rotate(90 ${cx} ${cy})` : undefined}>
          {/* Product artwork is line art on an opaque white page — the page is
              knocked out so the graphic shows only the cabinet's own drawing.
              The tight opaque white backing is the cabinet's OWN scaled
              footprint (iconBoxW × iconBoxH): a vertical cabinet brings its
              backing round with the rotated face, and nothing larger appears. */}
          <ProductArtwork
            backing={{ x: cx - iconBoxW / 2, y: cy - iconBoxH / 2, width: iconBoxW, height: iconBoxH }}
          >
            {renderFaceIcon()}
          </ProductArtwork>
        </g>
      ) : isRound ? (
        <circle cx={cx} cy={cy} r={Math.max(6, sw / 2)} fill={fill} stroke={stroke} strokeWidth={1.2} opacity={0.90} />
      ) : (
        <rect x={sx} y={sy} width={sw} height={sh} fill={fill} stroke={stroke} strokeWidth={1.2} rx={2} opacity={0.90} />
      )}
      {/* Acoustic centre dot — fallback only (face icons include their own markers) */}
      {!hasFaceIcon && <circle cx={cx} cy={cy} r={1.8} fill="rgba(255,255,255,0.55)" />}
      {/* Label: above for speakers, inside for subs */}
      {labelInsideBox ? (
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fill={labelFill} fontWeight={700} letterSpacing="0.04em" dominantBaseline="middle">
          {label}
        </text>
      ) : (
        <text x={cx} y={labelY ?? (sy - 10)} textAnchor="middle" fontSize={9} fill={labelFill} fontWeight={700} letterSpacing="0.04em">
          {label}
        </text>
      )}
    </g>
  );
}

export default drawFrontSpeakerArt;