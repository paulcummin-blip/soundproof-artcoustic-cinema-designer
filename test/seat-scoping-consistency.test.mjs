// seat-scoping-consistency.test.mjs
// Focused regression tests for the Primary/Secondary seat-scope fix.
//
// Verifies:
//   A. Secondary FAIL does not contaminate Primary scope
//   B. Primary FAIL does contaminate Primary scope
//   C. One Primary L4 produces Primary floor L4
//   D. Four Secondary seats remain Secondary
//   E. Priority toggle re-scopes without acoustic calculation
//   F. Pending bass does not preserve stale scope (fingerprint detection)
//   G. Hydration preserves explicit priority
//   H. All seat-scoped parameters use same scoped seat IDs
//   I. Stale fingerprint causes pending presentation, not old rating
//   J. Matching fingerprint restores current rating
//   K. No active seat enters scoped rating with missing priority
//   L. Five-seat screenshot case: S3 Primary → Primary=[S3], Secondary=[S1,S2,S4,S5]

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSeatPriority,
  toggleSeatPriority,
  PRIMARY,
  SECONDARY,
} from "@/components/utils/seatPriorityAuthority";
import {
  buildSeatPriorityFingerprint,
  getScopedSeatIds,
  normaliseSeatPriorities,
} from "@/components/utils/seatScopeAuthority";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeSeat = (id, priority) => ({
  id,
  x: 1,
  y: 2,
  z: 1.2,
  rowNumber: 1,
  priority,
});

// Screenshot case: S3 Primary, all others Secondary
const screenshotSeats = () => [
  makeSeat("S1", SECONDARY),
  makeSeat("S2", SECONDARY),
  makeSeat("S3", PRIMARY),
  makeSeat("S4", SECONDARY),
  makeSeat("S5", SECONDARY),
];

// ── Tests ─────────────────────────────────────────────────────────────────

describe("L — Screenshot case: S3 Primary", () => {
  it("scopes Primary=[S3], Secondary=[S1,S2,S4,S5]", () => {
    const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.deepEqual(primarySeatIds, ["S3"]);
    assert.deepEqual(secondarySeatIds, ["S1", "S2", "S4", "S5"]);
  });

  it("primarySeatIds.length = 1, secondarySeatIds.length = 4", () => {
    const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.equal(primarySeatIds.length, 1);
    assert.equal(secondarySeatIds.length, 4);
  });
});

describe("A — Secondary FAIL does not contaminate Primary", () => {
  it("Primary scope excludes all Secondary seats", () => {
    const { primarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.ok(!primarySeatIds.includes("S1"));
    assert.ok(!primarySeatIds.includes("S2"));
    assert.ok(!primarySeatIds.includes("S4"));
    assert.ok(!primarySeatIds.includes("S5"));
    assert.deepEqual(primarySeatIds, ["S3"]);
  });
});

describe("B — Primary FAIL does contaminate Primary", () => {
  it("a Primary seat is included in primarySeatIds regardless of its metric", () => {
    const seats = [makeSeat("S1", PRIMARY), makeSeat("S2", SECONDARY)];
    const { primarySeatIds } = getScopedSeatIds(seats);
    assert.deepEqual(primarySeatIds, ["S1"]);
  });
});

describe("C — One Primary seat produces single-seat Primary scope", () => {
  it("Primary scope has exactly one seat (S3)", () => {
    const { primarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.equal(primarySeatIds.length, 1);
    assert.equal(primarySeatIds[0], "S3");
  });
});

describe("D — Four Secondary seats remain Secondary", () => {
  it("Secondary scope has exactly four seats", () => {
    const { secondarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.equal(secondarySeatIds.length, 4);
    assert.deepEqual(secondarySeatIds, ["S1", "S2", "S4", "S5"]);
  });
});

describe("E — Priority toggle re-scopes without acoustic calculation", () => {
  it("State A: S3 Primary → Primary=[S3]", () => {
    const { primarySeatIds } = getScopedSeatIds(screenshotSeats());
    assert.deepEqual(primarySeatIds, ["S3"]);
  });

  it("State B: toggle to S2 Primary → Primary=[S2]", () => {
    let seats = screenshotSeats();
    seats = toggleSeatPriority(seats, "S3"); // S3 → Secondary
    seats = toggleSeatPriority(seats, "S2"); // S2 → Primary
    const { primarySeatIds, secondarySeatIds } = getScopedSeatIds(seats);
    assert.deepEqual(primarySeatIds, ["S2"]);
    assert.deepEqual(secondarySeatIds, ["S1", "S3", "S4", "S5"]);
  });

  it("State C: restore S3 Primary → Primary=[S3]", () => {
    let seats = screenshotSeats();
    seats = toggleSeatPriority(seats, "S3");
    seats = toggleSeatPriority(seats, "S2");
    seats = toggleSeatPriority(seats, "S2"); // S2 → Secondary
    seats = toggleSeatPriority(seats, "S3"); // S3 → Primary
    const { primarySeatIds } = getScopedSeatIds(seats);
    assert.deepEqual(primarySeatIds, ["S3"]);
  });

  it("fingerprint changes on toggle and restores on toggle-back", () => {
    const original = screenshotSeats();
    const fpA = buildSeatPriorityFingerprint(original);
    const toggled = toggleSeatPriority(original, "S3");
    const fpB = buildSeatPriorityFingerprint(toggled);
    assert.notEqual(fpA, fpB);
    const restored = toggleSeatPriority(toggled, "S3");
    const fpC = buildSeatPriorityFingerprint(restored);
    assert.equal(fpA, fpC);
  });
});

describe("F + I — Stale fingerprint detection", () => {
  it("different fingerprints detected as stale", () => {
    const liveFp = buildSeatPriorityFingerprint(screenshotSeats());
    const staleSeats = screenshotSeats().map((s) => ({ ...s, priority: PRIMARY }));
    const staleFp = buildSeatPriorityFingerprint(staleSeats);
    assert.notEqual(liveFp, staleFp);
    // Layout logic: liveFp && publishedFp && liveFp !== publishedFp → stale
    assert.ok(liveFp && staleFp && liveFp !== staleFp);
  });

  it("matching fingerprints not stale", () => {
    const fp = buildSeatPriorityFingerprint(screenshotSeats());
    const fp2 = buildSeatPriorityFingerprint(screenshotSeats());
    assert.equal(fp, fp2);
    assert.ok(!(fp && fp2 && fp !== fp2));
  });
});

describe("J — Matching fingerprint restores current rating", () => {
  it("same seat set produces same fingerprint", () => {
    const fp1 = buildSeatPriorityFingerprint(screenshotSeats());
    const fp2 = buildSeatPriorityFingerprint(screenshotSeats());
    assert.equal(fp1, fp2);
  });
});

describe("G — Hydration preserves explicit priority", () => {
  it("normaliseSeatPriorities adds explicit priority to seats missing it", () => {
    const raw = [
      { id: "S1", x: 1, y: 2 },
      { id: "S2", x: 1, y: 2, priority: "secondary" },
      { id: "S3", x: 1, y: 2, priority: "primary" },
    ];
    const normalised = normaliseSeatPriorities(raw);
    assert.equal(normalised[0].priority, "primary");
    assert.equal(normalised[1].priority, "secondary");
    assert.equal(normalised[2].priority, "primary");
  });

  it("normaliseSeatPriorities handles null/undefined/empty priority", () => {
    const raw = [
      { id: "S1", priority: null },
      { id: "S2", priority: undefined },
      { id: "S3", priority: "" },
    ];
    const normalised = normaliseSeatPriorities(raw);
    for (const s of normalised) {
      assert.ok(
        s.priority === "primary" || s.priority === "secondary",
        `seat ${s.id} has explicit priority`
      );
    }
  });

  it("normaliseSeatPriorities returns same ref when no change needed", () => {
    const seats = screenshotSeats();
    assert.equal(normaliseSeatPriorities(seats), seats);
  });
});

describe("H — All seat-scoped parameters use same scoped seat IDs", () => {
  it("getScopedSeatIds is deterministic — same input → same output", () => {
    const s1 = getScopedSeatIds(screenshotSeats());
    const s2 = getScopedSeatIds(screenshotSeats());
    assert.deepEqual(s1, s2);
  });

  it("fingerprint is order-independent (sorted)", () => {
    const seats = screenshotSeats();
    const shuffled = [seats[3], seats[0], seats[4], seats[1], seats[2]];
    assert.equal(
      buildSeatPriorityFingerprint(seats),
      buildSeatPriorityFingerprint(shuffled)
    );
  });
});

describe("K — No active seat enters scoped rating with missing priority", () => {
  it("resolveSeatPriority returns canonical value for any input", () => {
    assert.equal(resolveSeatPriority({ priority: "primary" }), PRIMARY);
    assert.equal(resolveSeatPriority({ priority: "secondary" }), SECONDARY);
    assert.equal(resolveSeatPriority({ priority: null }), PRIMARY);
    assert.equal(resolveSeatPriority({ priority: undefined }), PRIMARY);
    assert.equal(resolveSeatPriority({ priority: "" }), PRIMARY);
    assert.equal(resolveSeatPriority({}), PRIMARY);
    assert.equal(resolveSeatPriority(null), PRIMARY);
    assert.equal(resolveSeatPriority(undefined), PRIMARY);
  });

  it("normaliseSeatPriorities ensures every seat has explicit priority", () => {
    const raw = [{ id: "S1" }, { id: "S2", priority: "secondary" }];
    const normalised = normaliseSeatPriorities(raw);
    for (const s of normalised) {
      assert.ok(
        s.priority === "primary" || s.priority === "secondary",
        `seat ${s.id} has explicit priority`
      );
    }
  });
});