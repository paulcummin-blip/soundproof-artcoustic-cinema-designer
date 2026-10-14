/**
 * adi-chip-display-authority.test.mjs
 * -----------------------------------
 * THE ADI example chip display authority, as a regression fixture.
 *
 * An example chip states the display through the same authority every report and
 * proposal surface reads: a television by its NOMINAL size (a 100" TV is 100",
 * never the 101" that the panel's 87.80" viewable width would round to), and a
 * projection screen by its viewable width and aspect ratio, never a diagonal.
 *
 * The screen block is built by the real room authority and the chip by the real
 * wizard builder, so these assertions read the shipped path: project design in,
 * chip label out. Nothing is calculated here.
 */
import { describe, test, expect } from "vitest";

import { buildRoomAuthority } from "@/components/proposal/engineeringAuthority/buildRoomAuthority";
import {
  resolveCanonicalScreen,
  resolveStatedScreenSize,
} from "@/components/models/screen/canonicalScreenSize";
import { displayPhrase } from "@/components/models/screen/displayTypeAuthority";
import { buildEvidenceSuggestions } from "@/components/proposal/wizard/adiEvidenceSuggestions";

const ROOM_DIMS = JSON.stringify({ widthM: 5.42, lengthM: 5.25, heightM: 2.4 });

const design = (screen) => ({
  roomDims: ROOM_DIMS,
  screen_wall: "front",
  screen_mount_mode: "baffle",
  screen_height_from_floor: 0.6,
  ...screen,
});

/** Marquee Home / Original Design: a 100" television, 16:9. */
const MARQUEE_TV_100 = design({ tv_preset_key: "tv100", tv_width_mm: 2230, aspect_ratio: "16:9" });
/** A 65" television lounge. */
const LOUNGE_TV_65 = design({ tv_preset_key: "tv65", tv_width_mm: 1411, aspect_ratio: "16:9" });
/** A 170" wide 2.35:1 projection screen. */
const PROJECTION_170 = design({ screen_size: 170, aspect_ratio: "2.35:1" });

/** The frozen snapshot the wizard reads, with a real room authority screen block. */
const snapshotFor = (project) => {
  const room = buildRoomAuthority(project, null);
  return {
    available: true,
    room: {
      screen: room.screen,
      seating: { row_count: 1, total_seats: 4 },
    },
    system: { configuration: { dolby_config: "5.1" }, channel_layout: { total_discrete: 6 } },
    rp22: { parameter_headlines: [] },
    seats: [],
  };
};

const chipLabels = (project) => buildEvidenceSuggestions({
  snapshot: snapshotFor(project),
}).suggestions.map((entry) => entry.label);

const displayChip = (project) => chipLabels(project)[0];

describe("ADI example chips state the canonical display", () => {
  test('100" TV: chip says 100" TV and never 101" TV', () => {
    const canonical = resolveCanonicalScreen(MARQUEE_TV_100);
    expect(canonical.diagonalInches).toBe(100);
    expect(canonical.text).toBe('100" TV');
    expect(resolveStatedScreenSize(MARQUEE_TV_100)).toBe(100);

    const labels = chipLabels(MARQUEE_TV_100);
    expect(labels[0]).toBe('Emphasise the 100" TV');
    expect(labels.join(" | ")).not.toMatch(/101/);
  });

  test('65" TV: chip says 65" TV, with no recalculated diagonal', () => {
    const canonical = resolveCanonicalScreen(LOUNGE_TV_65);
    expect(canonical.diagonalInches).toBe(65);
    // The viewable width (55.55") would round to 64" — the nominal size is used.
    expect(canonical.diagonalInches).not.toBe(64);
    expect(resolveStatedScreenSize(LOUNGE_TV_65)).toBe(65);

    const label = displayChip(LOUNGE_TV_65);
    expect(label).toBe('Emphasise the 65" TV');
    expect(label).not.toMatch(/64/);
  });

  test("projector: chip uses the viewable width and aspect ratio, never a diagonal", () => {
    const canonical = resolveCanonicalScreen(PROJECTION_170);
    // The diagonal remains a reference value only, and is not what the chip states.
    expect(canonical.diagonalInches).toBe(185);
    expect(resolveStatedScreenSize(PROJECTION_170)).toBe(170);

    const label = displayChip(PROJECTION_170);
    expect(label).toBe("Emphasise the 170 inch 2.35:1 screen");
    expect(label).not.toMatch(/185/);
  });

  test("a television is stated by its nominal size on every surface", () => {
    [MARQUEE_TV_100, LOUNGE_TV_65].forEach((project) => {
      const nominal = resolveCanonicalScreen(project).diagonalInches;
      // The report's display identity and the snapshot the chip reads agree.
      expect(displayPhrase(project)).toBe(`${nominal}" TV`);
      expect(snapshotFor(project).room.screen.diagonal_inches).toBe(nominal);
      expect(snapshotFor(project).room.screen.size_inches).toBe(nominal);
    });
  });
});