/**
 * ADI suggestion loading recovery.
 * ---------------------------------
 * The Client Brief examples are optional assistance, so the suggestion area must
 * never sit in a loading state indefinitely. This suite covers the bounded wait
 * itself (settled, failed, timed out, late response, retry) and guards the
 * component contract that keeps the fallback honest and the wizard usable.
 *
 * The examples themselves no longer come from the request: they are built
 * synchronously from the frozen evidence, so the bounded wait can only ever ADD
 * to what is on screen. That behaviour is covered by
 * src/test/adi-suggestion-availability.test.mjs; here the wait is judged on its
 * own, as an optional refinement.
 *
 * Pure: no React render, no SDK, no database. The component contract is read
 * from source, in the same style as the other source-authority suites.
 *
 * Run: npx vitest run src/test/adi-suggestion-timeout.test.mjs
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SUGGESTION_TIMEOUT_MS,
  settleWithin,
} from '../components/proposal/wizard/suggestionRequestBounding.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const CHIPS = source('../components/proposal/wizard/AdiSuggestionChips.jsx');
const BRIEF_STEP = source('../components/proposal/wizard/ClientBriefStep.jsx');
const WIZARD = source('../components/proposal/CreateProposalWizard.jsx');

/** The timeout branch of load(), as it stands in the component. */
const timeoutBranch = () => CHIPS.slice(
  CHIPS.indexOf("if (result.status === 'timeout')"),
  CHIPS.indexOf("if (result.status === 'failed')"),
);

afterEach(() => {
  vi.useRealTimers();
});

describe('the bounded suggestion request', () => {
  test('A — a settled response is delivered as it is', async () => {
    const response = { data: { suggestions: [{ label: 'Explain the 9.1.6 system layout' }] } };
    const result = await settleWithin(Promise.resolve(response));

    expect(result.status).toBe('settled');
    expect(result.response).toBe(response);
    expect(result.error).toBeUndefined();
  });

  test('B — a failed request is reported as failed, never left waiting', async () => {
    const error = new Error('Suggestion generation failed');
    const result = await settleWithin(Promise.reject(error));

    expect(result.status).toBe('failed');
    expect(result.error).toBe(error);
    expect(result.response).toBeUndefined();
  });

  test('B — a request that throws before returning a promise is still reported', async () => {
    const result = await settleWithin(Promise.resolve().then(() => {
      throw new Error('synchronous failure');
    }));

    expect(result.status).toBe('failed');
    expect(result.error.message).toBe('synchronous failure');
  });

  test('C — a request that has not settled is bounded at 30 seconds', async () => {
    vi.useFakeTimers();
    expect(SUGGESTION_TIMEOUT_MS).toBe(30000);

    let status = null;
    const neverSettles = new Promise(() => {});
    settleWithin(neverSettles).then((result) => { status = result.status; });

    await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS - 1000);
    expect(status).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    expect(status).toBe('timeout');
  });

  test('D — a response arriving after the wait is discarded', async () => {
    vi.useFakeTimers();

    let resolveLate = null;
    const late = new Promise((resolve) => { resolveLate = resolve; });
    let settlements = 0;
    let result = null;
    settleWithin(late).then((settled) => { settlements += 1; result = settled; });

    await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS);
    expect(result.status).toBe('timeout');

    // The backend request finally returns well after the fallback was shown.
    resolveLate({ data: { suggestions: [{ label: 'A late suggestion' }] } });
    await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS);

    expect(settlements).toBe(1);
    expect(result.status).toBe('timeout');
    expect(result.response).toBeUndefined();
  });

  test('F — a retry after a timeout runs a fresh, bounded wait', async () => {
    vi.useFakeTimers();

    const first = settleWithin(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(SUGGESTION_TIMEOUT_MS);
    expect((await first).status).toBe('timeout');

    const retried = settleWithin(Promise.resolve({ data: { suggestions: [{ label: 'Recovered' }] } }));
    await vi.advanceTimersByTimeAsync(0);
    const result = await retried;

    expect(result.status).toBe('settled');
    expect(result.response.data.suggestions[0].label).toBe('Recovered');
  });
});

describe('the suggestion area can never sit in a loading state', () => {
  test('the request is bounded by the shared 30-second wait', () => {
    expect(CHIPS).toContain('settleWithin(');
    expect(CHIPS).toContain('SUGGESTION_TIMEOUT_MS');
    expect(CHIPS).not.toContain('await base44.functions.invoke');
  });

  test('a timeout leaves the examples on screen and offers a Retry', () => {
    const branch = timeoutBranch();
    expect(branch).not.toBe('');
    // The timeout branch records how the refinement ended and clears the flag.
    // It cannot touch an example, so the examples stay exactly as they are.
    expect(branch).toContain("setRefinement('timedOut')");
    expect(branch).toContain('setRefining(false)');
    expect(branch).not.toContain('setRefined(');
    expect(branch).not.toContain('setSelected(');
    // The examples come from the synchronous build, not from the request.
    expect(CHIPS).toContain('buildEvidenceSuggestions(');
    expect(CHIPS).toContain('evidence.evidenceBacked');
    expect(CHIPS).toContain('generalChips.map');
    // The status note is shown verbatim, and the retry is offered beside it.
    expect(CHIPS).toContain('TIMEOUT_NOTE');
    expect(CHIPS).toMatch(/onClick=\{load\}[\s\S]{0,240}Retry/);
  });

  test('a timeout never retries by itself and never re-requests', () => {
    const branch = timeoutBranch();
    expect(branch).not.toContain('load(');
    expect(branch).not.toContain('invoke(');
    expect(branch).not.toContain('setInterval');
    expect(CHIPS).not.toContain('setInterval');
  });

  test('E — every write after the wait is gated on the request that made it', () => {
    // ONE identity gate, after the await and before any state is written: a request
    // superseded by a version change, or by leaving the step, changes nothing.
    const gates = CHIPS.split('if (requestRef.current !== token) return;').length - 1;
    expect(gates).toBe(1);
    const afterAwait = CHIPS.slice(CHIPS.indexOf('const result = await settleWithin('));
    expect(afterAwait.indexOf('if (requestRef.current !== token) return;'))
      .toBeLessThan(afterAwait.indexOf('setRefined('));
    expect(afterAwait.indexOf('if (requestRef.current !== token) return;'))
      .toBeLessThan(afterAwait.indexOf('setRefinement('));
  });

  test('a late response after the fallback is discarded structurally', () => {
    // The bounding promise has already settled, so the component only ever reads
    // the single result object it awaited: there is no second response path.
    expect(CHIPS).toContain('const result = await settleWithin(');
    expect(CHIPS.split('await settleWithin(').length - 1).toBe(1);
  });

  test('leaving the step abandons whatever is in flight', () => {
    expect(CHIPS).toContain('requestRef.current += 1;');
    expect(CHIPS).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]{0,120}requestRef\.current \+= 1;/);
  });

  test('the refinement is not requested again by the effect that starts it', () => {
    // The effect runs once per evidence identity, and load() depends only on
    // whether results exist and reads its payload from refs: nothing the effect
    // or the request sets can re-trigger either of them.
    expect(CHIPS).toContain('}, [hasResults]);');
    const deps = '}, [evidenceKey, hasResults, load]);';
    expect(CHIPS).toContain(deps);
    const loadEffect = CHIPS.slice(
      CHIPS.indexOf('useEffect(() => {\n    requestRef.current += 1;'),
      CHIPS.indexOf(deps) + deps.length,
    );
    expect(loadEffect).toContain('load();');
    expect(loadEffect).not.toContain('timedOut');
    expect(loadEffect).not.toContain('refined');
  });
});

describe('the wizard is unaffected by suggestion loading', () => {
  test('H — Next is never gated on the suggestion area', () => {
    expect(WIZARD).toContain('true, // step 3 — client brief is optional');
    expect(WIZARD).toContain('disabled={!canProceed[step]}');
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*suggestion/i);
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*clarification/i);
    expect(WIZARD).not.toMatch(/disabled=\{[^}]*snapshotLoading/);
  });

  test('G — the brief is held by the wizard and never written by a suggestion', () => {
    expect(WIZARD).toContain('const [clientBrief, setClientBrief] = useState');
    expect(WIZARD).toContain('value={clientBrief}');
    expect(BRIEF_STEP).toContain("value={value || ''}");
    // The chips hand prompts over only when the designer confirms them.
    expect(BRIEF_STEP).toContain('onAddSelected={handleAddSelected}');
    expect(CHIPS).toContain('onAddSelected?.(selected)');
    expect(CHIPS).not.toContain('onChange(');
  });

  test('the examples are never hidden behind a loading state', () => {
    // A version read may still be in flight, and it no longer matters: the general
    // examples are on screen, and the project-specific ones replace them the
    // instant the frozen evidence is readable. Nothing is ever blank or blocking.
    expect(CHIPS).not.toContain('const busy =');
    expect(CHIPS).not.toContain('setLoading');
    expect(CHIPS).not.toMatch(/animate-spin/);
    expect(CHIPS).toMatch(/<div className="flex flex-wrap gap-2">\{chips\.map\(renderChip\)\}/);
    // The evidence read is logged as a measured wait, not shown as a loading line.
    expect(CHIPS).toContain('frozen evidence readable after');
  });
});