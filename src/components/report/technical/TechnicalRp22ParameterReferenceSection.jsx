/**
 * TechnicalRp22ParameterReferenceSection
 * --------------------------------------
 * The final page of the report: the P1–P21 parameter wording, verbatim from the
 * supplied RP22 Parameters document. Dry reference only: parameter number and
 * wording, grouped under the three canonical categories. No results, levels,
 * thresholds or commentary.
 */
import React from 'react';
import TechnicalCategoryBanner from '@/components/report/technical/TechnicalCategoryBanner';
import { RP22_PARAMETER_REFERENCE } from '@/components/report/technical/rp22ParameterReferenceText';
import {
  REPORT_FONT_BODY as FONT_BODY,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

const BODY = '#1B1A1A';
const RULE = '#DCDBD6';

export default function TechnicalRp22ParameterReferenceSection() {
  return (
    <section
      id="pdf-rp22-parameter-reference"
      className="report-page-block report-page-block--summary"
      data-report-block="rp22-parameter-reference"
      data-report-page-start="true"
      style={{ background: '#FFFFFF', padding: '8mm 10mm', boxSizing: 'border-box' }}
    >
      <div style={{ maxWidth: '185mm', margin: '0 auto', fontFamily: FONT_BODY, color: BODY }}>
        <div style={reportSectionHeadingStyle('16pt', { color: '#1B1A1A' })}>RP22 Parameter Reference</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: '9pt', color: '#625143', marginTop: '1mm' }}>
          P1–P21 quick reference
        </div>

        {RP22_PARAMETER_REFERENCE.map((group) => (
          <div key={group.category} style={{ marginTop: '4mm' }}>
            <TechnicalCategoryBanner category={group.category} caption={group.range} />
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1mm' }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, width: '12mm' }}>P#</th>
                  <th style={headCell}>PARAMETER WORDING</th>
                </tr>
              </thead>
              <tbody>
                {group.parameters.map(([number, wording]) => (
                  <tr key={number} style={{ breakInside: 'avoid' }}>
                    <td style={{ ...cell, fontWeight: 700 }}>{number}</td>
                    <td style={cell}>{wording}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

const headCell = {
  textAlign: 'left',
  fontFamily: FONT_BODY,
  fontSize: '7pt',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#625143',
  padding: '0.8mm 1mm',
  borderBottom: `1px solid ${RULE}`,
};

const cell = {
  fontFamily: FONT_BODY,
  fontSize: '8pt',
  lineHeight: 1.3,
  verticalAlign: 'top',
  padding: '0.9mm 1mm',
  borderBottom: `1px solid ${RULE}`,
};