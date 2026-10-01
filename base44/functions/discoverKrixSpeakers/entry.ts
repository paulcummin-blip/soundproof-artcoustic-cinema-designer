import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ---------------------------------------------------------------------------
// Krix dedicated home cinema discovery.
//
// Reads ONLY the official Krix domain: the dedicated-home-cinema category page
// for the product list and each product's own page for its specification block.
// Official download links (specification sheet, installation guide, performance
// report, design guide) are recorded against each candidate but their contents
// are never guessed at — every number here is read from the sentence it is
// quoted from, and that sentence is stored with the value.
//
// Nothing is written to the database. Subwoofers, amplifiers, wireless kits and
// accessories are excluded from the P12/P13 speaker comparison. A model whose
// page publishes no loudspeaker engineering data is reported as excluded with
// the reason, never as a usable candidate.
//
// Every extractor is range-guarded so a collapsed column cannot silently become
// a value: watts can never become SPL or dispersion, degrees can never become
// power, dB can never become impedance, hertz can never become power.
// ---------------------------------------------------------------------------

const SOURCE_URL = 'https://www.krix.com.au/dedicated-home-cinema?category=on-wall';
const ORIGIN = 'https://www.krix.com.au';

const SPEAKER_CATEGORIES = ['on-wall', 'in-wall', 'freestanding', 'modular', 'linear lcr'];
const EXCLUDED_CATEGORY_LABELS = ['Subwoofer', 'Amplifier'];

// The same ranges the Speaker Database validates against, applied here so a
// candidate can only ever carry a value that is plausible for its own field.
const GUARD = {
  sensitivity: [60, 115],
  impedance: [1, 32],
  power: [5, 5000],
  degrees: [10, 180],
  lowHz: [10, 500],
  highHz: [500, 60000],
  dimensionMm: [20, 2500],
  weightKg: [0.1, 300],
  wooferInches: [3, 18],
};

const CATEGORY_TO_PRODUCT = {
  'on-wall': 'On Wall',
  'in-wall': 'In Wall',
  freestanding: 'Freestanding',
  modular: 'Other',
  'linear lcr': 'Other',
};

function stripTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&frac12;/g, '½')
    .replace(/[\u200b\u200d]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inRange(value, [min, max]) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function guessSeries(model) {
  const first = String(model || '').trim().split(/\s+/)[0] || '';
  const stem = first.replace(/-.*$/, '');
  if (!stem) return '';
  return stem.charAt(0).toUpperCase() + stem.slice(1).toLowerCase();
}

function guessRole(model, category, pageText) {
  const name = String(model || '').toUpperCase();
  if (/CENTRE|CENTER/.test(name)) return 'LCR';
  if (category === 'modular' || category === 'linear lcr') return 'LCR';
  if (category === 'freestanding') return 'LCR';
  if (/\bsurround\b/i.test(pageText) && !/\bleft, cent|left, centre|LCR\b/i.test(pageText)) return 'Surround';
  if (category === 'on-wall' || category === 'in-wall') return 'Flexible';
  return 'Unknown';
}

/**
 * The specification block: every `<strong>Label<br></strong>Value</p>` in the
 * page, scanned document-wide (the block is an accordion, so its position moves
 * between pages) and reduced to the first occurrence of each label.
 */
function readSpecPairs(html) {
  const pairs = {};
  const sentences = {};
  const pattern = /<strong>([\s\S]{0,90}?)<br\s*\/?>\s*<\/strong>([\s\S]{0,700}?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const rawLabel = stripTags(match[1]);
    const label = rawLabel.toLowerCase().replace(/\s+/g, ' ').trim();
    const value = stripTags(match[2]);
    if (!label || !value || pairs[label]) continue;
    pairs[label] = value;
    sentences[label] = `${rawLabel}: ${value}`;
  }
  return { pairs, sentences };
}

/**
 * Pick a label. The MX modules publish separate low and high frequency element
 * figures; where both are present the low frequency element is used, because it
 * is the element whose output sets the dynamic-range capability the comparison
 * measures. The choice is reported as a review flag, never hidden.
 */
function firstPair(pairs, needles) {
  const matching = Object.keys(pairs).filter((key) => needles.some((needle) => key.includes(needle)));
  if (matching.length === 0) return null;
  const lowFrequency = matching.find((key) => /\blf\b|low frequency/.test(key));
  const key = lowFrequency || matching[0];
  return { label: key, value: pairs[key], splitElement: Boolean(lowFrequency) && matching.length > 1 };
}

/**
 * Bi-amped modular modules (the MX range) publish separate low and high
 * frequency element figures. The low frequency element is the one that carries
 * the dynamic-range capability the comparison measures, so it is used and the
 * choice is reported rather than hidden.
 */
function lowFrequencyElement(value) {
  const text = String(value || '');
  if (!/high frequency element/i.test(text)) return { value: text, split: false };
  const start = text.search(/low frequency element/i);
  if (start === -1) return { value: text, split: false };
  const rest = text.slice(start).replace(/low frequency element/i, '');
  const end = rest.search(/high frequency element/i);
  return { value: end > -1 ? rest.slice(0, end) : rest, split: true };
}

function parseSensitivity(value) {
  const match = String(value || '').match(/([\d.]+)\s*dB/i);
  if (!match) return {};
  const db = Number(match[1]);
  if (!inRange(db, GUARD.sensitivity)) return { rejected: `sensitivity ${match[1]} dB is outside the plausible range` };
  const text = String(value);
  let basis = 'unknown';
  if (/2\.83\s*V/i.test(text)) basis = '2.83V/1m';
  else if (/\b1\s*W(?:att)?\b/i.test(text)) basis = '1W/1m';
  return { sensitivity_db: db, sensitivity_basis: basis };
}

function parseImpedance(value) {
  const text = String(value || '');
  const nominalMatch = text.match(/nominally\s*([\d.]+)\s*ohms?/i) || text.match(/([\d.]+)\s*ohms?/i);
  const minMatch = text.match(/minimum\s*([\d.]+)\s*ohms?/i);
  const out = {};
  if (nominalMatch) {
    const nominal = Number(nominalMatch[1]);
    if (inRange(nominal, GUARD.impedance)) out.nominal_impedance_ohm = nominal;
    else out.rejected = `nominal impedance ${nominalMatch[1]} Ω is outside the plausible range`;
  }
  if (minMatch) {
    const minimum = Number(minMatch[1]);
    if (inRange(minimum, GUARD.impedance)) out.minimum_impedance_ohm = minimum;
  }
  return out;
}

function parsePower(value) {
  const text = String(value || '');
  if (!/watt/i.test(text)) return {};
  const range = text.match(/([\d.]+)\s*(?:-|–|—|to)\s*([\d.]+)\s*watts?/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!inRange(min, GUARD.power) || !inRange(max, GUARD.power)) {
      return { rejected: `amplifier power ${range[1]}-${range[2]} W is outside the plausible range` };
    }
    return { recommended_amp_min_w: Math.min(min, max), recommended_amp_max_w: Math.max(min, max) };
  }
  const single = text.match(/([\d.]+)\s*watts?/i);
  if (!single) return {};
  const max = Number(single[1]);
  if (!inRange(max, GUARD.power)) return { rejected: `amplifier power ${single[1]} W is outside the plausible range` };
  return { recommended_amp_max_w: max };
}

function parseFrequency(value) {
  const text = String(value || '');
  const out = {};
  let low = null;
  let high = null;
  const khz = text.match(/([\d.]+)\s*Hz\s*(?:-|–|—|to)\s*([\d.]+)\s*kHz/i);
  const hz = text.match(/([\d.]+)\s*Hz\s*(?:-|–|—|to)\s*([\d.]+)\s*Hz/i);
  if (khz) {
    low = Number(khz[1]);
    high = Number(khz[2]) * 1000;
  } else if (hz) {
    low = Number(hz[1]);
    high = Number(hz[2]);
  }
  if (low !== null && inRange(low, GUARD.lowHz)) out.frequency_response_low_hz = low;
  if (high !== null && inRange(high, GUARD.highHz)) out.frequency_response_high_hz = high;
  if (/in\s*-?\s*room/i.test(text)) out.measurement_space = 'in-room';
  else if (/anechoic|free\s*-?\s*space/i.test(text)) out.measurement_space = 'free-space';
  else if (/half\s*-?\s*space/i.test(text)) out.measurement_space = 'half-space';
  else out.measurement_space = 'unspecified';
  return out;
}

/** Coverage angles, only where the page states a horn or waveguide pattern. */
function parseDispersion(text) {
  const source = String(text || '');
  if (!/horn|waveguide|directivity|dispersion/i.test(source)) return {};
  const pair = source.match(/(\d{2,3})\s*(?:º|°|degrees?)\s*(?:x|×|by)\s*(\d{2,3})/i)
    || source.match(/(\d{2,3})\s*(?:x|×)\s*(\d{2,3})\s*(?:º|°|degrees?|short throw)/i);
  if (pair) {
    const horizontal = Number(pair[1]);
    const vertical = Number(pair[2]);
    const out = {};
    if (inRange(horizontal, GUARD.degrees)) out.horizontal_dispersion_deg = horizontal;
    if (inRange(vertical, GUARD.degrees)) out.vertical_dispersion_deg = vertical;
    if (Object.keys(out).length > 0) return out;
  }
  const words = source.match(/(\d{2,3})\s*degrees?\s*horizontal[^.]{0,40}?(\d{2,3})\s*degrees?\s*vertical/i);
  if (words) {
    const horizontal = Number(words[1]);
    const vertical = Number(words[2]);
    const out = {};
    if (inRange(horizontal, GUARD.degrees)) out.horizontal_dispersion_deg = horizontal;
    if (inRange(vertical, GUARD.degrees)) out.vertical_dispersion_deg = vertical;
    return out;
  }
  return {};
}

function parseDimensions(value) {
  const match = String(value || '').match(
    /([\d.]+)\s*mm\s*high\s*x\s*([\d.]+)\s*mm\s*wide\s*x\s*([\d.]+)\s*mm\s*deep/i,
  );
  if (!match) return {};
  const out = {};
  const height = Number(match[1]);
  const width = Number(match[2]);
  const depth = Number(match[3]);
  if (inRange(height, GUARD.dimensionMm)) out.height_mm = height;
  if (inRange(width, GUARD.dimensionMm)) out.width_mm = width;
  if (inRange(depth, GUARD.dimensionMm)) out.depth_mm = depth;
  return out;
}

function parseWeight(value) {
  const match = String(value || '').match(/([\d.]+)\s*kg/i);
  if (!match) return {};
  const kg = Number(match[1]);
  if (!inRange(kg, GUARD.weightKg)) return {};
  return { weight_kg: kg };
}

/** Driver count and size, read from the Krix driver sentence. */
function parseBassDriver(value) {
  const text = String(value || '');
  const out = {};
  const count = /dual|two\s/i.test(text) ? 2 : /\bfour\b/i.test(text) ? 4 : /\bsingle\b|\bone\b/i.test(text) ? 1 : null;
  if (count) out.woofer_count = count;
  const size = text.match(/(\d{2,3})\s*mm/);
  if (size) {
    const inches = Math.round((Number(size[1]) / 25.4) * 10) / 10;
    if (inRange(inches, GUARD.wooferInches)) out.woofer_size = `${inches}"`;
  }
  return out;
}

function readDocuments(html) {
  const found = [];
  const seen = new Set();
  for (const match of html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)) {
    const url = match[1].startsWith('http') ? match[1] : `${ORIGIN}${match[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const name = decodeURIComponent(url.split('/').pop() || '').replace(/\+/g, ' ');
    let type = 'Document';
    if (/specification/i.test(name)) type = 'Specification sheet';
    else if (/install/i.test(name)) type = 'Installation guide';
    else if (/performance/i.test(name)) type = 'Performance report';
    else if (/design guide/i.test(name)) type = 'Cinema design guide';
    else if (/manual/i.test(name)) type = 'Manual';
    else if (/drawing|dimension/i.test(name)) type = 'Dimensional drawing';
    found.push({ document_type: type, url, name });
  }
  return found;
}

const nameKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function slugLabel(slug) {
  return String(slug || '').split('-').map((token) => (
    token.length <= 4 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1)
  )).join(' ');
}

/**
 * The product page carries several h1s (the site banner, the model, a call to
 * action). The model is the one whose name matches the product slug.
 */
function resolveModelName(html, slug, fallback) {
  const headings = [...html.matchAll(/<h1[^>]*>([\s\S]{0,140}?)<\/h1>/gi)].map((match) => stripTags(match[1]));
  const key = nameKey(slug);
  const exact = headings.find((heading) => heading && nameKey(heading) === key);
  if (exact) return exact;
  const stem = nameKey(String(slug || '').split('-')[0]);
  const partial = headings.find((heading) => heading && heading.length <= 34 && nameKey(heading).startsWith(stem));
  return partial || fallback;
}

/** Product tiles from the category page: slug, name and the site's own category. */
function readTiles(html) {
  const labels = [...EXCLUDED_CATEGORY_LABELS, 'On-wall', 'In-wall', 'Freestanding', 'Modular', 'Linear LCR'];
  const tiles = [];
  const blocks = html.split('class="product-item w-dyn-item"').slice(1);
  for (const block of blocks) {
    const chunk = block.slice(0, 6000);
    const slug = chunk.match(/href="\/product\/([a-z0-9\-]+)"/);
    if (!slug) continue;
    const label = labels.find((candidate) => chunk.includes(`>${candidate}<`)) || 'Unknown';
    tiles.push({ slug: slug[1], categoryLabel: label, name: slugLabel(slug[1]) });
  }
  return tiles;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const payload = await req.json().catch(() => ({}));
    const limit = Number(payload?.limit) > 0 ? Math.min(Number(payload.limit), 80) : 80;
    const digest = payload?.digest === true;

    const categoryResponse = await fetch(SOURCE_URL);
    if (!categoryResponse.ok) {
      return Response.json({ error: `Krix category page returned ${categoryResponse.status}` }, { status: 502 });
    }
    const categoryHtml = await categoryResponse.text();
    const tiles = readTiles(categoryHtml);

    const candidates = [];
    const excluded = [];
    const failures = [];
    const digestLines = [];

    for (const tile of tiles.slice(0, limit)) {
      const category = tile.categoryLabel.toLowerCase();
      const slugTitle = tile.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      if (EXCLUDED_CATEGORY_LABELS.includes(tile.categoryLabel)) {
        excluded.push({
          model: tile.name || slugTitle,
          product_url: `${ORIGIN}/product/${tile.slug}`,
          reason: `${tile.categoryLabel} — not a loudspeaker, excluded from the P12/P13 comparison`,
        });
        continue;
      }
      if (!SPEAKER_CATEGORIES.includes(category)) {
        excluded.push({
          model: tile.name || slugTitle,
          product_url: `${ORIGIN}/product/${tile.slug}`,
          reason: `${tile.categoryLabel} — not part of the dedicated home cinema speaker range`,
        });
        continue;
      }

      let pageHtml = '';
      try {
        const pageResponse = await fetch(`${ORIGIN}/product/${tile.slug}`);
        if (!pageResponse.ok) {
          failures.push({ model: tile.name || slugTitle, reason: `product page returned ${pageResponse.status}` });
          continue;
        }
        pageHtml = await pageResponse.text();
      } catch (error) {
        failures.push({ model: tile.name || slugTitle, reason: `product page could not be read: ${error.message}` });
        continue;
      }

      const { pairs, sentences } = readSpecPairs(pageHtml);
      const productUrl = `${ORIGIN}/product/${tile.slug}`;
      const pageText = stripTags(pageHtml).slice(0, 60000);
      const model = resolveModelName(pageHtml, tile.slug, tile.name);

      const specification = {};
      const snippets = {};
      const flags = [];
      const rejected = [];

      const note = (field, sentence) => {
        if (sentence) snippets[field] = sentence;
      };

      const sensitivityPair = firstPair(pairs, ['sensitivity']);
      if (sensitivityPair) {
        const element = lowFrequencyElement(sensitivityPair.value);
        if (element.split || sensitivityPair.splitElement) flags.push('Bi-amped module: low frequency element figures used');
        const parsed = parseSensitivity(element.value);
        if (parsed.rejected) rejected.push(parsed.rejected);
        if (parsed.sensitivity_db) {
          specification.sensitivity_db = parsed.sensitivity_db;
          specification.sensitivity_basis = parsed.sensitivity_basis;
          note('sensitivity_db', sentences[sensitivityPair.label]);
        }
      }

      const impedancePair = firstPair(pairs, ['impedance']);
      if (impedancePair) {
        const element = lowFrequencyElement(impedancePair.value);
        const parsed = parseImpedance(element.value);
        if (parsed.rejected) rejected.push(parsed.rejected);
        if (parsed.nominal_impedance_ohm) {
          specification.nominal_impedance_ohm = parsed.nominal_impedance_ohm;
          note('nominal_impedance_ohm', sentences[impedancePair.label]);
        }
        if (parsed.minimum_impedance_ohm) {
          specification.minimum_impedance_ohm = parsed.minimum_impedance_ohm;
          note('minimum_impedance_ohm', sentences[impedancePair.label]);
        }
      }

      const powerPair = firstPair(pairs, ['power handling']);
      if (powerPair) {
        const element = lowFrequencyElement(powerPair.value);
        if (element.split || powerPair.splitElement) flags.push('Bi-amped module: low frequency element figures used');
        const parsed = parsePower(element.value);
        if (parsed.rejected) rejected.push(parsed.rejected);
        if (parsed.recommended_amp_min_w) {
          specification.recommended_amp_min_w = parsed.recommended_amp_min_w;
          note('recommended_amp_min_w', sentences[powerPair.label]);
        }
        if (parsed.recommended_amp_max_w) {
          specification.recommended_amp_max_w = parsed.recommended_amp_max_w;
          note('recommended_amp_max_w', sentences[powerPair.label]);
        }
      }

      const frequencyPair = firstPair(pairs, ['frequency range', 'frequency response']);
      if (frequencyPair) {
        const parsed = parseFrequency(frequencyPair.value);
        Object.assign(specification, parsed);
        if (parsed.frequency_response_low_hz) note('frequency_response_low_hz', sentences[frequencyPair.label]);
        if (parsed.frequency_response_high_hz) note('frequency_response_high_hz', sentences[frequencyPair.label]);
        note('measurement_space', sentences[frequencyPair.label]);
      }

      const dispersionSource = [
        pairs['low frequency driver'],
        pairs['high frequency driver'],
        pairs['mid frequency driver'],
        pairs['configuration'],
      ].filter(Boolean).join(' ');
      const dispersion = parseDispersion(dispersionSource);
      if (dispersion.horizontal_dispersion_deg || dispersion.vertical_dispersion_deg) {
        Object.assign(specification, dispersion);
        note('horizontal_dispersion_deg', `Coverage angles as published in the driver description: ${dispersionSource.slice(0, 200)}`);
      }

      const dimensionsPair = firstPair(pairs, ['dimensions']);
      if (dimensionsPair) {
        const parsed = parseDimensions(lowFrequencyElement(dimensionsPair.value).value);
        Object.assign(specification, parsed);
        if (Object.keys(parsed).length > 0) note('height_mm', sentences[dimensionsPair.label]);
        else if (/see specification sheet/i.test(dimensionsPair.value)) flags.push('Dimensions deferred to the specification sheet');
      }

      const weightPair = firstPair(pairs, ['weight']);
      if (weightPair) {
        const parsed = parseWeight(weightPair.value);
        Object.assign(specification, parsed);
        if (parsed.weight_kg) note('weight_kg', sentences[weightPair.label]);
      }

      const bassDriverPair = firstPair(pairs, ['low frequency driver', 'low frequency drivers', 'mid/bass frequency driver']);
      if (bassDriverPair) {
        Object.assign(specification, parseBassDriver(bassDriverPair.value));
        note('woofer_count', sentences[bassDriverPair.label]);
      }

      const enclosurePair = firstPair(pairs, ['enclosure']);
      if (enclosurePair) {
        specification.cabinet_type = enclosurePair.value.slice(0, 120);
        note('cabinet_type', sentences[enclosurePair.label]);
      }

      const highDriverPair = firstPair(pairs, ['high frequency driver']);
      if (highDriverPair) {
        specification.tweeter_description = highDriverPair.value.slice(0, 200);
        note('tweeter_description', sentences[highDriverPair.label]);
      }

      const configurationPair = firstPair(pairs, ['configuration']);
      const configuration = configurationPair ? configurationPair.value : '';

      const documents = readDocuments(pageHtml);
      const specSheet = documents.find((doc) => doc.document_type === 'Specification sheet');

      // A page with no sensitivity, impedance and no power authority is not a
      // speaker we can compare, so it is reported rather than offered.
      const hasEngineeringData = specification.sensitivity_db
        || specification.nominal_impedance_ohm
        || specification.recommended_amp_max_w;
      if (!hasEngineeringData) {
        excluded.push({
          model,
          product_url: productUrl,
          reason: 'No loudspeaker engineering data published on the product page — module or accessory, not a P12/P13 speaker',
        });
        continue;
      }

      const mounting = CATEGORY_TO_PRODUCT[category] || 'Other';
      specification.mounting_type = mounting;
      if (tile.categoryLabel === 'Modular' || tile.categoryLabel === 'Linear LCR') {
        flags.push(`${tile.categoryLabel} module — confirm how it is installed (baffle wall / on wall)`);
      }
      if (!specification.frequency_response_low_hz && !specification.frequency_response_high_hz) {
        flags.push('No frequency response published on the page');
      }
      if (!documents.some((doc) => doc.document_type === 'Performance report')) {
        flags.push('No performance report published — no measured capability to verify');
      }
      for (const item of rejected) flags.push(`Rejected: ${item}`);

      const driverNarrative = [
        configuration ? `Configuration: ${configuration}` : null,
        pairs['low frequency driver'] ? `Low frequency driver: ${pairs['low frequency driver']}` : null,
        pairs['mid frequency driver'] ? `Mid frequency driver: ${pairs['mid frequency driver']}` : null,
        pairs['high frequency driver'] ? `High frequency driver: ${pairs['high frequency driver']}` : null,
        pairs['crossover point'] || pairs['crossover frequency']
          ? `Crossover: ${pairs['crossover point'] || pairs['crossover frequency']}`
          : null,
      ].filter(Boolean).join('. ');

      specification.notes = `Read from the official Krix product page. ${driverNarrative}`
        + ' Krix publishes no maximum SPL on the product page; the RP22 P12/P13 capability is calculated from the published sensitivity, impedance and recommended amplifier power.';

      // Evidence quality states how the capability figure is obtained, exactly as
      // the comparison engine will read it: a published measured SPL is published
      // evidence, a figure calculated from the manufacturer's amplifier range is
      // calculated evidence, and a page with neither is unknown.
      specification.evidence_quality = specification.max_continuous_spl_db
        ? 'Manufacturer Published'
        : specification.recommended_amp_max_w && specification.sensitivity_db
          ? 'Manufacturer Calculated'
          : 'Unknown';

      const candidate = {
        model,
        series: guessSeries(model),
        product_category: mounting,
        range_category: tile.categoryLabel,
        role_guess: guessRole(model, category, pageText),
        product_url: productUrl,
        datasheet_url: specSheet?.url || documents[0]?.url || '',
        document_url: '',
        document_type: 'Product page',
        spec_source_type: 'Official Product Page',
        official_documents: documents,
        source_snippets: snippets,
        review_flags: flags,
        specification,
      };

      if (digest) {
        digestLines.push([
          model,
          tile.categoryLabel,
          candidate.role_guess,
          specification.sensitivity_db != null ? `${specification.sensitivity_db} dB @ ${specification.sensitivity_basis}` : 'sensitivity missing',
          specification.nominal_impedance_ohm != null ? `${specification.nominal_impedance_ohm} Ω` : 'impedance missing',
          specification.recommended_amp_max_w != null
            ? `${specification.recommended_amp_min_w ?? '?'}-${specification.recommended_amp_max_w} W`
            : 'power missing',
          `${specification.frequency_response_low_hz ?? '?'}-${specification.frequency_response_high_hz ?? '?'} Hz ${specification.measurement_space}`,
          specification.horizontal_dispersion_deg
            ? `${specification.horizontal_dispersion_deg}x${specification.vertical_dispersion_deg} deg`
            : 'dispersion not stated',
          `docs:${documents.length}`,
          `snips:${Object.keys(snippets).length}`,
          `flags:${flags.length}`,
        ].join(' | '));
      }
      candidates.push(candidate);
    }

    const response: Record<string, unknown> = {
      source_url: SOURCE_URL,
      official_domain: ORIGIN,
      tiles_found: tiles.length,
      candidate_count: candidates.length,
      excluded_count: excluded.length,
    };
    if (digest) {
      response.digest_lines = digestLines;
      response.excluded_lines = excluded.map((row) => `${row.model} | ${row.reason}`);
    } else {
      response.candidates = candidates;
      response.excluded = excluded;
    }
    response.failures = failures;
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}