/**
 * ProposalTypographyStyles
 * ------------------------
 * Mounts the proposal typography stylesheet for the on-screen proposal
 * document. Rendered once by the Proposal Editor, around the `.proposal-preview`
 * scope, so the preview and the exported PDF read from one authority
 * (proposalTypography.js).
 *
 * Type only: it changes no content, value or layout rule.
 */

import React from 'react';
import { buildProposalPreviewCss } from '@/components/proposal/typography/proposalTypography';

export default function ProposalTypographyStyles() {
  return <style>{buildProposalPreviewCss({ scope: '.proposal-preview' })}</style>;
}