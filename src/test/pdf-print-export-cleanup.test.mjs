import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ values: [], invoke: vi.fn(), print: vi.fn(), closed: vi.fn() }));
vi.mock('react', () => ({ useState: (value) => {
  const index = state.values.length; state.values.push(value);
  return [value, (next) => { state.values[index] = next; }];
}, useRef: (value) => ({ current: value }), useCallback: (fn) => fn, useEffect: () => {} }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: state.invoke } } }));
vi.mock('@/components/report/reportPdfTitle', () => ({ buildProposalReportTitle: () => 'Fixture' }));
vi.mock('@/components/report/printDocumentTitle', () => ({ applyPrintDocumentTitle() {}, restorePrintDocumentTitle() {} }));
vi.mock('@/components/proposal/export/proposalPrintWindow', () => ({
  openProposalPrintWindow: () => ({}), closeProposalPrintWindow: state.closed,
  findPrintNode: () => ({}), printProposalInWindow: state.print,
}));
vi.mock('@/components/library/issuedDocument/recordIssuedExport', () => ({ recordIssuedExportInBackground() {}, snapshotIssuedComposition() {} }));
vi.mock('@/components/proposal/export/browserProposalFallback', () => ({ prepareBrowserProposalFallback: vi.fn() }));
import { useProposalExport } from '../components/proposal/export/useProposalExport.js';
beforeEach(() => {
  vi.useFakeTimers(); state.values = []; vi.clearAllMocks();
  vi.stubGlobal('window', { localStorage: { getItem: () => null } });
  vi.stubGlobal('document', { body: { classList: { remove() {} } } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const hook = () => useProposalExport({ proposal: { id: 'fixture', status: 'generated' }, sections: [{ body: 'Fixture', is_enabled: true }] });
it('D/E unresolved authorization clears Preparing PDF, closes shell, permits retry, and never prepares print', async () => {
  state.invoke.mockImplementation(() => new Promise(() => {}));
  const flow = hook();
  const result = flow.handleExport();
  expect(state.values[0]).toBe(true);
  await vi.advanceTimersByTimeAsync(15001);
  await result;
  expect(state.values[0]).toBe(false);
  expect(state.values[1]).toBe(false);
  expect(state.values[4]).toBe(true);
  expect(state.values[2]).toMatch(/Authorization took too long/);
  expect(state.values[5].blockingStage).toBe('edit_layer');
  expect(state.closed).toHaveBeenCalled();
  expect(state.print).not.toHaveBeenCalled();
});
it('D rejected authorization also clears Preparing PDF without printing', async () => {
  state.invoke.mockRejectedValue(new Error('Fixture denial'));
  const result = hook().handleExport();
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(state.values[0]).toBe(false);
  expect(state.values[4]).toBe(true);
  expect(state.values[5].conditionNotMet).toBe('authorization_failed');
  expect(state.print).not.toHaveBeenCalled();
});
it('D layout failure clears Preparing PDF and preserves retryable technical details', async () => {
  state.invoke.mockResolvedValue({ data: { layer: { document_validation: { valid: true } } } });
  state.print.mockResolvedValue({ printed: false, reason: 'print_layout_unstable', message: 'Retry Export',
    diagnostics: { kind: 'print_readiness', blockingStage: 'layout_stability', conditionNotMet: 'animation_frame_deadline_exceeded' } });
  const result = hook().handleExport();
  await vi.advanceTimersByTimeAsync(20);
  await result;
  expect(state.values[0]).toBe(false);
  expect(state.values[4]).toBe(true);
  expect(state.values[5].conditionNotMet).toBe('animation_frame_deadline_exceeded');
  expect(state.closed).toHaveBeenCalled();
});