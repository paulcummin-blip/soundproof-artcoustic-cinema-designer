/**
 * TEMPORARY REVIEW HARNESS — Jooced / Original Design.
 *
 * Prints the ACTUAL client-facing text the Project Report will state for the real
 * saved project, so the front-page Design Intent and the five ADI Design
 * Highlights can be read together:
 *
 *   1. the Design Intent, as the report's own intent authority composes it;
 *   2. the highlights ADI selects for this design, with the copy each card states.
 *
 * The evidence is the project's own saved design state and its published
 * engineering summary, dumped to tmp/ by the review. Nothing is stubbed and
 * nothing is recalculated here.
 */

import { test } from 'vitest';
import fs from 'node:fs';

import { buildProjectReportSummaryOpening } from '@/components/report/projectReport/projectReportSummaryOpening';
import { buildProductsSelected, layoutVisibilityFilter } from '@/components/report/reportProductsSelected';
import { selectAdiHighlights } from '@/components/report/projectReport/adiDesignHighlights';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('Jooced / Original Design: the Design Intent and the five highlights', () => {
  const design = read('tmp/jooced-design-state.json');
  const project = read('tmp/jooced-project.json');
  const engineeringSummary = read('tmp/jooced-summary.json');
  const roomDims = JSON.parse(project.roomDims || '{}');

  const projectDetails = {
    dolby_config: design.dolby_config,
    seven_bed_layout_type: design.seven_bed_layout_type,
    display_type: design.display_type,
    screen_size: design.screen_size,
    aspect_ratio: design.aspect_ratio,
    manual_dimensions: design.manual_dimensions,
    screen_mount_mode: design.screen_mount_mode,
    float_depth_m: design.float_depth_m,
    tv_preset_key: design.tv_preset_key,
    mlp_basis: design.mlp_basis,
    rsp_mode: design.rsp_mode,
    viewing_level: design.viewing_level,
  };

  const productsSelected = buildProductsSelected({
    placedSpeakers: design.selected_speakers || [],
    frontSubsCfg: design.front_subs_cfg,
    rearSubsCfg: design.rear_subs_cfg,
    subwooferInstances: design.subwooferInstances || [],
    acousticTreatmentEnabled: design.acoustic_treatment_enabled === true,
    selectedAbfuserQty: design.selected_abfuser_qty || 0,
    isVisible: layoutVisibilityFilter(design.dolby_config, design.seven_bed_layout_type),
  });

  const intent = buildProjectReportSummaryOpening({
    projectDetails,
    roomDims,
    productsSelected,
    seatingPositions: design.seating_positions || [],
  });

  const selection = selectAdiHighlights({
    engineeringSummary,
    productsSelected,
    seatingPositions: design.seating_positions || [],
    roomDims,
    dolbyConfig: design.dolby_config,
    displayType: design.display_type,
  });

  console.log('[JOOCED SCHEDULE]', JSON.stringify(productsSelected.rows, null, 1));
  console.log('[JOOCED INTENT BEGIN]');
  console.log(intent);
  console.log('[JOOCED INTENT END]');
  console.log('[JOOCED HIGHLIGHT IDS]', JSON.stringify(selection.selected));
  selection.highlights.forEach((highlight, index) => {
    console.log(`[JOOCED HIGHLIGHT ${index + 1}]`, JSON.stringify(highlight, null, 1));
  });
});