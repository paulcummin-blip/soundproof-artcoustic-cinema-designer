import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import {
  GPT_WRITER_FLAG_FIELD,
  gptWriterFlagPayload,
  gptWriterClientState,
  normaliseGptWriterConfig,
  resolveGptWriterFlag,
} from '../../shared/proposalWriter/proposalWriterFlag.js';

/**
 * Read and set the Phase 6 GPT proposal writer flag — master admins only.
 *
 * The flag lives in the singleton SystemConfig record and defaults OFF. A master
 * admin may switch it on for listed accounts or emails, or for master admins
 * only, and may pin a provider model for a controlled test. A dealer, client or
 * account admin can neither read the scope lists nor change anything: this
 * function refuses them, and the writer function resolves the flag itself from
 * the same record rather than trusting anything a caller sends.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.isMasterAdmin !== true) {
      return Response.json({ error: 'Master admin access is required to change the proposal writer flag.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, enabled, accounts, emails, model } = body || {};

    const service = base44.asServiceRole;
    const configResult = await service.entities.SystemConfig.filter({}, { limit: 1 });
    const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;

    const readConfig = () => normaliseGptWriterConfig(configRecord?.[GPT_WRITER_FLAG_FIELD] || null);

    if (action === 'set') {
      const payload = gptWriterFlagPayload({
        enabled: enabled === true,
        accounts,
        emails,
        model: typeof model === 'string' && model.trim().length > 0 ? model.trim() : null,
        updatedBy: user.full_name || user.email || 'Master admin',
        updatedAt: new Date().toISOString(),
      });

      if (configRecord?.id) {
        await service.entities.SystemConfig.update(configRecord.id, { [GPT_WRITER_FLAG_FIELD]: payload });
      } else {
        await service.entities.SystemConfig.create({ [GPT_WRITER_FLAG_FIELD]: payload });
      }

      const flag = resolveGptWriterFlag({
        config: payload,
        accountId: accessContext.user?.account_id || null,
        email: user.email || null,
        isMasterAdmin: true,
      });

      return Response.json({ ok: true, config: normaliseGptWriterConfig(payload), writer: gptWriterClientState(flag) });
    }

    const config = readConfig();
    const flag = resolveGptWriterFlag({
      config,
      accountId: accessContext.user?.account_id || null,
      email: user.email || null,
      isMasterAdmin: true,
    });

    return Response.json({ ok: true, config, writer: gptWriterClientState(flag) });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposal writer flag could not be read.' }, { status: 500 });
  }
}