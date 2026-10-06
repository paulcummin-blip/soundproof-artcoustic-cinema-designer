import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { validateWriterOutput } from '../../shared/proposalWriter/writerOutputValidator.js';

/** Admin-only read-only replay: no provider call, no entity writes, no evidence rebuilding. */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { generation_id } = await req.json();
    if (typeof generation_id !== 'string' || !generation_id) return Response.json({ error: 'generation_id required' }, { status: 400 });
    const page = await base44.entities.ProposalGeneration.filter({ generation_id }, { limit: 1 });
    const record = page.items[0];
    if (!record?.gpt_input || !record?.gpt_output) return Response.json({ error: 'Saved input and output required' }, { status: 404 });
    const before = JSON.stringify(record);
    const result = validateWriterOutput({ input: record.gpt_input, output: record.gpt_output });
    return Response.json({ generation_id, prompt_version: record.prompt_version,
      pack_fingerprint: record.evidence_pack_fingerprint,
      historical_record_fingerprint: record.record_fingerprint,
      stored_errors: record.validation_errors, replay: result,
      historical_record_unchanged: before === JSON.stringify(record),
      provider_called: false, records_written: 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}