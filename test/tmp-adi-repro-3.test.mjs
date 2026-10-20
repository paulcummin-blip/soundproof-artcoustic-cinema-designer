import { test } from 'vitest';
import fs from 'node:fs';
import { correctSectionFacts } from '../base44/shared/adiEditorial/adiFactCorrection.js';

test('facts', () => {
  const body = fs.readFileSync('/tmp/adi_body.html', 'utf8');
  const { snapshot, rows } = JSON.parse(fs.readFileSync('/tmp/adi_snapshot.json', 'utf8'));
  const fix = correctSectionFacts({ body, highlightRows: rows, snapshot });
  console.log('FACTFIX', JSON.stringify(fix.changes), 'sameBody', fix.body === body);
});