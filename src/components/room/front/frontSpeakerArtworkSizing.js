// ---------------------------------------------------------------------------
// frontSpeakerArtworkSizing.js
// ---------------------------------------------------------------------------
// One authority for whether a front-elevation speaker's face icon fills its
// bounding box edge-to-edge at the cabinet's TRUE physical footprint — the
// question FrontElevation must answer to draw the cabinet box at the right
// height. It is the SAME elevation artwork authority FrontSpeakerArt already
// reads, so the elevation's box height and the face icon's own crop stay in
// step: a normalised (page-cropped) artwork, or a vector face icon that fills
// its own viewBox, is drawn at the cabinet's true height; an artwork the
// authority does not normalise keeps the long-standing padded enlargement.
//
// Presentation only. Nothing here states, infers or changes a cabinet's size,
// position, orientation, model assignment, RP22 or RP23 value.
// ---------------------------------------------------------------------------
import {
  elevationArtFitRatio,
  ELEVATION_ART_FIT_NORMALISED,
} from "@/components/report/elevation/elevationArtAuthority";

// Vector face icons (plain <svg>, not via ElevationArtworkIcon) that fill their
// own viewBox edge-to-edge, so they are drawn at the cabinet's true footprint.
const VECTOR_FACE_ICON_SUBSTRINGS = ["evolve-1-1", "evolve-1"];

function isMultiSoundbar(modelKey) {
  const mk = String(modelKey || "");
  return mk.includes("multi-lcr") || mk.includes("multi-mono");
}

// The face-icon model substrings FrontSpeakerArt recognises. Kept in step with
// src/components/room/front/FrontSpeakerArt.jsx so the elevation and the face
// icon agree on which models carry edge-to-edge artwork.
const FACE_ICON_SUBSTRINGS = [
  "q4-3",
  "q4-5",
  "q8-5",
  "q6-3",
  "evolve-1-1",
  "evolve-2-1",
  "evolve-3-1",
  "evolve-4-2",
  "evolve-6-3",
  "evolve-8-4",
  "c4-1",
  "c-1",
];

function hasFaceIcon(modelKey) {
  const mk = String(modelKey || "");
  if (!mk) return false;
  if (isMultiSoundbar(mk)) return true;
  return FACE_ICON_SUBSTRINGS.some((sub) => mk.includes(sub));
}

// The C4-1 cabinet-length variant, mirroring FrontSpeakerArt. Every length has
// its own approved artwork; the default is the shared fallback.
function c41ArtworkKey(cabinetLengthMm) {
  const len = Number(cabinetLengthMm);
  if (len === 1222) return "c41_1222";
  if (len === 1441) return "c41_1441";
  if (len === 1711) return "c41_1711";
  return "c41";
}

function artworkKeyFor(modelKey, cabinetLengthMm) {
  const mk = String(modelKey || "");
  if (!mk) return null;
  if (mk.includes("c4-1")) return c41ArtworkKey(cabinetLengthMm);
  if (mk.includes("c-1")) return "c1";
  if (mk.includes("q6-3")) return "q63";
  if (mk.includes("q4-5")) return "q45";
  if (mk.includes("q8-5")) return "q85";
  if (mk.includes("q4-3")) return "q43";
  // evolve-1-1 is a vector icon (no PNG crop authority entry).
  if (mk.includes("evolve-2-1")) return "evolve_2_1";
  if (mk.includes("evolve-3-1")) return "evolve_3_1";
  if (mk.includes("evolve-4-2")) return "evolve_4_2";
  if (mk.includes("evolve-6-3")) return "evolve_6_3";
  if (mk.includes("evolve-8-4")) return "evolve_8_4";
  return null;
}

function isVectorFaceIcon(modelKey) {
  const mk = String(modelKey || "");
  return VECTOR_FACE_ICON_SUBSTRINGS.some((sub) => mk.includes(sub));
}

/**
 * True when this speaker's face icon fills its bounding box edge-to-edge at the
 * cabinet's true physical footprint, so the elevation must draw the box at the
 * cabinet's true height (no vertical inflation).
 *
 * A normalised (page-cropped) PNG artwork fills its box because its crop is the
 * cabinet's own outline; a vector face icon fills its own viewBox; a multi
 * soundbar draws at its own locked aspect. All of these are edge-to-edge. An
 * artwork the authority does not normalise keeps the long-standing padded
 * enlargement, so the elevation keeps its legacy inflation for it.
 */
export function isFrontSpeakerEdgeToEdge(modelKey, cabinetLengthMm) {
  const mk = String(modelKey || "");
  if (!mk) return false;
  if (!hasFaceIcon(mk)) return false;
  if (isMultiSoundbar(mk)) return true;
  if (isVectorFaceIcon(mk)) return true;
  const key = artworkKeyFor(mk, cabinetLengthMm);
  if (!key) return false;
  return elevationArtFitRatio(key) === ELEVATION_ART_FIT_NORMALISED;
}