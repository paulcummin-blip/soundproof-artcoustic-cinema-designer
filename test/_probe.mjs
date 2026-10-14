import { test } from 'vitest';
import { removeAbsentFeatureFraming } from '../base44/shared/proposalWriter/absentFeatureFraming.js';

test('probe', () => {
  const cases = [
    '<p>The system is only listener-level, and it is limited to 5.1 channels.</p>',
    '<p>The system is only listener-level.</p>',
    '<p>and it is limited to 5</p>',
    '<p>1 channels.</p>',
    '<p>.</p>',
    '<p>The overhead speakers are missing from this design.</p>',
  ];
  for (const c of cases) console.log('IN :', JSON.stringify(c), '=> OUT:', JSON.stringify(removeAbsentFeatureFraming(c)));
});