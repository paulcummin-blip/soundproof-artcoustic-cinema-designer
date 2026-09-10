// Regression test: RSP authority consolidation.
// Verifies that the shared resolver produces identical inputs for every surface
// and that computeEffectiveRsp returns the correct coordinate for each mode.
//
// Run: node --experimental-vm-modules test/rsp-authority-consolidation.test.mjs

import { test, expect, describe } from "vitest";
import { computeEffectiveRsp } from "@/components/room/rsp/computeEffectiveRsp";
import {
  resolveDesignatedRspSeat,
  resolveRowDerivedRspYByMode,
  resolveRspInputs,
} from "@/components/room/rsp/rspInputResolver";
import {
  resolveRspScreenFrontPlaneM,
  resolveRspScreenWidthM,
} from "@/components/room/rsp/screenGeometryResolver";

// ── Fixtures ──────────────────────────────────────────────────────────────

const ROOM = { widthM: 5.0, lengthM: 7.0, heightM: 2.4 };
const SCREEN = {
  visibleWidthInches: 120,
  aspectRatio: "16:9",
  floatDepthM: 0.30,
  mountMode: "floating",
};

const SEATS = [
  { id: "seat-r1-c1", x: 1.5, y: 3.5, z: 1.2, rowNumber: 1, isPrimary: true },
  { id: "seat-r1-c2", x: 2.5, y: 3.5, z: 1.2, rowNumber: 1 },
  { id: "seat-r1-c3", x: 3.5, y: 3.5, z: 1.2, rowNumber: 1 },
  { id: "seat-r2-c1", x: 1.5, y: 5.3, z: 1.2, rowNumber: 2 },
  { id: "seat-r2-c2", x: 2.5, y: 5.3, z: 1.2, rowNumber: 2 },
  { id: "seat-r2-c3", x: 3.5, y: 5.3, z: 1.2, rowNumber: 2 },
];

const OFF_CENTRE_SEAT = { id: "seat-r1-c1", x: 1.5, y: 3.5, z: 1.2, rowNumber: 1, isPrimary: true };

// ── Tests ─────────────────────────────────────────────────────────────────

describe("resolveDesignatedRspSeat", () => {
  test("returns the exact seat coordinates when ID matches", () => {
    const seat = resolveDesignatedRspSeat("seat-r1-c1", SEATS);
    expect(seat).toEqual({ id: "seat-r1-c1", x: 1.5, y: 3.5, z: 1.2 });
  });

  test("returns null when seat ID is not found", () => {
    expect(resolveDesignatedRspSeat("nonexistent", SEATS)).toBeNull();
  });

  test("returns null when ID is null", () => {
    expect(resolveDesignatedRspSeat(null, SEATS)).toBeNull();
  });

  test("returns null when seat has invalid coordinates", () => {
    const badSeats = [{ id: "bad", x: NaN, y: 3.5 }];
    expect(resolveDesignatedRspSeat("bad", badSeats)).toBeNull();
  });
});

describe("resolveRowDerivedRspYByMode", () => {
  test("returns row-centre Y values for each mode", () => {
    const modes = resolveRowDerivedRspYByMode(SEATS, ROOM.widthM, ROOM.lengthM);
    expect(modes.front_row_center).toBeCloseTo(3.5, 2);
    expect(modes.back_row_center).toBeCloseTo(5.3, 2);
    expect(modes.all_rows_average).toBeCloseTo(4.4, 2);
    expect(Number.isFinite(modes.middle_row_center)).toBe(true);
  });

  test("returns empty object when no seats", () => {
    expect(resolveRowDerivedRspYByMode([], ROOM.widthM, ROOM.lengthM)).toEqual({});
  });
});

describe("resolveRspScreenFrontPlaneM", () => {
  test("uses published screenFrontPlaneM when > 0", () => {
    expect(resolveRspScreenFrontPlaneM(0.45, SCREEN)).toBeCloseTo(0.45, 3);
  });

  test("falls back to floatDepthM when screenFrontPlaneM is 0", () => {
    expect(resolveRspScreenFrontPlaneM(0, SCREEN)).toBeCloseTo(0.30, 3);
  });

  test("falls back to 0.20 when no valid source", () => {
    expect(resolveRspScreenFrontPlaneM(null, {})).toBeCloseTo(0.20, 3);
  });

  test("uses screenPlaneY_m before floatDepthM", () => {
    const screen = { ...SCREEN, screenPlaneY_m: 0.15, floatDepthM: 0.30 };
    expect(resolveRspScreenFrontPlaneM(0, screen)).toBeCloseTo(0.15, 3);
  });
});

describe("resolveRspScreenWidthM", () => {
  test("uses visibleWidthInches for projector screen", () => {
    const width = resolveRspScreenWidthM(SCREEN);
    expect(width).toBeCloseTo(120 * 0.0254, 4);
  });

  test("uses TV preset key when present", () => {
    const screen = { ...SCREEN, tvPresetKey: "tv83" };
    const width = resolveRspScreenWidthM(screen);
    expect(width).toBeCloseTo(72.52 * 0.0254, 4);
  });

  test("falls back to 120 inches when nothing is set", () => {
    expect(resolveRspScreenWidthM({})).toBeCloseTo(120 * 0.0254, 4);
  });
});

describe("computeEffectiveRsp — seat_bound mode", () => {
  test("returns exact seat x and y when designatedRspSeat is passed", () => {
    const designatedRspSeat = { id: "seat-r1-c1", x: 1.5, y: 3.5, z: 1.2 };
    const result = computeEffectiveRsp({
      rspMode: "seat_bound",
      roomWidthM: ROOM.widthM,
      designatedRspSeat,
    });
    expect(result.effectiveRspX_m).toBeCloseTo(1.5, 4);
    expect(result.effectiveRspY_m).toBeCloseTo(3.5, 4);
    expect(result.rspSourceLabel).toBe("Seat-bound RSP");
  });

  test("falls through to fallback when designatedRspSeat is null", () => {
    const result = computeEffectiveRsp({
      rspMode: "seat_bound",
      roomWidthM: ROOM.widthM,
      designatedRspSeat: null,
      currentMlpY_m: 4.0,
    });
    expect(result.effectiveRspX_m).toBeCloseTo(2.5, 4);
    expect(result.effectiveRspY_m).toBeCloseTo(4.0, 4);
    expect(result.rspSourceLabel).toBe("Current RSP");
  });
});

describe("computeEffectiveRsp — auto_from_screen mode", () => {
  test("returns centreline X and screen-derived Y", () => {
    const screenFrontPlaneM = 0.30;
    const screenWidthM = 120 * 0.0254;
    const result = computeEffectiveRsp({
      rspMode: "auto_from_screen",
      roomWidthM: ROOM.widthM,
      screenFrontPlaneM,
      screenWidthM,
    });
    expect(result.effectiveRspX_m).toBeCloseTo(2.5, 4);
    // 57.5° distance for 120" screen ≈ 2.636 m
    const expectedDist = screenWidthM / (2 * Math.tan((57.5 / 2) * Math.PI / 180));
    expect(result.effectiveRspY_m).toBeCloseTo(0.30 + expectedDist, 4);
    expect(result.rspSourceLabel).toBe("Auto from screen");
  });
});

describe("computeEffectiveRsp — row-derived modes", () => {
  test("front_row_center uses precomputed Y", () => {
    const rowDerivedRspYByMode = {
      front_row_center: 3.5,
      middle_row_center: 4.4,
      back_row_center: 5.3,
      all_rows_average: 4.4,
    };
    const result = computeEffectiveRsp({
      rspMode: "front_row_center",
      roomWidthM: ROOM.widthM,
      rowDerivedRspYByMode,
    });
    expect(result.effectiveRspX_m).toBeCloseTo(2.5, 4);
    expect(result.effectiveRspY_m).toBeCloseTo(3.5, 4);
    expect(result.rspSourceLabel).toBe("Front Row Centre");
  });

  test("falls through when rowDerivedRspYByMode is empty", () => {
    const result = computeEffectiveRsp({
      rspMode: "middle_row_center",
      roomWidthM: ROOM.widthM,
      rowDerivedRspYByMode: {},
      currentMlpY_m: 4.0,
    });
    expect(result.effectiveRspY_m).toBeCloseTo(4.0, 4);
    expect(result.rspSourceLabel).toBe("Current RSP");
  });
});

describe("resolveRspInputs — full input gathering", () => {
  test("gathers all inputs from appState + screen + seats", () => {
    const appState = {
      rspMode: "seat_bound",
      manualRspY_m: null,
      manualRspX_m: null,
      designatedRspSeatId: "seat-r1-c1",
      screenFrontPlaneM: 0.30,
      mlpY_m: 3.5,
    };
    const inputs = resolveRspInputs({
      appState,
      screen: SCREEN,
      seatingPositions: SEATS,
      roomWidthM: ROOM.widthM,
      roomLengthM: ROOM.lengthM,
    });
    expect(inputs.rspMode).toBe("seat_bound");
    expect(inputs.designatedRspSeat).toEqual({ id: "seat-r1-c1", x: 1.5, y: 3.5, z: 1.2 });
    expect(inputs.screenFrontPlaneM).toBeCloseTo(0.30, 4);
    expect(inputs.screenWidthM).toBeCloseTo(120 * 0.0254, 4);
    expect(inputs.rowDerivedRspYByMode.front_row_center).toBeCloseTo(3.5, 2);
  });

  test("produces same coordinate as direct computeEffectiveRsp call", () => {
    const appState = {
      rspMode: "seat_bound",
      designatedRspSeatId: "seat-r1-c1",
      screenFrontPlaneM: 0.30,
    };
    const inputs = resolveRspInputs({
      appState,
      screen: SCREEN,
      seatingPositions: SEATS,
      roomWidthM: ROOM.widthM,
      roomLengthM: ROOM.lengthM,
    });
    const result = computeEffectiveRsp(inputs);
    expect(result.effectiveRspX_m).toBeCloseTo(1.5, 4);
    expect(result.effectiveRspY_m).toBeCloseTo(3.5, 4);
  });
});

describe("Cross-surface parity", () => {
  test("seat_bound: Plan View and Report produce same x/y for off-centre seat", () => {
    // Simulate the inputs that RoomVisualisation and useClientReportAuthority
    // both resolve via the shared resolver.
    const appState = {
      rspMode: "seat_bound",
      designatedRspSeatId: OFF_CENTRE_SEAT.id,
      screenFrontPlaneM: 0.30,
    };
    const inputs = resolveRspInputs({
      appState,
      screen: SCREEN,
      seatingPositions: [OFF_CENTRE_SEAT],
      roomWidthM: ROOM.widthM,
      roomLengthM: ROOM.lengthM,
    });

    // Plan View calls computeEffectiveRsp with these inputs
    const planResult = computeEffectiveRsp(inputs);
    // Report calls computeEffectiveRsp with the same inputs
    const reportResult = computeEffectiveRsp(inputs);

    expect(reportResult.effectiveRspX_m).toBe(planResult.effectiveRspX_m);
    expect(reportResult.effectiveRspY_m).toBe(planResult.effectiveRspY_m);
    // X must be the seat's X (1.5), NOT the centreline (2.5)
    expect(planResult.effectiveRspX_m).toBeCloseTo(1.5, 4);
    expect(planResult.effectiveRspY_m).toBeCloseTo(3.5, 4);
  });

  test("auto_from_screen: Plan View and Report use same screen geometry", () => {
    const appState = {
      rspMode: "auto_from_screen",
      screenFrontPlaneM: 0, // not yet published
    };
    const screen = { ...SCREEN, screenPlaneY_m: 0 };

    const inputs = resolveRspInputs({
      appState,
      screen,
      seatingPositions: SEATS,
      roomWidthM: ROOM.widthM,
      roomLengthM: ROOM.lengthM,
    });

    // Both surfaces use the same screenFrontPlaneM (floatDepthM fallback = 0.30)
    expect(inputs.screenFrontPlaneM).toBeCloseTo(0.30, 4);

    const result = computeEffectiveRsp(inputs);
    const expectedDist = inputs.screenWidthM / (2 * Math.tan((57.5 / 2) * Math.PI / 180));
    expect(result.effectiveRspY_m).toBeCloseTo(0.30 + expectedDist, 4);
  });

  test("row-derived: RvStaticCanvas and Plan View use same rowDerivedRspYByMode", () => {
    const appState = { rspMode: "middle_row_center", screenFrontPlaneM: 0.30 };
    const inputs = resolveRspInputs({
      appState,
      screen: SCREEN,
      seatingPositions: SEATS,
      roomWidthM: ROOM.widthM,
      roomLengthM: ROOM.lengthM,
    });

    // Both surfaces compute rowDerivedRspYByMode from the same seats
    expect(inputs.rowDerivedRspYByMode.middle_row_center).toBeCloseTo(4.4, 2);

    const result = computeEffectiveRsp(inputs);
    expect(result.effectiveRspY_m).toBeCloseTo(4.4, 2);
    expect(result.rspSourceLabel).toBe("Middle Row Centre");
  });
});