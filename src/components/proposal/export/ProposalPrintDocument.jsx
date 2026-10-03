/**
 * ProposalPrintDocument
 * ---------------------
 * The print-only client specification pack, portalled directly to <body> so the
 * export stylesheet can hide the entire application shell and print the pack
 * alone. Mounted for the lifetime of the editor so export never races a render.
 *
 * The document itself is composed by ProposalPackDocument. This wrapper only
 * owns the portal and the guard for a non-browser environment.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import ProposalPackDocument from '@/components/proposal/print/ProposalPackDocument';

export default function ProposalPrintDocument(props) {
  if (typeof document === 'undefined') return null;
  return createPortal(<ProposalPackDocument {...props} />, document.body);
}