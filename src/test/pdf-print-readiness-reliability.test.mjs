import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { waitForLayoutStable } from '../components/report/printReadiness/resourceReadiness.js';
import { preparePrintDocument } from '../components/report/printReadiness/index.js';
import { authorizePrint } from '../components/proposal/export/printAuthorization.js';
import { createExportDiagnostics } from '../components/proposal/export/proposalExportDiagnostics.js';
import { printFailureDiagnostics } from '../components/proposal/export/printFailureDiagnostics.js';
import { printReportInWindow } from '../components/report/reportPrintWindow.js';

const budgets = { stylesheets: 30, fonts: 30, images: 30, layout: 30, poll: 1 };
function fixture({ suspended = false, changing = false, mutating = false } = {}) {
  let tick = 0;
  let notify;
  const disconnect = vi.fn();
  const pages = [{ index: 1 }, { index: 2 }];
  const root = {
    scrollHeight: 1123, scrollWidth: 794,
    querySelectorAll: (selector) => selector === '.pp-page, .pp-cover' ? pages : [],
    getBoundingClientRect: () => ({ width: 794, height: changing ? 1123 + tick++ : 1123 }),
  };
  const win = {
    requestAnimationFrame: suspended ? () => {} : (callback) => setTimeout(() => { if (mutating) notify?.(); callback(); }, 1),
    MutationObserver: class { constructor(fn) { notify = fn; } observe() {} disconnect() { disconnect(); } },
    print: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(),
  };
  const doc = {
    body: root, defaultView: win,
    querySelectorAll: () => [],
    fonts: { ready: Promise.resolve(), forEach() {} },
    open() {}, write() {}, close() {},
  };
  win.document = doc;
  return { root, win, doc, pages, disconnect };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('PDF print readiness reliability', () => {
  it('A/F normal document settles without changing existing pages or geometry', async () => {
    const f = fixture();
    const before = f.pages.slice();
    const detail = {};
    expect(await waitForLayoutStable(f.root, f.win, { budgetMs: 100, diagnostics: detail })).toBe(true);
    expect(detail.measurementsAttempted).toBe(3);
    expect(detail.stableFrames).toBe(2);
    expect(f.pages).toEqual(before);
    expect(f.root.getBoundingClientRect()).toEqual({ width: 794, height: 1123 });
    expect(f.disconnect).toHaveBeenCalledOnce();
  });
  it('B suspended animation frame respects remaining layout deadline', async () => {
    vi.useFakeTimers();
    const f = fixture({ suspended: true });
    const detail = {};
    const result = waitForLayoutStable(f.root, f.win, { budgetMs: 40, diagnostics: detail });
    await vi.advanceTimersByTimeAsync(41);
    expect(await result).toBe(false);
    expect(detail.conditionNotMet).toBe('animation_frame_deadline_exceeded');
    expect(detail.measurementsAttempted).toBe(1);
    expect(f.disconnect).toHaveBeenCalledOnce();
  });
  it('captures changing dimensions and safe resource/stage diagnostics', async () => {
    const f = fixture({ changing: true });
    const trace = createExportDiagnostics();
    trace.start('attempt');
    const result = await preparePrintDocument({ doc: f.doc, budgets, trace });
    expect(result.ready).toBe(false);
    const detail = printFailureDiagnostics({ readinessDiagnostics: result.diagnostics }, trace.snapshot());
    expect(detail.blockingStage).toBe('layout_stability');
    expect(detail.lastCompletedStage).toBe('background_images');
    expect(detail.lastTwoDimensions).toHaveLength(2);
    expect(detail.dimensionsChanged).toBe(true);
    expect(detail.pageCount).toBe(2);
    expect(detail.fontReadiness).toBe('ready');
    expect(detail.imageReadiness).toBe('loaded_and_decoded');
    expect(detail.conditionNotMet).toBe('layout_dimensions_still_changing');
    expect(detail.totalPreparationMs).toBeGreaterThanOrEqual(25);
    expect(JSON.stringify(detail)).not.toMatch(/textContent|innerHTML|file_url|client_name/);
  });
  it('DOM mutations block readiness even with unchanged dimensions', async () => {
    const f = fixture({ mutating: true });
    const detail = {};
    expect(await waitForLayoutStable(f.root, f.win, { budgetMs: 25, diagnostics: detail })).toBe(false);
    expect(detail.domStillChanging).toBe(true);
    expect(detail.dimensionsChanged).toBe(false);
    expect(detail.conditionNotMet).toBe('print_dom_still_mutating');
  });
  it('C authorization timeout rejects safely; late authorization cannot resume print', async () => {
    vi.useFakeTimers();
    let resolve;
    const print = vi.fn();
    const invoke = vi.fn(() => new Promise((done) => { resolve = done; }));
    const result = authorizePrint(invoke, {}, 35).then(print, (error) => error);
    await vi.advanceTimersByTimeAsync(36);
    const error = await result;
    expect(error.printNotReady).toBe(true);
    expect(error.exportBlockedBy).toBe('edit_layer');
    expect(error.readinessDiagnostics.conditionNotMet).toBe('authorization_deadline_exceeded');
    resolve({ data: { layer: { document_validation: { valid: true } } } });
    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
  });
  it('E preparation failure never invokes the print dialog or compositor', async () => {
    vi.useFakeTimers();
    const f = fixture({ suspended: true });
    const composition = vi.fn();
    const result = printReportInWindow(f.win, { title: 'Fixture', node: { outerHTML: '<div></div>' }, prepareComposition: composition });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await result).printed).toBe(false);
    expect(f.win.print).not.toHaveBeenCalled();
    expect(composition).not.toHaveBeenCalled();
  });
  it('stable print retains existing composition callback and opens print once', async () => {
    const f = fixture();
    const composition = vi.fn();
    const result = await printReportInWindow(f.win, { title: 'Fixture', node: { outerHTML: '<div></div>' }, prepareComposition: composition });
    expect(result.printed).toBe(true);
    expect(composition).toHaveBeenCalledExactlyOnceWith(f.doc);
    expect(f.win.print).toHaveBeenCalledOnce();
  });
});