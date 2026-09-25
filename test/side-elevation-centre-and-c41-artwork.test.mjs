import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sideElevation = await readFile(
  new URL("../src/components/room/SideElevation.jsx", import.meta.url),
  "utf8",
);
const speakerFaceIcons = await readFile(
  new URL("../src/components/report/SpeakerFaceIcons.jsx", import.meta.url),
  "utf8",
);

test("side elevation includes FC alongside the viewed-wall main speaker", () => {
  assert.match(sideElevation, /if \(hasFC\) visibleRoles\.add\('FC'\)/);
  assert.match(sideElevation, /wall === 'right' && hasFR/);
  assert.match(sideElevation, /wall === 'left' && hasFL/);
  assert.doesNotMatch(sideElevation, /FC \(centre\) is hidden/);
});

test("C4-1 artwork is normalised onto a white cabinet face", () => {
  assert.match(speakerFaceIcons, /id="c41-white-artwork"/);
  assert.match(speakerFaceIcons, /width="1711" height="120" fill="#ffffff"/);
  assert.match(speakerFaceIcons, /filter="url\(#c41-white-artwork\)"/);
});
