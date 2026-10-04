/**
 * Client Brief prompt chips — multi-select contract.
 *
 * The rule under test: selecting chips is local. The brief is only written when
 * the user confirms "Add selected to brief", and confirmed prompts are inserted
 * as bullets with no duplicates.
 *
 * Pure: no React, no database, no browser.
 */
import { test, expect } from 'vitest';
import {
  appendSelectedPrompts,
  briefPromptKeys,
  normalisePrompt,
  toggleChipSelection,
} from '@/components/proposal/wizard/clientBriefChips';

const COMPARISON_PROMPTS = [
  'Compare the dynamic range of both systems',
  'Compare the bass layouts of both systems',
  'Compare the speaker layouts of both systems',
  'Compare the screen and seating experience',
];

test('a chip toggles on and off, preserving click order', () => {
  let selected = [];
  selected = toggleChipSelection(selected, COMPARISON_PROMPTS[0]);
  selected = toggleChipSelection(selected, COMPARISON_PROMPTS[1]);
  selected = toggleChipSelection(selected, COMPARISON_PROMPTS[2]);
  expect(selected).toEqual(COMPARISON_PROMPTS.slice(0, 3));

  // Clicking a selected chip deselects it.
  selected = toggleChipSelection(selected, COMPARISON_PROMPTS[1]);
  expect(selected).toEqual([COMPARISON_PROMPTS[0], COMPARISON_PROMPTS[2]]);

  // The incoming list is never mutated.
  const original = [COMPARISON_PROMPTS[0]];
  toggleChipSelection(original, COMPARISON_PROMPTS[1]);
  expect(original).toEqual([COMPARISON_PROMPTS[0]]);
});

test('an empty brief receives every selected prompt as a bullet', () => {
  const { next, added, duplicates } = appendSelectedPrompts('', COMPARISON_PROMPTS.slice(0, 3));
  expect(next).toBe([
    '• Compare the dynamic range of both systems',
    '• Compare the bass layouts of both systems',
    '• Compare the speaker layouts of both systems',
  ].join('\n'));
  expect(added).toHaveLength(3);
  expect(duplicates).toEqual([]);
});

test('existing brief copy is kept and new prompts follow it on their own lines', () => {
  const brief = 'Family friendly, explain the room constraints.';
  const { next, added } = appendSelectedPrompts(brief, COMPARISON_PROMPTS.slice(0, 2));
  expect(next.startsWith(brief)).toBe(true);
  expect(next).toBe([
    'Family friendly, explain the room constraints.',
    '• Compare the dynamic range of both systems',
    '• Compare the bass layouts of both systems',
  ].join('\n'));
  expect(added).toHaveLength(2);
});

test('a prompt already in the brief is not added again', () => {
  const brief = '• Compare the dynamic range of both systems';
  const { next, added, duplicates } = appendSelectedPrompts(brief, COMPARISON_PROMPTS.slice(0, 3));
  expect(next).toBe([
    '• Compare the dynamic range of both systems',
    '• Compare the bass layouts of both systems',
    '• Compare the speaker layouts of both systems',
  ].join('\n'));
  expect(added).toEqual(COMPARISON_PROMPTS.slice(1, 3));
  expect(duplicates).toEqual([COMPARISON_PROMPTS[0]]);
});

test('duplicate detection is case, bullet and spacing tolerant', () => {
  const brief = '-   compare the DYNAMIC   range of both systems';
  const { next, added, duplicates } = appendSelectedPrompts(brief, [COMPARISON_PROMPTS[0]]);
  expect(next).toBe(brief);
  expect(added).toEqual([]);
  expect(duplicates).toEqual([COMPARISON_PROMPTS[0]]);
  expect(briefPromptKeys(brief).has(normalisePrompt(COMPARISON_PROMPTS[0]))).toBe(true);
});

test('adding nothing leaves the brief untouched, whitespace included', () => {
  const brief = 'Keep me exactly as written.   ';
  const { next, added } = appendSelectedPrompts(brief, []);
  expect(next).toBe(brief);
  expect(added).toEqual([]);
});

test('blank labels are ignored', () => {
  const { next, added } = appendSelectedPrompts('', ['   ', null, undefined]);
  expect(next).toBe('');
  expect(added).toEqual([]);
});