// about-sound-proof-mandatory.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — About Sound Proof is a MANDATORY closing page of the Visual and
// Technical Reports, and is never exported blank or in a waiting state.
//
//   TEST 1  Published copy wins when it says something
//   TEST 2  The bundled fallback answers when nothing is published, or when the
//           read has not resolved yet (null / undefined / empty / whitespace)
//   TEST 3  The fallback is always available and never empty — synchronous
//   TEST 4  The fallback copy is the approved wording, and is not excessively long
//   TEST 5  Both reports always render the page, last, and never wait for copy
//   TEST 6  The page keeps its single print identity, so no blank page is opened
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveAboutSoundProofHtml,
  hasAboutSoundProofCopy,
} from '@/components/publicationContent/aboutSoundProofCopy';
import { DEFAULT_ABOUT_SOUND_PROOF_HTML } from '@/components/publicationContent/defaultContent';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const plainText = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const PUBLISHED = '<p>Published About copy for this dealer.</p>';

// ── TEST 1 — published copy wins ──────────────────────────────────────────
test('TEST 1 — the published copy is used when it says something', () => {
  assert.equal(resolveAboutSoundProofHtml(PUBLISHED), PUBLISHED);
  assert.equal(hasAboutSoundProofCopy(PUBLISHED), true);
});

// ── TEST 2 — the fallback answers when the read has not resolved ──────────
test('TEST 2 — an unresolved read falls back to the built-in copy, never to nothing', () => {
  for (const unresolved of [null, undefined, '', '   ', '\n\t']) {
    const resolved = resolveAboutSoundProofHtml(unresolved);
    assert.equal(resolved, DEFAULT_ABOUT_SOUND_PROOF_HTML,
      `an unresolved read (${JSON.stringify(unresolved)}) resolves to the built-in copy`);
    assert.ok(resolved.trim().length > 0, 'the page always has copy to print');
  }
});

// ── TEST 3 — the fallback is bundled, synchronous and never empty ─────────
test('TEST 3 — the built-in fallback is bundled with the app', () => {
  // The copy module imports the fallback directly rather than fetching it: the
  // value is in the bundle, so it is available synchronously at print time.
  const source = read('src/components/publicationContent/aboutSoundProofCopy.js');
  assert.ok(source.includes('import { DEFAULT_ABOUT_SOUND_PROOF_HTML } from "./defaultContent";'),
    'the copy is imported from the bundled registry');
  assert.ok(!/await|fetch\(|base44\./.test(source), 'resolving the copy is synchronous');
  assert.ok(!/Loading/i.test(source), 'the copy authority has no waiting state');

  // Calling it twice in a row yields the same complete copy — no state, no wait.
  assert.equal(resolveAboutSoundProofHtml(null), resolveAboutSoundProofHtml(undefined));
  assert.ok(DEFAULT_ABOUT_SOUND_PROOF_HTML.trim().length > 0);
  assert.ok(hasAboutSoundProofCopy(DEFAULT_ABOUT_SOUND_PROOF_HTML), true);
});

// ── TEST 4 — the fallback copy itself ────────────────────────────────────
test('TEST 4 — the fallback is the approved copy, and not excessively long', () => {
  const text = plainText(DEFAULT_ABOUT_SOUND_PROOF_HTML);
  const paragraphs = (DEFAULT_ABOUT_SOUND_PROOF_HTML.match(/<p>/g) || []).length;

  assert.ok(paragraphs >= 6, 'the copy is a multi-paragraph document');
  assert.ok(
    text.includes('Sound Proof is a professional home cinema design assistant built around the engineering principles of CEDIA RP22.'),
    'the opening statement sets out what Sound Proof is',
  );
  assert.ok(
    text.includes('The RP22 parameters are not the objective of the design process. They are the evidence used to validate the quality of the design.'),
    'the copy explains how the report should be interpreted',
  );
  assert.ok(
    text.includes('The goal is not to force every room to Level 4.'),
    'the copy states the design intent',
  );
  assert.ok(
    text.includes('Predicted performance should always be confirmed by final calibration on site.'),
    'the copy closes with the calibration caveat',
  );
  assert.ok(text.length <= 1800, `the closing page stays short (${text.length} characters)`);
});

// ── TEST 5 — both reports always render the page, last ───────────────────
test('TEST 5 — the page is never omitted from either report', () => {
  const visual = read('src/pages/RP22ClientReport.jsx');
  const technical = read('src/pages/RP22Report.jsx');
  const section = read('src/components/report/technical/TechnicalAboutSoundProofSection.jsx');

  // Visual Report: closing page always pushed, and always the last page.
  assert.ok(!visual.includes('aboutSoundProofReady'), 'the Visual Report no longer gates the page');
  assert.ok(visual.includes('id: "about-sound-proof"'), 'the Visual Report always adds the page');
  const closing = visual.slice(visual.indexOf('const closingPages = []'));
  assert.ok(
    closing.lastIndexOf('id: "about-sound-proof"') > closing.lastIndexOf('id: "acoustic-treatment"'),
    'About Sound Proof is the final closing page',
  );

  // Technical Report: the closing block always renders.
  assert.ok(technical.includes('<TechnicalAboutSoundProofSection />'), 'the Technical Report renders the page');
  assert.ok(!section.includes('return null'), 'the block is never skipped');

  // Neither report renders a waiting state for it.
  assert.ok(!/Loading/.test(section.split('export default')[1]), 'the block prints no loading state');
});

// ── TEST 6 — one print identity, so no blank page is opened ──────────────
test('TEST 6 — the page keeps its single print identity', () => {
  const wrapper = read('src/components/report/client/ClientReportPage.jsx');
  const section = read('src/components/report/technical/TechnicalAboutSoundProofSection.jsx');

  assert.ok(wrapper.includes('"about-sound-proof"'), 'the Visual Report print set includes the page');
  assert.ok(wrapper.includes('printData?.type === "about-sound-proof"'), 'the wrapper composes it for print');
  assert.ok(section.includes('data-report-page-start="true"'), 'the Technical Report opens one page for it');
  assert.ok(
    (section.match(/id="pdf-about-sound-proof"/g) || []).length === 1,
    'exactly one page block carries the identity — nothing empty is laid out behind it',
  );
});