/**
 * Sound Proof — the ADI editorial action on wording.
 *
 * What is proved here:
 *   - ONE shared action serves both surfaces. The Project Report's Design Intent and
 *     the proposal narrative sections run the same editorial pass, the same meaning
 *     gate and the same splice gate, and neither surface owns an implementation of
 *     its own;
 *   - the wording the designer reads is the stored wording, and nothing is written
 *     when ADI leaves the copy as it is: an unchanged rewrite does not churn an
 *     approval;
 *   - the meaning gate refuses every rewrite that changes a figure, drops a
 *     material limitation, invents a reason or adds a Performance Level, and the
 *     original copy stands with the existing approval untouched;
 *   - a highlighted rewrite is saved only when the copy outside the highlight is
 *     byte for byte what it was, and a non-conserved splice is refused before it
 *     comes near the record: no partial write, on either surface;
 *   - a change ADI did make returns the section to Needs review — the same
 *     consequence a regeneration has — and Undo restores the exact prior state,
 *     wording, both stamps and the approval identity, so the approval counts again;
 *   - the report narrative keeps its own generation identity while the wording is
 *     improved, and the editorial action is recorded beside it rather than
 *     replacing it.
 *
 * The provider and the stores are stubbed, the narrative surface's validator is
 * injected (the writer contract's own rules are exercised by the generation suites);
 * the authority under test is the real one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  improveProposalSectionWording,
  ADI_SECTION_ACTION,
  ADI_SECTION_MODE,
  ADI_SECTION_BLOCK,
} from '../base44/shared/adiEditorial/proposalSectionWordingEditorial.js';
import {
  improveReportDesignIntentWording,
  ADI_INTENT_BLOCK,
} from '../base44/shared/reportDesignIntent/improveReportDesignIntentWording.js';
import { ADI_WORDING_OUTCOME } from '../base44/shared/adiEditorial/adiWordingPass.js';
import { DESIGN_INTENT_SECTION } from '../base44/shared/reportDesignIntent/designIntentBrief.js';
import {
  ADI_CONSERVATION_REJECTION,
  checkWordingConservation,
} from '../base44/shared/adiEditorial/adiWordingConservation.js';
import {
  ADI_IMPROVE_LABEL,
  ADI_IMPROVE_SELECTION_LABEL,
  ADI_UNDO_LABEL,
  ADI_IMPROVED_MESSAGE,
} from '../base44/shared/adiEditorial/adiEditorialStandard.js';
import {
  APPROVAL_STATUS,
  approvalRowForSection,
  approvalStatusByType,
  publishedSectionFingerprint,
  resolveSectionApproval,
  sectionApprovalFingerprint,
} from '../base44/shared/proposalApproval/sectionApprovalAuthority.js';

const GPT_STAMP = '2026-10-18T11:19:21.226Z';
const EDITED_STAMP = null;
const NOW = '2026-10-18T13:05:00.000Z';

/** A rewrite that states the same facts in the same words, reordered. */
const BODY = '<p>The screen channels maintain close level consistency across the primary seats. The arrangement of one front and two rear subwoofers extends the predicted low-frequency response to 22 Hz. The rear row sits closer to the side walls, which limits the evenness of the surround coverage.</p>';
const BODY_REWORDED = '<p>Across the primary seats, the screen channels maintain close level consistency. With one front and two rear subwoofers, the predicted low-frequency response extends to 22 Hz. The rear row sits closer to the side walls, which limits the evenness of the surround coverage.</p>';
const BODY_NUMBER_WORDS = '<p>The screen channels maintain close level consistency across the primary seats. The arrangement of 1 front and 2 rear subwoofers extends the predicted low-frequency response to 22 Hz. The rear row sits closer to the side walls, which limits the evenness of the surround coverage.</p>';

const SELECTION = 'The screen channels maintain close level consistency across the primary seats.';
const SELECTION_IMPROVED = 'Across the primary seats, the screen channels maintain close level consistency.';

/** An approved section, on the real fingerprint of the real authority. */
function approvedSection({ body = BODY } = {}) {
  return {
    id: 'sec_1',
    proposal_id: 'prop_1',
    section_type: 'spatial_resolution',
    title: 'Spatial Resolution',
    is_enabled: true,
    body,
    last_gpt_generated_at: GPT_STAMP,
    last_user_edited_at: EDITED_STAMP,
    metadata: {
      approval: {
        status: 'approved',
        approved_at: '2026-10-18T11:20:55.006Z',
        approved_by: 'Paul Cummin',
        fingerprint: sectionApprovalFingerprint({
          publishedBody: body,
          storedBody: body,
          lastUserEditedAt: EDITED_STAMP,
          lastGptGeneratedAt: GPT_STAMP,
        }),
        revision_id: 'gen_5738fda9',
        generation_id: 'gen_5738fda9',
        edit_id: null,
        published_page_fingerprint: publishedSectionFingerprint(body),
      },
    },
  };
}

/**
 * A stateful proposal store: a read sees what the last write left, exactly as the
 * database would, so improve → undo can be exercised end to end.
 */
function proposalWorld({ body = BODY } = {}) {
  let current = approvedSection({ body });
  const writes = [];
  const prompts = [];
  const proposal = { id: 'prop_1', proposal_type: 'system_summary', title: 'Barton Solutions' };
  const entities = {
    Proposal: { filter: async () => [proposal] },
    ProposalSection: {
      filter: async () => [{ ...current }],
      update: async (id, patch) => {
        writes.push({ id, patch });
        current = { ...current, ...patch };
        return current;
      },
    },
  };
  const invokeLLM = async ({ prompt }) => {
    prompts.push(prompt);
    return undefined;
  };
  return { entities, invokeLLM, writes, prompts, proposal, currentSection: () => current, stored: () => current };
}

/** The approval state the editor renders, resolved from the stored section. */
function approvalOf(section) {
  const approval = resolveSectionApproval({
    sections: [section],
    publishedSections: [{
      id: section.id,
      section_type: section.section_type,
      title: section.title,
      body: section.body,
      is_enabled: section.is_enabled,
    }],
  });
  return {
    approval,
    row: approvalRowForSection(approval, section.id),
    byType: approvalStatusByType(approval),
  };
}

/** One editorial action on the proposal surface, with the provider answering. */
async function sectionAction(world, { answer, ...input }) {
  const invokeLLM = async () => answer;
  return improveProposalSectionWording({
    entities: world.entities,
    invokeLLM,
    proposalId: world.proposal.id,
    sectionId: 'sec_1',
    user: { full_name: 'Paul Cummin' },
    now: NOW,
    ...input,
  });
}

const REPORT_NARRATIVE = 'This dedicated cinema is designed around a 120" 2.35:1 projection screen, with 8 seats in 2 rows. The screen and seating give the room its cinematic picture scale.';
const REPORT_NARRATIVE_REWORDED = 'The screen and seating give the room its cinematic picture scale, with this dedicated cinema designed around a 120" 2.35:1 projection screen and 8 seats in 2 rows.';

/** A saved Design Intent with its own generation identity, as the report stores it. */
function savedDesignIntent({ text = REPORT_NARRATIVE } = {}) {
  return {
    status: 'accepted',
    text,
    evidence_fingerprints: {
      engineeringFingerprint: 'eng:v1:447ffe3a1ffa73bc',
      calculationFingerprint: 'cal:v8:6de0b1fb43bb2e89',
      seatPriorityFingerprint: null,
    },
    evidence_pack_fingerprint: 'b0126e47',
    input_fingerprint: 'input_9a12',
    provider: 'base44-ai-gateway',
    model: 'gpt_6_astra',
    prompt_version: 'design-intent-v3',
    contract_version: 4,
    validator_fingerprint: 'val_77',
    duration_ms: 12257,
    generated_at: '2026-10-18T12:42:23.840Z',
    generated_by: 'Paul Cummin',
    rejection: null,
  };
}

/**
 * A report world: the frozen evidence path is stubbed (it is exercised in full by
 * the generation suites), the snapshot store is real enough to hold what is written.
 */
function reportWorld({ saved = savedDesignIntent(), enabled = true } = {}) {
  const writes = [];
  const attempts = [];
  const payload = { design_intent: saved };
  const snapshot = { id: 'snap_1', project_id: 'proj_1', version_id: 'ver_1', payload };
  let current = snapshot;
  const entities = {
    ReportSnapshot: {
      filter: async () => [{ ...current }],
      update: async (id, patch) => {
        writes.push({ id, patch });
        current = { ...current, ...patch };
        return current;
      },
    },
  };
  const buildAttempt = async (input) => {
    attempts.push(input);
    if (input.prepareOnly !== true) throw new Error('the editorial action must read the evidence in prepare-only mode');
    return {
      ok: true,
      snapshot: { ...current, payload: { ...current.payload } },
      flag: { enabled, model: null },
      project: { name: 'Barton', client_name: 'Barton Solutions' },
      version: { version_name: 'Current Design' },
      writerInput: {
        section_requirements: [{ section: DESIGN_INTENT_SECTION, title: 'Decision Summary' }],
      },
    };
  };
  return { entities, writes, attempts, buildAttempt, currentSnapshot: () => current };
}

/** A permissive surface validator, injected so the narrative surface's editorial
 *  wiring is read on its own: the writer contract's own rules are exercised by the
 *  generation suites. It is deliberately synchronous — the surface hands the
 *  injected validator the drafted copy and reads its verdict on the spot, exactly as
 *  it does with the writer's own validator. */
const permissive = () => ({ valid: true, violations: [] });

async function reportAction(world, { answer, validate = permissive, ...input }) {
  return improveReportDesignIntentWording({
    entities: world.entities,
    invokeLLM: async () => answer,
    projectId: 'proj_1',
    versionId: 'ver_1',
    buildAttempt: world.buildAttempt,
    validate,
    user: { full_name: 'Paul Cummins' },
    now: NOW,
    ...input,
  });
}

/** Every rejection the meaning gate reported for one rewrite of the same body. */
async function sectionRewrite(improved) {
  const world = proposalWorld();
  const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: improved });
  return { result, world };
}

describe('one shared editorial action, on both surfaces', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const shared = join(here, '..', 'base44', 'shared');

  /** Every file under base44/shared that defines a function by this name. */
  const definers = (name) => {
    const pattern = new RegExp(`export (?:async )?function ${name}\\(`);
    const found = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.js$/.test(path) && pattern.test(readFileSync(path, 'utf8'))) found.push(path);
      }
    };
    walk(shared);
    return found.map((path) => path.replace(/\\/g, '/').split('/base44/')[1]);
  };

  it('defines the editorial pass once, and imports it on both surfaces', () => {
    expect(definers('runAdiWordingPass')).toEqual(['shared/adiEditorial/adiWordingPass.js']);
    expect(definers('checkWordingConservation')).toEqual(['shared/adiEditorial/adiWordingConservation.js']);
    expect(definers('checkSelectionSpliceConservation')).toEqual(['shared/adiEditorial/adiWordingConservation.js']);
    expect(definers('improveProposalSectionWording')).toEqual(['shared/adiEditorial/proposalSectionWordingEditorial.js']);
    expect(definers('improveReportDesignIntentWording')).toEqual(['shared/reportDesignIntent/improveReportDesignIntentWording.js']);
  });

  it('runs the same pass, the same prompt builder and the same approval identity on both surfaces', () => {
    const report = readFileSync(join(here, '..', 'base44', 'shared', 'reportDesignIntent', 'improveReportDesignIntentWording.js'), 'utf8');
    const proposal = readFileSync(join(here, '..', 'base44', 'shared', 'adiEditorial', 'proposalSectionWordingEditorial.js'), 'utf8');
    for (const shared_module of ['adiEditorialPrompt.js', 'adiWordingPass.js', 'sectionApprovalAuthority.js']) {
      expect(report).toContain(shared_module);
      expect(proposal).toContain(shared_module);
    }
  });

  it('uses the designer’s own words for the action, and states what happened plainly', () => {
    expect(ADI_IMPROVE_LABEL).toBe('Improve wording with ADI');
    expect(ADI_IMPROVE_SELECTION_LABEL).toBe('Improve with ADI');
    expect(ADI_UNDO_LABEL).toBe('Undo');
    expect(ADI_IMPROVED_MESSAGE).toMatch(/^ADI has improved the wording\./);
  });

  it('declares the complete proposal-section Undo marker in the stored entity schema', () => {
    const schema = JSON.parse(readFileSync('base44/entities/ProposalSection.jsonc', 'utf8'));
    const marker = schema.properties.metadata.properties.adi_editorial.properties;
    for (const field of [
      'previous_body',
      'source_fingerprint',
      'improved_fingerprint',
      'improved_by',
      'improved_at',
    ]) expect(marker).toHaveProperty(field);
  });

  it('gives the provider the narrow no-new-meaning principle verbatim', () => {
    const prompt = readFileSync('base44/shared/adiEditorial/adiEditorialPrompt.js', 'utf8');
    expect(prompt).toContain('Do not make the text more impressive by adding plausible benefits or explanations. If an idea is not already expressed in the source copy, do not introduce it. Better wording may be simpler than the original.');
  });
});

describe('semantic meaning conservation', () => {
  const seatingSource = 'Eight seats are arranged in two rows.';

  it('accepts safe paraphrases without becoming word-for-word strict', () => {
    expect(checkWordingConservation({
      original: seatingSource,
      improved: 'Two rows provide seating for eight.',
    }).ok).toBe(true);
    expect(checkWordingConservation({
      original: seatingSource,
      improved: 'Eight seats are arranged across two rows.',
    }).ok).toBe(true);
  });

  it('accepts deletion and shortening when no protected meaning is removed', () => {
    expect(checkWordingConservation({
      original: 'Eight seats are arranged across two rows in a clear and straightforward layout.',
      improved: 'Eight seats are arranged across two rows.',
    }).ok).toBe(true);
  });

  it('rejects new experiential claims about the view or sightlines', () => {
    for (const improved of [
      'Two rows provide seating for eight, giving every listener an involving view.',
      'Eight seats are arranged across two rows. The arrangement improves sightlines from the rear row.',
    ]) {
      const checked = checkWordingConservation({ original: seatingSource, improved });
      expect(checked.ok).toBe(false);
      expect(checked.violations.map((entry) => entry.code))
        .toContain(ADI_CONSERVATION_REJECTION.NEW_EXPERIENTIAL_CLAIM);
    }
  });

  it('rejects a new room-use claim', () => {
    const checked = checkWordingConservation({
      original: seatingSource,
      improved: 'Eight seats are arranged in two rows. The layout supports shared use of the room.',
    });
    expect(checked.ok).toBe(false);
    expect(checked.violations.map((entry) => entry.code))
      .toContain(ADI_CONSERVATION_REJECTION.NEW_ROOM_USE_CLAIM);
  });

  it('rejects a new bass or design rationale unless the source already expresses it', () => {
    const source = 'One front and two rear subwoofers provide the bass foundation.';
    const added = checkWordingConservation({
      original: source,
      improved: 'One front and two rear subwoofers provide the bass foundation, an established approach to managing room modes.',
    });
    expect(added.ok).toBe(false);
    expect(added.violations.map((entry) => entry.code))
      .toContain(ADI_CONSERVATION_REJECTION.NEW_DESIGN_RATIONALE);

    const supported = checkWordingConservation({
      original: 'One front and two rear subwoofers are arranged to manage room modes and provide the bass foundation.',
      improved: 'The bass foundation comes from one front and two rear subwoofers, an established approach to managing room modes.',
    });
    expect(supported.ok).toBe(true);
  });

  it('keeps the numeric, RP22/RP23 and product protections unchanged', () => {
    const numeric = checkWordingConservation({ original: seatingSource, improved: 'Ten seats are arranged in two rows.' });
    expect(numeric.violations.map((entry) => entry.code)).toContain(ADI_CONSERVATION_REJECTION.ADDED_NUMBER);

    const performance = checkWordingConservation({
      original: 'RP22 P19 reaches Performance Level 4.',
      improved: 'RP23 P20 reaches Performance Level 3.',
    });
    expect(performance.violations.map((entry) => entry.code)).toContain(ADI_CONSERVATION_REJECTION.ADDED_LEVEL);
    expect(performance.violations.map((entry) => entry.code)).toContain(ADI_CONSERVATION_REJECTION.ADDED_PARAMETER);

    const product = checkWordingConservation({
      original: 'Q6-3 screen speakers carry the front stage.',
      improved: 'Q8-5 screen speakers carry the front stage.',
    });
    expect(product.violations.map((entry) => entry.code)).toContain(ADI_CONSERVATION_REJECTION.ADDED_PRODUCT);
  });
});

describe('a whole-section editorial pass', () => {
  it('saves only the wording, moves the generated stamp, and shows the section Needs review', async () => {
    const world = proposalWorld();
    const storedApproval = world.stored().metadata.approval;
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.APPROVED);

    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: BODY_REWORDED });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
    // The readable copy is the same words with the markup taken off.
    expect(result.improved_text).toContain('Across the primary seats');
    expect(result.previous_text).toContain('The screen channels maintain close level consistency');
    expect(result.can_undo).toBe(true);

    // The one write: the improved body, the moved generated stamp, the hand-edit
    // stamp untouched, and the approval itself left exactly where it was.
    expect(world.writes).toHaveLength(1);
    const patch = world.writes[0].patch;
    expect(patch.body).toBe(BODY_REWORDED);
    expect(patch.last_gpt_generated_at).toBe(NOW);
    expect(patch.last_gpt_generated_at).not.toBe(GPT_STAMP);
    expect('last_user_edited_at' in patch).toBe(false);
    expect(patch.metadata.approval).toEqual(storedApproval);
    expect(patch.metadata.adi_editorial).toMatchObject({
      previous_body: BODY,
      previous_last_gpt_generated_at: GPT_STAMP,
      previous_last_user_edited_at: EDITED_STAMP,
      improved_at: NOW,
    });
    expect(patch.metadata.adi_editorial.source_revision).toBe(publishedSectionFingerprint(BODY));
    expect(patch.metadata.adi_editorial.improved_revision).toBe(publishedSectionFingerprint(BODY_REWORDED));
    expect(patch.metadata.adi_editorial.source_fingerprint).toBe(publishedSectionFingerprint(BODY));
    expect(patch.metadata.adi_editorial.improved_fingerprint).toBe(publishedSectionFingerprint(BODY_REWORDED));
    expect(patch.metadata.adi_editorial.improved_by).toBe('Paul Cummin');

    // A normal hydration reads the durable marker, which is exactly the toolbar's
    // Undo condition after an accepted edit.
    const [hydrated] = await world.entities.ProposalSection.filter({ id: 'sec_1' });
    expect(Boolean(hydrated.metadata?.adi_editorial?.previous_body)).toBe(true);

    // The consequence on the surface: the wording no longer matches the approval.
    const after = approvalOf(world.stored());
    expect(after.row.status).toBe(APPROVAL_STATUS.NEEDS_REVIEW);
    expect(after.row.content_changed).toBe(true);
    expect(after.byType.spatial_resolution).toBe(APPROVAL_STATUS.NEEDS_REVIEW);
    expect(after.approval.all_approved).toBe(false);
  });

  it('writes nothing at all when ADI leaves the copy as it is', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: BODY });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.UNCHANGED);
    expect(world.writes).toHaveLength(0);
    // The approval is untouched, because the wording it describes is untouched.
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.APPROVED);
  });

  it('refuses a rewrite that changes a figure, and keeps the original copy', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SECTION,
      answer: BODY_REWORDED.replace('22 Hz', '20 Hz'),
    });

    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(result.reason).toBe(ADI_CONSERVATION_REJECTION.ADDED_NUMBER);
    expect(world.writes).toHaveLength(0);
    expect(world.stored().body).toBe(BODY);
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.APPROVED);
  });

  it('refuses a rewrite that drops a figure', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SECTION,
      answer: '<p>Across the primary seats, the screen channels maintain close level consistency. The rear row sits closer to the side walls, which limits the evenness of the surround coverage.</p>',
    });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect([ADI_CONSERVATION_REJECTION.DROPPED_NUMBER, ADI_CONSERVATION_REJECTION.REMOVED_LIMITATION])
      .toContain(result.reason);
    expect(world.writes).toHaveLength(0);
  });

  it('refuses a rewrite that removes a material limitation', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SECTION,
      answer: '<p>Across the primary seats, the screen channels maintain close level consistency. With one front and two rear subwoofers, the predicted low-frequency response extends to 22 Hz.</p>',
    });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(result.reason).toBe(ADI_CONSERVATION_REJECTION.REMOVED_LIMITATION);
    expect(world.writes).toHaveLength(0);
  });

  it('refuses a rewrite that invents a reason the design never recorded', async () => {
    const world = proposalWorld();
    const withReason = BODY_REWORDED.replace('</p>', ' The seating is set forward to ensure an even surround response.</p>');
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: withReason });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(checkWordingConservation({ original: BODY, improved: withReason }).violations.map((v) => v.code))
      .toContain(ADI_CONSERVATION_REJECTION.INVENTED_REASON);
    expect(world.writes).toHaveLength(0);
  });

  it('refuses a rewrite that adds a Performance Level', async () => {
    const world = proposalWorld();
    const withLevel = BODY_REWORDED.replace('</p>', ' This delivers Performance Level 4 imaging.</p>');
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: withLevel });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    // The added level is caught by name, not only as the extra figure it carries.
    expect(checkWordingConservation({ original: BODY, improved: withLevel }).violations.map((v) => v.code))
      .toContain(ADI_CONSERVATION_REJECTION.ADDED_LEVEL);
    expect(world.writes).toHaveLength(0);
  });

  it('accepts a rewrite that only reorders the same words, and the number words the copy may state either way', async () => {
    const reordered = await sectionRewrite(BODY_REWORDED);
    expect(reordered.result.applied).toBe(true);

    const world = proposalWorld();
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: BODY_NUMBER_WORDS });
    expect(result.applied).toBe(true);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
  });

  it('reports a provider that returns nothing as a failure, and writes nothing', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: '   ' });

    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.PROVIDER_FAILED);
    expect(world.writes).toHaveLength(0);
  });
});

describe('undo restores the exact prior state', () => {
  it('puts the wording, both stamps and the approval identity back, and the approval counts again', async () => {
    const world = proposalWorld();
    const approved = approvalOf(world.stored());
    const originalMetadata = world.stored().metadata;

    await sectionAction(world, { mode: ADI_SECTION_MODE.SECTION, answer: BODY_REWORDED });
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.NEEDS_REVIEW);

    const undone = await sectionAction(world, { action: ADI_SECTION_ACTION.UNDO });

    expect(undone.ok).toBe(true);
    expect(undone.applied).toBe(true);
    expect(undone.can_undo).toBe(false);

    const patch = world.writes[1].patch;
    expect(patch.body).toBe(BODY);
    expect(patch.last_gpt_generated_at).toBe(GPT_STAMP);
    expect(patch.last_user_edited_at).toBe(EDITED_STAMP);
    // No trace of the editorial act is left in the record.
    expect('adi_editorial' in patch.metadata).toBe(false);
    expect(patch.metadata).toEqual(originalMetadata);

    // The stored section is the approved one again, so its approval counts again.
    const restored = approvalOf(world.stored());
    expect(restored.row.status).toBe(APPROVAL_STATUS.APPROVED);
    expect(restored.row.fingerprint).toBe(approved.row.fingerprint);
    expect(restored.approval.all_approved).toBe(true);
  });

  it('refuses to undo when nothing was improved, and writes nothing', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, { action: ADI_SECTION_ACTION.UNDO });

    expect(result.ok).toBe(false);
    expect(result.block.code).toBe(ADI_SECTION_BLOCK.NOTHING_TO_UNDO);
    expect(world.writes).toHaveLength(0);
  });
});

describe('a highlighted rewrite saves only what it can prove', () => {
  it('proposes the improved text without saving it', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SELECTION,
      selectionText: SELECTION,
      answer: SELECTION_IMPROVED,
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.action).toBe('propose');
    expect(result.improved_text).toBe(SELECTION_IMPROVED);
    expect(world.writes).toHaveLength(0);
    expect(world.stored().body).toBe(BODY);
  });

  it('saves the spliced copy when everything outside the highlight is byte for byte unchanged', async () => {
    const world = proposalWorld();
    const spliced = BODY.replace(SELECTION, SELECTION_IMPROVED);

    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SELECTION,
      selectionText: SELECTION,
      improvedSelection: SELECTION_IMPROVED,
      bodyHtml: spliced,
    });

    expect(result.applied).toBe(true);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.IMPROVED);
    expect(world.writes).toHaveLength(1);
    // What is stored is exactly what was on screen, and taking the improved
    // highlight back out rebuilds the original copy character for character.
    expect(world.stored().body).toBe(spliced);
    expect(world.stored().body.replace(SELECTION_IMPROVED, SELECTION)).toBe(BODY);
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.NEEDS_REVIEW);
  });

  it('refuses a splice that changed anything outside the highlight, and writes nothing', async () => {
    const world = proposalWorld();
    const spliced = BODY.replace(SELECTION, SELECTION_IMPROVED).replace('22 Hz', '20 Hz');

    const result = await sectionAction(world, {
      mode: ADI_SECTION_MODE.SELECTION,
      selectionText: SELECTION,
      improvedSelection: SELECTION_IMPROVED,
      bodyHtml: spliced,
    });

    expect(result.ok).toBe(false);
    expect(result.block.code).toBe(ADI_SECTION_BLOCK.SPLICE_NOT_CONSERVED);
    expect(world.writes).toHaveLength(0);
    expect(world.stored().body).toBe(BODY);
    expect(approvalOf(world.stored()).row.status).toBe(APPROVAL_STATUS.APPROVED);
  });

  it('asks for a highlight when none was given', async () => {
    const world = proposalWorld();
    const result = await sectionAction(world, { mode: ADI_SECTION_MODE.SELECTION, answer: SELECTION_IMPROVED });

    expect(result.ok).toBe(false);
    expect(result.block.code).toBe(ADI_SECTION_BLOCK.NOTHING_SELECTED);
    expect(world.writes).toHaveLength(0);
  });
});

describe('the report narrative runs the same action', () => {
  it('reads the frozen evidence in prepare-only mode, and never starts a second generation', async () => {
    const world = reportWorld();
    const result = await reportAction(world, { mode: 'section', answer: REPORT_NARRATIVE_REWORDED });

    expect(result.applied).toBe(true);
    expect(world.attempts).toHaveLength(1);
    expect(world.attempts[0].prepareOnly).toBe(true);
  });

  it('keeps the generation identity and records the editorial act beside it', async () => {
    const world = reportWorld();
    const saved = world.currentSnapshot().payload.design_intent;

    const result = await reportAction(world, { mode: 'section', answer: REPORT_NARRATIVE_REWORDED });
    expect(result.applied).toBe(true);

    expect(world.writes).toHaveLength(1);
    const { payload } = world.writes[0].patch;
    const improved = payload.design_intent;

    expect(improved.text).toBe(REPORT_NARRATIVE_REWORDED);
    // The words were written when they were written: every identity the record
    // carried is still the one it was generated under.
    expect(improved.generated_at).toBe(saved.generated_at);
    expect(improved.generated_by).toBe(saved.generated_by);
    expect(improved.provider).toBe(saved.provider);
    expect(improved.model).toBe(saved.model);
    expect(improved.evidence_fingerprints).toEqual(saved.evidence_fingerprints);
    expect(improved.evidence_pack_fingerprint).toBe(saved.evidence_pack_fingerprint);
    // The editorial act is recorded beside it, on the same revision identity the
    // approval of a section copy is read from.
    expect(improved.editorial.mode).toBe('section');
    expect(improved.editorial.improved_at).toBe(NOW);
    expect(improved.editorial.source_revision).toBe(publishedSectionFingerprint(REPORT_NARRATIVE));
    expect(improved.editorial.improved_revision).toBe(publishedSectionFingerprint(REPORT_NARRATIVE_REWORDED));
    // The copy that was replaced is held whole, ready to be put back.
    expect(payload.design_intent_previous).toEqual(saved);
  });

  it('writes nothing when the narrative is left as it is', async () => {
    const world = reportWorld();
    const saved = world.currentSnapshot().payload.design_intent;

    const result = await reportAction(world, { mode: 'section', answer: REPORT_NARRATIVE });

    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.UNCHANGED);
    expect(world.writes).toHaveLength(0);
    expect(world.currentSnapshot().payload.design_intent).toEqual(saved);
  });

  it('refuses a narrative rewrite that changes a figure', async () => {
    const world = reportWorld();
    const result = await reportAction(world, {
      mode: 'section',
      answer: REPORT_NARRATIVE_REWORDED.replace('8 seats', '10 seats'),
    });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(result.reason).toBe(ADI_CONSERVATION_REJECTION.ADDED_NUMBER);
    expect(world.writes).toHaveLength(0);
  });

  it('holds the improved narrative to the report’s own validator as well', async () => {
    const world = reportWorld();
    const result = await reportAction(world, {
      mode: 'section',
      answer: REPORT_NARRATIVE_REWORDED,
      validate: () => ({ valid: false, violations: [{ code: 'writer_rule' }] }),
    });

    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.REJECTED);
    expect(result.reason).toBe('writer_rule');
    expect(world.writes).toHaveLength(0);
  });

  it('saves nothing while the writer is switched off for this login', async () => {
    const world = reportWorld({ enabled: false });
    const result = await reportAction(world, { mode: 'section', answer: REPORT_NARRATIVE_REWORDED });

    expect(result.applied).toBe(false);
    expect(result.outcome).toBe(ADI_WORDING_OUTCOME.FLAG_OFF);
    expect(world.writes).toHaveLength(0);
  });

  it('refuses a non-conserved splice, and puts the exact prior narrative back on undo', async () => {
    const world = reportWorld();
    const saved = world.currentSnapshot().payload.design_intent;
    const selection = 'with 8 seats in 2 rows.';
    const improvedSelection = 'with 8 seats in 2 rows.';

    const bad = await reportAction(world, {
      mode: 'selection',
      selectionText: selection,
      improvedSelection,
      bodyText: REPORT_NARRATIVE.replace('120"', '110"'),
    });
    expect(bad.ok).toBe(false);
    expect(bad.block.code).toBe(ADI_INTENT_BLOCK.SPLICE_NOT_CONSERVED);
    expect(world.writes).toHaveLength(0);

    await reportAction(world, { mode: 'section', answer: REPORT_NARRATIVE_REWORDED });
    expect(world.currentSnapshot().payload.design_intent_previous).toEqual(saved);

    const undone = await reportAction(world, { action: 'undo' });
    expect(undone.applied).toBe(true);
    expect(world.currentSnapshot().payload.design_intent).toEqual(saved);
    expect('design_intent_previous' in world.currentSnapshot().payload).toBe(false);

    const again = await reportAction(world, { action: 'undo' });
    expect(again.ok).toBe(false);
    expect(again.block.code).toBe(ADI_INTENT_BLOCK.NOTHING_TO_UNDO);
  });
});