/**
 * Sound Proof — the ADI SAFE-RETRY path, and the developer panel's visibility.
 *
 * What is proved here:
 *   - the first candidate that breaks the meaning-conservation rule is refused
 *     exactly as it always was: the rule is not loosened, and nothing is written;
 *   - the EXACT violations it was refused for are fed straight back to the pass,
 *     with the copy they were read against, so ADI repairs its own wording;
 *   - the corrected candidate is read by the SAME two gates, in the same order, and
 *     accepted only when it passes them on merit;
 *   - a correction that fails too leaves the original copy standing, with the one
 *     plain refusal line and nothing written;
 *   - two candidates, and no more: there is no further loop;
 *   - the developer diagnostic panel renders in ENGINEERING MODE alone, so normal
 *     use — a master admin included — is left clean.
 *
 * The provider is scripted; the pass, the conservation gate, the prompt builder and
 * the proposal section surface are the real ones.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  ADI_MAX_CANDIDATES,
  ADI_WORDING_OUTCOME,
  runAdiWordingPass,
} from '../base44/shared/adiEditorial/adiWordingPass.js';
import {
  ADI_SECTION_MODE,
  improveProposalSectionWording,
} from '../base44/shared/adiEditorial/proposalSectionWordingEditorial.js';
import { ADI_REJECTION_STAGE } from '../base44/shared/adiEditorial/adiRejectionDiagnostics.js';
import { ADI_KEPT_ORIGINAL_MESSAGE } from '../base44/shared/adiEditorial/adiEditorialStandard.js';

const NOW = '2026-10-18T16:08:00.000Z';

/** The live copy, the live refusal, and the correction that repairs it. */
const LIVE_ORIGINAL = 'The contrast between a quiet exchange and a sudden musical or effects peak is central to this cinema\u2019s intent.';
const LIVE_INVENTED_REASON = 'This cinema is designed to convey the contrast between quiet dialogue and sudden musical or effects peaks.';
const LIVE_CORRECTED = 'The contrast between quiet dialogue and sudden musical or effects peaks is central to this cinema.';

/** A provider that answers from a script, one answer per call, recording the prompts. */
function scriptedProvider(...answers) {
  const prompts = [];
  const invokeLLM = async ({ prompt }) => {
    prompts.push(prompt);
    return answers.length > 0 ? answers.shift() : undefined;
  };
  return { invokeLLM, prompts };
}

/** One pass over the live copy, with the provider answering from a script. */
async function livePass(...answers) {
  const provider = scriptedProvider(...answers);
  const pass = await runAdiWordingPass({
    invokeLLM: provider.invokeLLM,
    prompt: 'editorial prompt',
    original: LIVE_ORIGINAL,
    mode: 'section',
  });
  return { pass, provider };
}

describe('the one correction attempt', () => {
  it('refuses the invented reason, feeds the exact violation back, and accepts the correction', async () => {
    const { pass, provider } = await livePass(LIVE_INVENTED_REASON, LIVE_CORRECTED);

    // The first candidate, and the one correction it is allowed: two calls, no more.
    expect(ADI_MAX_CANDIDATES).toBe(2);
    expect(provider.prompts).toHaveLength(2);

    // The correction prompt carries the violation that was actually reported, the
    // copy it was read from, and the copy that was refused.
    const correction = provider.prompts[1];
    expect(correction).toContain('a_reason_was_invented');
    expect(correction).toContain('designed to');
    expect(correction).toContain(LIVE_INVENTED_REASON);
    expect(correction).toContain(LIVE_ORIGINAL);
    expect(correction).toContain('Correct only the listed validation violations. Preserve the intended editorial improvements. Do not restore weak wording unnecessarily.');

    // The corrected candidate passes both gates, so it is what the designer gets.
    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
    expect(pass.text).toBe(LIVE_CORRECTED);
    expect(pass.attempts).toBe(2);
    expect(pass.corrected).toBe(true);
    expect(pass.kept_original).toBe(false);
    expect(pass.diagnostics).toBeUndefined();
  });

  it('keeps the original copy, and reports the refusal, when the correction fails too', async () => {
    const { pass, provider } = await livePass(LIVE_INVENTED_REASON, LIVE_INVENTED_REASON);

    expect(provider.prompts).toHaveLength(2);
    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(pass.text).toBeNull();
    expect(pass.kept_original).toBe(true);
    expect(pass.attempts).toBe(2);
    expect(pass.violations[0].code).toBe('a_reason_was_invented');
    expect(pass.diagnostics.rejectionStage).toBe(ADI_REJECTION_STAGE.MEANING_CONSERVATION);
    expect(pass.diagnostics.proposedText).toBe(LIVE_INVENTED_REASON);

    // The one line the designer reads, and nothing else.
    expect(ADI_KEPT_ORIGINAL_MESSAGE)
      .toBe('ADI kept the original wording because the revised version changed the supported meaning.');
  });

  it('never asks for a third candidate, whatever the provider is willing to give', async () => {
    const { pass, provider } = await livePass(LIVE_INVENTED_REASON, LIVE_INVENTED_REASON, LIVE_CORRECTED);

    expect(provider.prompts).toHaveLength(ADI_MAX_CANDIDATES);
    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
  });

  it('does not retry a provider that returns nothing at all', async () => {
    const { pass, provider } = await livePass('   ');

    expect(provider.prompts).toHaveLength(1);
    expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.PROVIDER_FAILED);
  });

  it('reads the corrected candidate through the same gates, with no rule relaxed', async () => {
    const cases = [
      {
        name: 'a figure',
        original: 'The predicted low-frequency response extends to 22 Hz across the primary seats.',
        first: 'The predicted low-frequency response extends to 20 Hz across the primary seats.',
        corrected: 'The predicted low-frequency response extends to 18 Hz across the primary seats.',
        code: 'a_number_was_added',
      },
      {
        name: 'an RP22 level',
        original: 'The room reaches Performance Level 4 for P19.',
        first: 'The room reaches Performance Level 3 for P19.',
        corrected: 'The room reaches Performance Level 2 for P19.',
        code: 'a_performance_level_was_added',
      },
      {
        name: 'equipment',
        original: 'Q6-3 screen speakers carry the front stage.',
        first: 'Q8-5 screen speakers carry the front stage.',
        corrected: 'Q10 screen speakers carry the front stage.',
        code: 'equipment_was_added',
      },
    ];

    for (const entry of cases) {
      const provider = scriptedProvider(entry.first, entry.corrected);
      const pass = await runAdiWordingPass({
        invokeLLM: provider.invokeLLM,
        prompt: 'editorial prompt',
        original: entry.original,
        mode: 'section',
      });

      // The correction is refused for the same rule the first candidate broke.
      expect(pass.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
      expect(pass.text).toBeNull();
      expect(pass.violations.map((violation) => violation.code)).toContain(entry.code);
    }
  });
});

/** A proposal section world: a read sees what the last write left. */
function sectionWorld(body) {
  let current = {
    id: 'sec_1',
    proposal_id: 'prop_1',
    section_type: 'dynamic_range',
    title: 'Dynamic Range',
    body,
    last_gpt_generated_at: '2026-10-18T15:07:17.288Z',
    last_user_edited_at: null,
    metadata: null,
  };
  const writes = [];
  const entities = {
    Proposal: { filter: async () => [{ id: 'prop_1', proposal_type: 'single', title: 'Barton' }] },
    ProposalSection: {
      filter: async () => [{ ...current }],
      update: async (id, patch) => {
        writes.push({ id, patch });
        current = { ...current, ...patch };
        return current;
      },
    },
  };
  return { entities, writes, stored: () => current };
}

/** One whole-section editorial action, with the provider answering from a script. */
async function sectionAction(world, ...answers) {
  const provider = scriptedProvider(...answers);
  const result = await improveProposalSectionWording({
    entities: world.entities,
    invokeLLM: provider.invokeLLM,
    proposalId: 'prop_1',
    sectionId: 'sec_1',
    user: { full_name: 'Paul Cummin' },
    now: NOW,
    mode: ADI_SECTION_MODE.SECTION,
  });
  return { result, provider };
}

describe('the designer sees one outcome, after at most two candidates', () => {
  it('applies the corrected copy in one write, with its Undo record, and no refusal notice', async () => {
    const world = sectionWorld(LIVE_ORIGINAL);
    const { result, provider } = await sectionAction(world, LIVE_INVENTED_REASON, LIVE_CORRECTED);

    expect(provider.prompts).toHaveLength(2);
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
    expect(result.improved_text).toBe(LIVE_CORRECTED);
    expect(result.diagnostics).toBeNull();

    expect(world.writes).toHaveLength(1);
    expect(world.stored().body).toBe(LIVE_CORRECTED);
    expect(world.stored().metadata.adi_editorial.previous_body).toBe(LIVE_ORIGINAL);
  });

  it('writes nothing and keeps the original wording when both candidates are refused', async () => {
    const world = sectionWorld(LIVE_ORIGINAL);
    const { result, provider } = await sectionAction(world, LIVE_INVENTED_REASON, LIVE_INVENTED_REASON);

    expect(provider.prompts).toHaveLength(2);
    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(result.kept_original).toBe(true);
    expect(result.improved_text).toBeNull();
    expect(world.writes).toHaveLength(0);
    expect(world.stored().body).toBe(LIVE_ORIGINAL);
  });

  it('offers a correction on a highlighted rewrite too, still without saving it', async () => {
    const selection = 'a sudden musical or effects peak is central to this cinema\u2019s intent.';
    const world = sectionWorld(`<p>${LIVE_ORIGINAL}</p>`);
    const provider = scriptedProvider(
      'a sudden musical or effects peak is designed to be central to this cinema.',
      'a sudden musical or effects peak is central to this cinema.',
    );

    const result = await improveProposalSectionWording({
      entities: world.entities,
      invokeLLM: provider.invokeLLM,
      proposalId: 'prop_1',
      sectionId: 'sec_1',
      user: { full_name: 'Paul Cummin' },
      now: NOW,
      mode: ADI_SECTION_MODE.SELECTION,
      selectionText: selection,
    });

    expect(provider.prompts).toHaveLength(2);
    expect(result.action).toBe('propose');
    expect(result.applied).toBe(false);
    expect(result.improved_text).toBe('a sudden musical or effects peak is central to this cinema.');
    expect(world.writes).toHaveLength(0);
  });
});

describe('the developer diagnostic panel is Engineering Mode only', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const panel = readFileSync(
    join(here, '..', 'src', 'components', 'adi', 'AdiEditorialRejectionDiagnostics.jsx'),
    'utf8',
  );

  it('renders on engineering mode, and never on master-admin status', () => {
    expect(panel).toContain('const mayView = engineeringMode === true;');
    expect(panel).not.toContain('isMasterAdmin');
    expect(panel).not.toContain('useAuth');
  });
});