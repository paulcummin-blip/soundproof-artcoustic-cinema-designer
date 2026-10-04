/**
 * ProposalRenderBoundary
 * ----------------------
 * A render error inside the Proposal Editor must never leave a blank page. This
 * boundary catches a failing section, table or print composition and shows the
 * same clear state the editor uses elsewhere, with a way back to the Proposal
 * Centre.
 *
 * It wraps presentation only: it never retries, reloads or writes anything.
 */

import React from 'react';
import ProposalEditorState from './ProposalEditorState';

export default class ProposalRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the diagnostic trail the app shell already collects.
    if (typeof window !== 'undefined') {
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(
        `[ProposalRenderBoundary] ${error?.message || error}`,
        `[ProposalRenderBoundary] Stack: ${error?.stack || '(no stack)'}`,
      );
    }
    // eslint-disable-next-line no-console
    console.error('[ProposalRenderBoundary] the proposal could not be displayed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ProposalEditorState
          title="This proposal could not be displayed"
          message="Something in this document failed to render. Nothing was changed or saved."
          reason={String(this.state.error?.message || this.state.error || 'Unknown render error')}
          actions={{ retry: false, regenerate: false, return: true }}
          onReturn={this.props.onReturn}
        />
      );
    }
    return this.props.children ?? null;
  }
}