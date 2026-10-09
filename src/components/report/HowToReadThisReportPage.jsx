/**
 * HowToReadThisReportPage.jsx
 * ---------------------------
 * The report's reference page: how the results are graded and what they mean.
 *
 * It carries the report's existing reference material — the CEDIA RP22 level
 * definitions word for word, the note that levels apply to both seating
 * positions and the room, and the RP23 image statement — together with the plain
 * explanation of how to read a result: which parameters are assessed for the room
 * and which are assessed at each seat, why the Primary and Secondary seating
 * positions may carry different results, and that the parameters are engineering
 * evidence rather than the objective of the design.
 *
 * Reference copy only. It states no result of any design, so it can never
 * disagree with the report's own evidence.
 */

import React from 'react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_SECTION_HEADING_GAP_PX,
  reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';

const BODY = '#3E4349';
const LEVELS = [
  ['Level 1', 'The minimum level of performance necessary to convey basic artistic intent.'],
  ['Level 2', 'A higher level of performance that more accurately conveys artistic intent.'],
  ['Level 3', 'Meets or exceeds reference commercial cinema exhibition standards.'],
  ['Level 4', 'The maximum level of achievable performance across every parameter.'],
];

const PARAGRAPH_STYLE = {
  fontFamily: FONT_BODY,
  fontSize: '10pt',
  color: BODY,
  lineHeight: 1.55,
  marginTop: '2mm',
};

function Section({ title, children }) {
  return (
    <div style={{ marginTop: '6mm' }}>
      <div
        data-report-section-heading="true"
        style={reportSectionHeadingStyle('11pt', {
          color: '#1B1A1A',
          marginBottom: `${REPORT_SECTION_HEADING_GAP_PX}px`,
        })}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function HowToReadThisReportPage() {
  return (
    <div style={{ maxWidth: '185mm', margin: '0 auto', fontFamily: FONT_BODY, color: BODY, textAlign: 'left' }}>
      <div
        data-report-section-heading="true"
        style={reportSectionHeadingStyle('18pt', { color: '#213428', marginBottom: '2mm' })}
      >
        How to Read This Report
      </div>
      <div style={{ ...PARAGRAPH_STYLE, fontStyle: 'italic', marginTop: 0 }}>
        How the results in this report are graded, and what they mean.
      </div>

      <Section title="CEDIA RP22 - Immersive Audio Performance Levels">
        {LEVELS.map(([level, meaning]) => (
          <div key={level} style={{ fontSize: '10pt', lineHeight: 1.55, marginTop: '1mm' }}>
            <strong>{level}</strong> – {meaning}
          </div>
        ))}
        <div style={{ ...PARAGRAPH_STYLE, marginTop: '3mm' }}>
          Performance levels apply to both individual seating positions as well as the room, with parameters therein attributed to one or the other.
        </div>
      </Section>

      <Section title="Room-wide and seat-scoped parameters">
        <div style={PARAGRAPH_STYLE}>
          Some RP22 parameters are assessed for the room itself. They describe the room the design is built in, and one result covers every seating position.
        </div>
        <div style={PARAGRAPH_STYLE}>
          Others are assessed at each seating position independently. Where a parameter is assessed that way, the report states the result for every seat, and no single result is stated for the room.
        </div>
        <div style={PARAGRAPH_STYLE}>
          Where results are seat-scoped, Sound Proof designates Primary and Secondary seating positions. Each seat is graded on its own, so the Primary and Secondary positions can carry different results — that difference is information about the seating layout, not a missing result.
        </div>
      </Section>

      <Section title="What the parameters are for">
        <div style={PARAGRAPH_STYLE}>
          The RP22 parameters are engineering evidence, not the objective of the design. They show what the finished cinema is capable of. The decisions that shape the room — architecture, seating, loudspeaker selection and bass strategy — are made in the design itself, and the parameters record the outcome.
        </div>
      </Section>

      <Section title="RP23 - Image Performance">
        <div style={PARAGRAPH_STYLE}>
          CEDIA's forthcoming RP23 document will address best practice for image. Currently, we only have the size of the images based on the horizontal viewing angle, and the brightness which is known.
        </div>
      </Section>
    </div>
  );
}