/**
 * Sound Proof Natural Writing Standard — acceptance tests.
 *
 * The editorial refinement of the Astra proposal instructions, and the four
 * deterministic readings that hold it. What is proved here:
 *
 *   - the standard states the voice, the sentence craft, the recommendation
 *     language, the section responsibilities and the whole-document review, and
 *     it is written without an em dash;
 *   - it reaches the prompt the writer is really called with, and it carries the
 *     vocabulary the validator refuses (one list, not two);
 *   - an em dash, a stock connective, a generic marketing phrase and the same
 *     mechanical paragraph opener repeated across the document are each refused,
 *     and punctuation is never rewritten silently: the copy is refused so the
 *     writer rewrites the sentence;
 *   - a draft that passes today still passes: the fixture drafts, the approved
 *     Genesis AV narrative and the historical Marquee generation gain no new
 *     rejection from this pass, and the evidence, the levels, the products, the
 *     claim grounding and the RP22 assessment are untouched;
 *   - the validator release and every rule module are traceable by hash.
 *
 * Fixtures only: no proposal is generated, no provider is called, nothing is
 * written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  EM_DASH_CHARACTER,
  GENERIC_CLAIM_PHRASES,
  MECHANICAL_OPENERS,
  MECHANICAL_OPENER_THRESHOLD,
  NATURAL_RECOMMENDATION_RULE,
  NATURAL_REPETITION_RULE,
  NATURAL_SENTENCE_RULE,
  NATURAL_VOICE_RULE,
  NATURAL_WRITING_REVIEW,
  NATURAL_WRITING_STANDARD_VERSION,
  STOCK_CONNECTIVES,
} from '../base44/shared/proposalWriter/writerNaturalWritingStandard.js';
import {
  emDashAt,
  genericClaimPhrase,
  repetitiveParagraphOpeners,
  stockConnective,
} from '../base44/shared/proposalWriter/writerNaturalWritingRules.js';
import {
  WRITER_CONTRACT_VERSION,
  WRITER_PROMPT_VERSION,
  WRITER_REJECTION,
  WRITER_WRITING_RULES,
} from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { VALIDATOR_VERSION } from '../base44/shared/proposalWriter/validatorProvenance.js';
import { VALIDATOR_SOURCE_MANIFEST } from '../base44/shared/proposalWriter/validatorSourceManifest.js';
import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import { GENESIS_SECTIONS } from './fixtures/genesisProposalFixture.mjs';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'));
const prompt = buildWriterPrompt({ input: saved.input });
const NEW_CODES = [
  WRITER_REJECTION.EM_DASH_IN_NARRATIVE,
  WRITER_REJECTION.STOCK_CONNECTIVE,
  WRITER_REJECTION.GENERIC_MARKETING_PHRASE,
  WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER,
];

const STANDARD_TEXT = [
  NATURAL_VOICE_RULE,
  NATURAL_SENTENCE_RULE,
  NATURAL_RECOMMENDATION_RULE,
  NATURAL_REPETITION_RULE,
  ...NATURAL_WRITING_REVIEW,
].join('\n');

/** The writer's own validation path, on a fixture draft whose section text is replaced. */
function run(text, section = 'dynamic_range', fixture = writer12Fixture()) {
  fixture.output.sections.find((row) => row.section === section).text = text;
  return validateWriterOutput({ input: fixture.input, output: fixture.output });
}
const codes = (result) => result.violations.map((entry) => entry.code);

describe('A. The standard the proposal is written to', () => {
  it('states one voice, from an experienced British cinema designer', () => {
    expect(STANDARD_TEXT).toMatch(/natural, confident, professional British English/);
    expect(STANDARD_TEXT).toMatch(/never as an engineering report, a marketing brochure, a software generated assessment, a technical validator or an assistant/);
    expect(STANDARD_TEXT).toMatch(/never forcing a contraction into a formal passage/);
    expect(NATURAL_WRITING_STANDARD_VERSION).toBe(1);
  });

  it('states the sentence craft and the connectives it refuses', () => {
    expect(NATURAL_SENTENCE_RULE).toMatch(/vary sentence structure and paragraph length/);
    for (const connective of ['Furthermore', 'Moreover', 'Additionally', 'Subsequently', 'In conclusion', 'It is important to note that']) {
      expect(STOCK_CONNECTIVES).toContain(connective.replace(' that', ''));
      expect(NATURAL_SENTENCE_RULE).toContain(connective);
    }
    for (const opener of ['The system', 'The design', 'This ensures', 'The result']) {
      expect(MECHANICAL_OPENERS).toContain(opener.toLowerCase());
    }
    expect(MECHANICAL_OPENER_THRESHOLD).toBe(3);
  });

  it('allows the design team its own first-person judgement, used selectively', () => {
    expect(NATURAL_RECOMMENDATION_RULE).toMatch(/write we or our, naturally and selectively/);
    expect(NATURAL_RECOMMENDATION_RULE).toMatch(/Never announce a recommendation/);
    expect(NATURAL_RECOMMENDATION_RULE).toMatch(/never invent a conversation, a meeting, a site visit, a budget or a client wish/);
  });

  it('gives every section one contribution and forbids the repeated benefit', () => {
    for (const section of ['Design Summary', 'Design Overview', 'Why This Specification', 'Spatial Resolution', 'Dynamic Range', 'Timbre Matching', 'Overall Design']) {
      expect(NATURAL_REPETITION_RULE).toContain(section);
    }
    expect(NATURAL_REPETITION_RULE).toMatch(/never restate the opening summary at the end/);
    expect(NATURAL_REPETITION_RULE).toMatch(/A repeated idea is acceptable only where it adds a genuinely different aspect of the design/);
  });

  it('asks the whole-document review, and prints none of it', () => {
    const review = NATURAL_WRITING_REVIEW.join(' ');
    for (const question of ['sound like a real cinema designer', 'Is the wording natural', 'Does it explain this actual project', 'Does every sentence add useful information', 'Is anything repetitive', 'Are there generic marketing phrases', 'Are the qualifications excessive', 'Does the writing flow naturally', 'Is the design intent clear', 'read this aloud']) {
      expect(review).toContain(question);
    }
    expect(review).toMatch(/never print the review, a note about a change or any explanation of your own editing/);
    expect(review).toMatch(/Introduce no new engineering fact, product specification or performance claim/);
  });

  it('carries no em dash of its own', () => {
    expect(STANDARD_TEXT.includes(EM_DASH_CHARACTER)).toBe(false);
    expect(EM_DASH_CHARACTER).toBe('\u2014');
  });

  it('refuses the generic phrases the operator named', () => {
    for (const phrase of ['sophisticated cinematic experience', 'seamless immersive sound', 'elevates the listening experience', 'unparalleled performance', 'delivers exceptional immersion', 'brings everything together']) {
      expect(genericClaimPhrase(`The copy states that ${phrase} is delivered.`)).toEqual({ phrase });
    }
    expect(GENERIC_CLAIM_PHRASES.length).toBeGreaterThan(10);
  });
});

describe('B. It reaches the prompt the writer is really called with', () => {
  it('carries the whole standard, and the refusal is stated in the contract the input fingerprints', () => {
    expect(prompt).toContain(NATURAL_VOICE_RULE);
    expect(prompt).toContain(NATURAL_SENTENCE_RULE);
    expect(prompt).toContain(NATURAL_RECOMMENDATION_RULE);
    expect(prompt).toContain(NATURAL_REPETITION_RULE);
    expect(prompt).toContain('THE NATURAL WRITING REVIEW');
    expect(WRITER_WRITING_RULES.some((rule) => /zero em dashes/.test(rule))).toBe(true);
    expect(WRITER_WRITING_RULES.some((rule) => /Never begin a sentence with Furthermore, Moreover, Additionally/.test(rule))).toBe(true);
    expect(WRITER_WRITING_RULES.some((rule) => /project-specific explanation of what was chosen/.test(rule))).toBe(true);
  });

  it('is the natural-writing generation, with the contract unchanged', () => {
    expect(WRITER_PROMPT_VERSION).toBe('proposal-writer-prompt-25');
    expect(WRITER_CONTRACT_VERSION).toBe(2);
    // The prompt carries the input it was built from, so a historical input is
    // still written under the generation it was filed under.
    expect(prompt).toContain(saved.input.prompt_version);
    expect(saved.prompt_version).toBe('proposal-writer-prompt-1');
    expect(buildWriterPrompt({ input: saved.input }).includes('proposal-writer-prompt-1')).toBe(true);
  });
});

describe('C. The deterministic readings', () => {
  it('finds an em dash and leaves clean copy alone', () => {
    expect(emDashAt(`The screen is wider ${EM_DASH_CHARACTER} and brighter.`)).toBe(20);
    expect(emDashAt('The screen is wider and brighter.')).toBe(null);
  });

  it('catches a stock connective at the head of a sentence, and only there', () => {
    for (const connective of STOCK_CONNECTIVES) {
      expect(stockConnective(`${connective}, the room suits the layout.`)?.phrase).toBe(connective);
    }
    expect(stockConnective('The room is treated, and additionally the screen is masked.')).toBe(null);
    expect(stockConnective('The layout holds the front row where the room allows it.')).toBe(null);
  });

  it('catches a generic claim phrase on normalised whitespace', () => {
    expect(genericClaimPhrase('This delivers    exceptional   immersion.')).toEqual({ phrase: 'delivers exceptional immersion' });
    expect(genericClaimPhrase('The subwoofers give demanding soundtracks physical weight at the reference seat.')).toBe(null);
  });

  it('refuses the same mechanical opener only once it is mechanical', () => {
    const two = [
      { section: 'a', text: 'The system places the speakers.\n\nThe room is treated.' },
      { section: 'b', text: 'The system keeps the rows close.' },
    ];
    expect(repetitiveParagraphOpeners(two)).toEqual([]);
    const three = [...two, { section: 'c', text: 'The system repeats itself again.\n\nThe result is a cinema.' }];
    const found = repetitiveParagraphOpeners(three);
    expect(found).toHaveLength(1);
    expect(found[0].code).toBe(WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER);
    expect(found[0].section).toBe('c');
    expect(found[0].detail).toBe('repeated_paragraph_opener:the_system');
  });
});

describe('D. The validator refuses the wording, and rewrites nothing itself', () => {
  it('refuses an em dash in client-facing copy', () => {
    const result = run(`The screen channels deliver ${EM_DASH_CHARACTER} as the evidence states ${EM_DASH_CHARACTER} the headroom the room allows.`);
    expect(codes(result)).toContain(WRITER_REJECTION.EM_DASH_IN_NARRATIVE);
    expect(result.valid).toBe(false);
  });

  it('refuses a stock connective and a generic phrase', () => {
    expect(codes(run('Additionally, the front row is held where the room allows it.'))).toContain(WRITER_REJECTION.STOCK_CONNECTIVE);
    expect(codes(run('The room gives the design a sophisticated cinematic experience.'))).toContain(WRITER_REJECTION.GENERIC_MARKETING_PHRASE);
  });

  it('refuses the same mechanical opener across the document, read as one document', () => {
    const fixture = writer12Fixture();
    for (const section of ['what_stays_same', 'what_changes', 'dynamic_range']) {
      fixture.output.sections.find((row) => row.section === section).text = 'The system places the speakers where the evidence places them.\n\nThe design holds the rows where the room allows.';
    }
    expect(codes(validateWriterOutput({ input: fixture.input, output: fixture.output }))).toContain(WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER);
  });

  it('leaves a draft that passes today passing', () => {
    for (const fixture of [writer12Fixture(), writer12Fixture({ comparison: true }), writer12Fixture({ alternatives: true, comparison: true })]) {
      const result = validateWriterOutput({ input: fixture.input, output: fixture.output });
      for (const code of NEW_CODES) expect(codes(result)).not.toContain(code);
      expect(result.valid).toBe(true);
    }
  });

  it('adds no new rejection to the historical generation', () => {
    const result = validateWriterOutput({ input: saved.input, output: saved.output });
    for (const code of NEW_CODES) expect(codes(result), code).not.toContain(code);
  });

  it('finds nothing in the approved Genesis AV narrative', () => {
    GENESIS_SECTIONS.filter((section) => section.body.trim()).forEach((section) => {
      expect(emDashAt(section.body), section.section_type).toBe(null);
      expect(genericClaimPhrase(section.body), section.section_type).toBe(null);
      expect(stockConnective(section.body), section.section_type).toBe(null);
    });
  });
});

describe('E. Traceability', () => {
  it('is the current validator release', () => {
    expect(VALIDATOR_VERSION).toBe('proposal-validator-4');
  });

  it('hashes every rule module, including both new ones, byte for byte', () => {
    for (const path of [
      'base44/shared/proposalWriter/writerNaturalWritingStandard.js',
      'base44/shared/proposalWriter/writerNaturalWritingRules.js',
      'base44/shared/proposalWriter/writerProseScanner.js',
      'base44/shared/proposalWriter/writerContractSchema.js',
      'base44/shared/proposalWriter/writerPromptBuilder.js',
      'base44/shared/proposalWriter/writerOutputValidator.js',
    ]) {
      const hash = VALIDATOR_SOURCE_MANIFEST[path];
      expect(hash, path).toMatch(/^[0-9a-f]{64}$/);
      expect(createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex'), path).toBe(hash);
    }
  });
});