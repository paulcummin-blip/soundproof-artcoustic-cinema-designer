/**
 * AppendixPage
 * ------------
 * The detail kept out of the client story: the assessment basis, the prediction
 * disclaimer, what the Design Index is, and the parameters this document refers
 * to.
 *
 * Factual and separate from the sales narrative, as the report structure
 * requires. The copy is fixed and held in proposalPackAuthority.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import {
  APPENDIX_PAGE,
  parameterReferenceList,
} from '@/components/proposal/print/proposalPackAuthority';

export default function AppendixPage({ number }) {
  const parameters = parameterReferenceList();

  return (
    <section className="proposal-print-section pp-page pp-page--appendix">
      <ProposalPageHeader number={number} kicker="Reference" title={APPENDIX_PAGE.title} />

      <div className="pp-notes">
        {APPENDIX_PAGE.notes.map((note) => (
          <div key={note.title} className="pp-note pp-note--stacked">
            <div className="pp-note__title">{note.title}</div>
            <p className="pp-note__text">{note.text}</p>
          </div>
        ))}
      </div>

      <div className="pp-block">
        <h3 className="pp-block__title">{APPENDIX_PAGE.parameters_title}</h3>
        <div className="pp-chips">
          {parameters.map((parameter) => (
            <span key={parameter.id} className="pp-chip">
              {parameter.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}