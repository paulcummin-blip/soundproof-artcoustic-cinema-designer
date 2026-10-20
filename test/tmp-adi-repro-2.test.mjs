import { test } from 'vitest';
import fs from 'node:fs';
import { runAdiWordingPass } from '../base44/shared/adiEditorial/adiWordingPass.js';

test('gates', async () => {
  const body = fs.readFileSync('/tmp/adi_body.html', 'utf8');
  const out = fs.readFileSync('/tmp/adi_out.txt', 'utf8');
  let calls = 0;
  const pass = await runAdiWordingPass({
    invokeLLM: async () => { calls += 1; return out; },
    prompt: 'x', original: body, mode: 'section', validate: async () => ({ ok: true, violations: [] }),
  });
  console.log('DETAIL', JSON.stringify(pass.violations, null, 1).slice(0, 3500));
  console.log('OUTCOME', pass.outcome, 'attempts', pass.attempts, JSON.stringify(pass.attempt_audit.map((a) => ({ o: a.outcome, s: a.rejectionStage, v: a.violations.map((x) => x.rule || x.code) }))));
});