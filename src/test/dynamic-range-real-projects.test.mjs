/**
 * dynamic-range-real-projects.test.mjs
 * ------------------------------------
 * THE DYNAMIC RANGE STORY, READ FROM THE REAL PROJECTS' PUBLISHED RESULTS.
 *
 * The evidence is the app's own: every level and value below is read from
 * ProjectAnalysisCache.engineering_publications for the version named, frozen into
 * fixtures/dynamicRangeRealEvidence.json. Nothing here invents, re-scores or
 * re-calculates a result — the suite only asks what the narrative authorities
 * actually assemble from the published engineering.
 *
 * It proves, on real designs:
 *   - an absent / unassessed carrying result opens no generic performance claim;
 *   - the pillar opens on the client experience, never on a layer or a figure;
 *   - the opening claim is read at the WEAKEST carrying result, so it is honest for
 *     the whole system;
 *   - a stronger contributor keeps the language its own result earned (no flattening);
 *   - ASDR still decides emphasis inside the story;
 *   - the brief still decides what the results mean for the project;
 *   - and it prints the actual text each project's evidence produces.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = [
  new URL('../', import.meta.url),
  new URL('../../', import.meta.url),
].find((base) => existsSync(new URL('base44/shared/narrativePillars.js', base)))
  || new URL('../', import.meta.url);

const shared = (name) => import(new URL(`base44/shared/${name}`, ROOT).href);

const { buildClientStoryPillars } = await shared('narrativePillarGrouping.js');
const {
  PILLAR,
  BASS_PARTS,
  DYNAMIC_RANGE_SYSTEM_PARTS,
  clientStoryTextIsSafe,
} = await shared('narrativePillars.js');
const {
  dynamicRangeOpening,
  dynamicRangeOpeningTier,
} = await shared('narrativeDynamicRangeOpening.js');
const { buildNarrativePriorityRows } = await shared('narrativePriorityAuthority.js');
const { summaryFromReportEvidence, levelRank } = await shared('strengthImportance.js');
const { BRIEF_INTENT } = await shared('briefRelevance.js');
const { performancePhrase } = await shared('performanceLanguageAuthority.js');

const FIXTURE = JSON.parse(
  readFileSync(new URL('fixtures/dynamicRangeRealEvidence.json', import.meta.url), 'utf8'),
);
const PROJECTS = FIXTURE.projects;

/** The area each part is written in, so a clause can be checked against its own level. */
const AREA_OF = new Map(
  [...DYNAMIC_RANGE_SYSTEM_PARTS, ...BASS_PARTS].map((part) => [part.part, part.area]),
);

const DESIGN = { display: true, speakers: true, bass: true, spatial: true, timbre: true, screenChannels: true };
const intentOf = (project, override) => override
  || BRIEF_INTENT[project.intent_expected]
  || BRIEF_INTENT.MEDIA_LOUNGE;

const rowsFor = (project, intentOverride) => buildNarrativePriorityRows({
  summary: summaryFromReportEvidence({
    parameters: project.parameters.map((parameter) => ({
      parameter_id: parameter.id,
      level: parameter.level ?? null,
      scope: 'room',
      state: parameter.state || 'scored',
      value: parameter.value ?? null,
      supporting_per_seat: [],
    })),
  }),
  intent: intentOf(project, intentOverride),
  design: { ...DESIGN, seats: project.key === 'genesis' ? 8 : 5 },
}).rows;

const dynamicOf = (project, intentOverride) => buildClientStoryPillars({
  rows: rowsFor(project, intentOverride),
}).byPillar[PILLAR.DYNAMIC_RANGE];

/** The readings that carry the story: the screen channels, the surrounds, the output, the depth. */
const carryingOf = (dynamic) => [
  ...dynamic.system_parts.filter((part) => part.available).map((part) => ({ part: part.part, level: part.level })),
  ...dynamic.parts.filter((part) => part.available && !part.supporting).map((part) => ({ part: part.part, level: part.level })),
];

const ranked = (list) => list.filter((entry) => levelRank(entry.level) != null);
const rankOf = (list) => ranked(list).reduce(
  (acc, entry) => (acc == null || levelRank(entry.level) > levelRank(acc.level) ? entry : acc),
  null,
);
const weakestOf = (list) => ranked(list).reduce(
  (acc, entry) => (acc == null || levelRank(entry.level) < levelRank(acc.level) ? entry : acc),
  null,
);

/** The story as the evidence actually reads it: the opening, then the clauses it earned. */
function dynamicRangeText(project, intentOverride) {
  const dynamic = dynamicOf(project, intentOverride);
  const lines = [];
  lines.push(`DYNAMIC RANGE — ${project.name}`);
  lines.push(`(opening tier: ${dynamic.opening.tier}; read at ${dynamic.opening.strength_level}, the weakest carrying result; emphasis: ${dynamic.opening.emphasis.parts.join(', ') || 'none'})`);
  lines.push(`  ${dynamic.opening.claim || '(no carrying result: no whole-system claim is opened)'}`);
  lines.push('  The system its story rests on, in the order the story weaves it:');
  for (const part of dynamic.system_parts) {
    lines.push(`    - ${part.label} (${part.level || 'no result'})${part.told ? '' : ' [not told]'}: ${part.clause || '—'}`);
  }
  lines.push('  The bass beneath it:');
  for (const part of dynamic.parts) {
    lines.push(`    - ${part.label} (${part.level || 'no result'})${part.told ? '' : ' [not told]'}: ${part.clause || '—'}`);
  }
  lines.push(`  Lead evidence: ${dynamic.lead_evidence.ids.join(', ') || 'none'} (${dynamic.lead_evidence.level || 'no level'})`);
  lines.push('  Earned clauses handed to the writer:');
  for (const clause of dynamic.client_clauses) lines.push(`    • ${clause}`);
  return { dynamic, text: lines.join('\n') };
}

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push(['PASS', name]); }
  catch (error) { checks.push(['FAIL', name, String(error.message).slice(0, 400)]); }
};

test('the Dynamic Range story the real projects actually produce', () => {
  /* ── 1 · NO RESULT: an absent carrying result opens no generic claim ───── */
  check('NO-RESULT OPENING GUARD', () => {
    const unpublished = {
      key: 'none', name: 'No published results',
      intent_expected: 'DEDICATED_CINEMA',
      parameters: [12, 13, 14, 18, 19].map((id) => ({ id, level: null, value: null })),
    };
    const dynamic = dynamicOf(unpublished);
    assert.equal(dynamic.opening.tier, null, 'an absent result must not open a tier');
    assert.equal(dynamic.opening.claim, null, 'an absent result must not open a claim');
    assert.match(dynamic.opening.emphasis.wording, /open on what the evidence genuinely supports/);
    assert.deepEqual(dynamic.client_clauses, [], 'no clause is handed over without a result');
    // A QUALIFIER ALONE IS STILL NO CARRYING RESULT: bass control published at its
    // best, with nothing beneath it, opens no whole-system claim either.
    const controlOnly = {
      key: 'control_only', name: 'Bass control only',
      intent_expected: 'DEDICATED_CINEMA',
      parameters: [
        { id: 12, level: null, value: null }, { id: 13, level: null, value: null },
        { id: 14, level: null, value: null }, { id: 18, level: null, value: null },
        { id: 19, level: 'L4', value: '±1 dB' },
      ],
    };
    const controlDynamic = dynamicOf(controlOnly);
    assert.equal(controlDynamic.opening.tier, null);
    assert.equal(controlDynamic.opening.claim, null);
    // Read on its own with an absent level the opening states no claim; the qualifier
    // exclusion itself belongs to the grouping, and it is what the two cases above prove.
    assert.equal(dynamicRangeOpening({ carryingParts: [{ part: 'control', label: 'bass control', level: null }] }).claim, null);
  });

  /* ── 2 · EXPERIENCE FIRST, AND PROPORTIONATE TO THE WHOLE SYSTEM ───────── */
  for (const project of PROJECTS) {
    const { dynamic, text } = dynamicRangeText(project);
    console.log(`@@TEXT ${text}\n`);

    check(`EXPERIENCE-FIRST OPENING (${project.key})`, () => {
      assert.ok(dynamic.opening.claim, 'a published carrying result must open a claim');
      assert.equal(clientStoryTextIsSafe(dynamic.opening.claim).safe, true);
      assert.equal(/\d/.test(dynamic.opening.claim), false, 'the opening quotes no figure');
      assert.equal(/L[1-4]/.test(dynamic.opening.claim), false, 'the opening quotes no level');
      const layers = ['front stage', 'surrounds', 'bass system'].filter((word) => dynamic.opening.claim.includes(word));
      if (dynamic.opening.tier === 'standard') {
        // The everyday system's opening names no layer at all: it states what the
        // client hears, and never a part of the system as the subject.
        assert.deepEqual(layers, [], `the opening names no layer: ${dynamic.opening.claim}`);
      } else {
        // A strong or exceptional system is told ACROSS the whole system: all three
        // parts are named together as one, and none of them is singled out alone.
        assert.equal(layers.length, 3, `the whole system is named as one: ${dynamic.opening.claim}`);
      }
    });

    check(`OPENING STRENGTH PROPORTIONATE (${project.key})`, () => {
      const carrying = carryingOf(dynamic);
      const weakest = weakestOf(carrying);
      const strongest = rankOf(carrying);
      assert.equal(dynamic.opening.strength_level, weakest.level, 'the claim is read at the weakest carrying result');
      assert.equal(dynamic.opening.tier, dynamicRangeOpeningTier(weakest.level)?.tier ?? null);
      assert.equal(dynamic.opening.strongest_level, strongest.level, 'emphasis follows the strongest carrying result');
      assert.equal(dynamic.opening.emphasis.level, strongest.level);
      // The one system that reaches L4 everywhere is the one that opens exceptionally.
      assert.equal(dynamic.opening.tier === 'exceptional', weakest.level === 'L4');
      assert.equal(dynamic.opening.tier === 'strong', weakest.level === 'L3');
    });

    check(`STRONGER CONTRIBUTORS NOT FLATTENED (${project.key})`, () => {
      const parts = [...dynamic.system_parts, ...dynamic.parts].filter((part) => part.told && part.clause);
      assert.ok(parts.length > 0, 'the story carries told parts');
      for (const part of parts) {
        const area = AREA_OF.get(part.part);
        assert.ok(area, `every told part is written in an area: ${part.part}`);
        assert.equal(part.clause, performancePhrase(area, part.level),
          `${part.part} keeps the language its own ${part.level} earned`);
      }
      // A stronger contributor is never told in a weaker result's words.
      for (const part of parts) {
        const area = AREA_OF.get(part.part);
        for (const weaker of ['L1', 'L2', 'L3']) {
          if ((levelRank(weaker) ?? 0) >= (levelRank(part.level) ?? 0)) break;
          const wording = performancePhrase(area, weaker);
          if (wording) {
            assert.notEqual(part.clause, wording,
              `${part.part} (${part.level}) is not flattened onto the ${weaker} wording`);
          }
        }
      }
    });

    check(`ASDR EMPHASIS PRESERVED (${project.key})`, () => {
      assert.ok(dynamic.role, 'the pillar keeps its ASDR role');
      assert.ok(dynamic.role_label, 'the pillar keeps its ASDR role label');
      assert.ok(dynamic.members.length > 0, 'every published result keeps its member');
      for (const member of dynamic.members) {
        assert.ok(['lead', 'supporting', 'contributing', 'context'].includes(member.emphasis),
          `${member.key} carries an emphasis: ${member.emphasis}`);
      }
      // The strongest carrying layer is named for emphasis inside the story.
      const strongest = rankOf(carryingOf(dynamic));
      assert.ok(dynamic.opening.emphasis.parts.length > 0);
      assert.equal(dynamic.lead_evidence.level, strongest.level);
      // A qualifier never becomes the lead.
      assert.equal(dynamic.lead_evidence.ids.includes('P19'), false);
    });
  }

  /* ── 3 · THE BRIEF STILL DECIDES WHAT THE RESULTS MEAN ─────────────────── */
  check('BRIEF CONTEXT PRESERVED', () => {
    const genesis = PROJECTS.find((project) => project.key === 'genesis');
    const cinema = dynamicOf(genesis, BRIEF_INTENT.DEDICATED_CINEMA);
    const lounge = dynamicOf(genesis, BRIEF_INTENT.MEDIA_LOUNGE);
    const shape = (dynamic) => JSON.stringify({
      role: dynamic.role,
      role_label: dynamic.role_label,
      emphasis_note: dynamic.emphasis_note,
      lead: dynamic.lead_evidence.ids,
      members: dynamic.members.map((member) => [member.key, member.emphasis]),
    });
    assert.notEqual(shape(cinema), shape(lounge),
      'the same results are interpreted differently for a dedicated cinema and a media room');
  });

  const failures = checks.filter(([state]) => state === 'FAIL');
  for (const [state, name, detail] of checks) {
    console.log(`@@${state} ${name}${detail ? `\n      ${detail}` : ''}`);
  }
  assert.equal(failures.length, 0, failures.map(([, name, detail]) => `${name}: ${detail}`).join('\n'));
});