/**
 * buildProjectCadPayload.js
 * -------------------------
 * INPUT assembly for the Cinema Designer's Project CAD Download.
 *
 * This module builds inputs only. It performs NO CAD geometry: the drawing is
 * produced by the existing shared utilities in `@/components/utils/cadExport`
 * (generateDXF / downloadTextFile) that the reports already use. Nothing here
 * is a second CAD generator.
 *
 * Every input is read from the same authority Plan View reads, so the exported
 * drawing represents the LIVE active design version rather than a saved
 * snapshot:
 *   - speakers     → resolveActiveSpeakerLayout (Plan View's active-layout filter)
 *   - subwoofers   → bassInputAdapter (the canonical instance → render adapter)
 *   - screen size  → resolveEffectiveViewableDimsM (the report/print authority)
 *   - screen plane → resolveRspScreenFrontPlaneM (the shared fallback chain)
 *   - LCR aim      → safeYawToMLP (the same maths Plan View's lcrAngleInfo uses)
 *   - projector    → the live projector room element
 *
 * Only installed speakers are exported: the active-layout resolver drops every
 * role without an explicitly assigned model, so a "Not Selected" role is never
 * drawn as installed equipment.
 *
 * Room elements are converted from the live design shape (length_m / pos_m) to
 * the input contract documented by cadExport's roomElementToCADRect (width /
 * x_position as a 0–1 ratio of the element's CENTRE along its wall).
 */

import { resolveEffectiveViewableDimsM } from "@/components/models/screen/resolveEffectiveScreen";
import { safeYawToMLP } from "@/components/room/rv/RenderPrimitives";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";

const DEFAULT_BORDER_M = 0.08;

// ─── Filename ──────────────────────────────────────────────────────────────

/** Strip characters that are illegal in a filename on Windows/macOS/Linux. */
export function sanitiseFilenamePart(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/[\\/:*?"<>|]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
}

/** "Project Name - Version Name - CAD.dxf" */
export function buildProjectCadFilename({ projectName, versionName }) {
  return [
    sanitiseFilenamePart(projectName),
    sanitiseFilenamePart(versionName),
    "CAD",
  ].filter(Boolean).join(" - ") + ".dxf";
}

// ─── Screen ────────────────────────────────────────────────────────────────

/**
 * Screen metrics for cadExport: { viewWm, overallWm, borderM }.
 * Uses the same resolved viewable dimensions as the reports, plus the project's
 * per-side border thickness (default 8 cm for projector screens).
 */
export function buildScreenMetrics(screen) {
  const dims = resolveEffectiveViewableDimsM(screen);
  const viewWm = Number(dims?.widthM);
  const rawBorder = Number(screen?.borderThicknessM);
  const borderM = Number.isFinite(rawBorder) && rawBorder > 0 ? rawBorder : DEFAULT_BORDER_M;
  return {
    viewWm: Number.isFinite(viewWm) && viewWm > 0 ? viewWm : null,
    overallWm: Number.isFinite(viewWm) && viewWm > 0 ? viewWm + borderM * 2 : null,
    borderM,
  };
}

// ─── LCR aim ───────────────────────────────────────────────────────────────

/**
 * LCR left/right aim angles, mirroring RoomVisualisation's lcrAngleInfo memo:
 * zero when the LCR aim mode is flat, otherwise the yaw from each speaker to
 * the canonical RSP using the same shared maths function.
 */
export function buildLcrAngleInfo({ placedSpeakers, mlp, lcrAimMode }) {
  if (String(lcrAimMode || "flat") !== "angled") return { L: 0, R: 0 };

  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  if (!mlp || !Number.isFinite(mlp.x) || !Number.isFinite(mlp.y)) return { L: 0, R: 0 };

  const target = { x: mlp.x, y: mlp.y };
  const fl = list.find((s) => getCanonicalRole(s?.role) === "FL");
  const fr = list.find((s) => getCanonicalRole(s?.role) === "FR");

  return {
    L: fl?.position ? safeYawToMLP(fl.position, target) : 0,
    R: fr?.position ? safeYawToMLP(fr.position, target) : 0,
  };
}

// ─── Subwoofers ────────────────────────────────────────────────────────────

/**
 * Derive the two subwoofer configs cadExport reads (front + rear) from the
 * canonical subwoofer instances, through the SAME adapter Plan View renders
 * from. Only enabled instances with a finite position reach the drawing.
 */
export function buildSubwooferCfgs(subwooferInstances, cfgs = {}) {
  const instances = Array.isArray(subwooferInstances) ? subwooferInstances : [];
  const adapted = bassInputAdapter(instances, {
    frontOrientation: cfgs?.frontSubsCfg?.orientation ?? null,
    rearOrientation: cfgs?.rearSubsCfg?.orientation ?? null,
  });

  const build = (group, fallbackCfg) => {
    const items = adapted.filter((s) => s?.group === group);
    if (items.length === 0) {
      return { ...(fallbackCfg || {}), count: 0, positions: [] };
    }
    return {
      ...(fallbackCfg || {}),
      model: items[0]?.model ?? fallbackCfg?.model ?? null,
      count: items.length,
      positions: items.map((s) => ({
        x: s.x,
        y: s.y,
        model: s.model,
        orientation: s.orientation ?? null,
      })),
    };
  };

  return {
    frontSubsCfg: build("front", cfgs?.frontSubsCfg),
    rearSubsCfg: build("rear", cfgs?.rearSubsCfg),
  };
}

// ─── Room elements ─────────────────────────────────────────────────────────

function wallForCad(wall) {
  const v = String(wall || "").toLowerCase();
  if (v === "rear" || v === "back") return "back";
  if (v === "front" || v === "left" || v === "right") return v;
  return "front";
}

/**
 * Convert live room elements (doors, windows, columns…) into cadExport's input
 * contract. Projectors are excluded here — cadExport draws those separately.
 */
export function adaptRoomElementsForCad(roomElements, roomDims) {
  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) return [];

  return (Array.isArray(roomElements) ? roomElements : [])
    .filter((el) => el && el.type !== "projector")
    .map((el) => {
      const wall = wallForCad(el.wall);
      const alongWallM = Number(el.length_m ?? el.lengthM ?? el.width);
      if (!Number.isFinite(alongWallM) || alongWallM <= 0) return null;

      const wallLengthM = wall === "left" || wall === "right" ? L : W;
      const startM = Number(el.pos_m ?? el.x_m ?? el.y_m);
      const clampedStartM = Number.isFinite(startM)
        ? Math.max(0, Math.min(startM, Math.max(0, wallLengthM - alongWallM)))
        : 0;

      return {
        type: el.type,
        wall,
        // cadExport takes the element's span and the 0–1 ratio of its CENTRE
        // along the wall, so the stored start offset becomes a centre ratio.
        width: alongWallM,
        x_position: (clampedStartM + alongWallM / 2) / wallLengthM,
        label: el.label ?? null,
      };
    })
    .filter(Boolean);
}

// ─── Payload ───────────────────────────────────────────────────────────────

/**
 * Assemble the complete cadExport input for the active design version.
 *
 * @returns {{ ready: boolean, reason: string|null, filename: string|null, data: object|null }}
 *   `ready: false` means required geometry is unavailable — the caller must not
 *   generate a drawing from it.
 */
export function buildProjectCadPayload({
  projectName,
  versionName,
  roomDims,
  seatingPositions,
  installedSpeakers,
  screenMetrics,
  screenFrontPlaneM,
  mlp,
  frontSubsCfg,
  rearSubsCfg,
  roomElements,
  projector,
  lcrAngleInfo,
  aimToggles,
}) {
  const notReady = (reason) => ({ ready: false, reason, filename: null, data: null });

  const cleanProjectName = sanitiseFilenamePart(projectName);
  if (!cleanProjectName) return notReady("The project name is unavailable.");

  const cleanVersionName = sanitiseFilenamePart(versionName);
  if (!cleanVersionName) {
    return notReady("The active design version could not be identified.");
  }

  const W = Number(roomDims?.widthM);
  const L = Number(roomDims?.lengthM);
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
    return notReady("The room dimensions are unavailable.");
  }

  const speakers = Array.isArray(installedSpeakers) ? installedSpeakers : [];
  if (!speakers.some((s) => Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y))) {
    return notReady("No installed speakers with an assigned model were found.");
  }

  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  if (!seats.some((s) => Number.isFinite(s?.x) && Number.isFinite(s?.y))) {
    return notReady("The seating positions are unavailable.");
  }

  const hasUnpositionedSub = [frontSubsCfg, rearSubsCfg].some((cfg) => {
    const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];
    if (Number(cfg?.count) <= 0) return false;
    return positions.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y));
  });
  if (hasUnpositionedSub) {
    return notReady("A subwoofer position is unavailable.");
  }

  const viewWm = Number(screenMetrics?.viewWm);
  if (!Number.isFinite(viewWm) || viewWm <= 0) {
    return notReady("The screen size is unavailable.");
  }
  if (!Number.isFinite(Number(screenFrontPlaneM))) {
    return notReady("The screen position is unavailable.");
  }

  const hasMlp = !!mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y);

  const data = {
    roomDims,
    seatingPositions: seats,
    placedSpeakers: speakers,
    screenFrontPlaneM: Number(screenFrontPlaneM),
    screenMetrics,
    mlp: hasMlp ? { x: mlp.x, y: mlp.y } : null,
    frontSubsCfg,
    rearSubsCfg,
    roomElements: adaptRoomElementsForCad(roomElements, roomDims),
    projector: projector || null,
    lcrAngleInfo: lcrAngleInfo || null,
    aimToggles: {
      aimFrontWidesAtMLP: !!aimToggles?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: !!aimToggles?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: !!aimToggles?.aimRearSurroundsAtMLP,
    },
  };

  return {
    ready: true,
    reason: null,
    filename: buildProjectCadFilename({
      projectName: cleanProjectName,
      versionName: cleanVersionName,
    }),
    data,
  };
}