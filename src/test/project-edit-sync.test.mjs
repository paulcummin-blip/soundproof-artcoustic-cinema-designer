// project-edit-sync.test.mjs
// --------------------------------
// Focused tests for the safe project-edit diff builder.
//
// Requirement: when editing an EXISTING project, submit only the fields the
// user has intentionally changed. A client-name-only correction sends only
// client_name; unchanged engineering-summary fields (room dimensions, Dolby
// config, target SPL, amplifier power) are never resubmitted.

import { describe, test, expect } from "vitest";
import { buildProjectEditPayload } from "@/components/projects/projectEditDiff.js";

const baseForm = () => ({
  name: "Rotherham",
  client_name: "Rotherham Proejct",
  project_reference: "AC-2026-014",
  project_status: "prospective",
  room_length: "6.0",
  room_width: "4.5",
  room_height: "2.4",
  dolby_config: "7.1.4",
  target_spl: 105,
  amplifier_power: "250",
  notes: "Existing notes",
});

describe("buildProjectEditPayload", () => {
  test("client-name-only correction sends only client_name", () => {
    const original = baseForm();
    const current = { ...original, client_name: "Rotherham Project" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(["client_name"]);
    expect(payload.client_name).toBe("Rotherham Project");
  });

  test("no changes produces an empty payload", () => {
    const original = baseForm();
    const { payload, hasChanges } = buildProjectEditPayload(original, original);
    expect(hasChanges).toBe(false);
    expect(payload).toEqual({});
  });

  test("correcting a project reference does not overwrite unrelated values", () => {
    const original = baseForm();
    const current = { ...original, project_reference: "AC-2026-999" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(["project_reference"]);
    expect(payload.project_reference).toBe("AC-2026-999");
  });

  test("unchanged engineering-summary fields are never resubmitted", () => {
    const original = baseForm();
    const current = { ...original, client_name: "Rotherham Project Ltd" };
    const { payload } = buildProjectEditPayload(original, current);
    expect(payload).not.toHaveProperty("room_length");
    expect(payload).not.toHaveProperty("room_width");
    expect(payload).not.toHaveProperty("room_height");
    expect(payload).not.toHaveProperty("dolby_config");
    expect(payload).not.toHaveProperty("target_spl");
    expect(payload).not.toHaveProperty("amplifier_power");
    expect(Object.keys(payload).sort()).toEqual(["client_name"]);
  });

  test("deliberate permitted edits still work (room dimension change)", () => {
    const original = baseForm();
    const current = { ...original, room_length: "6.5" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(["room_length"]);
    expect(payload.room_length).toBe(6.5);
  });

  test("numeric coercion: 6 vs '6.0' is not a change", () => {
    const original = baseForm();
    const current = { ...original, room_length: 6.0 };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(false);
    expect(payload).toEqual({});
  });

  test("clearing a numeric field is detected as a change (250 -> null)", () => {
    const original = baseForm();
    const current = { ...original, amplifier_power: "" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(payload.amplifier_power).toBeNull();
  });

  test("status change is detected and only status is sent", () => {
    const original = baseForm();
    const current = { ...original, project_status: "live" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(["project_status"]);
    expect(payload.project_status).toBe("live");
  });

  test("name change is detected and only name is sent", () => {
    const original = baseForm();
    const current = { ...original, name: "Rotherham Cinema" };
    const { payload, hasChanges } = buildProjectEditPayload(original, current);
    expect(hasChanges).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(["name"]);
    expect(payload.name).toBe("Rotherham Cinema");
  });
});