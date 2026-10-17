/**
 * concept-render-social-principle.test.mjs
 * ----------------------------------------
 * THE SOCIAL / LIFESTYLE PRINCIPLE, ASSERTED.
 *
 * A concept render may remind the writer that the client is buying a complete room they
 * will spend time in: day to day with family, and in more social use with friends —
 * films, television, sport, music and concerts, gaming, and time spent together.
 *
 * It may never sell the object shown. A bar in a render suggests SOCIAL FLEXIBILITY; it
 * does not establish a BAR REQUIREMENT. A large sofa suggests RELAXED FAMILY USE; it does
 * not establish a FURNITURE SPECIFICATION. Decorative lighting suggests A ROOM THAT FEELS
 * SPECIAL TO SPEND TIME IN; it does not establish a LIGHTING DESIGN.
 *
 * The social use itself is set by the project, in one order: the client or dealer brief
 * where one exists, then the project's own intent, then a render as a soft cue at most.
 * Where nothing records one, the copy stays general and no client preference is invented.
 * Engineering remains the report's primary authority, and the register stays restrained:
 * an engineering report, not lifestyle marketing.
 *
 * Pure: no provider call, no network. The contracts and the block the writer reads are
 * asserted directly, and the same words are proved to reach the Design Intent's own brief.
 */

import { describe, expect, it } from 'vitest';

import {
  VISUAL_EXPERIENCE_REGISTER,
  VISUAL_OBJECT_PRINCIPLE,
  buildReportVisualContext,
  writerVisualBlock,
} from '../base44/shared/reportDesignIntent/reportVisualContext.js';
import { DESIGN_INTENT_REQUIREMENT } from '../base44/shared/reportDesignIntent/designIntentBrief.js';

const ASSETS = [
  { id: 's-1', slot: 'cover', file_url: 'https://x/y/rear-bar-render.jpg', asset_type: 'cover_image', image_purpose: 'whole_room' },
  { id: 's-2', slot: 'image_1', file_url: 'https://x/y/lounge-render.jpg', asset_type: 'gallery', image_purpose: 'interior_detail' },
];

const blockFor = ({ briefSupplied = false } = {}) => writerVisualBlock(
  buildReportVisualContext({ assets: ASSETS, versionId: 'v1', briefSupplied }),
);

describe('A. A render can inform social flexibility', () => {
  it('carries the register to the writer, stating the room the client is buying', () => {
    const block = blockFor({ briefSupplied: true });
    expect(block.experience_register).toBe(VISUAL_EXPERIENCE_REGISTER);
    expect(block.social_experience_allowed).toBe(true);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/a complete room they will spend time in, not a list of equipment/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/day to day with family/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/more social use with friends/i);
  });
});

describe('B. The object in a picture never becomes a requirement', () => {
  it('sells the possibility, and names the three objects a render must never specify', () => {
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/never sell and never specify the object shown/i);
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/it is illustrative only/i);
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/a bar may suggest social flexibility, never a bar requirement/i);
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/a large sofa may suggest relaxed family use, never a furniture specification/i);
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/decorative lighting may suggest a room that feels special to spend time in, never a lighting design/i);
    // The two phrasings an object-led draft reaches for are refused by name.
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/never write "the client should have"/i);
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/never write "the rear bar will"/i);
  });

  it('reaches the Design Intent as its own requirement', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/SELL THE POSSIBILITY THE ROOM OFFERS, NEVER THE OBJECT A PICTURE SHOWS/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never a bar requirement/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never a furniture specification/i);
  });
});

describe('C. Nothing shown is presented as approved design', () => {
  it('refuses an approved, final, specified or built status for anything in a render', () => {
    expect(VISUAL_OBJECT_PRINCIPLE).toMatch(/never present anything shown as approved, final, specified or built/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/never present anything shown as approved, final, specified or built/i);
  });
});

describe('D. The client experience extends beyond films', () => {
  it('names the shared use the room may be written for', () => {
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/films, television, sport, music and concerts, gaming/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/simply time spent together/i);
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/THE ROOM IS FOR MORE THAN FILMS/i);
  });
});

describe('E. Family and friends language needs brief support, or stays general', () => {
  it('withholds the social register where this project records no brief', () => {
    expect(blockFor({ briefSupplied: false }).social_experience_allowed).toBe(false);
    const notes = blockFor({ briefSupplied: false }).notes.join(' ');
    expect(notes).toMatch(/records no client brief/i);
    expect(notes).toMatch(/no intended use is stated and none is ever invented/i);
  });

  it('states the authority order and the general fallback, and forbids an invented preference', () => {
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/client or dealer brief where one exists, then from the project's own intent/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/read a render only as a soft cue/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/a picture never invents a client preference/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/a room designed to be enjoyed regularly/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/never invent family movie nights or entertaining friends/i);
  });
});

describe('F. Engineering remains the primary report authority', () => {
  it('keeps the engineering authority above the register and offers no figure of its own', () => {
    expect(DESIGN_INTENT_REQUIREMENT).toMatch(/canonical project and engineering data always wins/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/this is an engineering report, not lifestyle marketing/i);
    expect(`${VISUAL_OBJECT_PRINCIPLE} ${VISUAL_EXPERIENCE_REGISTER}`).not.toMatch(/dB|Hz/);
  });
});

describe('G. No interior-design claim, and no analogy in the copy', () => {
  it('keeps the interior prohibitions travelling with the images', () => {
    const block = blockFor({ briefSupplied: true });
    expect(block.never).toMatch(/never describe colours, fabrics, timber, stone, wall finishes, furniture, lighting/i);
    expect(block.object_principle).toBe(VISUAL_OBJECT_PRINCIPLE);
    expect(`${VISUAL_OBJECT_PRINCIPLE} ${VISUAL_EXPERIENCE_REGISTER}`).not.toMatch(/#[0-9A-Fa-f]{3,6}/);
  });

  it('keeps the kitchen analogy for the writer\'s understanding only', () => {
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/for your own understanding/i);
    expect(VISUAL_EXPERIENCE_REGISTER).toMatch(/never put that comparison in the copy/i);
    expect(DESIGN_INTENT_REQUIREMENT).not.toMatch(/kitchen/i);
  });
});