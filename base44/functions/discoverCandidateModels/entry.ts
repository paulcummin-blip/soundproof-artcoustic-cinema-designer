// discoverCandidateModels/entry.ts
// ---------------------------------------------------------------------------
// Candidate model discovery for one manufacturer — the review step BEFORE
// anything reaches the Speaker Database.
//
// Three reporting passes, all restricted to the manufacturer's own hosts:
//
//   1. DISCOVERY  the cinema / custom-install ranges, searched twice (dedicated
//                 cinema + custom-theatre ranges, and the wider architectural
//                 portfolio) so a manufacturer's full range is covered
//   2. DOCUMENTS  the P12/P13 values, read from the official product sheet /
//                 datasheet / manual / installation guide that the product page
//                 links to — the specification is rarely on the page itself
//   3. SECOND CHANCE  models still missing sensitivity, impedance or a power
//                 authority are searched again for their SERIES document
//   4. TRUSTED SECONDARY  models the official sources left incomplete are offered
//                 the named trusted distributor documents (Habitech, CAVD, Pulse
//                 Cinemas, AWE Europe). Those values are proposed for review and
//                 capped at C — they are never written into the candidate.
//
// Scope discipline (enforced in code, not only in the prompt):
//   - one manufacturer; every product and document URL is checked against the
//     official hosts, so a dealer or distributor copy is never used as evidence
//   - every number is re-checked by the deterministic guards, which discard an
//     implausible or collapsed value and report exactly what was rejected
//   - nothing is created, approved or published: this function performs no
//     database writes at all. The admin selects the models to add.
// ---------------------------------------------------------------------------

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { hostOf, resolveManufacturerAuthority, isOfficialUrl } from '../../shared/officialDomain.js';
import { normaliseSpecification, buildSpecificationSchema, text } from '../../shared/speakerSpecGuards.js';
import { DOCUMENT_TYPES, harvestOfficialDocuments, probeUrl, urlResponds } from '../../shared/officialDocumentHarvest.js';
import {
  buildDiscoveryPrompt,
  discoverySchema,
  buildExtractionPrompt,
  extractionSchema,
  buildTrustedSecondaryPrompt,
  trustedSecondarySchema,
} from '../../shared/candidateDiscoveryPrompts.js';
import {
  TRUSTED_SECONDARY_FIELDS,
  TRUSTED_SECONDARY_SOURCES,
  canonicalManufacturerName,
  isFocusManufacturer,
  trustedSecondarySource,
} from '../../shared/trustedSecondarySources.js';

const MAX_CANDIDATES = 30;
// How many leading candidates have their official documents fetched and read,
// and how many of those get a second search for their series document.
const DEEP_LIMIT = 24;
const EXTRACTION_CHUNK = 8;
const RETRY_LIMIT = 6;
const MAX_DOCUMENTS_PER_MODEL = 6;
// Models whose official data is incomplete, retried against the trusted
// secondary distributor hosts (Habitech, CAVD, Pulse Cinemas, AWE Europe).
const TRUSTED_RETRY_LIMIT = 8;

const ROLE_GUESSES = ['LCR', 'Surround', 'Wide', 'Height', 'Flexible', 'Both', 'Unknown'];
const CATEGORIES = ['On Wall', 'In Wall', 'Freestanding', 'Other'];

// Exclusions for this P12/P13 speaker-capability section.
const EXCLUSIONS = [
  { reason: 'Subwoofer', test: /\bsub ?woofers?\b|\bsub[ -]?\d|\bsub\b|\bsw\b|\bswm\b/i },
  { reason: 'Headphones', test: /headphone|headset|earphone|earbud|\bin-?ear\b/i },
  { reason: 'Soundbar', test: /sound ?bar/i },
  { reason: 'Wireless lifestyle speaker', test: /portable|bluetooth|wireless speaker|smart speaker|voice assistant/i },
  { reason: 'Electronics / amplifier', test: /amplifier|receiver|processor|\bavr\b|\bdac\b|electronic|streamer/i },
  { reason: 'Accessory', test: /accessor|bracket|cable|mount kit|grille|speaker stand|spike|back ?box|recessed ?box/i },
  { reason: 'Installation package', test: /\bpackage\b|\bbundle\b|complete system|speaker system/i },
  { reason: 'Outdoor', test: /outdoor|landscape|marine/i },
];

// Models belonging to a cinema or custom-install range. They are searched first
// in every pass: they are the ones a P12/P13 comparison is built from.
const CINEMA_RANGE = /custom[-_ ]?(install|theatre|theater)|cinema|theatre|theater|\bct[ .-]?\d|\bctm\b|\blcrs?\b|screen|behind[-_ ]?screen|surround|overhead|in[-_ ]?wall|in[-_ ]?ceiling|\biw\b/i;

const SPEC_SCHEMA = buildSpecificationSchema();

function modelKey(value: any) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function exclusionFor(candidate: any) {
  // "CT8 SW" carries no subwoofer keyword: the model suffix is the designation.
  if (modelKey(candidate?.model).endsWith('sw')) return 'Subwoofer';
  const haystack = `${text(candidate?.model)} ${text(candidate?.series)}`;
  for (const rule of EXCLUSIONS) {
    if (rule.test.test(haystack)) return rule.reason;
  }
  return null;
}

/** The document kind reported for a candidate, restricted to the known set. */
function documentTypeOf(value: any, hasDocument: boolean) {
  const type = text(value);
  if (!hasDocument) return 'Product page';
  if (type === 'Product page' || !type) return 'Other document';
  return DOCUMENT_TYPES.includes(type) ? type : 'Other document';
}

function hasPowerAuthority(spec: any) {
  return spec.power_handling_continuous_w !== undefined
    || spec.long_term_iec_power_w !== undefined
    || spec.rated_iec_power_w !== undefined
    || spec.aes_power_w !== undefined
    || spec.recommended_amp_max_w !== undefined
    || spec.max_continuous_spl_db !== undefined;
}

/**
 * Fold one document-extraction result into a candidate: the document is the
 * deeper source, so its stated values win over the product page, and the whole
 * merged set is re-checked by the guards. A document that is not on the
 * manufacturer's own hosts is never used and is reported instead.
 * @returns {boolean} whether an official document backed this candidate
 */
function mergeDocumentResult({ candidate, document, allowedHosts, rejectedDocuments }: any) {
  const reportedUrl = text(document?.document_url);
  const officialDocument = isOfficialUrl(reportedUrl, allowedHosts) ? reportedUrl : '';
  if (reportedUrl && !officialDocument) {
    rejectedDocuments.push({
      model: candidate.model,
      url: reportedUrl,
      reason: 'Not on the official domain — not used as evidence',
    });
  }

  // Values are only read when they came from a source that exists.
  if (candidate.product_url_ok === false && !officialDocument) {
    candidate.specification = {};
    candidate.discarded_values = [];
    return false;
  }

  const merged: Record<string, any> = { ...(candidate.specification || {}) };
  const documentSpec = document?.specification && typeof document.specification === 'object' ? document.specification : {};
  for (const [field, value] of Object.entries(documentSpec)) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    merged[field] = value;
  }

  const guarded = normaliseSpecification(merged);
  candidate.specification = guarded.spec;
  candidate.discarded_values = guarded.discarded;

  if (!officialDocument) {
    candidate.document_note = text(document?.not_found_reason);
    return false;
  }

  candidate.document_url = officialDocument;
  candidate.document_type = documentTypeOf(document?.document_type, true);
  candidate.document_note = '';
  candidate.source_quote = text(document?.source_quote) || candidate.source_quote;
  candidate.spec_source_type = 'Official PDF';
  // The document that carried the values is the source of record.
  candidate.datasheet_url = officialDocument;
  return true;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    // The canonical spelling is searched ("Lyndorf Audio" → "Lyngdorf Audio"), so a
    // misspelled record cannot send the search after a name that does not exist.
    const manufacturerName = canonicalManufacturerName(text(body?.manufacturerName)) || text(body?.manufacturerName);
    if (!manufacturerName) {
      return Response.json({ error: 'Manufacturer is required' }, { status: 400 });
    }
    const focusManufacturer = isFocusManufacturer(manufacturerName);

    // UK / regional entry point first; the recorded website stays the authority too.
    const authority = resolveManufacturerAuthority({
      manufacturerName,
      website: body?.manufacturerDomain || body?.website,
    });
    if (!authority.primaryUrl) {
      return Response.json({
        error: 'This manufacturer has no official website recorded, so there is no authority domain to search. Add the website first.',
        candidates: [],
      }, { status: 400 });
    }

    let authorityUrl = authority.primaryUrl;
    let preferenceNote = authority.regionalUrl
      ? `${authority.regionalLabel} pages preferred (${authority.regionalUrl})`
      : '';
    if (authority.preferRegional && !(await urlResponds(authority.primaryUrl))) {
      authorityUrl = authority.storedDomain ? `https://${authority.storedDomain}` : authority.primaryUrl;
      preferenceNote = 'The preferred regional entry point did not respond, so the recorded official domain was used.';
    }
    const allowedHosts = authority.hosts;

    // ---- Pass 1: which models exist on the official domain -------------------
    const search = async (focus: string) => {
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: buildDiscoveryPrompt({
            manufacturerName,
            authorityUrl,
            allowedHosts,
            regionalLabel: authority.regionalUrl ? authority.regionalLabel : '',
            focus,
            roleGuesses: ROLE_GUESSES,
            categories: CATEGORIES,
            maxCandidates: MAX_CANDIDATES,
            isFocus: focusManufacturer,
          }),
          add_context_from_internet: true,
          response_json_schema: discoverySchema(),
        });
        return Array.isArray(result?.candidates) ? result.candidates : [];
      } catch {
        // One failed search must not lose the models the other one found.
        return [];
      }
    };

    const [cinemaModels, installModels, catalogueModels] = await Promise.all([
      search('the manufacturer\'s dedicated custom-theatre / behind-screen cinema ranges — the models it sells specifically for cinema installations, which usually form their own series — and EVERY model in those series'),
      search('the custom-installation and architectural ranges: every in-wall and in-ceiling model, every on-wall LCR, plus the surround, wide and height / overhead models used in home cinema'),
      search('the manufacturer\'s loudspeaker range set out by series: first name every series, then list the individual models in each series that is used for home cinema or custom installation — do not stop at the flagship hi-fi range'),
    ]);

    const raw = [...cinemaModels, ...installModels, ...catalogueModels];
    const seen = new Set<string>();
    const current: any[] = [];
    const discontinued: any[] = [];
    const excluded: any[] = [];
    const rejected: any[] = [];

    for (const item of raw) {
      const productUrl = text(item?.product_url);
      if (!isOfficialUrl(productUrl, allowedHosts)) {
        if (productUrl) rejected.push({ model: text(item?.model), url: productUrl, reason: `Not on ${allowedHosts[0] || 'the official domain'}` });
        continue;
      }

      const model = text(item?.model);
      const key = modelKey(model);
      if (!model || !key || seen.has(key)) continue;
      seen.add(key);

      // Discovery is identity only: the engineering values arrive in the document pass.
      const datasheetUrl = text(item?.datasheet_url);

      const candidate = {
        model,
        series: text(item?.series),
        role_guess: ROLE_GUESSES.includes(text(item?.role_guess)) ? text(item?.role_guess) : 'Unknown',
        product_category: CATEGORIES.includes(text(item?.product_category)) ? text(item?.product_category) : 'Other',
        product_url: productUrl,
        datasheet_url: isOfficialUrl(datasheetUrl, allowedHosts) ? datasheetUrl : '',
        spec_source_type: text(item?.spec_source_type) === 'Official PDF' ? 'Official PDF' : 'Official Product Page',
        source_quote: text(item?.source_quote),
        is_discontinued: item?.is_discontinued === true,
        specification: {},
        discarded_values: [],
        // Filled by the document passes below.
        product_url_ok: true,
        document_url: '',
        document_type: 'Product page',
        document_note: '',
        official_documents: [],
      };

      const exclusion = exclusionFor(candidate);
      if (exclusion) {
        excluded.push({ model: candidate.model, series: candidate.series, url: candidate.product_url, reason: exclusion });
        continue;
      }

      if (candidate.is_discontinued) discontinued.push({ ...candidate, exclusion_note: 'Discontinued' });
      else current.push(candidate);
    }

    // Discontinued models are offered only when no current option exists.
    const noCurrentOptions = current.length === 0 && discontinued.length > 0;
    const shown = noCurrentOptions ? discontinued : current;

    // The list is only worth reading if its addresses exist. A URL the search
    // invented (or one the manufacturer has since removed) is flagged, and can
    // never become the evidence behind a value.
    const urlProbes = await Promise.all(shown.slice(0, MAX_CANDIDATES).map(async (candidate: any) => ({
      candidate,
      probe: await probeUrl(candidate.product_url),
    })));
    for (const { candidate, probe } of urlProbes) {
      if (probe.notFound) {
        candidate.product_url_ok = false;
        candidate.document_note = 'No page found for this model at the address the search reported — not used as a source.';
      }
    }

    // ---- Pass 2: read the official supporting documents ---------------------
    // Each leading product page is fetched for its document links, and those
    // documents are then read for the P12/P13 values.
    const deepTargets = shown.slice(0, DEEP_LIMIT);
    const harvest = await Promise.all(deepTargets.map(async (candidate: any) => {
      const documents = candidate.product_url
        ? await harvestOfficialDocuments(candidate.product_url, {
          isAllowed: (url: string) => isOfficialUrl(url, allowedHosts),
          limit: MAX_DOCUMENTS_PER_MODEL,
        })
        : [];
      return { candidate, documents };
    }));

    const batches: any[][] = [];
    for (let index = 0; index < harvest.length; index += EXTRACTION_CHUNK) {
      batches.push(harvest.slice(index, index + EXTRACTION_CHUNK));
    }

    const readDocuments = async (models: any[], deepSearch = false) => {
      const groups: any[][] = [];
      for (let index = 0; index < models.length; index += EXTRACTION_CHUNK) {
        groups.push(models.slice(index, index + EXTRACTION_CHUNK));
      }
      const results = await Promise.all(groups.map(async (group) => {
        try {
          const result = await base44.integrations.Core.InvokeLLM({
            prompt: buildExtractionPrompt({ manufacturerName, authorityUrl, allowedHosts, models: group, deepSearch }),
            add_context_from_internet: true,
            response_json_schema: extractionSchema(SPEC_SCHEMA),
          });
          return Array.isArray(result?.items) ? result.items : [];
        } catch {
          // A failed document pass never discards the models already discovered.
          return [];
        }
      }));
      return results.flat();
    };

    // A reported source is only trusted when it actually exists: an address that
    // returns 404 must never carry engineering values into the database.
    const verifyDocuments = async (items: any[]) => Promise.all(items.map(async (item) => {
      const url = text(item?.document_url);
      if (!url || !(await probeUrl(url)).notFound) return item;
      return {
        ...item,
        document_url: '',
        specification: {},
        not_found_reason: 'The source reported for this model could not be found at that address.',
      };
    }));

    const extracted = await verifyDocuments(await readDocuments(batches.flat()));
    const documentByKey = new Map<string, any>();
    for (const item of extracted) {
      const key = modelKey(item?.model);
      if (key && !documentByKey.has(key)) documentByKey.set(key, item);
    }

    let documentsUsed = 0;
    const rejectedDocuments: any[] = [];
    const mergeContext = { allowedHosts, rejectedDocuments };

    for (const entry of harvest) {
      const { candidate, documents } = entry;
      candidate.official_documents = documents;
      const backed = mergeDocumentResult({
        ...mergeContext,
        candidate,
        document: documentByKey.get(modelKey(candidate.model)),
      });
      if (backed) documentsUsed += 1;
    }

    // ---- Pass 3: second chance for models still missing key fields -----------
    // A model's values are often in its SERIES document rather than its own page.
    // The cinema and custom-install models are retried first — they are the ones
    // the P12/P13 comparison is built from.
    const cinemaScore = (candidate: any) =>
      (CINEMA_RANGE.test(`${candidate.model} ${candidate.series}`) ? 2 : 0)
      + (CINEMA_RANGE.test(candidate.product_url || '') ? 1 : 0);

    const thin = deepTargets
      .filter((candidate: any) => {
        const spec = candidate.specification || {};
        return !spec.sensitivity_db || !spec.nominal_impedance_ohm || !hasPowerAuthority(spec);
      })
      .sort((a: any, b: any) => cinemaScore(b) - cinemaScore(a))
      .slice(0, RETRY_LIMIT);

    if (thin.length > 0) {
      const retryItems = await verifyDocuments(await readDocuments(thin.map((candidate: any) => ({
        model: candidate.model,
        series: candidate.series,
        product_url: candidate.product_url,
        // An address that did not resolve is flagged for the retry: the search
        // must find the model's current page or document, not repeat a dead one.
        product_url_ok: candidate.product_url_ok,
        documents: candidate.official_documents || [],
      })), true));

      for (const item of retryItems) {
        const key = modelKey(item?.model);
        const candidate = thin.find((entry: any) => modelKey(entry.model) === key);
        if (!candidate) continue;
        if (mergeDocumentResult({ ...mergeContext, candidate, document: item })) documentsUsed += 1;
      }
    }

    // ---- Pass 4: trusted secondary distributor documents ---------------------
    // ONLY for models the official sources left incomplete. Habitech, CAVD, Pulse
    // Cinemas and AWE Europe are trusted enough to use for a P12/P13 estimate, but
    // they are never primary: their values are proposed for review and are NOT
    // written into the candidate's specification. The admin opens the document,
    // reads the sentences and accepts it explicitly (capped at C).
    const isThin = (candidate: any) => {
      const spec = candidate?.specification || {};
      return !spec.sensitivity_db || !spec.nominal_impedance_ohm || !hasPowerAuthority(spec);
    };

    const missingFieldsOf = (spec: any) => {
      const fields: string[] = [];
      if (!spec?.sensitivity_db) fields.push('sensitivity_db');
      if (!spec?.nominal_impedance_ohm) fields.push('nominal_impedance_ohm');
      if (!hasPowerAuthority(spec || {})) fields.push('power authority (AES/continuous rating or recommended amplifier range)');
      if (!spec?.frequency_response_low_hz && !spec?.frequency_response_high_hz) fields.push('frequency_response');
      return fields;
    };

    const stillThin = shown
      .filter((candidate: any) => isThin(candidate))
      .sort((a: any, b: any) => cinemaScore(b) - cinemaScore(a))
      .slice(0, TRUSTED_RETRY_LIMIT);

    let trustedProposals = 0;
    if (stillThin.length > 0) {
      const trustedGroups: any[][] = [];
      for (let index = 0; index < stillThin.length; index += EXTRACTION_CHUNK) {
        trustedGroups.push(stillThin.slice(index, index + EXTRACTION_CHUNK));
      }

      const found = await Promise.all(trustedGroups.map(async (group) => {
        try {
          const result = await base44.integrations.Core.InvokeLLM({
            prompt: buildTrustedSecondaryPrompt({
              manufacturerName,
              models: group.map((candidate: any) => ({
                model: candidate.model,
                series: candidate.series,
                product_url: candidate.product_url,
                missing: missingFieldsOf(candidate.specification),
              })),
            }),
            add_context_from_internet: true,
            response_json_schema: trustedSecondarySchema(SPEC_SCHEMA),
          });
          return Array.isArray(result?.items) ? result.items : [];
        } catch {
          // A failed trusted-source pass never affects the official results.
          return [];
        }
      }));

      const proposedRows: any[] = [];
      for (const item of found.flat()) {
        const url = text(item?.url || item?.document_url);
        // Deterministic host check: only the named trusted distributors count,
        // whatever the search claims about a source.
        const source = trustedSecondarySource(url) || trustedSecondarySource(text(item?.host));
        const candidate = stillThin.find((entry: any) => modelKey(entry.model) === modelKey(item?.model));
        if (!source || !url || !candidate) continue;

        // Only P12/P13 fields, and only the ones the official read left empty.
        const officialSpec = candidate.specification || {};
        const proposed: Record<string, any> = {};
        for (const [field, value] of Object.entries(item?.specification || {})) {
          if (!TRUSTED_SECONDARY_FIELDS.includes(field) && field !== 'frequency_response_high_hz') continue;
          if (value === null || value === undefined || String(value).trim() === '') continue;
          if (officialSpec[field] !== undefined) continue;
          proposed[field] = value;
        }
        const guarded = normaliseSpecification(proposed);
        if (Object.keys(guarded.spec).length === 0) continue;

        proposedRows.push({ item, url, source, candidate, specification: guarded.spec, discarded: guarded.discarded });
      }

      // The proposed document must exist: an address that 404s is never offered
      // for review.
      const trustedProbes = await Promise.all(proposedRows.map(async (row: any) => ({
        row,
        probe: await probeUrl(row.url),
      })));

      for (const { row, probe } of trustedProbes) {
        if (probe.notFound) continue;
        row.candidate.trusted_secondary = {
          source_name: row.source.name,
          host: row.source.host,
          url: row.url,
          document_type: text(row.item?.document_type),
          source_date: text(row.item?.source_date),
          source_quote: text(row.item?.source_quote).slice(0, 400),
          specification: row.specification,
          discarded_values: row.discarded,
          note: 'Trusted secondary distributor source — review and accept explicitly. Capped at confidence C.',
        };
        trustedProposals += 1;
      }
    }

    const candidates = shown.slice(0, MAX_CANDIDATES);

    return Response.json({
      candidates,
      excluded,
      rejected,
      rejected_documents: rejectedDocuments,
      searched_domain: hostOf(authorityUrl) || allowedHosts[0] || '',
      authority_url: authorityUrl,
      allowed_domains: allowedHosts,
      regional_preference: preferenceNote,
      official_only: true,
      manufacturer_name_used: manufacturerName,
      focus_manufacturer: focusManufacturer,
      trusted_secondary_hosts: TRUSTED_SECONDARY_SOURCES.map((source) => source.host),
      trusted_secondary_count: trustedProposals,
      no_current_options_found: noCurrentOptions,
      candidate_count: candidates.length,
      excluded_count: excluded.length,
      deep_checked_count: deepTargets.length,
      documents_used_count: documentsUsed,
      note: noCurrentOptions
        ? 'No current models were found on the official domain, so discontinued models are shown instead.'
        : `Nothing has been created. Supporting official documents (product sheets, datasheets, manuals) and series documents were searched for the leading models${trustedProposals > 0 ? `; ${trustedProposals} model${trustedProposals === 1 ? '' : 's'} also has a trusted secondary distributor document proposed for review` : ''}; select the models to add.`,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}