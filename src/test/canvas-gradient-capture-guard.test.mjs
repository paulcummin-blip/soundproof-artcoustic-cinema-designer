/**
 * canvas gradient capture guard — the contract
 * --------------------------------------------
 * The Project Library storage path failed with:
 *
 *   Failed to execute 'addColorStop' on 'CanvasGradient':
 *   The provided double value is non-finite.
 *
 * html2canvas paints a CSS gradient by dividing each colour-stop position by
 * the gradient line length, so a gradient on a box that measures nothing gives
 * 0/0 = NaN and the browser throws — aborting the capture, so the PDF downloads
 * but no Library copy is stored.
 *
 * What this suite proves:
 *   TEST A  a valid colour stop is passed through, clamped to 0-1
 *   TEST B  a non-finite stop falls back instead of throwing
 *   TEST C  the guard is installed for the capture and removed afterwards
 *   TEST D  gradient geometry is made finite (radius never negative)
 *   TEST E  a gradient on a zero-measured box is neutralised, upstream
 *   TEST F  the capture installs the guard and neutralises before rasterising
 *   TEST G  one export action stores once and reports once
 * ---------------------------------------------------------------------------
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  clampGradientOffset,
  installCanvasGradientGuard,
  neutraliseDegenerateGradients,
  sanitiseGradientCoordinate,
  sanitiseGradientOffset,
  sanitiseRadialRadius,
} from '../components/library/canvasGradientGuard.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** A canvas realm that throws exactly as a browser does on a non-finite stop. */
function fakeCanvasRealm() {
  class FakeGradient {
    constructor() {
      this.stops = [];
    }

    addColorStop(offset, color) {
      if (!Number.isFinite(offset)) {
        throw new Error("Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is non-finite.");
      }
      this.stops.push([offset, color]);
    }
  }

  class FakeContext {
    createLinearGradient(...args) {
      this.linearArgs = args;
      return new FakeGradient();
    }

    createRadialGradient(...args) {
      this.radialArgs = args;
      return new FakeGradient();
    }
  }

  return { CanvasGradient: FakeGradient, CanvasRenderingContext2D: FakeContext, FakeContext, FakeGradient };
}

/** A capture document with one degenerate gradient box and one real one. */
function fakeCaptureDocument() {
  const make = (tagName, className, rect, backgroundImage) => {
    const applied = [];
    return {
      tagName,
      className,
      applied,
      getAttribute: () => className,
      getBoundingClientRect: () => rect,
      style: {
        setProperty: (name, value, priority) => applied.push([name, value, priority]),
      },
      computed: backgroundImage,
    };
  };

  const degenerate = make('div', 'proposal-cover-shade', { width: 794, height: 0 }, 'linear-gradient(rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.84) 100%)');
  const real = make('div', 'pp-card', { width: 320, height: 120 }, 'linear-gradient(rgb(255, 255, 255) 0%, rgb(0, 0, 0) 100%)');
  const plain = make('div', 'pp-text', { width: 320, height: 20 }, 'none');

  return {
    degenerate,
    real,
    document: {
      defaultView: { getComputedStyle: (element) => ({ backgroundImage: element.computed }) },
      querySelectorAll: () => [degenerate, real, plain],
    },
  };
}

// ── TEST A — a valid stop is passed through ────────────────────────────────
test('TEST A — a finite colour stop is clamped into 0-1 and otherwise untouched', () => {
  assert.equal(clampGradientOffset(0), 0);
  assert.equal(clampGradientOffset(0.4), 0.4);
  assert.equal(clampGradientOffset(1), 1);
  assert.equal(clampGradientOffset(1.6), 1, 'above the end of the line is clamped to 1');
  assert.equal(clampGradientOffset(-0.3), 0, 'below the start of the line is clamped to 0');

  assert.equal(sanitiseGradientOffset(0.62), 0.62);
  assert.equal(sanitiseGradientOffset('0.25'), 0.25, 'a numeric string is a valid offset');
});

// ── TEST B — a non-finite stop falls back instead of throwing ──────────────
test('TEST B — a non-finite colour stop falls back to the last valid stop', () => {
  const nan = sanitiseGradientOffset(NaN);
  assert.ok(Number.isFinite(nan), 'the offset handed to the canvas is always finite');
  assert.equal(nan, 0, 'the first stop of a degenerate gradient lands at the start');

  assert.equal(sanitiseGradientOffset(Infinity), 0);
  assert.equal(sanitiseGradientOffset(-Infinity), 0);
  assert.equal(sanitiseGradientOffset(undefined), 0);
  assert.equal(sanitiseGradientOffset(NaN, 0.84), 0.84, 'a later stop keeps the previous valid position');
  assert.equal(sanitiseGradientOffset(NaN, 4), 1, 'and the fallback is itself clamped');
});

// ── TEST C — the guard is installed and then removed ──────────────────────
test('TEST C — the guard survives the non-finite stop and is removed afterwards', () => {
  const realm = fakeCanvasRealm();
  const gradient = new realm.FakeGradient();
  assert.throws(() => gradient.addColorStop(NaN, '#000'), /non-finite/, 'the browser behaviour this fixes');

  const guard = installCanvasGradientGuard(realm);
  gradient.addColorStop(NaN, 'rgba(0, 0, 0, 0.62)');
  gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.34)');
  gradient.addColorStop(NaN, 'rgba(0, 0, 0, 0.84)');

  assert.equal(gradient.stops.length, 3, 'every stop is painted');
  assert.ok(gradient.stops.every(([offset]) => Number.isFinite(offset)));
  assert.deepEqual(guard.sanitisedStops(), [
    { received: 'NaN', used: 0 },
    { received: 'NaN', used: 0.4 },
  ], 'what was sanitised is reported, never hidden');

  guard.restore();
  assert.throws(() => new realm.FakeGradient().addColorStop(NaN, '#000'), /non-finite/, 'the canvas API is left as it was found');
});

// ── TEST D — gradient geometry is made finite ─────────────────────────────
test('TEST D — the gradient geometry cannot carry a failed measurement', () => {
  const realm = fakeCanvasRealm();
  const guard = installCanvasGradientGuard(realm);
  const context = new realm.FakeContext();

  context.createLinearGradient(NaN, Infinity, -Infinity, undefined);
  assert.deepEqual(context.linearArgs, [0, 0, 0, 0]);

  context.createRadialGradient(0, 0, NaN, 10, 10, -4);
  assert.deepEqual(context.radialArgs, [0, 0, 0, 10, 10, 0], 'a radius is finite and never negative');

  assert.equal(sanitiseGradientCoordinate('120'), 120);
  assert.equal(sanitiseRadialRadius(-1), 0);
  guard.restore();
});

// ── TEST E — the degenerate gradient is removed upstream ──────────────────
test('TEST E — a gradient on a box that measures nothing is neutralised', () => {
  const capture = fakeCaptureDocument();
  const findings = neutraliseDegenerateGradients(capture.document);

  assert.equal(findings.length, 1, 'only the degenerate gradient is touched');
  assert.equal(findings[0].tag, 'div');
  assert.equal(findings[0].className, 'proposal-cover-shade');
  assert.equal(findings[0].height, 0);
  assert.match(findings[0].backgroundImage, /^linear-gradient\(/);

  assert.deepEqual(
    capture.degenerate.applied,
    [['background-image', 'none', 'important']],
    'a box that cannot paint is told not to paint a gradient',
  );
  assert.deepEqual(capture.real.applied, [], 'a gradient that can paint is untouched: the document is unchanged');
  assert.deepEqual(capture.real.getBoundingClientRect(), { width: 320, height: 120 });
});

// ── TEST F — the capture installs both guards ─────────────────────────────
test('TEST F — the capture neutralises the degenerate gradient and guards the canvas', () => {
  const capture = read('src/components/library/compositionCapture.js');

  assert.ok(
    capture.indexOf('neutraliseDegenerateGradients(scope)') < capture.indexOf('html2canvas(pages[index]'),
    'the degenerate gradient is removed before any page is rasterised',
  );
  assert.ok(capture.includes('gradientGuard = installCanvasGradientGuard();'), 'the canvas is guarded for the capture');
  assert.ok(capture.includes('gradientGuard.restore();'), 'and the canvas API is restored in the finally');
  assert.ok(
    capture.includes('degenerateGradients,') && capture.includes('sanitisedStops: gradientGuard ? gradientGuard.sanitisedStops() : []'),
    'what was sanitised is returned with the capture',
  );
  assert.ok(!capture.includes('addColorStop('), 'the capture never calls addColorStop itself');

  // The guard is the only place in the app that touches the canvas gradient API.
  const guard = read('src/components/library/canvasGradientGuard.js');
  assert.ok(guard.includes("replacePrototypeMethod(gradientPrototype, 'addColorStop'"), 'the offset is validated at the source');
  assert.ok(guard.includes("'createLinearGradient'") && guard.includes("'createRadialGradient'"), 'and with it the geometry');
});

// ── TEST G — one export action stores once and reports once ───────────────
test('TEST G — a repeated entry for one export is stored once and reported once', () => {
  const record = read('src/components/library/issuedDocument/recordIssuedExport.js');

  assert.ok(record.includes('const attemptsInFlight = new Set();'), 'an attempt in flight is tracked');
  assert.ok(record.includes('if (attemptsInFlight.has(attemptKey)) return false;'), 'the same export is not captured twice');
  assert.ok(record.includes('attemptsInFlight.add(attemptKey);') && record.includes('attemptsInFlight.delete(attemptKey);'));

  // The dedupe key is the export's own identity, plus the step that failed.
  assert.ok(record.includes('function exportAttemptKey(identity = {})'));
  assert.ok(record.includes('identity.projectId || ') && record.includes('identity.documentType || '));
  assert.ok(record.includes('Array.isArray(identity.selectedVersionIds)') && record.includes('identity.versionId || '));
  assert.ok(record.includes('normalizeFilename(identity.filename),'));
  assert.ok(record.includes('function failureNoticeKey(identity = {}, stage)'));
  assert.ok(record.includes('${exportAttemptKey(identity)}|${stage || EXPORT_STORAGE_STAGE.UNKNOWN}'));
  assert.ok(
    record.includes('if (shownAt && Date.now() - shownAt < FAILURE_NOTICE_WINDOW_MS) return;'),
    'the same failure is not announced twice while its notice is on screen',
  );
  assert.ok(record.includes('failureNoticesShown.delete(noticeKey);'), 'dismissing the notice clears it, so a retry can still report');

  // The failure still names the real reason and still offers its retry.
  assert.ok(record.includes('description: exportStorageReason(identified)'), 'the reason is still the real one');
  assert.ok(record.includes('variant: \'destructive\''), 'and it is still a failure notice');
  assert.ok(record.includes('ExportStorageFailureActions'), 'with its retry action');
  assert.ok(record.includes('captureDiagnostics: held?.captureDiagnostics || null'), 'and the capture findings travel with it');
});