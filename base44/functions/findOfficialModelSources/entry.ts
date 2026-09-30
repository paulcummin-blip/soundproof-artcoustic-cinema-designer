// findOfficialModelSources
// ---------------------------------------------------------------------------
// Model-first source discovery for the Speaker Database.
//
// Scope discipline (enforced here, not just in the prompt):
//   - one manufacturer domain, one exact model
//   - official manufacturer pages and datasheets only
//   - every candidate whose URL is not on the manufacturer domain is discarded
//     before it ever reaches the admin
//   - no catalogue crawling, no dealer/retailer sources, no third-party reviews
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { hostOf, normaliseDomain, isOfficialHost } from '../../shared/officialDomain.js';

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          source_type: { type: 'string' },
          states_model: { type: 'boolean' },
        },
      },
    },
  },
};

const ALLOWED_SOURCE_TYPES = ['Official Product Page', 'Official PDF', 'Engineering Document', 'Support Article'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const manufacturerName = String(body?.manufacturerName || '').trim();
    const model = String(body?.model || '').trim();
    const domain = normaliseDomain(body?.manufacturerDomain);

    if (!manufacturerName || !model) {
      return Response.json({ error: 'Manufacturer and model are required' }, { status: 400 });
    }
    if (!domain) {
      return Response.json({
        error: 'This manufacturer has no website recorded, so there is no official domain to search. Add the manufacturer website first, or enter the product URL manually.',
        candidates: [],
      }, { status: 400 });
    }

    const prompt = [
      `Find official documentation for ONE EXACT loudspeaker model.`,
      ``,
      `Manufacturer: ${manufacturerName}`,
      `Official manufacturer domain: ${domain}`,
      `Exact model name typed by our engineer: "${model}"`,
      ``,
      `Rules you must follow exactly:`,
      `1. Search ONLY pages on the domain ${domain} (including subdomains of it).`,
      `2. Return ONLY pages or PDFs that are on ${domain}. Never return dealer, retailer, distributor, forum, review site or marketplace links.`,
      `3. A candidate must be about the exact model "${model}" by ${manufacturerName}. Do not return sibling models, other series, or a general catalogue/index page.`,
      `4. Prefer, in this order: the model's own product page, the model's official specification PDF/datasheet, an official manual, an official support article.`,
      `5. Return at most 6 candidates. If you cannot find any page on ${domain} for this exact model, return an empty list — never substitute a similar model or a third-party source.`,
      `6. For each candidate give: the page title, the full absolute URL, the source type (one of: ${ALLOWED_SOURCE_TYPES.join(', ')}), and states_model = true only if the page or PDF explicitly names the exact model "${model}".`,
      ``,
      `Return JSON only.`,
    ].join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: CANDIDATE_SCHEMA,
    });

    const raw = Array.isArray(result?.candidates) ? result.candidates : [];
    const candidates = [];
    const rejected = [];

    for (const item of raw) {
      const url = String(item?.url || '').trim();
      const host = hostOf(url);
      if (!isOfficialHost(host, domain)) {
        if (url) rejected.push({ url, reason: 'Not on the manufacturer domain' });
        continue;
      }
      candidates.push({
        title: String(item?.title || '').trim() || `${manufacturerName} ${model}`,
        url,
        source_type: ALLOWED_SOURCE_TYPES.includes(item?.source_type) ? item.source_type : 'Official Product Page',
        domain: host,
        states_model: item?.states_model === true,
        is_official: true,
      });
    }

    return Response.json({
      candidates,
      rejected,
      searched_domain: domain,
      official_only: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}